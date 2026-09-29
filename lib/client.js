/**
 * dsh-turn-status-text (browser half)
 *
 * Two jobs:
 *
 *   1. Replace the running-status line — the copy the chat shows while a request
 *      is in flight ("深度求索中，用时 12秒 ···" / "Deep diving for 12s ···") — with the
 *      text and colour stored in this plugin's settings section.
 *   2. Contribute the card that edits them: the Web Plugins page's `可配置` tab
 *      dispatches `settings.plugin.item` once per settings namespace the Host
 *      serves, so registering under this plugin's namespace key is all it takes
 *      to own a card there.
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
 * is painted by `TextShimmer`, a gradient built from `currentColor` with
 * `background-clip: text`. Setting `color` on the row therefore recolours the
 * shimmer itself, with no class-name discovery: the row is addressed through its
 * stable `data-chat-running` attribute, doubled so it outranks the equal-specificity
 * generated class. Older builds that expose `[data-turn-process]` and the
 * pre-0.1.7 `_turnStatus` gradient label are handled too, the latter by
 * discovering its content-hashed class from the live stylesheets.
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
    /** Settings namespace owned by the host half (the card's slot key). */
    var NS = "turn-status-text"
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
    /** Copy the card shows while the text field is empty (per locale). */
    var SHIPPED_TEXT = "深度求索中，用时 " + PLACEHOLDER + " ···"
    /** Literal the card renders in place of the placeholder in its preview. */
    var SAMPLE_DURATION = "12秒"
    /** Colour the preview and the swatch fall back to while the section carries none. */
    var DEFAULT_COLOR = "#4d6bfe"
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
    /** Dictionary namespace for the card's own copy (independent of 'chat'). */
    var CARD_NS = "turn-status-text"

    /** Simplified Chinese card copy. */
    var zh = {
      title: "状态文案",
      description: "模型工作时聊天区显示的那行文字与颜色",
      textField: "自定义文字",
      textPlaceholder: SHIPPED_TEXT,
      textHint: "留空并保存即恢复默认文案；写 " + PLACEHOLDER + " 占位符可保留实时用时。保存后立即生效，无需刷新页面。",
      colorField: "文字颜色",
      colorHint: "用调色盘或直接填颜色代码（如 #4d6bfe）。留空并保存即恢复主题默认色；整行（文字与小鲸鱼）都用这个颜色。",
      colorPlaceholder: "#4d6bfe（留空 = 主题默认）",
      colorInvalid: "颜色代码无效：支持 #rgb 或 #rrggbb。",
      colorReset: "恢复默认",
      preview: "预览",
      sampleDuration: SAMPLE_DURATION,
      overridden: "已覆盖",
      reset: "恢复默认",
      unsaved: "未保存",
      save: "保存",
      saving: "保存中…",
      discard: "放弃修改",
      readOnly: "本部署的设置为只读。",
      saveFailed: "本部署没有接受这些值，已保留供你修改。",
      expand: "展开设置",
      collapse: "收起设置",
    }

    /** English card copy. */
    var en = {
      title: "Status text",
      description: "The line the chat shows while the model is working, and its colour",
      textField: "Custom text",
      textPlaceholder: "Deep diving for " + PLACEHOLDER + " ···",
      textHint: "Clear the field and save to restore the shipped copy; keep the " + PLACEHOLDER + " placeholder to keep the live elapsed time. Changes apply immediately, no reload needed.",
      colorField: "Text colour",
      colorHint: "Pick with the swatch or type a colour code (e.g. #4d6bfe). Clear it and save to restore the theme colour; the whole row — text and whale mark — takes this colour.",
      colorPlaceholder: "#4d6bfe (empty = theme default)",
      colorInvalid: "Not a colour code: use #rgb or #rrggbb.",
      colorReset: "Reset to default",
      preview: "Preview",
      sampleDuration: "12s",
      overridden: "Overridden",
      reset: "Reset to default",
      unsaved: "Unsaved",
      save: "Save",
      saving: "Saving…",
      discard: "Discard",
      readOnly: "This deployment stores settings read-only.",
      saveFailed: "The deployment did not accept these values; they were left for you to correct.",
      expand: "Show settings",
      collapse: "Hide settings",
    }

    /**
     * The copy the card previews: the custom draft with its placeholder rendered
     * as a sample duration, or the shipped copy while the field is empty.
     * @param text - current text draft.
     * @param t - card dictionary reader.
     * @returns the preview copy.
     */
    function previewCopy(text, t) {
      var draft = text.trim() === "" ? t("textPlaceholder") : text
      return renderOverride(draft, { duration: t("sampleDuration") })
    }

    /** Card store state; replaced wholesale so the snapshot reference moves only on change. */
    var cardState = {
      available: false, writable: false, dirty: false, saving: false, failed: false,
      text: "", textOverridden: false,
      color: "", colorDraft: "", colorInvalid: false, colorOverridden: false, colorPicker: DEFAULT_COLOR,
    }
    /** Staged text draft, or undefined while the card shows the stored value. */
    var stagedText
    /** Staged colour draft, or undefined while the card shows the stored value. */
    var stagedColor
    var saving = false
    var failed = false
    var listeners = new Set()

    /** Rebuild the card snapshot from the scope plus the local drafts. */
    function publish() {
      var snapshot = scope === undefined
        ? { status: "unavailable", writable: false, value: undefined, user: undefined }
        : scope.getSnapshot()
      var section = snapshot.value === undefined || snapshot.value === null ? undefined : snapshot.value
      var user = snapshot.user === undefined || snapshot.user === null ? undefined : snapshot.user
      var stored = section === undefined ? undefined : section[FIELD]
      var storedColor = normalizeColor(section === undefined ? undefined : section[COLOR_FIELD]) ?? ""
      var colorDraft = stagedColor !== undefined ? stagedColor : storedColor
      var invalid = colorDraft.trim() !== "" && normalizeColor(colorDraft) === undefined
      var effective = normalizeColor(colorDraft)
      cardState = {
        available: snapshot.status === "ready",
        writable: snapshot.writable === true,
        dirty: stagedText !== undefined || stagedColor !== undefined,
        saving: saving,
        failed: failed,
        text: stagedText !== undefined ? stagedText : (typeof stored === "string" ? stored : ""),
        textOverridden: stagedText !== undefined ? stagedText.trim() !== "" : typeof user?.[FIELD] === "string" && user[FIELD] !== "",
        color: effective ?? "",
        colorDraft: colorDraft,
        colorInvalid: invalid,
        colorOverridden: stagedColor !== undefined ? stagedColor.trim() !== "" : typeof user?.[COLOR_FIELD] === "string" && user[COLOR_FIELD] !== "",
        colorPicker: effective ?? DEFAULT_COLOR,
      }
      for (var listener of Array.from(listeners)) {
        try {
          listener()
        } catch (error) {
          console.error("dsh-turn-status-text: card listener crashed:", error)
        }
      }
      syncColorStyle()
    }

    /** @returns {object} the store the card's bound hook reads. */
    function cardStore() {
      return {
        getSnapshot: function () {
          return cardState
        },
        subscribe: function (listener) {
          listeners.add(listener)
          return function () {
            listeners.delete(listener)
          }
        },
      }
    }

    /**
     * Stage one draft without writing it.
     * @param field - field name inside the settings namespace.
     * @param value - raw draft text.
     */
    function edit(field, value) {
      if (field === COLOR_FIELD) stagedColor = value
      else stagedText = value
      failed = false
      publish()
    }

    /**
     * Stage a clear, so saving lets the field inherit the default again.
     * @param field - field name inside the settings namespace.
     */
    function resetField(field) {
      edit(field, "")
    }

    /** Drop every staged draft. */
    function discard() {
      stagedText = undefined
      stagedColor = undefined
      failed = false
      publish()
    }

    /**
     * Resolve the staged drafts into ordered section operations.
     * @returns the operations, or undefined when a draft is not acceptable.
     */
    function planWrites() {
      var ops = []
      if (stagedText !== undefined) {
        var text = stagedText.trim()
        ops.push(text === "" ? { op: "unset", path: [FIELD] } : { op: "set", path: [FIELD], value: text })
      }
      if (stagedColor !== undefined) {
        var draft = stagedColor.trim()
        if (draft === "") {
          ops.push({ op: "unset", path: [COLOR_FIELD] })
        } else {
          var color = normalizeColor(draft)
          if (color === undefined) return undefined
          ops.push({ op: "set", path: [COLOR_FIELD], value: color })
        }
      }
      return ops
    }

    /** Write every staged draft, then re-seed from what the Host accepted. */
    function save() {
      if (scope === undefined || saving) return
      var ops = planWrites()
      if (ops === undefined || ops.length === 0) return
      saving = true
      failed = false
      publish()
      // One atomic namespace mutation where the scope offers it; the sequential
      // fallback keeps this card working against a set/unset-only scope.
      var settle = typeof scope.mutate === "function"
        ? scope.mutate(ops)
        : ops.reduce(function (chain, op) {
          return chain.then(function () {
            return op.op === "unset" ? scope.unset(op.path[0]) : scope.set(op.path[0], op.value)
          })
        }, Promise.resolve())
      Promise.resolve(settle).then(function () {
        saving = false
        stagedText = undefined
        stagedColor = undefined
        // The scope swallows write failures by re-reading the Host, so verify the
        // committed section against what was staged: a `set` must show up in the
        // resolved value, and an `unset` must leave no user-layer entry (the
        // resolved value re-applies the schema default, so it is not undefined).
        var settled = scope.getSnapshot()
        for (var op of ops) {
          var field = op.path[0]
          var accepted = op.op === "unset"
            ? settled.user === undefined || settled.user === null || settled.user[field] === undefined
            : settled.value !== undefined && settled.value !== null && settled.value[field] === op.value
          if (!accepted) {
            failed = true
            break
          }
        }
        publish()
      }, function () {
        saving = false
        failed = true
        publish()
      })
    }

    /** @returns {object} the face the card's slot registration injects. */
    function cardFace() {
      return {
        hooks: { turnStatusText: cardStore() },
        edit: edit,
        resetField: resetField,
        discard: discard,
        save: save,
      }
    }

    //#region card chrome
    /**
     * Design-system values copied from the shipped plugin card
     * (`ui-settings-plugins`'s PluginCard/ValueField CSS modules) with this
     * plugin's own class prefix, so the card is indistinguishable from the ones
     * the deployment ships. Only theme alias tokens are used — the light/dark
     * switch is entirely theirs.
     */
    var CARD_CSS = [
      ".dshTst_card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color .16s,background .16s}",
      ".dshTst_card:hover{border-color:var(--dsw-alias-label-dimmed)}",
      ".dshTst_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
      ".dshTst_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
      ".dshTst_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
      ".dshTst_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
      ".dshTst_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
      ".dshTst_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
      ".dshTst_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}",
      ".dshTst_chevronOpen{transform:rotate(180deg)}",
      ".dshTst_chevronFallback{width:7px;height:7px;margin:0 4px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .16s}",
      ".dshTst_chevronFallbackOpen{transform:rotate(-135deg)}",
      ".dshTst_badge{flex:none;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap}",
      ".dshTst_body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",
      ".dshTst_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}",
      ".dshTst_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}",
      ".dshTst_field+.dshTst_field{border-top:.5px solid var(--dsw-alias-border-l2)}",
      ".dshTst_head{align-items:center;gap:8px;display:flex}",
      ".dshTst_badges{align-items:center;gap:8px;display:inline-flex}",
      ".dshTst_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}",
      ".dshTst_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5;white-space:nowrap}",
      ".dshTst_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
      ".dshTst_reset:disabled{cursor:default;opacity:.4}",
      ".dshTst_input{box-sizing:border-box;width:100%;min-width:0;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}",
      ".dshTst_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
      ".dshTst_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
      ".dshTst_inputInvalid{border-color:var(--dsw-alias-label-error)}",
      ".dshTst_colorRow{align-items:center;gap:8px;display:flex}",
      ".dshTst_swatch{appearance:none;-webkit-appearance:none;flex:none;width:46px;height:34px;padding:2px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-3);cursor:pointer}",
      ".dshTst_swatch::-webkit-color-swatch-wrapper{padding:0}",
      ".dshTst_swatch::-webkit-color-swatch{border:none;border-radius:6px}",
      ".dshTst_swatch::-moz-color-swatch{border:none;border-radius:6px}",
      ".dshTst_swatch:disabled{cursor:default;opacity:.4}",
      ".dshTst_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
      ".dshTst_invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}",
      ".dshTst_preview{align-items:baseline;gap:8px;margin:0;font-size:13px;line-height:1.5;display:flex}",
      ".dshTst_previewLabel{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px}",
      ".dshTst_previewText{font-weight:500;word-break:break-word}",
      ".dshTst_footer{border-top:.5px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}",
      ".dshTst_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}",
      ".dshTst_discard,.dshTst_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;white-space:nowrap}",
      ".dshTst_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}",
      ".dshTst_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
      ".dshTst_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}",
      ".dshTst_discard:disabled,.dshTst_save:disabled{opacity:.4;cursor:default}",
      ".dshTst_discard:focus-visible,.dshTst_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
    ].join("")

    /** Attribute marking style elements this plugin owns. */
    var CARD_STYLE_MARK = "dsh-turn-status-text/card"
    /** Injected card stylesheet. */
    var cardStyleEl

    /**
     * Inject the card stylesheet once, so the card is styled by real CSS
     * (hover, focus-visible, disabled) instead of inline styles that cannot
     * express them.
     * @returns disposer removing the element.
     */
    function installCardStyles() {
      if (typeof document === "undefined") return function () {}
      var host = document.head ?? document.body
      if (host === undefined || host === null) return function () {}
      cardStyleEl = document.createElement("style")
      cardStyleEl.setAttribute("data-plugin-css", CARD_STYLE_MARK)
      cardStyleEl.textContent = CARD_CSS
      host.appendChild(cardStyleEl)
      return function () {
        if (cardStyleEl !== undefined && typeof cardStyleEl.remove === "function") cardStyleEl.remove()
        else if (cardStyleEl !== undefined && cardStyleEl.parentNode != null) cardStyleEl.parentNode.removeChild(cardStyleEl)
        cardStyleEl = undefined
      }
    }
    //#endregion

    //#region card presentation
    /** Class-name table for the card's stylesheet. */
    var cls = {
      card: "dshTst_card",
      cardOpen: "dshTst_cardOpen",
      header: "dshTst_header",
      headText: "dshTst_headText",
      name: "dshTst_name",
      description: "dshTst_description",
      chevron: "dshTst_chevron",
      chevronOpen: "dshTst_chevronOpen",
      chevronFallback: "dshTst_chevronFallback",
      chevronFallbackOpen: "dshTst_chevronFallbackOpen",
      badge: "dshTst_badge",
      badges: "dshTst_badges",
      body: "dshTst_body",
      readOnly: "dshTst_readOnly",
      field: "dshTst_field",
      head: "dshTst_head",
      label: "dshTst_label",
      reset: "dshTst_reset",
      input: "dshTst_input",
      inputInvalid: "dshTst_inputInvalid",
      colorRow: "dshTst_colorRow",
      swatch: "dshTst_swatch",
      hint: "dshTst_hint",
      invalid: "dshTst_invalid",
      preview: "dshTst_preview",
      previewLabel: "dshTst_previewLabel",
      previewText: "dshTst_previewText",
      footer: "dshTst_footer",
      failed: "dshTst_failed",
      discard: "dshTst_discard",
      save: "dshTst_save",
    }

    /** Join class names, dropping falsy entries. */
    function cx() {
      var parts = []
      for (var i = 0; i < arguments.length; i += 1) if (arguments[i]) parts.push(arguments[i])
      return parts.join(" ")
    }

    /** localStorage key remembering whether the user left the card expanded. */
    var OPEN_KEY = "dsh-turn-status-text:open"

    /** @returns {boolean} the remembered disclosure state (expanded on first visit). */
    function readOpen() {
      try {
        var value = globalThis.localStorage?.getItem(OPEN_KEY)
        return value === null || value === undefined ? true : value === "1"
      } catch (error) {
        return true
      }
    }

    /**
     * Remember the disclosure state.
     * @param open - whether the card is expanded.
     */
    function writeOpen(open) {
      try {
        globalThis.localStorage?.setItem(OPEN_KEY, open ? "1" : "0")
      } catch (error) {
        // Storage can be unavailable: the state then simply does not persist.
      }
    }
    //#endregion

    //#region card component
    /** Design-system module face; absent only where the shell table word is missing. */
    var primitives
    try {
      primitives = require("@deepseek-ai/dsh-client-ui-primitives")
    } catch (error) {
      primitives = undefined
    }
    /** Disclosure chevron, shared with the shipped plugin cards. */
    var Chevron = primitives === undefined ? undefined : primitives.IconChevronDownOutline14
    /** Neutral tag used for the unsaved badge. */
    var Tag = primitives === undefined ? undefined : primitives.Tag

    /**
     * The card header's disclosure affordance.
     * @param open - whether the card is expanded.
     * @returns the shipped chevron, or a CSS-drawn stand-in.
     */
    function disclosureIcon(open) {
      if (Chevron === undefined) {
        return jsx("span", {
          "aria-hidden": true,
          className: cx(cls.chevron, cls.chevronFallback, open && cls.chevronFallbackOpen),
        })
      }
      return jsx(Chevron, { className: cx(cls.chevron, open && cls.chevronOpen) })
    }

    /**
     * A neutral status tag, the same primitive the shipped cards use.
     * @param text - badge copy.
     * @param extraClass - extra class name, when the badge has a variant.
     * @returns the shipped neutral tag, or a styled stand-in.
     */
    function unsavedBadge(text, extraClass) {
      var className = extraClass === undefined ? cls.badge : cx(cls.badge, extraClass)
      if (Tag === undefined) return jsx("span", { className: className, children: text })
      return jsx(Tag, { tone: "neutral", className: className, children: text })
    }

    /**
     * Render this plugin's card inside the Plugins page's `可配置` tab.
     * @param props - locale reader, the card snapshot hook, and the form actions.
     * @returns the card element.
     */
    function TurnStatusTextCard(props) {
      var t = props.t
      var state = props.useTurnStatusText(function (snapshot) {
        return snapshot
      })
      var openState = React.useState(readOpen)
      var open = openState[0]
      var setOpen = openState[1]
      // Every hook runs before the availability check: a namespace that arrives
      // late must not change this component's hook order.
      var textId = React.useId()
      var colorId = React.useId()
      // A deployment that does not serve the namespace shows no trace of the card.
      if (!state.available) return null
      var disabled = !state.writable
      var shown = state.color === "" ? DEFAULT_COLOR : state.color
      var previewText = previewCopy(state.text, t)
      return jsxs("li", {
        className: cx(cls.card, open && cls.cardOpen),
        children: [
          jsxs("button", {
            type: "button",
            className: cls.header,
            "aria-expanded": open,
            "aria-label": t(open ? "collapse" : "expand") + ": " + t("title"),
            onClick: function () {
              var next = !open
              setOpen(next)
              writeOpen(next)
            },
            children: [
              jsxs("span", {
                className: cls.headText,
                children: [
                  jsx("span", { className: cls.name, children: t("title") }),
                  jsx("span", { className: cls.description, children: t("description") }),
                ],
              }),
              state.dirty ? unsavedBadge(t("unsaved")) : null,
              disclosureIcon(open),
            ],
          }),
          open
            ? jsxs("div", {
                className: cls.body,
                children: [
                  disabled ? jsx("p", { className: cls.readOnly, role: "status", children: t("readOnly") }) : null,
                  jsxs("div", {
                    className: cls.field,
                    children: [
                      jsxs("div", {
                        className: cls.head,
                        children: [
                          jsx("label", { className: cls.label, htmlFor: textId, children: t("textField") }),
                          state.textOverridden
                            ? jsxs("span", {
                                className: cls.badges,
                                children: [
                                  unsavedBadge(t("overridden")),
                                  jsx("button", {
                                    type: "button",
                                    className: cls.reset,
                                    disabled: disabled,
                                    onClick: function () {
                                      props.resetField("text")
                                    },
                                    children: t("reset"),
                                  }),
                                ],
                              })
                            : null,
                        ],
                      }),
                      jsx("input", {
                        id: textId,
                        type: "text",
                        className: cls.input,
                        value: state.text,
                        placeholder: t("textPlaceholder"),
                        disabled: disabled,
                        onChange: function (event) {
                          props.edit("text", event.target.value)
                        },
                      }),
                      jsx("p", { className: cls.hint, children: t("textHint") }),
                    ],
                  }),
                  jsxs("div", {
                    className: cls.field,
                    children: [
                      jsxs("div", {
                        className: cls.head,
                        children: [
                          jsx("label", { className: cls.label, htmlFor: colorId, children: t("colorField") }),
                          state.colorOverridden
                            ? jsxs("span", {
                                className: cls.badges,
                                children: [
                                  unsavedBadge(t("overridden")),
                                  jsx("button", {
                                    type: "button",
                                    className: cls.reset,
                                    disabled: disabled,
                                    onClick: function () {
                                      props.resetField("color")
                                    },
                                    children: t("reset"),
                                  }),
                                ],
                              })
                            : null,
                        ],
                      }),
                      jsxs("div", {
                        className: cls.colorRow,
                        children: [
                          jsx("input", {
                            type: "color",
                            "aria-label": t("colorField"),
                            className: cls.swatch,
                            value: state.colorPicker,
                            disabled: disabled,
                            onChange: function (event) {
                              props.edit("color", event.target.value)
                            },
                          }),
                          jsx("input", {
                            id: colorId,
                            type: "text",
                            spellCheck: false,
                            className: cx(cls.input, state.colorInvalid && cls.inputInvalid),
                            value: state.colorDraft,
                            placeholder: t("colorPlaceholder"),
                            disabled: disabled,
                            onChange: function (event) {
                              props.edit("color", event.target.value)
                            },
                          }),
                        ],
                      }),
                      jsx("p", {
                        className: state.colorInvalid ? cls.invalid : cls.hint,
                        role: state.colorInvalid ? "status" : undefined,
                        children: state.colorInvalid ? t("colorInvalid") : t("colorHint"),
                      }),
                    ],
                  }),
                  jsxs("p", {
                    className: cls.preview,
                    children: [
                      jsx("span", { className: cls.previewLabel, children: t("preview") }),
                      jsx("span", { className: cls.previewText, style: { color: shown }, children: previewText }),
                    ],
                  }),
                  jsxs("div", {
                    className: cls.footer,
                    children: [
                      state.failed ? jsx("p", { className: cls.failed, role: "status", children: t("saveFailed") }) : null,
                      jsx("button", {
                        type: "button",
                        className: cls.discard,
                        disabled: !state.dirty || state.saving,
                        onClick: props.discard,
                        children: t("discard"),
                      }),
                      jsx("button", {
                        type: "button",
                        className: cls.save,
                        disabled: !state.dirty || state.saving || disabled || state.colorInvalid,
                        onClick: props.save,
                        children: t(state.saving ? "saving" : "save"),
                      }),
                    ],
                  }),
                ],
              })
            : null,
        ],
      })
    }
    //#endregion
    //#endregion

    /** Required services: dictionary registry for the label seat, slots for the card. */
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
          // Apply whatever the page global already says, before the settings
          // service has had a chance to bind (the colour must not depend on it).
          syncColorStyle()
          return releaseColorStyle
        },
        "dsh-turn-status-text: injected colour rule",
      )
      ctx.effect(() => installCardStyles(), "dsh-turn-status-text: card stylesheet")
      // The settings scope and the card slot are optional: without them the label
      // override above still installs, it just has nothing to read.
      ctx.inject(["settingsScope", "slots"], (scoped) => {
        scope = scoped.settingsScope.bind({ namespace: NS })
        publish()
        scoped.effect(() => scope.subscribe(publish), "dsh-turn-status-text: card scope sync")
        scoped.slots.inject("settings.plugin.item", () => scoped.slots.register({
          name: "settings.plugin.item",
          key: NS,
          order: 10,
          locale: CARD_NS,
          inject: cardFace,
        }, TurnStatusTextCard))
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
    exports.TurnStatusTextCard = TurnStatusTextCard
    exports.normalizeColor = normalizeColor
    exports.effectiveColor = effectiveColor
    exports.renderOverride = renderOverride
    exports.isStatusKey = isStatusKey
    exports.colorCss = colorCss
    exports.previewCopy = previewCopy
    return module.exports
  },
})