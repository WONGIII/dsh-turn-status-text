# dsh-turn-status-text

English | [中文](README.md)

Replaces the **"Deep diving for 12s ···"** line in the DSH (DeepSeek Harness) chat area with text you write yourself and a colour you pick,
from **sidebar → Plugins → select this plugin → configure** — save and it applies immediately, no page reload.

| Default | Customised |
| --- | --- |
| ![Default status line](docs/before.png) | ![Custom status line](docs/after.png) |

Both images are real screenshots from the same machine: the left is the deployment as shipped (`深度求索中，用时 6分29秒 ···`),
the right swaps the text for `硬邦邦思考中…` and the colour for `#ff5500` (the whale mark on the left and the shimmer on the right change colour with it).

Keep `{duration}` in your text and the live elapsed time stays:

![Custom status line keeping the elapsed time](docs/after-duration.png)

## What you can change

| What | Details |
| --- | --- |
| Text | Any text. Include the `{duration}` placeholder to keep the live elapsed time, e.g. `Thinking hard… {duration}` → `Thinking hard… 12s`; without the placeholder the line shows nothing but your text. |
| Colour | Type a colour code, `#4d6bfe` or `#abc`. The whole row takes the colour — the text, the whale mark to its left, and the text's shimmer all follow (see below for why). |
| Reset to default | One control per field: clear the draft and save, and the text goes back to the copy the deployment ships while the colour goes back to the theme colour. |

The Host writes the changes into the current profile's `cordis.patch.yml`, appending a `config:` section to this row (this is what actually lands on disk), so they survive a browser switch and a restart;
the plugin makes no network calls and registers nothing the model can see.

```yaml
- id: dsh-turn-status-text
  name: "@dsh-external/dsh-turn-status-text"
  config:
    text: 宝宝正在努力思考… {duration}
    color: "#ff5500"
```

Only the **in-progress line** changes. The `Completed in …` summary after a turn finishes, `Failed`, and the rest stay exactly as shipped.

## Install

From GitHub (the repository ships the built `lib/` and **deliberately declares no `prepare` script**, so pnpm will not ask you to approve build permissions):

```bash
dsh plugin --profile <your profile> add github:WONGIII/dsh-turn-status-text
```

From a local checkout:

```bash
git clone https://github.com/WONGIII/dsh-turn-status-text.git
dsh plugin --profile <your profile> add ./dsh-turn-status-text
```

On the desktop app you can also paste that GitHub URL straight into the **Plugins** page in the sidebar.

> Replace `<your profile>` with your own profile name (commonly `web` for `dsh web`).
> The desktop app's own profile is managed exclusively by the Electron application — the CLI refuses it with
> `profile "desktop" is managed exclusively by the Electron application` — so install and uninstall from the sidebar
> **Plugins** page there.

**DSH has to be restarted once after installing** (`dsh web` or the desktop app). The plugin row is a host-side Loader row, and the browser half is served from it;
only a fresh composition of the configuration mounts a new Loader row — refreshing the page is not enough.
(The configuration file itself is "live" at runtime, but the settings namespace directory a **new** row depends on only includes it after that recomposition.)

Once installed, `@dsh-external/dsh-turn-status-text` shows up in the sidebar under **Plugins → Installed**; expand it to toggle the `dsh-turn-status-text` row on its own.

Uninstall:

```bash
dsh plugin --profile <your profile> remove @dsh-external/dsh-turn-status-text
```

## How to configure

**1. Configure it in the Plugins page (recommended)**: **sidebar → Plugins → open this plugin in the list → the configuration section is right under the title** (no need to open 包含的组件) → two inputs: the custom text and the text colour → Save.

![The configuration section on the plugin's own page](docs/plugins-config.png)

There is another way in: the same form also lives on the row inside "包含的组件" (click that row's chevron title, the `配置 @dsh-external/dsh-turn-status-text` button).

> In 0.2.0-rc the plugin configuration is no longer under "Settings → Plugins → Configurable": that tab and the `settings.plugin.item` slot it dispatched do not exist in the new build.
> The Plugins page now collects configuration from two slots, and **each needs a registration before any entry appears**:
> - `plugins.bundle.config` (key = the package name) → renders a configuration section under the plugin's own title, which is the screenshot above;
> - `plugins.row.config` (key = `<package name>#<row id>`, i.e. `rowConfigKey()` in `ui-plugin-manager`) → gives that row inside "包含的组件" a page of its own (`configure.has(row)`).
>
> The values travel over the `configForms` service (`configForms.get(row id)`, guarded by `whileServed`), and the form is the platform's own
> `SettingsFormModel` / `SettingsForm` / `SettingsValueField`, so both places look exactly like the settings pages the deployment ships.

Both fields are `volatile()` fields on this row's Config, so a save takes effect **immediately — with neither a restart nor a page reload**.

**2. Temporary override (DevTools console, current page only, wins over the settings)**:

```js
window.__DSH_TURN_STATUS_TEXT__  = 'Thinking hard… {duration}'
window.__DSH_TURN_STATUS_COLOR__ = '#ff5500'
delete window.__DSH_TURN_STATUS_TEXT__      // drop the text override
delete window.__DSH_TURN_STATUS_COLOR__     // drop the colour override
```

Both globals are **read live on every render and on every stylesheet change**, so an edit shows up at once.

Precedence: `window override` > `value from settings` > the copy / theme colour the deployment ships.

## How it works

### Text: the dictionaries stay untouched, the `translate` seam is rewritten

The in-progress line's copy comes from Chat's dictionary keys:

```js
const label = startTime === undefined
  ? t('chat.deepDiving')                                  // Deep diving
  : t('chat.deepDivingFor', { duration })                 // Deep diving for {duration} ···
```

The `t` the framework hands every slot component is built by `ctx.locale.bind(ns)` and implemented as `(key, params) => this.translate(ns, key, params)` —
**`this.translate` is resolved at call time**. So the plugin installs an own property of the same name on the locale service instance to shadow `translate`:
it intercepts exactly these three keys (`chat.deepDiving`, `chat.deepDivingFor`, and `message.turnProcess.deepDivingFor` on 0.1.7),
and forwards every other key untouched (`common` fallbacks, parameter interpolation, unknown keys falling back to the key name); uninstalling the plugin restores the original.

`{duration}` is filled in by the plugin itself from the elapsed-time string the framework passes; when there is no duration parameter (the key used before the clock starts, for instance)
the placeholder is swallowed and doubled spaces are collapsed, so no curly braces ever leak through.

### Colour: one higher-priority rule plus the platform's own colour variables

On 0.2.0-rc that line is not flat text but `TextShimmer` (a layer of text swept by a mask): its colour comes from the custom property `--dsw-alias-label-shimmer`,
and `.X_running` maps that from `--dsw-alias-label-deep-diving-shimmer`. So **both custom properties are load-bearing in the rule** (not a nicety),
while `color` covers the older deployments (where it really was a `currentColor` gradient) and unifies the whale mark along the way.

This is the single rule the plugin injects (the selector is written twice = 0,2,0, which outranks the generated class at 0,1,0 no matter which stylesheet comes first):

```css
[data-chat-running][data-chat-running]{
  color:#ff5500;                            /* older deployments are coloured by this, and it unifies the whale mark too */
  --dsw-alias-label-deep-diving:#ff5500;    /* the two variables the deployment uses itself */
  --dsw-alias-label-shimmer:#ff5500;
}
[data-turn-process][data-turn-process]{color:#ff5500}   /* the 0.1.7 turn-process row */
```

The shimmer's geometry, animation and timing all stay exactly as they were; only the colour changes.

The row itself is addressed through **attributes** (`data-chat-running` / `data-turn-process`), never through content-hashed class names that move with the build.
On older deployments (before 0.1.7) that row is `.<hash>_turnStatus` with a gradient background, so the plugin discovers the real class name in `document.styleSheets`
with `/\.([A-Za-z0-9_-]*_turnStatus)(?![\w-])/` and rebuilds a rule with the same gradient geometry;
the `<style>` element carries `data-plugin-css="dsh-turn-status-text"` and is removed on uninstall. With the colour left empty the rule's text is the empty string, which leaves the deployment's styles completely alone.

### The configuration page

**The settings entry *is* this row's Config**: the row id `- id: dsh-turn-status-text` in `cordis.patch.yml` is the key of the settings entry,
the Host projects the row's Config schema into a settings section (one namespace in `settings/describe`), so no `settings.register`-style call is needed at all,
and all three sides (the Host projection, the Plugins page form, the browser half's reads) align on the same id by construction.

Both fields carry `volatile()`: `volatile` means "the value can be changed without remounting this row, and what you read is always the latest value",
which is why the Plugins page puts it into an editable form; an empty-string default means "inherit" (the shipped copy / the theme colour).

**But the settings section being served ≠ the Plugins page giving it an entry**: the Plugins page only renders places that **registered a configuration slot** —
the plugin's own page needs `plugins.bundle.config` (key = the package name), and the row inside "包含的组件" needs `plugins.row.config` (key = `<package name>#<row id>`).
So registering this form into both slots is the second thing the browser half has to do:

```js
const inject = ['slots', 'locale']                       // required services: just these two
ctx.inject(['configForms', 'slots'], (scoped) => {       // settings form optional: without it the label override still works
  scope = scoped.configForms.get('dsh-turn-status-text')  // ConfigFormController: getSnapshot/ subscribe/ set/ mutate
  const card = new TurnStatusTextCardController(scope)    // wraps the platform's SettingsFormModel
  scoped.configForms.whileServed([NS], () => {
    for (const page of [
      { slot: 'plugins.bundle.config', key: '@dsh-external/dsh-turn-status-text' },                    // the plugin's own page
      { slot: 'plugins.row.config', key: '@dsh-external/dsh-turn-status-text#dsh-turn-status-text' },  // that row's page
    ]) {
      scoped.slots.inject(page.slot, () => scoped.slots.register({
        name: page.slot, key: page.key, locale: CARD_NS,
        inject: () => card.inject(),                      // { hooks, edit, resetField, discard, save }
      }, TurnStatusTextCard))
    }
  })
})
```

`whileServed` is the guard the platform provides for "mount these two places only when the Host really serves this settings entry": on a deployment that has not composed this row, the Plugins page shows no trace of them.
Both call the component with `view: 'page'` (the summary row in the row list is `view: 'summary'`); the plugin's own page passes no `form`, the row page passes one (`{state, mutate}`).
This plugin uses its own `SettingsFormModel` in both (the same `configForms` scope), so staging / saving / discarding / resetting to default mean exactly what they mean on the settings pages the deployment ships.

### Why the colour rule is written this way

The shimmer on the 0.2.0-rc row is not a `background-clip: text` gradient but a layer of text swept by a mask:
`TextShimmer`'s colour comes from `--dsw-alias-label-shimmer`, and `.X_running` maps that from `--dsw-alias-label-deep-diving-shimmer`.
So **both custom properties are load-bearing in the rule** (not a nicety): change them and the shimmer takes the new colour, while the geometry and animation stay completely untouched.
`color` is written alongside for the older deployments (which really did use `currentColor` + `background-clip:text`), and it unifies the whale mark with the row.

## Layout

```
dsh-turn-status-text/
├── package.json          # dsh.bundle.patch / dsh.client.platform = web; exports["./client"] → the browser bundle
├── cordis.patch.yml      # bundle layer: inserts one dsh-turn-status-text row
├── lib/
│   ├── host.js           # host half: declares the settings-entry row's Config (row id dsh-turn-status-text, text + color, volatile)
│   ├── index.js          # package entry (package.json main): re-exports ./host.js
│   └── client.js         # browser half: rewrites the copy + colours the row + the configuration page in the Plugins page
├── tools/
│   ├── selfcheck.mjs     # headless self-check (fake DOM + fake LocaleRuntime/ConfigForms running the real bundle)
│   ├── verify-live.mjs   # queries/writes the settings namespace of a running instance
│   ├── live-probe.mjs    # dependency-free CDP probe: reads the status line's text and computed colour in a real page, can screenshot
│   ├── preview.mjs       # renders a card reference page (light/dark)
│   └── hmr-probe.mjs     # listens for hot-reload frames on /plugins/events
├── docs/                 # the captured screenshots used by the README
└── README.md / README.en.md / LICENSE
```

The browser half needs no `node_modules` at all: it `require("react")` / `require("react/jsx-runtime")` through the page's module table.
The host half imports only `@deepseek-ai/schemastery` (declared as a regular dependency; the harness ships 3.18.4 itself).

## Development and verification

```bash
# 1) Browser-half self-check: fake DOM + the production semantics of LocaleRuntime/ConfigForms/settings form running the real bundle
node tools/selfcheck.mjs
node tools/selfcheck.mjs <copy of the client.js the server serves>   # check the exact bytes that ship

# 2) Confirm a running instance serves the settings entry (so the configuration page gets mounted)
node tools/verify-live.mjs
node tools/verify-live.mjs --set "Thinking hard… {duration}"
node tools/verify-live.mjs --color "#ff5500"
node tools/verify-live.mjs --color -        # clear the colour
node tools/verify-live.mjs --clear          # clear both fields

# 3) Read the status line in a real page (no third-party dependencies; signs the cookie itself and drives headless Chromium)
node tools/live-probe.mjs --wait 30 --shot probe.png

# 4) Generate the card reference page (light/dark)
node tools/preview.mjs && start tools/preview.html

# 5) Watch browser-side hot-reload frames
node tools/hmr-probe.mjs 15
```

`selfcheck.mjs` covers: text precedence (including `{duration}` filling and "swallow the placeholder when there is nothing to fill it with"), non-target keys forwarded untouched,
colour normalization (`#ABC` → `#aabbcc`, `4d6bfe` → `#4d6bfe`, `red`/`#12345` rejected),
the **exact CSS text** of both attribute selectors and of the legacy `_turnStatus` gradient rule, the page-global overrides and their fallback,
the binding of `configForms.get(row id)`, the `whileServed` guard (no configuration page mounted when the settings entry is not served),
both slots (`plugins.bundle.config` by package name, `plugins.row.config` by `<package name>#<row id>`), that each slot is claimed once, both the summary and the full-page view,
the form state and the injection of the form actions, a field edit / reset to default landing in the settings through the platform form and rendering on the status line,
a scope without `mutate` falling back to `set`/`unset`, and the style element and the dictionaries removed after cleanup.

`verify-live.mjs` signs a loopback page cookie with the browser-session secret from the local `$DSH_HOME/.credentials.yaml`,
then calls `settings/describe` / `settings/mutate` (the secret is never printed).

`live-probe.mjs` signs the same cookie, then launches the headless Chromium under `%LOCALAPPDATA%\ms-playwright\chromium-*`
and uses CDP (Node's built-in `WebSocket`) to read `[data-chat-running]`'s text and computed colour. Note that the Web app **has no URL routing**:
a freshly opened tab always lands in the empty state, so the probe only finds the status line when the running turn is already open on the page —
it only reads and never clicks, and when it finds nothing it prints a diagnostic JSON (including the page's currently visible text) and exits with 1.

### Captured live readings on this machine

On the DSH desktop app (0.2.0-rc.2), `live-probe.mjs` reading a real in-flight session:

```
# deployment as shipped (no override set)
{"found":true,"rows":1,"rowClass":"xz4KEq_running","text":"深度求索中深度求索中，用时 6分29秒 ···",
 "rowColor":"color(srgb 0.20549 0.367451 0.730196)",
 "deepDivingVar":"color-mix(in srgb, #4176e6 70%, #172554)",
 "shimmerVar":"color-mix(in srgb, #4176e6 30%, #172554)",
 "ruleInjected":["…","dsh-turn-status-text/card","…"]}

# after the plugin's page globals are turned on
{"found":true,"rows":1,"rowClass":"xz4KEq_running","text":"硬邦邦思考中…硬邦邦思考中…",
 "rowColor":"rgb(255, 85, 0)",
 "deepDivingVar":"#ff5500","shimmerVar":"#ff5500",
 "ruleInjected":["…","dsh-turn-status-text","dsh-turn-status-text/card","…"]}
```

In the first line's text the leading half is the `aria-live` announcement (the same key) and the trailing half is the visible row;
the two readings correspond to `docs/before.png` and `docs/after.png`.

With the plugin installed into this machine's desktop profile from the GitHub address above
(`github:WONGIII/dsh-turn-status-text`, written into `dsh.profile.bundles` by the Plugins page), one more reading —
this time of **this session's own in-flight turn** — verifies the `{duration}` placeholder:

```
{"found":true,"rows":1,"rowClass":"xz4KEq_running","text":"硬邦邦思考中…硬邦邦思考中… 34分21秒",
 "rowColor":"rgb(255, 85, 0)","deepDivingVar":"#ff5500","shimmerVar":"#ff5500"}
```

That is `docs/after-duration.png`: custom text, still-live elapsed time.

### The whole configure loop in the Plugins page (measured live)

After a DSH restart the settings entry is served properly (`node tools/verify-live.mjs` →

```
OK: dsh-turn-status-text is served -> {"text":"","color":""}
```

), and then headless Chromium walked the real UI once:

1. sidebar **Plugins** → open `@dsh-external/dsh-turn-status-text` in the plugin list;
2. **the configuration section is right under the title** (`[data-plugin-config]`, no need to open "包含的组件"), with the two fields **自定义文字** / **文字颜色** (custom text / text colour);
3. the row keeps a page of its own as well: its title is a chevron button, `aria-label="配置 @dsh-external/dsh-turn-status-text"` (without the `plugins.row.config` registration it is plain text);
4. fill in `宝宝正在努力思考… {duration}` and `#ff5500`, click **Save**;
5. back in the conversation, read the status line:

```
{"found":true,"rowClass":"xz4KEq_running","text":"宝宝正在努力思考…宝宝正在努力思考… 6分43秒",
 "rowColor":"rgb(255, 85, 0)","deepDivingVar":"#ff5500","shimmerVar":"#ff5500"}
```

The leading half is the `aria-live` announcement and the trailing half is the visible row; the configuration section is in `docs/plugins-config.png` (since v0.1.3 it sits on the plugin's own page).
In other words: **save in the Plugins page → the chat row renders with your text and colour at once**, with no page reload anywhere in the loop.

## Compatibility

| Deployment | Copy keys | Colour anchor | Settings entry | Supported |
| --- | --- | --- | --- | --- |
| 0.2.0-rc (current desktop app) | `chat.deepDiving` / `chat.deepDivingFor` | `[data-chat-running]` | row id `dsh-turn-status-text` + `configForms` + `plugins.row.config` | ✅ full loop verified live |
| 0.1.7-rc | `message.turnProcess.deepDivingFor` | `[data-turn-process]` | the old `settingsScope` service | ⚠️ copy/colour work; the configuration page follows the 0.2.0-rc contract |
| before 0.1.7 | `chat.deepDiving` | `.<hash>_turnStatus` (discovered at runtime) | same as above | ⚠️ same as above |

The host half depends on `@deepseek-ai/schemastery@^3.18.4` (the harness ships the same version); it declares no `prepare`, so a git install needs no build-script approval.

## Limitations

- Only the in-progress line changes; the copy on the summary line after a turn ends (`message.turnProcess.took` and friends) is out of scope.
- The colour applies to the **whole row** (whale mark included), because it is that row's `color`/colour variables; there is no separate whale switch.
- The colour field is a text input (the control the platform's settings form gives), so there is no colour picker; the colour you type is normalized at render time, and an invalid value simply means "no colour".
- Content-hashed class names only need discovering on the legacy path, so a very old deployment that renamed `_turnStatus` gets no colour (the text override still works).
- On 0.1.7 and older: both the copy and the colour paths still exist, but the configuration page is written against 0.2.0-rc's `configForms` + `plugins.row.config` contract,
  so it never shows up on those older versions (which had no such settings API in the first place).
- Placeholders other than `{duration}` are rendered verbatim.

## License

[MIT](LICENSE) © 2026 WONGIII
