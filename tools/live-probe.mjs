#!/usr/bin/env node
/**
 * live-probe.mjs — ask the RUNNING dsh web GUI what it actually paints.
 *
 * Every other tool in this folder talks to the Host (verify-live.mjs) or watches
 * its event stream (hmr-probe.mjs). Neither can answer the question this plugin
 * lives or dies by: in the real browser, on the real page, what does the running
 * status row look like right now — its copy, its computed colour, and the theme
 * custom properties feeding the shimmer?
 *
 * So this one drives a real headless chromium over the Chrome DevTools Protocol
 * and prints machine-readable evidence:
 *
 *   node tools/live-probe.mjs                  # probe and print one JSON line
 *   node tools/live-probe.mjs --shot out.png   # also write a PNG of the page
 *   node tools/live-probe.mjs --wait 60        # seconds to wait for the row (default 45)
 *
 *   {"ok":true,"url":"http://127.0.0.1:19387/","title":"...","found":true,"rows":1,
 *    "text":"深度求索中，用时 12秒 ···","rowColor":"rgb(77, 107, 254)",
 *    "shimmerColor":"#4d6bfe","customProperty":"#4d6bfe",
 *    "textShimmerColor":"rgb(77, 107, 254)","shimmerText":"深度求索中，用时 12秒 ···",
 *    "variables":{"--dsw-alias-label-deep-diving":"#4d6bfe","--dsw-alias-label-shimmer":"#4d6bfe"},
 *    "shot":"D:\\...\\out.png"}
 *
 * Exit 0 when the row was read; exit 1 with {"ok":false,"found":false,...} when it
 * never appeared — a running turn may simply not be in flight, which is a normal
 * outcome and not a crash. `waitedSeconds` counts the row poll only;
 * `elapsedSeconds` counts the whole run. `--shot` writes the PNG on both paths,
 * because the picture of a page with no running row is the diagnosis.
 *
 * Known reach: the web app has no URL routing, so a freshly launched browser
 * profile always lands on its empty state (no workspace picked, no session
 * open) and the chat's running row cannot exist there — found:false is the
 * honest answer in that case. found:true needs a page where a turn is actually
 * in flight.
 *
 * Notes on the machinery, all of it deliberate:
 *   - No dependencies. Chromium and the CDP socket are external; this script uses
 *     only Node builtins, including the global WebSocket Node 24 ships.
 *   - The page is auth-gated, so the probe mints the same browser-session cookie
 *     verify-live.mjs does from $DSH_HOME/.credentials.yaml. The secret is never
 *     printed and never written to the report.
 *   - chromium is spawned with stdio 'ignore' (capturing a child's piped stdio is
 *     blocked in this environment) and killed in a finally block. Nothing on disk
 *     is deleted: the throwaway profile directory stays in %TEMP%.
 */
import { spawn } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

//#region configuration

/** Fallback browser, used when the Playwright cache cannot be scanned. */
const DEFAULT_CHROME = 'C:\\Users\\lan13\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
/** The running GUI under test. */
const base = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080'
/** Where the durable Host secrets live. */
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
/** Milliseconds the chromium DevTools endpoint gets to answer. */
const DEVTOOLS_BUDGET_MS = 15_000
/** Milliseconds the app shell gets to render before the row poll starts anyway. */
const SHELL_BUDGET_MS = 30_000
/** Poll cadence for the running row. */
const POLL_MS = 500
/** Selector of the running status row this plugin restyles. */
const ROW_SELECTOR = '[data-chat-running]'
/** Selector of the span whose text the shimmer gradient paints. */
const SHIMMER_SELECTOR = '[data-text-shimmer]'

//#endregion

//#region CLI

/**
 * Read `--name value` off argv.
 * @param name - flag to look for.
 * @param fallback - value when the flag is absent.
 * @returns the flag's value.
 */
function option(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(name + ' needs a value')
  return value
}

/**
 * Parse this run's CLI flags. Called from `probe()` so that a bad flag comes back
 * as the same machine-readable report as every other failure, not a stack trace.
 * @returns the wait budget in seconds and the absolute screenshot target.
 */
function options() {
  const waitSeconds = Number(option('--wait', '45'))
  if (!Number.isFinite(waitSeconds) || waitSeconds <= 0) throw new Error('--wait needs a positive number of seconds')
  const shot = option('--shot', null)
  return { waitSeconds, shotPath: shot === null ? null : resolve(String(shot)) }
}

//#endregion

//#region browser session cookie (same algorithm as tools/verify-live.mjs)

/** base64url without padding, matching the Host's own encoder. */
function base64url(value) {
  return Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/** Read the browser-session signing secret out of the credentials document. */
function readSecret() {
  const lines = readFileSync(join(home, '.credentials.yaml'), 'utf8').split(/\r?\n/u)
  let inRecord = false
  for (const line of lines) {
    if (/^ {2}client-connection\/browser-session:\s*$/u.test(line)) {
      inRecord = true
      continue
    }
    if (!inRecord) continue
    if (/^ {2}\S/u.test(line)) break
    const match = /^\s+secret:\s*(\S+)\s*$/u.exec(line)
    if (match !== null) return Buffer.from(match[1], 'base64url')
  }
  throw new Error('no client-connection/browser-session secret in ' + join(home, '.credentials.yaml'))
}

/**
 * Mint the browser-session cookie the running Host accepts.
 * @returns the cookie name, value and expiry.
 */
function mintCookie() {
  const authority = new URL(base).host
  const secret = readSecret()
  const name = 'dsh-auth-' + base64url(createHash('sha256').update(authority).digest())
  const issuedAt = Date.now()
  const expiresAt = issuedAt + 3_600_000
  const body = base64url(JSON.stringify({ version: 1, authority, issuedAt, expiresAt }))
  const value = 'v1.' + body + '.' + base64url(createHmac('sha256', secret).update(body).digest())
  return { name, value, expiresAt }
}

//#endregion

//#region small helpers

/** Sleep for a while. */
function sleep(ms) {
  return new Promise(done => setTimeout(done, ms))
}

/** A human-readable message for any thrown value. */
function message(error) {
  return error instanceof Error ? error.message : String(error)
}

/** The chromium binary: explicit override, then the pinned build, then the cache. */
function chromePath() {
  const override = process.env.DSH_CHROMIUM
  if (override !== undefined && existsSync(override)) return override
  if (existsSync(DEFAULT_CHROME)) return DEFAULT_CHROME
  const root = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')
  if (existsSync(root)) {
    const builds = readdirSync(root).filter(entry => entry.startsWith('chromium-')).sort().reverse()
    for (const build of builds) {
      const candidate = join(root, build, 'chrome-win64', 'chrome.exe')
      if (existsSync(candidate)) return candidate
    }
  }
  throw new Error('no chromium binary found; set DSH_CHROMIUM')
}

/** True when nothing answers the DevTools endpoint on a port. */
async function portIsFree(port) {
  try {
    await fetch('http://127.0.0.1:' + String(port) + '/json/version', { signal: AbortSignal.timeout(700) })
    return false
  } catch {
    return true
  }
}

/** Pick a random high port nothing is listening on. */
async function freePort() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const port = 9300 + Math.floor(Math.random() * 600)
    if (await portIsFree(port)) return port
  }
  throw new Error('no free DevTools port in 9300-9899')
}

/**
 * Poll /json/version until chromium answers.
 * @param port - the debugging port.
 * @param deadline - epoch ms after which this gives up.
 * @param spawnError - reads the child's spawn failure, if any.
 * @returns the version document.
 */
async function waitForDevtools(port, deadline, spawnError) {
  while (Date.now() < deadline) {
    if (spawnError() !== null) throw new Error('chromium did not start: ' + spawnError())
    try {
      const response = await fetch('http://127.0.0.1:' + String(port) + '/json/version', { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return await response.json()
    } catch {
      // not listening yet
    }
    await sleep(200)
  }
  throw new Error('no DevTools endpoint on 127.0.0.1:' + String(port) + ' after ' + String(DEVTOOLS_BUDGET_MS / 1_000) + 's')
}

/**
 * Find the page target's CDP socket, creating a tab if chromium opened none.
 * @param port - the debugging port.
 * @param deadline - epoch ms after which this gives up.
 * @returns the target descriptor.
 */
async function pageTarget(port, deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:' + String(port) + '/json/list', { signal: AbortSignal.timeout(1_000) })
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find(target => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string')
        if (page !== undefined) return page
      }
    } catch {
      // endpoint not up yet
    }
    try {
      const created = await fetch('http://127.0.0.1:' + String(port) + '/json/new?about:blank', { method: 'PUT', signal: AbortSignal.timeout(1_500) })
      if (created.ok) {
        const target = await created.json()
        if (typeof target.webSocketDebuggerUrl === 'string') return target
      }
    } catch {
      // no page target yet
    }
    await sleep(250)
  }
  throw new Error('chromium exposed no page target')
}

//#endregion

//#region CDP client

/**
 * Open a CDP session on one target.
 * @param url - the target's webSocketDebuggerUrl.
 * @returns `{ send, close }`.
 */
function connect(url) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    let nextId = 1
    let closed = false
    /** Reject everything in flight; a dropped socket must not hang the probe. */
    const failAll = error => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(error)
      }
      pending.clear()
    }
    socket.addEventListener('open', () => resolvePromise({ send, close }))
    socket.addEventListener('close', () => {
      closed = true
      failAll(new Error('CDP socket closed'))
    })
    socket.addEventListener('error', () => {
      failAll(new Error('CDP socket error'))
    })
    socket.addEventListener('message', event => {
      let parsed
      try {
        parsed = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
      } catch {
        return
      }
      const entry = pending.get(parsed.id)
      if (entry === undefined) return
      pending.delete(parsed.id)
      clearTimeout(entry.timer)
      if (parsed.error !== undefined) entry.reject(new Error(parsed.error.message ?? 'CDP error'))
      else entry.resolve(parsed.result)
    })
    /**
     * Call one CDP method.
     * @param method - CDP method name.
     * @param params - method parameters.
     * @param timeoutMs - per-call timeout.
     * @returns the method result.
     */
    function send(method, params = {}, timeoutMs = 15_000) {
      if (closed) return Promise.reject(new Error('CDP socket closed'))
      const id = nextId
      nextId += 1
      return new Promise((resolveCall, rejectCall) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          rejectCall(new Error('CDP timeout: ' + method))
        }, timeoutMs)
        pending.set(id, { resolve: resolveCall, reject: rejectCall, timer })
        try {
          socket.send(JSON.stringify({ id, method, params }))
        } catch (error) {
          clearTimeout(timer)
          pending.delete(id)
          rejectCall(error)
        }
      })
    }
    /** Close the socket. */
    function close() {
      try {
        socket.close()
      } catch {
        // already gone
      }
    }
  })
}

/**
 * Evaluate an expression in the page and return its value.
 * @param session - the CDP session.
 * @param expression - page expression.
 * @param timeoutMs - per-call timeout.
 * @returns the page value.
 */
async function evaluate(session, expression, timeoutMs = 10_000) {
  const result = await session.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs)
  if (result.exceptionDetails !== undefined) {
    const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
    throw new Error('page threw: ' + String(detail))
  }
  return result.result?.value
}

//#endregion

//#region page probes

/** Reports whether the SPA shell has painted anything yet. */
const SHELL_EXPRESSION = `(() => {
  const root = document.querySelector('#root, #app, [data-dsh-root], [data-dsh-app]');
  const body = document.body;
  return {
    readyState: document.readyState,
    rootSelector: root === null ? null : (root.id !== '' ? '#' + root.id : root.tagName.toLowerCase()),
    rootChildren: root === null ? -1 : root.childElementCount,
    bodyChildren: body === null ? -1 : body.childElementCount,
    url: location.href,
    title: document.title,
    text: body === null ? '' : body.innerText.slice(0, 400),
  };
})()`

/**
 * Everything the DOM contract promises, read off the live row.
 * The row is `<div class="<hash>_running" data-chat-running>`; its text is painted
 * by a shimmer gradient built from `currentColor`, so the row's computed `color`
 * is the colour a user sees.
 */
const COLLECT_EXPRESSION = `(() => {
  const rows = document.querySelectorAll('${ROW_SELECTOR}');
  const row = rows.length === 0 ? null : rows[0];
  if (row === null) return { found: false, rows: 0 };
  const rowStyle = getComputedStyle(row);
  const shimmer = row.querySelector('${SHIMMER_SELECTOR}');
  const shimmerStyle = shimmer === null ? null : getComputedStyle(shimmer);
  const read = (style, name) => {
    if (style === null) return null;
    const value = style.getPropertyValue(name).trim();
    return value === '' ? null : value;
  };
  return {
    found: true,
    rows: rows.length,
    text: row.textContent,
    rowColor: rowStyle.color,
    variables: {
      '--dsw-alias-label-deep-diving': read(rowStyle, '--dsw-alias-label-deep-diving'),
      '--dsw-alias-label-shimmer': read(rowStyle, '--dsw-alias-label-shimmer'),
    },
    rowClass: typeof row.className === 'string' ? row.className : null,
    contentPresent: row.querySelector('[class$="_runningContent"]') !== null,
    shimmerPresent: shimmer !== null,
    shimmerText: shimmer === null ? null : shimmer.textContent,
    textShimmerColor: shimmerStyle === null ? null : shimmerStyle.color,
    url: location.href,
    title: document.title,
  };
})()`

//#endregion

//#region main

/** The browser child process, killed in the outer finally block. */
let browser = null
/** The reason chromium refused to start, if it did. */
let spawnFailure = null
/** When this run started. */
const startedAt = Date.now()

/**
 * Launch chromium, wait for the shell, read the running row.
 * @returns the JSON report object.
 */
async function probe() {
  const { waitSeconds, shotPath } = options()
  const hardDeadline = Date.now() + DEVTOOLS_BUDGET_MS + SHELL_BUDGET_MS + waitSeconds * 1_000 + 15_000
  const cookie = mintCookie()

  const port = await freePort()
  const profile = mkdtempSync(join(tmpdir(), 'dsh-live-probe-'))
  browser = spawn(
    chromePath(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--user-data-dir=' + profile,
      '--remote-debugging-port=' + String(port),
      'about:blank',
    ],
    { detached: false, stdio: 'ignore', windowsHide: true },
  )
  browser.on('error', error => {
    spawnFailure = message(error)
  })

  const version = await waitForDevtools(port, Math.min(Date.now() + DEVTOOLS_BUDGET_MS, hardDeadline), () => spawnFailure)
  const target = await pageTarget(port, Math.min(Date.now() + DEVTOOLS_BUDGET_MS, hardDeadline))
  const session = await connect(target.webSocketDebuggerUrl)
  try {
    await session.send('Network.enable', {})
    const common = { name: cookie.name, value: cookie.value, path: '/', expires: Math.floor(cookie.expiresAt / 1_000), httpOnly: false, secure: false, sameSite: 'Lax' }
    const byDomain = await session.send('Network.setCookie', { ...common, domain: new URL(base).hostname })
    if (byDomain?.success === false) {
      const byUrl = await session.send('Network.setCookie', { ...common, url: base })
      if (byUrl?.success === false) throw new Error('the browser refused the session cookie')
    }
    await session.send('Page.enable', {})
    try {
      await session.send('Emulation.setDeviceMetricsOverride', { width: 1_440, height: 900, deviceScaleFactor: 1, mobile: false })
    } catch {
      // cosmetic only: the default 800x600 viewport still works
    }
    await session.send('Page.navigate', { url: base }, 20_000)

    // 1. Wait for the shell, then start the row clock even if it never showed.
    const shellDeadline = Math.min(Date.now() + SHELL_BUDGET_MS, hardDeadline)
    let shell = null
    let shellReady = false
    while (Date.now() < shellDeadline) {
      try {
        shell = await evaluate(session, SHELL_EXPRESSION, 5_000)
        const painted = shell.rootChildren > 0 || (shell.readyState === 'complete' && shell.bodyChildren > 0)
        if (painted) {
          shellReady = true
          break
        }
      } catch {
        // mid-navigation: try again
      }
      await sleep(POLL_MS)
    }

    // 2. Poll for the running status row.
    const rowWaitStartedAt = Date.now()
    const rowDeadline = Math.min(rowWaitStartedAt + waitSeconds * 1_000, hardDeadline)
    let seen = false
    while (Date.now() < rowDeadline) {
      try {
        seen = await evaluate(session, `document.querySelector('${ROW_SELECTOR}') !== null`, 5_000) === true
      } catch {
        seen = false
      }
      if (seen) break
      await sleep(POLL_MS)
    }

    // 3. Read the row, or explain why there is none.
    let data = { found: false, rows: 0 }
    try {
      data = await evaluate(session, COLLECT_EXPRESSION, 10_000)
    } catch (error) {
      if (seen) throw error
    }
    if (data.found !== true) {
      // Re-read the page: the boot snapshot is taken before the sidebar and the
      // session list have loaded, and the settled state is what explains the miss.
      try {
        shell = await evaluate(session, SHELL_EXPRESSION, 5_000)
      } catch {
        // keep the boot snapshot
      }
    }
    const title = data.title ?? shell?.title ?? null
    const url = data.url ?? shell?.url ?? base
    const waitedSeconds = Math.round((Date.now() - rowWaitStartedAt) / 1_000)
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1_000)

    // 4. Optional screenshot of the page in exactly this state. Taken on both
    //    paths: when no row showed up, the picture is the diagnosis.
    let shot = null
    let shotError = null
    if (shotPath !== null) {
      try {
        const capture = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, 20_000)
        writeFileSync(shotPath, Buffer.from(capture.data, 'base64'))
        shot = shotPath
      } catch (error) {
        shotError = message(error)
      }
    }

    if (data.found !== true) {
      let reason = 'no ' + ROW_SELECTOR + ' row appeared within ' + String(waitSeconds) + 's'
      if (!shellReady) reason = 'the app shell never rendered the page root within ' + String(Math.round(SHELL_BUDGET_MS / 1_000)) + 's'
      else if (typeof shell?.text === 'string' && shell.text.trim() !== '') reason += ' (page shows: ' + shell.text.trim().slice(0, 200).replace(/\s+/gu, ' ') + ')'
      const failure = {
        ok: false,
        found: false,
        reason,
        waitedSeconds,
        elapsedSeconds,
        url,
        title,
        shellReady,
        readyState: shell?.readyState ?? null,
        devtools: version.Browser ?? null,
      }
      if (shot !== null) failure.shot = shot
      if (shotError !== null) failure.shotError = shotError
      return failure
    }

    const report = {
      ok: true,
      url,
      title,
      found: true,
      rows: data.rows,
      text: data.text,
      rowColor: data.rowColor,
      shimmerColor: data.variables?.['--dsw-alias-label-shimmer'] ?? null,
      customProperty: data.variables?.['--dsw-alias-label-deep-diving'] ?? null,
      textShimmerColor: data.textShimmerColor,
      shimmerText: data.shimmerText,
      variables: data.variables ?? null,
      rowClass: data.rowClass ?? null,
      contentPresent: data.contentPresent === true,
      shellReady,
      waitedSeconds,
      elapsedSeconds,
      devtools: version.Browser ?? null,
    }
    if (shot !== null) report.shot = shot
    if (shotError !== null) report.shotError = shotError
    return report
  } finally {
    session.close()
  }
}

let report
try {
  report = await probe()
} catch (error) {
  report = {
    ok: false,
    found: false,
    reason: message(error),
    waitedSeconds: 0,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
    url: base,
  }
} finally {
  if (browser !== null && browser.exitCode === null && browser.signalCode === null) {
    try {
      browser.kill()
    } catch {
      // already gone
    }
    // child.kill() reaps the browser process; on Windows the renderer children can
    // outlive it, so take the tree down too. No file is ever deleted.
    if (process.platform === 'win32' && typeof browser.pid === 'number') {
      try {
        const reaper = spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        reaper.on('error', () => {})
      } catch {
        // taskkill unavailable: the browser process itself is already killed
      }
    }
  }
}

process.exitCode = report.ok === true ? 0 : 1
console.log(JSON.stringify(report))
