/**
 * dsh-turn-status-text (browser half)
 *
 * Two jobs:
 *
 *   1. Replace the running-status line — the copy the chat shows while a request
 *      is in flight ("深度求索中，用时 12秒 ···" / "Deep diving for 12s ···") — with the
 *      text and colour stored in this plugin's settings entry.
 *   2. Contribute the row's own configuration page to the Plugins page — the
 *      `plugins.row.config` entry, keyed `<bundle package name>#<row id>`, which
 *      is what gives the row its configure control there — built from the
 *      platform's own settings form and guarded by `configForms.whileServed`, so
 *      it appears exactly where the Host really serves this settings entry.
 *
 * Text: the Chat target renders `t("chat.deepDivingFor", { duration })` while the
 * clock runs and `t("chat.deepDiving")` before it starts, both through the `t`
 * seat the framework builds with `ctx.locale.bind(ns)`. That bound function
 * resolves `this.translate(ns, key, params)` at call time, so shadowing the
 * translate method of the provided locale service rewrites the rendered copy
 * without touching the shipped dictionaries (which refuse re-registration of the
 * 'chat' namespace). The custom text may carry the `{duration}` placeholder to
 * keep the live elapsed time; without it the line is exactly the custom text.
 *
 * Colour: the row is `<div class="<hash>_running" data-chat-running>` and its text
 * is painted by `TextShimmer`, whose tint comes from `--dsw-alias-label-shimmer`
 * (the row maps that from `--dsw-alias-label-deep-diving-shimmer`). The injected
 * rule therefore re-points both custom properties, and writes `color` as well for
 * the older builds that painted with `currentColor`; the row is addressed through
 * its stable `data-chat-running` attribute, doubled so it outranks the
 * equal-specificity generated class, and no class-name discovery is needed.
 * Older builds that expose `[data-turn-process]` and the pre-0.1.7 `_turnStatus`
 * gradient label are handled too, the latter by discovering its content-hashed
 * class from the live stylesheets.
 *
 * Settings: the row's own Config is the section (`cordis.patch.yml` inserts the
 * row id `dsh-turn-status-text`, both fields `volatile()`), read and written
 * through `configForms.get(NS)` — the same ConfigFormController the shipped
 * settings pages use.
 *
 * Registration-only bundle: everything runs inside the factory, which the lazy
 * module table materializes on first import and re-runs on every hot reload.
 *
 * Two page globals exist for temporary/dev overrides, read on every render and on
 * every stylesheet change; both win over the stored settings section:
 *
 *   window.__DSH_TURN_STATUS_TEXT__  = '宝宝正在努力思考…'
 *   window.__DSH_TURN_STATUS_COLOR__ = '#ff5500'
 *   delete window.__DSH_TURN_STATUS_TEXT__   // back to the stored value
 */
window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-turn-status-text",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })

    var React = require("react")
    var jsxRuntime = require("react/jsx-runtime")
    var jsx = jsxRuntime.jsx
    var jsxs = jsxRuntime.jsxs

    //#region shared contract with the host half
    /**
     * Settings entry this plugin is configured through: the id of the Loader row
     * `cordis.patch.yml` inserts, which is also the namespace `configForms.get()`
     * and `whileServed()` are keyed by (settings sections are keyed by the row id
     * the profile patch declares, not by a name the plugin invents).
     */
    var NS = "dsh-turn-status-text"
    /**
     * The bundle's package name. The Plugins page keys a row's configuration page
     * by `<bundle package name>#<row id>`, and the row this plugin's patch inserts
     * is named after the package, so both ids are needed here.
     */
    var PACKAGE = "@dsh-external/dsh-turn-status-text"
    /** Field inside the namespace holding the custom text. */
    var FIELD = "text"
    /** Field inside the namespace holding the custom colour. */
    var COLOR_FIELD = "color"
    /** Dictionary key rendered while the elapsed clock runs. */
    var RUNNING_KEY = "chat.deepDivingFor"
    /** Dictionary key rendered before the elapsed clock starts. */
    var IDLE_KEY = "chat.deepDiving"
    /** Same copy in the 0.1.7 chat build's turn-process row. */
    var TURN_PROCESS_KEY = "message.turnProcess.deepDivingFor"
    /** Placeholder the custom text may carry to keep the live elapsed time. */
    var PLACEHOLDER = "{duration}"
    /** Dev override read on every render: a string on the page global. */
    var GLOBAL_KEY = "__DSH_TURN_STATUS_TEXT__"
    /** Dev override for the colour: a `#rrggbb` string on the page global. */
    var GLOBAL_COLOR_KEY = "__DSH_TURN_STATUS_COLOR__"
    //#endregion

    //#region label override
    /**
     * The bound settings scope, installed when the settings service is available.
     * Module-level because the label override resolves through it on every render.
     */
    var scope

    /** @returns {string|undefined} the page-global dev override, when usable. */
    function globalText() {
      var value = globalThis[GLOBAL_KEY]
      return typeof value === "string" && value !== "" ? value : undefined
    }

    /**
     * Read one field of the stored section.
     * @param field - field name inside the settings namespace.
     * @returns the stored string, or undefined when the section carries none.
     */
    function storedField(field) {
      if (scope === undefined) return undefined
      var value = scope.getSnapshot().value
      var entry = value === undefined || value === null ? undefined : value[field]
      return typeof entry === "string" ? entry : undefined
    }

    /** @returns {string|undefined} the stored text, when the user set one. */
    function sectionText() {
      var text = storedField(FIELD)
      return text !== undefined && text.trim() !== "" ? text : undefined
    }

    /** @returns {string|undefined} the stored colour, when it is a colour. */
    function sectionColor() {
      return normalizeColor(storedField(COLOR_FIELD))
    }

    /**
     * The colour to paint with: the page-global dev override first, then the
     * stored section. `undefined` means "leave the shipped colour alone", which is
     * also what an untouched install resolves to.
     * @returns {string|undefined} the normalized colour.
     */
    function effectiveColor() {
      var global = normalizeColor(globalThis[GLOBAL_COLOR_KEY])
      return global ?? sectionColor()
    }

    /**
     * The configured text, if any: page global first, then the stored section.
     * `undefined` means "keep the shipped copy", which is also what an unset
     * field resolves to, so an untouched install renders exactly as shipped.
     * @returns {string|undefined} the override.
     */
    function resolveOverride() {
      return globalText() ?? sectionText()
    }

    /**
     * Render the custom text for one status key.
     * @param override - custom text, optionally carrying `{duration}`.
     * @param params - interpolation parameters the framework passed.
     * @returns the copy to render.
     */
    function renderOverride(override, params) {
      if (override.indexOf(PLACEHOLDER) === -1) return override
      var duration = params === undefined || params === null ? undefined : params.duration
      var filled = typeof duration === "string" ? duration : ""
      return override
        .split(PLACEHOLDER).join(filled)
        .replace(/\s{2,}/gu, " ")
        .replace(/\s+([，,。、;；:：])/gu, "$1")
        .trim()
    }

    /**
     * Whether one dictionary key carries the running-status copy.
     * @param key - dictionary key the framework is about to translate.
     * @returns true when this plugin owns that key.
     */
    function isStatusKey(key) {
      return key === RUNNING_KEY || key === IDLE_KEY || key === TURN_PROCESS_KEY
    }

    /**
     * Shadow the locale service's `translate` so the running-status keys render
     * our copy. The own property is installed on the service instance (the same
     * object the slot renderer holds as its LocaleFace), with a prototype
     * fallback for a non-extensible service.
     * @param locale - the provided locale service.
     * @returns restore function releasing the shadow.
     */
    function installOverride(locale) {
      if (locale === undefined || locale === null || typeof locale.translate !== "function") {
        return function () {}
      }
      var holder = locale
      var own = Object.getOwnPropertyDescriptor(holder, "translate")
      var original = locale.translate
      var patched = function (ns, key, params) {
        if (isStatusKey(key)) {
          var override = resolveOverride()
          if (override !== undefined) return renderOverride(override, params)
        }
        return original.apply(this === undefined ? locale : this, [ns, key, params])
      }
      try {
        Object.defineProperty(holder, "translate", {
          value: patched,
          writable: true,
          configurable: true,
          enumerable: own !== undefined && own.enumerable === true,
        })
      } catch (error) {
        // A sealed service: shadow the prototype method instead.
        holder = Object.getPrototypeOf(locale)
        if (holder === null || typeof holder.translate !== "function") throw error
        own = Object.getOwnPropertyDescriptor(holder, "translate")
        holder.translate = patched
      }
      return function restore() {
        if (own === undefined) delete holder.translate
        else Object.defineProperty(holder, "translate", own)
      }
    }
    //#endregion

    //#region colour
    /** `#rgb` / `#rrggbb`, with the leading hash optional. */
    var HEX_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

    /**
     * Normalize one colour draft.
     * @param value - raw draft text.
     * @returns the lowercase `#rrggbb` form, or undefined when the draft is not a colour.
     */
    function normalizeColor(value) {
      if (typeof value !== "string") return undefined
      var match = HEX_PATTERN.exec(value.trim())
      if (match === null) return undefined
      var hex = match[1].toLowerCase()
      if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
      return "#" + hex
    }

    /** Pre-0.1.7 status line: content-hashed `_turnStatus` class painting a gradient. */
    var LEGACY_CLASS_PATTERN = /\.([A-Za-z0-9_-]*_turnStatus)(?![\w-])/
    /** Attribute marking the style element this plugin owns. */
    var STYLE_MARK = "dsh-turn-status-text"
    /** Discovered legacy turn-status class name. */
    var legacyClass
    /** Injected style element. */
    var styleEl

    /**
     * Find the pre-0.1.7 `_turnStatus` class in the live stylesheets, then in the
     * DOM. The hash prefix is content-derived, so it is resolved at runtime, and
     * the class only exists on builds that still render the old gradient label.
     * @returns the class name, or undefined while it is not on the page yet.
     */
    function discoverLegacyClass() {
      if (typeof document === "undefined") return undefined
      var sheets = document.styleSheets ?? []
      for (var i = 0; i < sheets.length; i += 1) {
        var rules
        try {
          rules = sheets[i].cssRules
        } catch (error) {
          // A cross-origin sheet refuses rule access; the DOM pass below still runs.
          rules = undefined
        }
        if (rules === undefined || rules === null) continue
        for (var j = 0; j < rules.length; j += 1) {
          var selector = rules[j].selectorText
          if (typeof selector !== "string") continue
          var match = LEGACY_CLASS_PATTERN.exec(selector)
          if (match !== null) return match[1]
        }
      }
      var element = document.querySelector('[class*="_turnStatus"]')
      var attribute = element === null || element === undefined ? null : element.getAttribute("class")
      if (typeof attribute !== "string") return undefined
      var names = attribute.split(/\s+/)
      for (var k = 0; k < names.length; k += 1) {
        if (/_turnStatus$/.test(names[k])) return names[k]
      }
      return undefined
    }

    /**
     * The legacy rule recolouring the old gradient label: same geometry as the
     * shipped gradient, so the shimmer animation keeps running. The first
     * declaration is the flat fallback; the second adds the highlight stop where
     * `color-mix` exists, and is dropped as invalid where it does not.
     * @param className - discovered legacy turn-status class.
     * @param color - normalized `#rrggbb`.
     * @returns the stylesheet text.
     */
    function legacyTurnStatusCss(className, color) {
      var selector = "." + className + "." + className
      var flat = "linear-gradient(90deg, " + color + " 0%, " + color + " 40%, " + color + " 50%, " + color + " 60%, " + color + " 100%)"
      var shimmer = "linear-gradient(90deg, " + color + " 0%, " + color + " 40%, color-mix(in srgb, " + color + " 45%, #fff) 50%, " + color + " 60%, " + color + " 100%)"
      return selector + "{background-image:" + flat + ";background-image:" + shimmer + "}"
    }

    /**
     * The stylesheet for one colour. The running row is addressed through the
     * attributes its build stamps on it — `data-chat-running` in the desktop chat,
     * `data-turn-process` on the 0.1.7 turn-process row — and each selector is
     * doubled so it outranks the equal-specificity generated class no matter which
     * stylesheet came first. `color` is what `TextShimmer`'s `currentColor`
     * gradient paints with, so the whole row, whale mark included, recolours; the
     * custom properties are set too, for any inner use of them.
     * @param color - normalized `#rrggbb`.
     * @param legacy - discovered legacy class, when this build renders one.
     * @returns the stylesheet text.
     */
    function colorCss(color, legacy) {
      var rules = [
        "[data-chat-running][data-chat-running]{color:" + color
          + ";--dsw-alias-label-deep-diving:" + color
          + ";--dsw-alias-label-shimmer:" + color + "}",
        "[data-turn-process][data-turn-process]{color:" + color + "}",
      ]
      if (legacy !== undefined) rules.push(legacyTurnStatusCss(legacy, color))
      return rules.join("")
    }

    /** Bring the injected rule in line with the effective colour. */
    function syncColorStyle() {
      if (typeof document === "undefined") return
      var color = effectiveColor()
      if (color === undefined) {
        // Unset means "theme default": empty the rule instead of leaving a stale colour.
        if (styleEl !== undefined) styleEl.textContent = ""
        return
      }
      if (legacyClass === undefined) legacyClass = discoverLegacyClass()
      if (styleEl === undefined || styleEl.parentNode === null || styleEl.parentNode === undefined) {
        styleEl = document.createElement("style")
        styleEl.setAttribute("data-plugin-css", STYLE_MARK)
        var host = document.head ?? document.body
        if (host === undefined || host === null) return
        host.appendChild(styleEl)
      }
      styleEl.textContent = colorCss(color, legacyClass)
    }

    /**
     * Drop the injected rule and forget the discovered class, so a hot reload
     * cannot leave a stale hash-prefixed selector behind.
     */
    function releaseColorStyle() {
      if (styleEl !== undefined && typeof styleEl.remove === "function") styleEl.remove()
      else if (styleEl !== undefined && styleEl.parentNode !== null && styleEl.parentNode !== undefined) styleEl.parentNode.removeChild(styleEl)
      styleEl = undefined
      legacyClass = undefined
    }
    //#endregion

    //#region settings card
    /**
     * Dictionary namespace for the card's own copy. Independent of `chat` and of
     * the settings entry, exactly like the platform's own settings pages.
     */
    var CARD_NS = "settings.turnStatusText"

    /** Simplified Chinese copy. */
    var zh = {
      title: "状态文案",
      description: "模型工作时聊天区显示的那行文字与颜色",
      textField: "自定义文字",
      textHint: "留空即恢复部署原文案；写 {duration} 占位符可保留实时用时。",
      colorField: "文字颜色",
      colorHint: "填颜色代码（如 #4d6bfe 或 #abc）。留空即恢复主题色；整行（文字与小鲸鱼）都用这个颜色。",
      overridden: "已覆盖",
      reset: "恢复默认",
      readOnly: "本部署的设置为只读。",
      unavailable: "该插件当前未加载，暂时无法配置。",
      save: "保存",
      saving: "保存中…",
      saveFailed: "本部署没有接受这些值，已保留供你修改。",
    }

    /** English copy. */
    var en = {
      title: "Status text",
      description: "The line the chat shows while the model is working, and its colour",
      textField: "Custom text",
      textHint: "Clear the field to restore the shipped copy; keep the {duration} placeholder to keep the live elapsed time.",
      colorField: "Text colour",
      colorHint: "A colour code such as #4d6bfe or #abc. Clear it to restore the theme colour; the whole row — text and whale mark — takes this colour.",
      overridden: "Overridden",
      reset: "Reset to default",
      readOnly: "This deployment stores settings read-only.",
      unavailable: "This plugin is not loaded, so it cannot be configured right now.",
      save: "Save",
      saving: "Saving…",
      saveFailed: "The deployment did not accept these values; they were left for you to correct.",
    }

    /**
     * Design-system module face. The shared form model and field components live
     * here, so the card is built from the platform's own settings UI instead of a
     * copy of it; absent only where the shell's module table lacks the word.
     */
    var primitives
    try {
      primitives = require("@deepseek-ai/dsh-client-ui-primitives")
    } catch (error) {
      primitives = undefined
    }

    /** @returns whether the deployment exposes the shared settings form. */
    function hasSettingsForm() {
      return primitives !== undefined
        && typeof primitives.SettingsFormModel === "function"
        && primitives.SettingsForm !== undefined
        && primitives.SettingsValueField !== undefined
        && typeof primitives.settingsTextField === "function"
    }

    /**
     * The form labels the shared settings frame renders.
     * @param t - this plugin's dictionary reader.
     * @returns the label set `SettingsForm` takes.
     */
    function formLabels(t) {
      return {
        unavailable: t("unavailable"),
        readOnly: t("readOnly"),
        saveFailed: t("saveFailed"),
        save: t("save"),
        saving: t("saving"),
      }
    }

    /**
     * One text field of the card, rendered by the platform's own value field: it
     * owns the label, the hint, the override badge, the reset control and the
     * disabled/invalid states.
     * @param options - name, copy keys, staged state and the form actions.
     * @returns the field element.
     */
    function valueField(options) {
      var t = options.t
      return jsx(primitives.SettingsValueField, {
        id: "dsh-turn-status-text-" + options.name,
        label: t(options.labelKey),
        hint: t(options.hintKey),
        overriddenLabel: t("overridden"),
        resetLabel: t("reset"),
        disabled: options.disabled,
        ...options.state,
        onEdit: function (next) {
          options.edit(options.name, next)
        },
        onReset: function () {
          options.resetField(options.name)
        },
      })
    }

    /**
     * Render this plugin's card in the Plugins page: a one-line summary in the
     * card list, and the two-field form once the page opens it.
     * @param props - locale reader, the card snapshot hook, and the form actions.
     * @returns the card element.
     */
    function TurnStatusTextCard(props) {
      var t = props.t
      // Every hook runs before the summary branch: the view must not change this
      // component's hook order.
      var state = props.useTurnStatusText(function (snapshot) {
        return snapshot
      })
      if (props.view === "summary") return t("description")
      return jsx(primitives.SettingsForm, {
        labels: formLabels(t),
        state: state,
        onSave: props.save,
        onDiscard: props.discard,
        children: [
          valueField({
            t: t, name: FIELD, labelKey: "textField", hintKey: "textHint",
            state: state.text, disabled: !state.writable,
            edit: props.edit, resetField: props.resetField,
          }),
          valueField({
            t: t, name: COLOR_FIELD, labelKey: "colorField", hintKey: "colorHint",
            state: state.color, disabled: !state.writable,
            edit: props.edit, resetField: props.resetField,
          }),
        ],
      })
    }

    /**
     * The card's controller over this plugin's settings entry: the platform's
     * staged form model plus this card's projection, so the card gets the same
     * drafts, save/discard actions and override badges as the shipped pages.
     */
    var TurnStatusTextCardController = class {
      /**
       * @param formScope - the bound form scope for this plugin's settings entry.
       */
      constructor(formScope) {
        this.form = new primitives.SettingsFormModel(formScope, [
          primitives.settingsTextField(FIELD),
          primitives.settingsTextField(COLOR_FIELD),
        ])
        this.store = this.form.bind(() => this.projection())
      }

      /** @returns the snapshot the card component reads. */
      projection() {
        return {
          ...this.form.shell(),
          text: this.form.field(FIELD),
          color: this.form.field(COLOR_FIELD),
        }
      }

      /** @returns the face the card's slot registration injects. */
      inject() {
        return {
          hooks: { turnStatusText: this.store },
          ...this.form.actions(),
        }
      }

      /** Release the staged form's subscriptions. */
      dispose() {
        this.form.dispose()
      }
    }
    //#endregion

    /** Required services: the dictionary registry and the slot registry. */
    var inject = ["slots", "locale"]

    /**
     * Client plugin body.
     * @param ctx - client cordis context.
     */
    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(CARD_NS, { zh: zh, en: en }),
        "dsh-turn-status-text: card dictionaries",
      )
      ctx.effect(
        () => installOverride(ctx.locale),
        "dsh-turn-status-text: turn-status label override",
      )
      ctx.effect(
        () => {
          // Apply whatever the page global already says, before the settings service
          // has had a chance to bind (the colour must not depend on it).
          syncColorStyle()
          return releaseColorStyle
        },
        "dsh-turn-status-text: injected colour rule",
      )
      // The settings forms are optional: without them the label override and the
      // page globals still work, there is just nothing to read and no card.
      ctx.inject(["configForms", "slots"], (scoped) => {
        scope = scoped.configForms.get(NS)
        scoped.effect(
          () => scope.subscribe(syncColorStyle),
          "dsh-turn-status-text: colour follows the settings",
        )
        if (!hasSettingsForm()) return
        var card = new TurnStatusTextCardController(scope)
        scoped.effect(() => () => card.dispose(), "dsh-turn-status-text: card form")
        // The row's own configuration page. The Plugins page gives a row a
        // configure control only for the rows that registered a
        // `plugins.row.config` entry, keyed `<bundle package name>#<row id>` — the
        // same two ids this plugin is built around. It is registered only while
        // the Host really serves the settings entry, so a deployment that never
        // composed this row shows no trace of the page.
        scoped.effect(
          () => scoped.configForms.whileServed([NS], () => scoped.slots.inject("plugins.row.config", () => scoped.slots.register({
            name: "plugins.row.config",
            key: PACKAGE + "#" + NS,
            locale: CARD_NS,
            inject: () => card.inject(),
          }, TurnStatusTextCard))),
          "dsh-turn-status-text: settings card",
        )
      })
      // The Chat stylesheet (and, on a legacy build, its hashed status class) may
      // materialize after this plugin activates; watch for it so the colour
      // applies without waiting for the next settings change.
      if (typeof MutationObserver === "function" && typeof document !== "undefined" && document.head != null) {
        var observer = new MutationObserver(() => {
          if (legacyClass === undefined || effectiveColor() !== undefined) syncColorStyle()
        })
        observer.observe(document.head, { childList: true })
        ctx.effect(() => () => {
          observer.disconnect()
        }, "dsh-turn-status-text: stylesheet watch")
      }
    }

    exports.inject = inject
    exports.apply = apply
    exports.NS = NS
    exports.PACKAGE = PACKAGE
    exports.CARD_NS = CARD_NS
    exports.TurnStatusTextCard = TurnStatusTextCard
    exports.TurnStatusTextCardController = TurnStatusTextCardController
    exports.hasSettingsForm = hasSettingsForm
    exports.normalizeColor = normalizeColor
    exports.effectiveColor = effectiveColor
    exports.renderOverride = renderOverride
    exports.isStatusKey = isStatusKey
    exports.colorCss = colorCss
    return module.exports
  },
})
