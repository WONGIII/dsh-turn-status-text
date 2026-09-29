/**
 * Live check against the running dsh web host.
 *
 * The Host serves its settings API on the loopback page behind the browser
 * session cookie, so this harness mints one from the same durable secret the
 * running instance uses (\`$DSH_HOME/.credentials.yaml\`, the
 * \`client-connection/browser-session\` record) and then:
 *
 *   node tools/verify-live.mjs                  # list the settings namespaces the Host serves
 *   node tools/verify-live.mjs --set "文字"      # write the plugin's text field
 *   node tools/verify-live.mjs --color "#ff5500" # write the plugin's colour field
 *   node tools/verify-live.mjs --color -         # clear the colour (theme default)
 *   node tools/verify-live.mjs --clear           # drop both overrides
 *
 * It answers the one question the browser cannot be asked from a terminal: is
 * this plugin's settings namespace actually served (and therefore is its card
 * dispatched in Settings -> Plugins -> 可配置)? The secret is never printed.
 */
import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const NS = 'turn-status-text'
const FIELD = 'text'
const COLOR_FIELD = 'color'
const base = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080'
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')

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

const authority = new URL(base).host
const secret = readSecret()
const cookieName = 'dsh-auth-' + base64url(createHash('sha256').update(authority).digest())
const issuedAt = Date.now()
const body = base64url(JSON.stringify({ version: 1, authority, issuedAt, expiresAt: issuedAt + 3_600_000 }))
const cookie = cookieName + '=v1.' + body + '.' + base64url(createHmac('sha256', secret).update(body).digest())

/**
 * Call one settings endpoint.
 * @param method - endpoint path below /api.
 * @param payload - endpoint payload.
 * @returns the endpoint result.
 */
async function rpc(method, payload) {
  const response = await fetch(new URL('/api/' + method, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: 'verify-' + String(Date.now()), method, payload: { args: payload } }),
  })
  if (!response.ok) throw new Error(method + ' -> HTTP ' + String(response.status) + ': ' + await response.text())
  const message = await response.json()
  if (message.result?.ok !== true) throw new Error(method + ' -> ' + JSON.stringify(message.result?.error ?? message.result))
  return message.result.value
}

const mode = process.argv[2]
const view = await rpc('settings/describe', {})

if (mode === '--set' || mode === '--clear' || mode === '--color') {
  if (mode === '--set' && String(process.argv[3] ?? '') === '') throw new Error('--set needs a value')
  if (mode === '--color' && process.argv[3] === undefined) throw new Error('--color needs a colour code or "-"')
  const ops = []
  if (mode === '--set') ops.push({ op: 'set', path: [FIELD], value: String(process.argv[3]) })
  if (mode === '--color') {
    const code = String(process.argv[3])
    ops.push(code === '-' ? { op: 'unset', path: [COLOR_FIELD] } : { op: 'set', path: [COLOR_FIELD], value: code })
  }
  if (mode === '--clear') ops.push({ op: 'unset', path: [FIELD] }, { op: 'unset', path: [COLOR_FIELD] })
  const written = await rpc('settings/mutate', { ns: NS, ops, expectedRevision: undefined })
  const verb = mode === '--set' ? 'wrote text' : mode === '--color' ? (String(process.argv[3]) === '-' ? 'cleared colour' : 'wrote colour') : 'cleared overrides'
  console.log(verb, NS, '->', JSON.stringify(written?.value ?? written))
} else {
  const namespaces = view.namespaces ?? []
  console.log('writable:', view.writable, '| namespaces served by the Host:', namespaces.length)
  for (const entry of namespaces) console.log(' -', entry.ns)
  const mine = namespaces.find(entry => entry.ns === NS)
  console.log(mine === undefined
    ? 'MISSING: ' + NS + ' is not served (the card would not be dispatched)'
    : 'OK: ' + NS + ' is served -> ' + JSON.stringify(mine.value ?? null))
  if (mine === undefined) process.exitCode = 1
}
