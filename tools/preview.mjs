/**
 * Render the card to a standalone HTML page, next to the plugin card the
 * deployment ships, so the design can be compared side by side (and
 * screenshotted) without opening the GUI.
 *
 * The card markup comes from the real bundle: the harness drives lib/client.js
 * through the same minimal React the self-check uses and serializes the element
 * tree. The shipped `终端` card is reproduced from the deployed package's own
 * PluginCard/BashCard/ValueField source and styled with its own CSS modules, so
 * both cards stand under identical theme tokens.
 *
 * Usage: node tools/preview.mjs [outPath]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = process.argv[2] ?? join(here, 'preview.html')

//#region real theme tokens
/** The deployment's own design tokens, lifted from the shipped theme bundle. */
function themeCss() {
  const themePath = join(
    process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? '', '.dsh'),
    'profiles/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js',
  )
  const source = readFileSync(themePath, 'utf8')
  const start = source.indexOf('var design_platform_css_default = "')
  const from = start + 'var design_platform_css_default = "'.length
  const end = source.indexOf('";', from)
  return JSON.parse('"' + source.slice(from, end) + '"')
}
//#endregion

//#region the shipped card, for comparison
/**
 * The shipped plugin card's CSS modules, lifted from the deployed bundle.
 * Deployments differ: a build whose settings-plugins bundle no longer carries
 * that card answers with an empty string, and the preview then shows this
 * plugin's card alone instead of failing.
 * @returns the shipped card CSS, or an empty string when it is not deployed here.
 */
function shippedCss() {
  const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? '', '.dsh')
  for (const root of ['profiles/node_modules', 'profiles/desktop/node_modules']) {
    const bundlePath = join(home, root, '@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js')
    let source
    try {
      source = readFileSync(bundlePath, 'utf8')
    } catch (error) {
      continue
    }
    const strings = [...source.matchAll(/const css\$?[0-9]* = "((?:[^"\\]|\\.)*)"/g)].map((match) => match[1])
    const card = strings.find((value) => value.includes('_card{border:'))
    const field = strings.find((value) => value.includes('_input{border:'))
    if (card !== undefined && field !== undefined) return card + field
  }
  console.log('note: the shipped card is not readable in this deployment; previewing this plugin\'s card alone')
  return ''
}
//#endregion

//#region fake React + serializer
/** Hook-order-preserving stand-in for the React entry points the card uses. */
function createFakeReact() {
  const slots = []
  let cursor = 0
  return {
    reset() {
      cursor = 0
    },
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], () => {}]
    },
    useId() {
      cursor += 1
      return 'preview-' + String(cursor)
    },
    useEffect() {
      cursor += 1
    },
  }
}

const fakeReact = createFakeReact()
const primitives = {
  IconChevronDownOutline14: (props) => ({ type: 'svg', props: { ...props, viewBox: '0 0 14 14', width: 14, height: 14, children: { type: 'path', props: { d: 'M2 5l5 5 5-5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' } } } }),
  Tag: (props) => ({ type: 'span', props }),
}

/** React prop names that differ from their HTML attribute. */
const ATTRIBUTE_NAMES = { className: 'class', htmlFor: 'for', spellCheck: undefined, ariaLabel: 'aria-label' }

/** Serialize an element tree to HTML, with the escapes an attribute needs. */
function render(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render).join('')
  const tag = typeof node.type === 'string' ? node.type : 'span'
  const props = node.props ?? {}
  const attributes = Object.entries(props)
    .map(([key, value]) => [ATTRIBUTE_NAMES[key] === undefined && key in ATTRIBUTE_NAMES ? undefined : ATTRIBUTE_NAMES[key] ?? key, value])
    .filter(([key, value]) => key !== undefined && key !== 'children' && value !== false && value !== undefined)
    .map(([key, value]) => ' ' + key + '="' + String(value).replace(/"/g, '&quot;') + '"')
    .join('')
  const style = props.style
  const styleAttribute = style === undefined
    ? ''
    : ' style="' + Object.entries(style).map(([key, value]) => key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ':' + String(value)).join(';') + '"'
  return '<' + tag + attributes + styleAttribute + '>' + render(props.children) + '</' + tag + '>'
}
//#endregion

//#region drive the real bundle
/** Captured registration. */
let registration
globalThis.window = { __ModuleLoader__: { load(value) { registration = value } } }
// A <style>-less document: the harness renders markup, not a live plugin host.
globalThis.document = {
  head: { appendChild() {}, removeChild() {} },
  createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
  styleSheets: [],
  querySelector: () => null,
}

await import(pathToFileURL(join(root, 'lib/client.js')).href)
const plugin = registration.factory((spec) => {
  if (spec === 'react') return fakeReact
  if (spec === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props: props ?? {} }), jsxs: (type, props) => ({ type, props: props ?? {} }), Fragment: 'fragment' }
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error('unexpected require: ' + spec)
})

/** A settings scope snapshot with both fields overridden, as a configured user sees. */
function scopeWith(value, user) {
  return {
    getSnapshot: () => ({ status: 'ready', value, user, writable: true, revision: 1 }),
    subscribe: () => () => {},
    set: async () => {},
    unset: async () => {},
    mutate: async () => {},
  }
}

const locale = {
  register: () => () => {},
  bind: () => (key) => require0(key),
}
/** Minimal dictionary lookup for the card's own namespace. */
function require0(key) {
  const zh = {
    title: '状态文案',
    description: '请求模型时聊天区显示的那行文字与颜色',
    textField: '自定义文字',
    textHint: '留空并保存即恢复默认。保存后立即生效，无需刷新页面。',
    colorField: '文字颜色',
    colorHint: '用调色盘或直接填颜色代码（如 #4d6bfe）。留空并保存即恢复主题默认色。',
    colorPlaceholder: '#4d6bfe（留空 = 主题默认）',
    colorInvalid: '颜色代码无效：支持 #rgb 或 #rrggbb。',
    colorInvalidShort: '默认色',
    preview: '预览',
    overridden: '已覆盖',
    reset: '恢复默认',
    unsaved: '未保存',
    save: '保存',
    saving: '保存中…',
    discard: '放弃修改',
    readOnly: '本部署的设置为只读。',
    saveFailed: '本部署没有接受这些值，已保留供你修改。',
    expand: '展开设置',
    collapse: '收起设置',
  }
  return zh[key] ?? key
}

let card
plugin.apply({
  locale,
  effect: (callback) => { callback(); return () => {} },
  inject: (deps, callback) => {
    callback({
      settingsScope: { bind: () => scopeWith({ text: '与神对话中…', color: '#8053c6' }, { text: '与神对话中…', color: '#8053c6' }) },
      slots: { inject: (name, register) => { card = register(); return () => {} }, register: (options, component) => ({ options, component }) },
      effect: (callback) => { callback(); return () => {} },
    })
  },
})

function cardHtml(open) {
  fakeReact.reset()
  return render(card.component({
    t: require0,
    useTurnStatusText: (select) => select({ available: true, writable: true, dirty: false, saving: false, failed: false, text: '与神对话中…', textOverridden: true, color: '#8053c6', colorDraft: '#8053c6', colorInvalid: false, colorOverridden: true, colorPicker: '#8053c6' }),
    edit: () => {},
    resetField: () => {},
    discard: () => {},
    save: () => {},
  }))
}
//#endregion

const cardCss = readFileSync(join(root, 'lib/client.js'), 'utf8').match(/var CARD_CSS = \[([\s\S]*?)\]\.join\(""\)/)[1]
  .split('",')
  .map((part) => part.trim().replace(/^"/, '').replace(/"$/, ''))
  .join('')

/** The shipped 终端 card, reproduced from the deployed package's own components. */
const shippedCard = (open) => `<li class="YyYd_a_card${open ? ' YyYd_a_cardOpen' : ''}">
  <button type="button" class="YyYd_a_header" aria-expanded="${open}">
    <span class="YyYd_a_headText"><span class="YyYd_a_name">终端</span><span class="YyYd_a_description">限制 agent 运行的每一条命令。</span></span>
    <svg class="YyYd_a_chevron${open ? ' YyYd_a_chevronOpen' : ''}" width="14" height="14" viewBox="0 0 14 14"><path d="M2 5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
  </button>
  ${open ? `<div class="YyYd_a_body">
    <div class="At1oFq_field">
      <div class="At1oFq_head">
        <label class="At1oFq_label">命令超时（毫秒）</label>
        <span class="At1oFq_badges"><span class="dshTagNeutral">已覆盖</span><button type="button" class="At1oFq_reset">恢复默认</button></span>
      </div>
      <input class="At1oFq_input" value="120000">
      <p class="At1oFq_hint">单条命令允许运行多久，超时即终止。</p>
    </div>
    <div class="YyYd_a_footer">
      <button type="button" class="YyYd_a_discard" disabled>放弃修改</button>
      <button type="button" class="YyYd_a_save" disabled>保存</button>
    </div>
  </div>` : ''}
</li>`

const shipped = shippedCss()
const reference = (open) => (shipped === '' ? '' : shippedCard(open))

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>dsh-turn-status-text preview</title>
<style>
${themeCss()}
${shipped}
${cardCss}
/* harness chrome only */
body{margin:0;padding:32px;font:var(--dsw-font-s-14);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.pvGrid{display:flex;gap:32px;align-items:flex-start;flex-wrap:wrap}
.pvPanel{width:520px}
.pvLabel{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:0 0 8px}
.pvList{display:flex;flex-direction:column;gap:12px;list-style:none;margin:0;padding:0}
.dshTagNeutral{padding:1px 8px;border-radius:999px;font-size:12px;line-height:18px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
</style></head>
<body>
<div class="pvGrid">
  <div class="pvPanel" data-theme="light">
    <p class="pvLabel">浅色 · 上=本插件卡片${shipped === '' ? '' : '，下=部署自带卡片（对照）'}</p>
    <ul class="pvList">${cardHtml(true)}${reference(true)}</ul>
  </div>
  <div class="pvPanel" data-theme="dark" data-ds-dark-theme>
    <p class="pvLabel">深色</p>
    <ul class="pvList">${cardHtml(true)}${reference(true)}</ul>
  </div>
</div>
</body></html>`

writeFileSync(out, page, 'utf8')
console.log('preview written:', out)
