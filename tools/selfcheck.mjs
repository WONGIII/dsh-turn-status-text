/**
 * Self-check for the browser half of dsh-turn-status-text.
 *
 * Runs lib/client.js headlessly, the way the web shell does (a classic script
 * that only registers a factory), and drives it against mocks that mirror the
 * shipped implementations:
 *
 *   - LocaleRuntime: `bind(ns)` returns a closure resolving `this.translate` at
 *     call time — the seam the label override shadows.
 *   - ConfigForms: `get(entryId)` returns the entry's form scope over
 *     `{status, value, user, writable}` with `set`/`unset`/`mutate`, and
 *     `whileServed(namespaces, register)` runs the registration only while the
 *     Host serves one of them. Both mirror `ConfigForms`/`ConfigFormController`
 *     in the shipped client bundle.
 *   - The design-system module face: `SettingsFormModel` (shell/field/bind/
 *     actions/dispose), the `SettingsForm` and `SettingsValueField` components,
 *     and `settingsTextField`. The model folds staged drafts into the scope on
 *     save, so a save can be followed all the way to the rendered label.
 *   - The slot renderer's contract: the row config registers into `plugins.row.config` keyed
 *     `<package>#<row id>`, gets its `hooks` face bound as a
 *     `use<Name>` prop, and renders an element tree; the summary and page views are both exercised.
 *   - The chat stylesheet: the running row is styled by attributes
 *     (`[data-chat-running]`) the plugin can address without discovery, and a
 *     legacy build's content-hashed `.EvIC1a_turnStatus` rule arrives later, so
 *     both paths are exercised against a `<head>` that records the style element
 *     the plugin injects.
 *
 * React is not installed beside this plugin (the web shell bundles it), so the
 * harness ships a minimal React with the hooks the card uses; rendering is then
 * a direct component call plus a tree walk.
 *
 * Usage: node tools/selfcheck.mjs [bundlePath]
 * (the optional argument checks an already-served copy, e.g. the file the running
 *  web server hands the browser)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = process.argv[2] ?? join(here, '..', 'lib', 'client.js')

/** Settings entry the row declares; every side is keyed by it. */
const ENTRY_ID = 'dsh-turn-status-text'
/** Dictionary namespace the card owns. */
const CARD_NS = 'settings.turnStatusText'
/** Legacy status class a pre-0.1.7 build gives the label (hash prefix + local name). */
const PACKAGE = '@dsh-external/dsh-turn-status-text'
/** Legacy status class a pre-0.1.7 build gives the label (hash prefix + local name). */
const LEGACY_STATUS_CLASS = 'EvIC1a_turnStatus'

//#region fake DOM
/** A `<head>` that records appended style elements and supports removal. */
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
 * Minimal document: style sheets for legacy class discovery and a head for the
 * injected rule.
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
  const slots = []
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
      return 'self-check-id-' + String(cursor)
    },
    useEffect() {
      cursor += 1
    },
  }
}

function createElement(type, props) {
  return { type, props: props ?? {} }
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

/** Every element of the given type in the tree. */
function findAll(node, type) {
  return [...walk(node)].filter((element) => element.type === type)
}
//#endregion

//#region the deployment's design-system face, mocked to its real shape
/** Required services the shipped settings form model reads. */
class FakeSettingsFormModel {
  /**
   * @param scope - the entry's form scope (mirrors ConfigFormController).
   * @param fields - the field descriptors the card declares.
   */
  constructor(scope, fields) {
    this.scope = scope
    this.fields = fields
    this.staged = new Map()
    this.disposed = false
    this.saved = 0
  }

  /** @returns the form frame state the shipped SettingsForm renders. */
  shell() {
    const snapshot = this.scope.getSnapshot()
    return {
      status: snapshot.status,
      writable: snapshot.writable === true,
      dirty: this.staged.size > 0,
      saving: false,
      failed: false,
    }
  }

  /**
   * @param name - field name.
   * @returns the staged (or stored) field state.
   */
  field(name) {
    const snapshot = this.scope.getSnapshot()
    const user = snapshot.user ?? {}
    const stored = snapshot.value?.[name]
    const staged = this.staged.has(name)
    return {
      name,
      value: staged ? this.staged.get(name) : (typeof stored === 'string' ? stored : ''),
      overridden: staged ? this.staged.get(name) !== '' : typeof user[name] === 'string' && user[name] !== '',
      invalid: false,
      placeholder: '',
    }
  }

  /**
   * @param projection - builds the card snapshot from this model.
   * @returns the store the card's bound hook reads.
   */
  bind(projection) {
    const listeners = new Set()
    this.notify = () => {
      for (const listener of [...listeners]) listener()
    }
    return {
      getSnapshot: () => projection.call(this),
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
  }

  /** @returns the staged actions the page's slot registration injects. */
  actions() {
    const model = this
    return {
      edit(name, value) {
        model.staged.set(name, value)
        model.notify?.()
      },
      resetField(name) {
        model.staged.set(name, '')
        model.notify?.()
      },
      discard() {
        model.staged.clear()
        model.notify?.()
      },
      async save() {
        const ops = []
        for (const [name, value] of model.staged) {
          ops.push(value === ''
            ? { op: 'unset', path: [name] }
            : { op: 'set', path: [name], value })
        }
        model.staged.clear()
        model.saved += 1
        if (typeof model.scope.mutate === 'function') await model.scope.mutate(ops)
        else for (const op of ops) await (op.op === 'unset' ? model.scope.unset(op.path[0]) : model.scope.set(op.path[0], op.value))
        model.notify?.()
      },
    }
  }

  /** Release the model, exactly as the shipped one does. */
  dispose() {
    this.disposed = true
  }
}

/** Field descriptor factory, mirroring `settingsTextField`. */
function settingsTextField(name) {
  return { name, kind: 'text' }
}

const fakePrimitives = {
  SettingsFormModel: FakeSettingsFormModel,
  SettingsForm: (props) => createElement('dshSettingsForm', props),
  SettingsValueField: (props) => createElement('dshSettingsValueField', props),
  settingsTextField,
}
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
 * Mirrors ConfigFormController: a snapshot store over one entry's view, with the
 * Host folding accepted writes back into it.
 * @param initial - starting section value.
 * @param options - `sequential` drops `mutate` to exercise the set/unset fallback;
 *   `defaults` are the schema defaults an `unset` re-applies to the resolved value.
 */
function createFormScope(initial, options = {}) {
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

/** Mirrors the ConfigForms service face this plugin consumes. */
function createConfigForms(scope, options = {}) {
  const served = options.served ?? true
  const watchers = []
  return {
    seen: [],
    formScope: scope,
    get(entryId) {
      this.seen.push(entryId)
      return scope
    },
    whileServed(namespaces, register) {
      watchers.push({ namespaces, register })
      if (served) return register(new Set(namespaces)) ?? (() => {})
      return () => {}
    },
    /** Flip the deployment to a state where the namespace is served. */
    serve() {
      for (const watcher of watchers) watcher.register(new Set(watcher.namespaces))
    },
  }
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

// The legacy chat stylesheet is not on the page yet: the plugin must survive that
// and pick the class up once the sheet arrives (asserted further down).
globalThis.document = createDocument([])

await import(pathToFileURL(bundlePath).href)

assert.ok(registration, 'the bundle registers itself with window.__ModuleLoader__.load()')
assert.equal(registration.id, '@dsh-external/dsh-turn-status-text')
assert.equal(typeof registration.factory, 'function')

const plugin = registration.factory((spec) => {
  if (spec === 'react') return createFakeReact()
  if (spec === 'react/jsx-runtime') return { jsx: createElement, jsxs: createElement, Fragment: Symbol('Fragment') }
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return fakePrimitives
  throw new Error('unexpected require: ' + spec)
})

assert.deepEqual(plugin.inject, ['slots', 'locale'], 'the label seat and the slot registry are the only required services')
assert.equal(typeof plugin.apply, 'function')
assert.equal(plugin.NS, ENTRY_ID, 'the settings entry id is the row id the patch declares')
assert.equal(plugin.CARD_NS, CARD_NS)
assert.equal(plugin.hasSettingsForm(), true)
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

const scope = createFormScope(
  { value: { text: '', color: '' } },
  { defaults: { text: '', color: '' } },
)
const configForms = createConfigForms(scope)
const disposers = []
const slotRegistrations = []
let injectedDeps
let injectedCallback
const fakeReact = { useState: undefined }

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

plugin.apply(ctx)

assert.deepEqual(injectedDeps, ['configForms', 'slots'], 'the settings form and slots activate together, and only where they exist')

const seat = locale.bind('chat')
assert.equal(seat('chat.deepDiving'), '深度求索中...', 'an untouched install renders the shipped copy')

const scoped = {
  configForms,
  slots: {
    inject(name, register) {
      assert.equal(name, 'plugins.row.config', 'the card joins the Plugins page row-config slot')
      return register()
    },
    register(options, component) {
      slotRegistrations.push({ options, component })
      return () => {}
    },
  },
  locale,
  effect(callback) {
    const dispose = callback()
    disposers.push(dispose)
    return dispose
  },
}
injectedCallback(scoped)

assert.deepEqual(configForms.seen, [ENTRY_ID], 'the form scope is bound to this plugin\'s settings entry')
assert.equal(slotRegistrations.length, 1, 'exactly one card is contributed')
const card = slotRegistrations[0]
assert.equal(card.options.name, 'plugins.row.config')
assert.equal(card.options.key, PACKAGE + '#' + ENTRY_ID, 'the row is keyed `<bundle package name>#<row id>`, which is what the Plugins page looks up')
assert.equal(card.options.locale, CARD_NS)
assert.equal(locale.dictionary?.ns, CARD_NS, 'the card registers its own dictionary namespace')
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
assert.equal(head.children.length, 0, 'no colour rule is injected while the section carries none')

// The running row is addressed through the attributes its build stamps on it, so
// nothing has to be discovered before a stored colour can apply.
await scope.set('color', '#ff5500')
assert.equal(head.children.length, 1, 'the colour rule is injected as soon as a colour is stored')
const styleEl = head.children[0]
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

await scope.set('color', '#0f0')
assert.ok(styleEl.textContent.includes('#00ff00'), 'a new colour rewrites the same rule in place')

await scope.unset('color')
assert.equal(styleEl.textContent, '', 'clearing the colour leaves the shipped styling untouched')

// The page-global dev override beats the stored section, and an unusable global
// falls back to it instead of blanking the colour.
await scope.set('color', '#123456')
globalThis.__DSH_TURN_STATUS_COLOR__ = '#00ff00'
assert.equal(plugin.effectiveColor(), '#00ff00', 'the page-global colour wins over the stored one')
await scope.set('color', '#123456')
assert.ok(styleEl.textContent.includes('color:#00ff00'), 'the page-global colour reaches the injected rule')
globalThis.__DSH_TURN_STATUS_COLOR__ = 'not-a-colour'
assert.equal(plugin.effectiveColor(), '#123456', 'an unusable page global falls back to the stored colour')
delete globalThis.__DSH_TURN_STATUS_COLOR__

assert.deepEqual(
  plugin.colorCss('#ff5500', LEGACY_STATUS_CLASS),
  '[data-chat-running][data-chat-running]{color:#ff5500;--dsw-alias-label-deep-diving:#ff5500;--dsw-alias-label-shimmer:#ff5500}'
  + '[data-turn-process][data-turn-process]{color:#ff5500}'
  + '.' + LEGACY_STATUS_CLASS + '.' + LEGACY_STATUS_CLASS + '{background-image:linear-gradient(90deg, #ff5500 0%, #ff5500 40%, #ff5500 50%, #ff5500 60%, #ff5500 100%);background-image:linear-gradient(90deg, #ff5500 0%, #ff5500 40%, color-mix(in srgb, #ff5500 45%, #fff) 50%, #ff5500 60%, #ff5500 100%)}',
  'the emitted stylesheet is exactly the attribute rules plus the legacy gradient',
)
//#endregion

//#region card rendering and writes
/** Render the card the way the slot renderer does: hooks face bound to use<Name>. */
function renderCard(face, view) {
  const react = createFakeReact()
  react.reset()
  const props = {
    t: (key) => (locale.dictionaries[CARD_NS]?.[key] ?? key),
    useTurnStatusText: (select) => select(face.hooks.turnStatusText.getSnapshot()),
    view,
    ...face,
  }
  return card.component(props)
}

const face = card.options.inject()
assert.equal(typeof face.hooks.turnStatusText.getSnapshot, 'function', 'the card reads a store, not a raw value')
for (const action of ['edit', 'resetField', 'discard', 'save']) {
  assert.equal(typeof face[action], 'function', 'the platform form actions are injected: ' + action)
}

assert.equal(renderCard(face, 'summary'), locale.dictionaries[CARD_NS].description, 'the list view renders the one-line summary')

let tree = renderCard(face)
const form = findAll(tree, fakePrimitives.SettingsForm)[0]
assert.ok(form, 'the open view renders the platform settings form')
assert.equal(form.props.labels.readOnly, locale.dictionaries[CARD_NS].readOnly, 'the form frame gets this plugin\'s labels')
assert.equal(form.props.onSave, face.save, 'the form saves through the injected action')
assert.equal(form.props.onDiscard, face.discard, 'the form discards through the injected action')
assert.equal(form.props.state.writable, true, 'a writable deployment is reported as writable')

const fields = findAll(tree, fakePrimitives.SettingsValueField)
assert.equal(fields.length, 2, 'the card renders a text field and a colour field')
assert.equal(fields[0].props.label, locale.dictionaries[CARD_NS].textField)
assert.equal(fields[0].props.hint, locale.dictionaries[CARD_NS].textHint)
assert.equal(fields[0].props.id, ENTRY_ID + '-text')
assert.equal(fields[0].props.name ?? fields[0].props.name, fields[0].props.name, 'the field keeps the platform field state')
assert.equal(fields[1].props.label, locale.dictionaries[CARD_NS].colorField)
assert.equal(fields[1].props.hint, locale.dictionaries[CARD_NS].colorHint)
assert.equal(fields[1].props.id, ENTRY_ID + '-color')

// The hint documents the placeholder, and the field states start empty.
assert.ok(locale.dictionaries[CARD_NS].textHint.includes('{duration}'), 'the text hint documents the {duration} placeholder')
assert.equal(fields[0].props.value, '', 'the text field starts on the stored (empty) value')
assert.equal(fields[1].props.value, '#123456', 'the colour field shows the stored colour')

// Edit through the platform field, then save through the platform action.
fields[0].props.onEdit('一起保存 {duration}')
const staged = renderCard(face)
assert.equal(findAll(staged, fakePrimitives.SettingsValueField)[0].props.value, '一起保存 {duration}', 'a staged edit shows in the field')
assert.equal(findAll(staged, fakePrimitives.SettingsValueField)[0].props.overridden, true, 'a staged edit is badged as an override')
assert.equal(scope.getSnapshot().value.text, '', 'staging alone does not write to the settings')
await face.save()
assert.deepEqual(scope.writes.at(-1), { op: 'set', path: ['text'], value: '一起保存 {duration}' }, 'save writes the staged text through the Host')
assert.equal(seat('chat.deepDivingFor', { duration: '12秒' }), '一起保存 12秒', 'the saved text renders with the live clock')

// A colour edit goes through the same path, and the injected rule follows it.
const colourFaces = findAll(renderCard(face), fakePrimitives.SettingsValueField)[1]
colourFaces.props.onEdit('#ff5500')
await face.save()
assert.equal(scope.getSnapshot().value.color, '#ff5500', 'the colour reaches the settings')
assert.ok(styleEl.textContent.includes('color:#ff5500'), 'the colour reaches the injected rule')

// The reset control stages a clear, and saving it drops the override.
findAll(renderCard(face), fakePrimitives.SettingsValueField)[1].props.onReset()
await face.save()
assert.equal(scope.getSnapshot().user.color, undefined, 'resetting the field drops the user-layer entry')
assert.equal(styleEl.textContent, '', 'the injected rule goes quiet again')
assert.equal(seat('chat.deepDivingFor', { duration: '12秒' }), '一起保存 12秒', 'the text override survives a colour reset')

// The sequential fallback covers a scope without mutate().
const sequential = createFormScope({ value: { text: '', color: '#111111' } }, { sequential: true })
const sequentialForms = createConfigForms(sequential)
injectedCallback({
  configForms: sequentialForms,
  slots: scoped.slots,
  locale,
  effect: scoped.effect,
})
const sequentialFace = slotRegistrations.at(-1).options.inject()
findAll(renderCard(sequentialFace), fakePrimitives.SettingsValueField)[1].props.onEdit('#222222')
await sequentialFace.save()
assert.deepEqual(sequential.writes.at(-1), { op: 'set', path: ['color'], value: '#222222' }, 'a mutate-less scope still receives the write')
//#endregion

//#region a deployment that does not serve the entry
const unserved = createFormScope({ value: { text: '', color: '' } })
const unservedForms = createConfigForms(unserved, { served: false })
const before = slotRegistrations.length
injectedCallback({
  configForms: unservedForms,
  slots: scoped.slots,
  locale,
  effect: scoped.effect,
})
assert.equal(slotRegistrations.length, before, 'no card is contributed while the Host serves no settings entry for this plugin')
unservedForms.serve()
assert.equal(slotRegistrations.length, before + 1, 'the card appears once the entry is served')
//#endregion

//#region lifecycle
for (const dispose of disposers) dispose()
assert.equal(seat('chat.deepDiving'), '深度求索中...', 'disposing the effects restores the original translate')
assert.equal(locale.dictionary, undefined, 'disposing the effects releases the card dictionary')
assert.equal(head.children.length, 0, 'disposing the effects removes the injected colour rule')

const source = readFileSync(bundlePath, 'utf8')
assert.ok(!/^\s*(import|export)\s/m.test(source), 'the bundle carries no top-level import/export')

console.log('dsh-turn-status-text self-check: all assertions passed')
//#endregion
