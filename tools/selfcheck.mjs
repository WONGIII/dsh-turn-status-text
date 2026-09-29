/**
 * Self-check for the browser half of dsh-turn-status-text.
 *
 * Runs lib/client.js headlessly, the way the web shell does (a classic script
 * that only registers a factory), and drives it against mocks that mirror the
 * shipped implementations:
 *
 *   - LocaleRuntime: \`bind(ns)\` returns a closure resolving \`this.translate\` at
 *     call time — the seam the label override shadows.
 *   - SettingsScope: \`getSnapshot()\` over \`{status, value, user, writable}\` plus
 *     \`mutate\`/\`set\`/\`unset\` that fold the write back into the snapshot and notify.
 *   - The chat stylesheet: the running row is styled by attributes
 *     (\`[data-chat-running]\`) the plugin can address without discovery, and a
 *     legacy build's content-hashed \`.EvIC1a_turnStatus\` rule arrives later, so
 *     both paths are exercised against a \`<head>\` that records the style element
 *     the plugin injects — the colour assertions inspect the exact CSS text.
 *   - The slot renderer's contract: a card registers into \`settings.plugin.item\`
 *     with the settings namespace as its key, gets its \`hooks\` face bound as a
 *     \`use<Name>\` prop, and renders an element tree.
 *
 * React is not installed beside this plugin (the web shell bundles it), so the
 * harness ships a minimal React with the hooks the card uses; rendering is then
 * a direct component call plus a tree walk.
 *
 * Usage: node tools/selfcheck.mjs [bundlePath]
 * (the optional argument checks an already-served copy, e.g. the file the running
 *  web server hands the browser at /plugins/??<pkg>/client.js)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = process.argv[2] ?? join(here, '..', 'lib', 'client.js')

/** Legacy status class a pre-0.1.7 build gives the label (hash prefix + local name). */
const LEGACY_STATUS_CLASS = 'EvIC1a_turnStatus'

//#region fake DOM
/** A \`<head>\` that records appended style elements and supports removal. */
function createHead() {
  const head = {
    children: [],
    appendChild(element) {
      element.parentNode = head
      head.children.push(element)
      return element
    },
    removeChild(element) {
      const index = head.children.indexOf(element)
      if (index >= 0) head.children.splice(index, 1)
      element.parentNode = null
      return element
    },
  }
  return head
}

/**
 * Minimal document: style sheets for class discovery and a head for the injected rule.
 * @param selectors - selector texts the initial style sheet exposes.
 */
function createDocument(selectors) {
  const head = createHead()
  const document = {
    head,
    body: head,
    styleSheets: [{ cssRules: selectors.map((selectorText) => ({ selectorText })) }],
    /** Add a sheet later, as a lazily materialized plugin stylesheet would. */
    addSheet(selectorText) {
      document.styleSheets.push({ cssRules: [{ selectorText }] })
    },
    createElement(tagName) {
      return {
        tagName,
        textContent: '',
        parentNode: null,
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value
        },
        getAttribute(name) {
          return this.attributes[name] ?? null
        },
        remove() {
          if (this.parentNode !== null) this.parentNode.removeChild(this)
          this.parentNode = null
        },
      }
    },
    querySelector() {
      return null
    },
  }
  return document
}
//#endregion

//#region minimal React + jsx runtime
/** Hook-order-preserving stand-in for the React entry points the card uses. */
function createFakeReact() {
  let slots = []
  let cursor = 0
  return {
    reset() {
      cursor = 0
    },
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], (next) => {
        slots[index] = typeof next === 'function' ? next(slots[index]) : next
      }]
    },
    useId() {
      cursor += 1
      return 'self-check-input-' + String(cursor)
    },
    useEffect() {
      cursor += 1
    },
  }
}

function createElement(type, props) {
  return { type, props: props ?? {} }
}

const fakeReact = createFakeReact()
const jsxRuntime = {
  jsx: createElement,
  jsxs: createElement,
  Fragment: Symbol('Fragment'),
}

/** First element carrying the given class name. */
function findByClass(node, className) {
  for (const element of walk(node)) {
    const value = element.props?.className
    if (typeof value === 'string' && value.split(' ').includes(className)) return element
  }
  return undefined
}

/** Depth-first walk of a rendered element tree. */
function* walk(node) {
  if (node === null || node === undefined || typeof node !== 'object') return
  yield node
  const children = node.props?.children
  const list = Array.isArray(children) ? children : [children]
  for (const child of list) {
    if (Array.isArray(child)) {
      for (const nested of child) yield* walk(nested)
    } else {
      yield* walk(child)
    }
  }
}

/** Every element of the given tag in the tree. */
function findAll(node, type) {
  return [...walk(node)].filter((element) => element.type === type)
}

/** First element of the given tag in the tree. */
function find(node, type) {
  return findAll(node, type)[0]
}

/** Card copy as the locale seat would serve it. */
const CARD_COPY = {
  title: '状态文案',
  description: '模型工作时聊天区显示的那行文字与颜色',
  textField: '自定义文字',
  textPlaceholder: '深度求索中，用时 {duration} ···',
  textHint: '留空并保存即恢复默认文案；写 {duration} 占位符可保留实时用时。',
  colorField: '文字颜色',
  colorHint: '用调色盘或直接填颜色代码。',
  colorPlaceholder: '#4d6bfe（留空 = 主题默认）',
  colorInvalid: '颜色代码无效：支持 #rgb 或 #rrggbb。',
  colorReset: '恢复默认',
  preview: '预览',
  sampleDuration: '12秒',
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
//#endregion

//#region registration capture
/** Captured registration from window.__ModuleLoader__.load(). */
let registration
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      registration = value
    },
  },
}

// The chat stylesheet is not on the page yet: the plugin must survive that and
// pick the class up once the sheet arrives (asserted further down).
globalThis.document = createDocument([])

await import(pathToFileURL(bundlePath).href)

assert.ok(registration, 'the bundle registers itself with window.__ModuleLoader__.load()')
assert.equal(registration.id, '@dsh-external/dsh-turn-status-text')
assert.equal(typeof registration.factory, 'function')

// The shell seeds this table word; the card uses the deployment's own icon and tag.
const fakePrimitives = {
  IconChevronDownOutline14: (props) => createElement('svg', props),
  Tag: (props) => createElement('span', props),
}

const plugin = registration.factory((spec) => {
  if (spec === 'react') return fakeReact
  if (spec === 'react/jsx-runtime') return jsxRuntime
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return fakePrimitives
  throw new Error('unexpected require: ' + spec)
})

assert.deepEqual(plugin.inject, ['slots', 'locale'])
assert.equal(typeof plugin.apply, 'function')
//#endregion

//#region mocks mirroring the shipped services
/** Mirrors LocaleRuntime's bind/translate/lookup behaviour. */
class LocaleRuntime {
  constructor(dictionaries) {
    this.dictionaries = dictionaries
    this.bound = new Map()
    this.dictionary = undefined
  }
  register(ns, dicts) {
    this.dictionary = { ns, dicts }
    this.dictionaries[ns] = dicts.zh
    return () => {
      this.dictionary = undefined
      delete this.dictionaries[ns]
    }
  }
  bind(ns) {
    let t = this.bound.get(ns)
    if (t === undefined) {
      t = (key, params) => this.translate(ns, key, params)
      this.bound.set(ns, t)
    }
    return t
  }
  translate(ns, key, params) {
    const lookup = (namespace) => this.dictionaries[namespace]?.[key]
    const template = lookup(ns) ?? (ns === 'common' ? undefined : lookup('common')) ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
  }
}

/**
 * Mirrors SettingsScopeController: a snapshot store over one namespace's view,
 * with the Host folding accepted writes back into it.
 * @param initial - starting section value.
 * @param options - \`sequential\` drops \`mutate\` to exercise the set/unset fallback;
 *   \`defaults\` are the schema defaults an \`unset\` re-applies to the resolved value.
 */
function createSettingsScope(initial, options = {}) {
  const defaults = options.defaults ?? {}
  let snapshot = {
    status: 'ready',
    value: initial.value,
    user: initial.user ?? initial.value,
    base: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
  }
  const listeners = new Set()
  const writes = []
  const apply_ = (op) => {
    const value = { ...snapshot.value }
    const user = { ...snapshot.user }
    if (op.op === 'unset') {
      // The Host re-resolves the section, so a cleared field shows its schema
      // default again — only the user layer forgets it.
      if (op.path[0] in defaults) value[op.path[0]] = defaults[op.path[0]]
      else delete value[op.path[0]]
      delete user[op.path[0]]
    } else {
      value[op.path[0]] = op.value
      user[op.path[0]] = op.value
    }
    snapshot = { ...snapshot, value, user, revision: snapshot.revision + 1 }
  }
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  const scope = {
    writes,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async set(field, value) {
      writes.push({ op: 'set', path: [field], value })
      apply_({ op: 'set', path: [field], value })
      notify()
    },
    async unset(field) {
      writes.push({ op: 'unset', path: [field] })
      apply_({ op: 'unset', path: [field] })
      notify()
    },
  }
  if (options.sequential !== true) {
    scope.mutate = async (ops) => {
      for (const op of ops) {
        writes.push(op)
        apply_(op)
      }
      notify()
    }
  }
  return scope
}
//#endregion

//#region activate the plugin against the mocks
const locale = new LocaleRuntime({
  chat: {
    'chat.deepDiving': '深度求索中...',
    'chat.deepDivingFor': '深度求索中，用时 {duration} ···',
    'view.chat': '对话',
  },
  common: { close: '关闭' },
})

const scope = createSettingsScope(
  { value: { text: '', color: '' } },
  { defaults: { text: '', color: '' } },
)
const disposers = []
const slotRegistrations = []
let settingsScopeSpec
let injectedDeps

const ctx = {
  locale,
  effect(callback) {
    const dispose = callback()
    disposers.push(dispose)
    return dispose
  },
  inject(deps, callback) {
    injectedDeps = deps
    injectedCallback = callback
  },
}

let injectedCallback
plugin.apply(ctx)

assert.deepEqual(injectedDeps, ['settingsScope', 'slots'], 'the card activates only where settings and slots exist')

const seat = locale.bind('chat')
assert.equal(seat('chat.deepDiving'), '深度求索中...', 'an untouched install renders the shipped copy')

// The card stylesheet is injected with the plugin and speaks only in theme tokens:
// the light-theme regression this guards against was a hard-coded dark fallback.
const cardCss = globalThis.document.head.children[0]
assert.equal(cardCss.attributes['data-plugin-css'], 'dsh-turn-status-text/card', 'the card stylesheet is plugin-owned')
assert.ok(cardCss.textContent.includes('.dshTst_card{'), 'the stylesheet defines the card rule')
assert.ok(cardCss.textContent.includes('background:var(--dsw-alias-bg-layer-3)'), 'fields use the theme layer token')
assert.ok(cardCss.textContent.includes('color:var(--dsw-alias-label-primary)'), 'field text uses the theme label token')
assert.ok(cardCss.textContent.includes('--dsw-alias-border-l4') && cardCss.textContent.includes('--dsw-alias-border-l2'), 'borders use theme tokens')
assert.ok(cardCss.textContent.includes('--dsw-alias-label-error'), 'invalid copy uses the theme error token')
assert.ok(cardCss.textContent.includes('white-space:nowrap'), 'button and reset labels cannot wrap')
assert.ok(!/var\(--dsw-alias-bg-layer[,)]/.test(cardCss.textContent), 'no bare --dsw-alias-bg-layer: that token does not exist')
assert.ok(!/#1e1e1e|#e6e6e6|#161616/.test(cardCss.textContent), 'no hard-coded colours: the light/dark switch is the theme\'s')
const openBraces = (cardCss.textContent.match(/\{/g) ?? []).length
const closeBraces = (cardCss.textContent.match(/\}/g) ?? []).length
assert.equal(openBraces, closeBraces, 'every card rule is closed: ' + String(openBraces) + ' blocks')

const scoped = {
  settingsScope: {
    bind(spec) {
      settingsScopeSpec = spec
      return scope
    },
  },
  slots: {
    inject(name, register) {
      assert.equal(name, 'settings.plugin.item')
      return register()
    },
    register(options, component) {
      slotRegistrations.push({ options, component })
      return () => {}
    },
  },
  effect(callback) {
    const dispose = callback()
    disposers.push(dispose)
    return dispose
  },
}
injectedCallback(scoped)

assert.deepEqual(settingsScopeSpec, { namespace: 'turn-status-text' }, 'the card binds this plugin\'s settings namespace')
assert.equal(slotRegistrations.length, 1, 'exactly one card is contributed')
const card = slotRegistrations[0]
assert.equal(card.options.name, 'settings.plugin.item')
assert.equal(card.options.key, 'turn-status-text', 'the slot key is the settings namespace the Host serves')
assert.equal(card.options.locale, 'turn-status-text')
assert.equal(typeof card.component, 'function')
assert.ok(locale.dictionary?.ns === 'turn-status-text', 'the card registers its own dictionary namespace')
//#endregion

//#region label resolution
assert.equal(seat('chat.deepDiving'), '深度求索中...', 'with nothing configured the shipped copy is forwarded untouched')
assert.equal(seat('chat.deepDivingFor', { duration: '12秒' }), '深度求索中，用时 12秒 ···', 'the shipped running copy keeps its own interpolation')
assert.equal(seat('view.chat'), '对话', 'non-target keys keep their dictionary copy')
assert.equal(seat('close'), '关闭', 'the common namespace keeps its dictionary copy')
assert.equal(seat('missing.key'), 'missing.key', 'unknown keys still fall through to the key itself')

globalThis.__DSH_TURN_STATUS_TEXT__ = '临时覆盖'
assert.equal(seat('chat.deepDiving'), '临时覆盖', 'the page-global dev override wins')
delete globalThis.__DSH_TURN_STATUS_TEXT__

await scope.set('text', '来自设置的文案')
assert.equal(seat('chat.deepDiving'), '来自设置的文案', 'a settings write reaches the rendered label')
assert.equal(seat('chat.deepDivingFor', { duration: '12秒' }), '来自设置的文案', 'a text without the placeholder drops the elapsed time')

await scope.set('text', '思考中 {duration}')
assert.equal(seat('chat.deepDivingFor', { duration: '12秒' }), '思考中 12秒', 'the {duration} placeholder keeps the live elapsed time')
assert.equal(seat('chat.deepDiving'), '思考中', 'the pre-clock key strips the placeholder instead of printing it')
assert.equal(seat('message.turnProcess.deepDivingFor', { duration: '12秒' }), '思考中 12秒', 'the 0.1.7 turn-process key is covered too')

await scope.unset('text')
assert.equal(seat('chat.deepDiving'), '深度求索中...', 'clearing the field restores the shipped copy')
assert.equal(seat('chat.deepDivingFor', { duration: '12秒' }), '深度求索中，用时 12秒 ···', 'and the shipped running copy with it')

assert.equal(plugin.renderOverride('思考中 {duration} ···', undefined), '思考中 ···', 'an unfilled placeholder collapses instead of leaking braces')
assert.equal(plugin.renderOverride('宝宝思考中', { duration: '12秒' }), '宝宝思考中', 'a text without the placeholder is rendered verbatim')
assert.equal(plugin.renderOverride('深度求索中，用时 {duration} ···', { duration: '12秒' }), '深度求索中，用时 12秒 ···', 'the shipped template shape round-trips')
assert.equal(plugin.isStatusKey('chat.deepDivingFor'), true, 'the running key is owned')
assert.equal(plugin.isStatusKey('chat.deepDiving'), true, 'the pre-clock key is owned')
assert.equal(plugin.isStatusKey('view.chat'), false, 'other chat keys are not touched')
//#endregion

//#region colour
assert.deepEqual(plugin.normalizeColor('#ABC'), '#aabbcc', 'short hex expands')
assert.deepEqual(plugin.normalizeColor('4D6BFE'), '#4d6bfe', 'a bare code is accepted and lowercased')
assert.equal(plugin.normalizeColor('red'), undefined, 'a named colour is not a colour code')
assert.equal(plugin.normalizeColor('#12345'), undefined, 'a malformed code is rejected')
assert.equal(plugin.normalizeColor(''), undefined, 'an empty draft is not a colour')

const head = globalThis.document.head
assert.equal(head.children.length, 1, 'no colour rule is injected while the section carries none')

// The running row is addressed through the attributes its build stamps on it, so
// nothing has to be discovered before a stored colour can apply.
await scope.set('color', '#ff5500')
assert.equal(head.children.length, 2, 'the colour rule is injected as soon as a colour is stored')
const styleEl = head.children[1]
assert.equal(styleEl.tagName, 'style')
assert.equal(styleEl.attributes['data-plugin-css'], 'dsh-turn-status-text', 'the injected rule is marked as plugin-owned')
assert.ok(styleEl.textContent.includes('[data-chat-running][data-chat-running]{color:#ff5500'), 'the running row is addressed by attribute, doubled to out-specify the generated class: ' + styleEl.textContent.slice(0, 90))
assert.ok(styleEl.textContent.includes('--dsw-alias-label-deep-diving:#ff5500'), 'the shipped accent variable is re-pointed on the same row')
assert.ok(styleEl.textContent.includes('--dsw-alias-label-shimmer:#ff5500'), 'the shimmer variable follows the chosen colour')
assert.ok(styleEl.textContent.includes('[data-turn-process][data-turn-process]{color:#ff5500}'), 'the 0.1.7 turn-process row is covered')
assert.ok(!styleEl.textContent.includes('background-image'), 'no gradient rule is emitted while no legacy class is on the page')
assert.ok(!styleEl.textContent.includes('_turnStatus'), 'nothing is guessed about a class that is not there')

// A legacy build materializes its content-hashed status class later; the rule
// picks it up and rebuilds the old gradient around the chosen colour.
globalThis.document.addSheet('.' + LEGACY_STATUS_CLASS)
await scope.set('color', '#ff5500')
assert.ok(
  styleEl.textContent.includes('.' + LEGACY_STATUS_CLASS + '.' + LEGACY_STATUS_CLASS + '{background-image:'),
  'the legacy gradient label is recoloured once its class appears',
)
assert.ok(styleEl.textContent.includes('color-mix(in srgb, #ff5500 45%, #fff)'), 'the shimmer highlight is derived from the chosen colour')
assert.equal(head.children.length, 2, 'the same rule is rewritten, not duplicated')

await scope.set('color', '#0f0')
assert.ok(styleEl.textContent.includes('#00ff00'), 'a new colour rewrites the same rule in place')
assert.equal(head.children.length, 2, 'no duplicate style element is appended')

await scope.unset('color')
assert.equal(styleEl.textContent, '', 'clearing the colour leaves the shipped styling untouched')
assert.equal(head.children.length, 2, 'the style element stays owned while the plugin is mounted')

assert.deepEqual(
  plugin.colorCss('#ff5500', LEGACY_STATUS_CLASS),
  '[data-chat-running][data-chat-running]{color:#ff5500;--dsw-alias-label-deep-diving:#ff5500;--dsw-alias-label-shimmer:#ff5500}'
  + '[data-turn-process][data-turn-process]{color:#ff5500}'
  + '.' + LEGACY_STATUS_CLASS + '.' + LEGACY_STATUS_CLASS + '{background-image:linear-gradient(90deg, #ff5500 0%, #ff5500 40%, #ff5500 50%, #ff5500 60%, #ff5500 100%);background-image:linear-gradient(90deg, #ff5500 0%, #ff5500 40%, color-mix(in srgb, #ff5500 45%, #fff) 50%, #ff5500 60%, #ff5500 100%)}',
  'the emitted stylesheet is exactly the attribute rules plus the legacy gradient',
)

await scope.set('color', '#123456')

// The page-global dev override beats the stored section, and an unusable global
// falls back to it instead of blanking the colour.
globalThis.__DSH_TURN_STATUS_COLOR__ = '#00ff00'
assert.equal(plugin.effectiveColor(), '#00ff00', 'the page-global colour wins over the stored one')
await scope.set('color', '#123456')
assert.ok(styleEl.textContent.includes('color:#00ff00'), 'the page-global colour reaches the injected rule')
globalThis.__DSH_TURN_STATUS_COLOR__ = 'not-a-colour'
assert.equal(plugin.effectiveColor(), '#123456', 'an unusable page global falls back to the stored colour')
delete globalThis.__DSH_TURN_STATUS_COLOR__
await scope.set('color', '#123456')
assert.ok(styleEl.textContent.includes('color:#123456'), 'deleting the global restores the stored colour')
//#endregion

//#region card rendering and writes
/** Render the card the way the slot renderer does: hooks face bound to use<Name>. */
function renderCard(face) {
  fakeReact.reset()
  const props = {
    t: (key) => CARD_COPY[key] ?? key,
    useTurnStatusText: (select) => select(face.hooks.turnStatusText.getSnapshot()),
    edit: face.edit,
    resetField: face.resetField,
    discard: face.discard,
    save: face.save,
  }
  return card.component(props)
}

let tree = renderCard(card.options.inject())
assert.equal(find(tree, 'li') !== undefined, true, 'the card renders a list item')
let inputs = findAll(tree, 'input')
assert.equal(inputs.length, 3, 'the card renders a text field, a colour swatch, and a colour code field')
const [textInput, swatchInput, codeInput] = inputs
assert.equal(textInput.props.type, 'text', 'the first field is the label text')
assert.equal(textInput.props.placeholder, CARD_COPY.textPlaceholder, 'the empty text field shows the shipped copy as its placeholder')
assert.equal(swatchInput.props.type, 'color', 'the second field is the colour picker')
assert.equal(codeInput.props.type, 'text', 'the third field is the colour code')
assert.equal(swatchInput.props.value, '#123456', 'the picker opens on the stored colour')
assert.equal(codeInput.props.value, '#123456', 'the code field shows the stored colour')
assert.equal(codeInput.props.placeholder, CARD_COPY.colorPlaceholder)
const previewPair = findByClass(tree, 'dshTst_preview')
assert.ok(previewPair, 'the card renders the preview line')
assert.equal(findByClass(tree, 'dshTst_previewLabel').props.children, CARD_COPY.preview)
assert.equal(findByClass(tree, 'dshTst_previewText').props.children, '深度求索中，用时 12秒 ···', 'an empty draft previews the shipped copy with a sample duration')
assert.equal(findByClass(tree, 'dshTst_previewText').props.style.color, '#123456', 'the preview paints the stored colour')
assert.ok(
  [...walk(tree)].some((element) => element.type === fakePrimitives.IconChevronDownOutline14),
  'the header renders the deployment\'s own chevron component',
)
assert.equal(
  [...walk(tree)].find((element) => element.type === fakePrimitives.IconChevronDownOutline14).props.className,
  'dshTst_chevron dshTst_chevronOpen',
  'the chevron is rotated while the card is expanded',
)

// Stage a colour through the picker: the draft follows it, the section does not.
const liveFace = card.options.inject()
renderCard(liveFace)
liveFace.edit('color', '#00c2a8')
let liveTree = renderCard(liveFace)
assert.equal(findAll(liveTree, 'input')[2].props.value, '#00c2a8', 'the staged colour shows in the code field')
assert.equal(findAll(liveTree, 'input')[1].props.value, '#00c2a8', 'the staged colour shows in the picker')
assert.equal(scope.getSnapshot().value.color, '#123456', 'staging alone does not write to the section')
assert.equal(findByClass(liveTree, 'dshTst_previewText').props.style.color, '#00c2a8', 'the preview paints the staged colour')
assert.equal(findByClass(liveTree, 'dshTst_badge').props.children, CARD_COPY.unsaved, 'an unsaved edit marks the header')
// The platform renders the override badge and its reset control together, inside a
// badges group that appears only while the field carries a user-layer entry.
const overrideGroups = [...walk(liveTree)].filter((element) => element.props?.className === 'dshTst_badges')
assert.equal(overrideGroups.length, 1, 'only the field carrying an override shows the badge group')
assert.equal(overrideGroups[0].props.children[0].props.children, CARD_COPY.overridden, 'a stored override is badged on its field')
assert.equal(overrideGroups[0].props.children[1].props.children, CARD_COPY.reset, 'the badge group carries the reset control')
const saveButton = findAll(liveTree, 'button').at(-1)
assert.equal(saveButton.props.disabled, false, 'save is enabled while an edit is staged')
saveButton.props.onClick()
await Promise.resolve()
await Promise.resolve()
assert.deepEqual(scope.writes.at(-1), { op: 'set', path: ['color'], value: '#00c2a8' }, 'save writes the staged colour')
assert.ok(styleEl.textContent.includes('#00c2a8'), 'the saved colour reaches the injected rule')
assert.equal(findAll(renderCard(card.options.inject()), 'button').at(-1).props.disabled, true, 'save is idle again after the write')

// Text and colour staged together write as one atomic mutation.
const bothFace = card.options.inject()
renderCard(bothFace)
bothFace.edit('text', '一起保存')
bothFace.edit('color', '#abcdef')
const beforeBoth = scope.writes.length
findAll(renderCard(bothFace), 'button').at(-1).props.onClick()
await Promise.resolve()
await Promise.resolve()
assert.deepEqual(scope.writes.slice(beforeBoth), [
  { op: 'set', path: ['text'], value: '一起保存' },
  { op: 'set', path: ['color'], value: '#abcdef' },
], 'both fields ride one mutation')
assert.equal(seat('chat.deepDiving'), '一起保存', 'the saved text renders')

// A malformed code blocks the save and says so.
const invalidFace = card.options.inject()
renderCard(invalidFace)
invalidFace.edit('color', '#zz')
const invalidTree = renderCard(invalidFace)
assert.equal(findAll(invalidTree, 'input')[2].props.value, '#zz', 'the bad draft stays visible for correction')
assert.ok(String(findByClass(invalidTree, 'dshTst_inputInvalid')?.props.className).includes('dshTst_inputInvalid'), 'the invalid field is marked')
assert.equal(findAll(invalidTree, 'button').at(-1).props.disabled, true, 'an invalid colour blocks saving')
assert.ok(findAll(invalidTree, 'p').some((element) => String(element.props.children).includes('颜色代码无效')), 'the card explains the rejection')
const writesBeforeInvalid = scope.writes.length
invalidFace.save()
await Promise.resolve()
assert.equal(scope.writes.length, writesBeforeInvalid, 'an invalid colour writes nothing')

// The default-colour button stages a clear.
const resetFace = card.options.inject()
renderCard(resetFace)
const resetButtons = findAll(renderCard(resetFace), 'button').filter((element) => element.props.children === CARD_COPY.reset)
assert.equal(resetButtons.length, 2, 'both fields offer the platform\'s reset control')
const resetButton = resetButtons[1]
resetButton.props.onClick()
const clearedTree = renderCard(resetFace)
assert.equal(findAll(clearedTree, 'input')[2].props.value, '', 'the default button empties the code field')
assert.equal(findAll(clearedTree, 'input')[1].props.value, '#4d6bfe', 'the picker falls back to the theme colour while cleared')
findAll(clearedTree, 'button').at(-1).props.onClick()
await Promise.resolve()
await Promise.resolve()
assert.deepEqual(scope.writes.at(-1), { op: 'unset', path: ['color'] }, 'saving the cleared field drops the override')
assert.equal(styleEl.textContent, '', 'the injected rule goes quiet again')
// The resolved section re-applies the schema default after a clear, so the
// post-save verification must read the user layer, not the resolved value.
const clearedState = card.options.inject().hooks.turnStatusText.getSnapshot()
assert.equal(clearedState.failed, false, 'a cleared field is not reported as a rejected save')
assert.equal(clearedState.colorDraft, '', 'the cleared field shows empty again')
assert.equal(seat('chat.deepDiving'), '一起保存', 'the text override survives a colour reset')

// The sequential fallback covers a scope without mutate().
const sequential = createSettingsScope({ value: { text: 'x', color: '#111111' } }, { sequential: true })
injectedCallback({
  settingsScope: { bind: () => sequential },
  slots: scoped.slots,
  effect: scoped.effect,
})
const sequentialFace = slotRegistrations.at(-1).options.inject()
const sequentialTree = renderCard(sequentialFace)
sequentialFace.edit('color', '#222222')
renderCard(sequentialFace)
findAll(sequentialTree, 'button')
findAll(renderCard(sequentialFace), 'button').at(-1).props.onClick()
await Promise.resolve()
await Promise.resolve()
assert.deepEqual(sequential.writes.at(-1), { op: 'set', path: ['color'], value: '#222222' }, 'a mutate-less scope still receives the write')
//#endregion

//#region lifecycle
for (const dispose of disposers) dispose()
assert.equal(seat('chat.deepDiving'), '深度求索中...', 'disposing the effect restores the original translate')
assert.equal(locale.dictionary, undefined, 'disposing the effect releases the card dictionary')
assert.equal(head.children.length, 0, 'disposing the effect removes both injected stylesheets')

const source = readFileSync(bundlePath, 'utf8')
assert.ok(!/^\s*(import|export)\s/m.test(source), 'the bundle carries no top-level import/export')

console.log('dsh-turn-status-text self-check: all assertions passed')
