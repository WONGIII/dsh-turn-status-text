# dsh-turn-status-text

[English](README.en.md) | 中文

给 DSH（DeepSeek Harness）聊天区那行**「深度求索中，用时 12秒 ···」**换成你自己写的文字和你自己选的颜色，
在**侧栏「插件」页选中本插件后配置**，保存即生效，不用刷新页面。

| 默认 | 改过之后 |
| --- | --- |
| ![默认状态行](docs/before.png) | ![自定义状态行](docs/after.png) |

上图是同一台机器上的两次真实截屏：左边是部署原样（`深度求索中，用时 6分29秒 ···`），
右边把文字换成 `硬邦邦思考中…`、颜色换成 `#ff5500`（左边的小鲸鱼、右侧的流光也一起换了色）。

文字里写 `{duration}` 时，实时用时会保留：

![保留用时的自定义状态行](docs/after-duration.png)

## 你能改什么

| 能改 | 说明 |
| --- | --- |
| 文字 | 任意文字。写 `{duration}` 占位符可以保留实时用时，例如 `宝宝正在努力思考… {duration}` → `宝宝正在努力思考… 12秒`；不写占位符就整行只显示你的文字。 |
| 颜色 | 填颜色代码 `#4d6bfe` 或 `#abc`。整行统一上色——文字、左边的小鲸鱼、以及文字的流光都跟着走（原理见下）。 |
| 恢复默认 | 每个字段各有一个：把草稿清空再保存，文字回到部署原文案，颜色回到主题色。 |

改动存在 `$DSH_HOME/settings.yaml` 的 `turn-status-text:` 段里，跨浏览器、重启后仍在；
插件不联网，也不注册任何给模型看的内容。

只改**「进行中」那行**。一轮结束后的「已完成，用时 …」「处理失败」等等保持原样。

## 安装

从 GitHub 安装（仓库自带已构建的 `lib/`，且**刻意不声明 `prepare` 脚本**，所以 pnpm 不会要求你放行构建权限）：

```bash
dsh plugin --profile <你的 profile> add github:WONGIII/dsh-turn-status-text
```

从本地 checkout 安装：

```bash
git clone https://github.com/WONGIII/dsh-turn-status-text.git
dsh plugin --profile <你的 profile> add ./dsh-turn-status-text
```

桌面端也可以直接在侧栏 **插件** 页里填这个 GitHub 地址安装。

> 把 `<你的 profile>` 换成你自己的 profile 名即可（`dsh web` 常见是 `web`）。
> 桌面端那个 profile 由 Electron 应用独占管理（CLI 会拒绝：`profile "desktop" is managed exclusively by the Electron application`），
> 所以桌面端请用侧栏 **插件** 页安装/卸载。

**装完要重启一次 DSH**（`dsh web` 或桌面端）。插件行是 host 侧的 Loader 行，浏览器半侧由它对外提供；
只有让 DSH 重新组合一次配置，新的 Loader 行才会被挂上——只刷新页面不够。
（配置文件本身在运行期是"活"的，但**新增**一行所依赖的设置命名空间目录要等这次重组才会包含它。）

装上以后在侧栏 **插件 → 已安装** 里能看到 `@dsh-external/dsh-turn-status-text`，展开即可单独开关 `dsh-turn-status-text` 这一行。

卸载：

```bash
dsh plugin --profile <你的 profile> remove @dsh-external/dsh-turn-status-text
```

## 怎么改

**1. 图形界面（推荐）**：**侧栏「插件」页 →（已安装 / Installed）→ 找到本插件 → 配置**。
本插件的卡片「状态文案」就在插件页的配置列表里，展开是两个输入框：自定义文字、文字颜色。

> 0.2.0-rc 的插件配置已经不在"设置 → 插件 → 可配置"里了：那个标签页与它 dispatch 的 `settings.plugin.item` 槽位在新版里已经不存在，
> 现在由插件页自己承载——配置卡片注册进插件页的 `plugins.item` 槽位，设置值走 `configForms` 服务，
> 表单用平台自己的 `SettingsFormModel` / `SettingsForm` / `SettingsValueField`。
> 同一个 `text` / `color` 也出现在插件页里该 row 的配置页上（row 的 Config 就是设置分区），两处改的是同一份值。

卡片用的是平台自己的设置表单（`SettingsFormModel` + `SettingsForm` + `SettingsValueField`，都来自 `@deepseek-ai/dsh-client-ui-primitives`）：
同边框/圆角/背景层、同字号间距、hover 与 focus-visible 状态、同一个「已覆盖」徽章与「恢复默认」控件、同一套「保存 / 放弃修改 / 本部署的设置为只读。」文案，
连表单框架的标签集都是这套组件自带的——所以它和部署自带的设置页长得完全一样，主题（浅色/深色）也由平台负责。

两个字段都声明为 `volatile()`，所以改完保存**立即生效、不用重启也不用刷新**。

**2. 临时覆盖（DevTools 控制台，只在当前页面生效，优先级高于设置）**：

```js
window.__DSH_TURN_STATUS_TEXT__  = '宝宝正在努力思考… {duration}'
window.__DSH_TURN_STATUS_COLOR__ = '#ff5500'
delete window.__DSH_TURN_STATUS_TEXT__      // 撤销文字覆盖
delete window.__DSH_TURN_STATUS_COLOR__     // 撤销颜色覆盖
```

两个全局都是**每次渲染/每次样式表变动时实时读取**的，改完立刻能看到效果。

优先级：`window 覆盖` > `设置里的值` > 部署原文案 / 主题原色。

## 它是怎么做到的

### 文案：不碰词典，改 `translate` 这一层

「进行中」那行的文字来自 Chat 目标的词典键：

```js
const label = startTime === undefined
  ? t('chat.deepDiving')                                  // 深度求索中
  : t('chat.deepDivingFor', { duration })                 // 深度求索中，用时 {duration} ···
```

框架给每个 slot 组件的 `t` 是 `ctx.locale.bind(ns)` 造出来的，实现是 `(key, params) => this.translate(ns, key, params)`——
**调用时才解析 `this.translate`**。所以插件在 locale 服务实例上挂一个同名 own property 覆盖 `translate`：
只拦截这三个键（`chat.deepDiving`、`chat.deepDivingFor`、以及 0.1.7 版的 `message.turnProcess.deepDivingFor`），
其余键（含 `common` 回退、参数插值、未知键回退到键名）原样转发；插件卸载时自动还原。

`{duration}` 由插件自己替换成框架传来的用时字符串；没有 duration 参数时（比如「时钟还没开始」的那个键）
占位符会被吃掉并折叠多余空格，不会漏出花括号。

### 颜色：一条更高优先级的规则 + 平台自己的着色变量

0.2.0-rc 里那行文字不是平面文字，而是 `TextShimmer`（一层用遮罩扫过的文字）：它的着色变量是 `--dsw-alias-label-shimmer`，
而 `.X_running` 又把它映射自 `--dsw-alias-label-deep-diving-shimmer`。所以规则里**两个自定义属性是必需的**（不是锦上添花），
`color` 则负责更老的版本（那时确实是 `currentColor` 渐变）并顺手统一小鲸鱼。

插件注入的就是这一条（选择器写两遍 = 0,2,0，稳压生成类名的 0,1,0，与样式表先后无关）：

```css
[data-chat-running][data-chat-running]{
  color:#ff5500;                            /* 更老的版本靠它上色，也顺手统一小鲸鱼 */
  --dsw-alias-label-deep-diving:#ff5500;    /* 部署自己用的两个变量 */
  --dsw-alias-label-shimmer:#ff5500;
}
[data-turn-process][data-turn-process]{color:#ff5500}   /* 0.1.7 的 turn-process 行 */
```

流光几何、动画、节奏全部保持原样，只换颜色。

行本身用**属性**定位（`data-chat-running` / `data-turn-process`），不依赖会随构建变化的内容哈希类名。
更老的部署（0.1.7 之前）那行是 `.<hash>_turnStatus` 加一条渐变背景，插件会从 `document.styleSheets` 里
用 `/\.([A-Za-z0-9_-]*_turnStatus)(?![\w-])/` 找出真实类名，再用同样的渐变几何重建一条规则，
`<style>` 元素上带 `data-plugin-css="dsh-turn-status-text"`，卸载时移除。颜色留空时规则内容为空字符串，等于完全不干预部署样式。

### 配置卡片

**设置项就是这一行的 Config**：`cordis.patch.yml` 里 `- id: dsh-turn-status-text` 这个 row id 就是设置条目的 key，
Host 把 row 的 Config schema 投影成设置分区（`settings/describe` 里的一个 namespace），插件页据此渲染表单——
所以不需要任何 `settings.register` 之类的注册调用，三方（Host 投影、插件页表单、浏览器半侧读取）天然对齐同一个 id。

两个字段都带 `volatile()`：`volatile` 是"值可以在不重新挂载这个 row 的前提下被改，并且读到的始终是最新值"，
SettingsForm 因此把它放进可编辑表单；空串默认值表示"继承"（部署原文案 / 主题原色）。

浏览器半侧的读与写都走平台服务：

```js
const inject = ['slots', 'locale']                      // 必需服务：只有这两个
ctx.inject(['configForms', 'slots'], (scoped) => {      // 设置表单可选：没有它标签覆盖照常工作
  scope = scoped.configForms.get('dsh-turn-status-text') // ConfigFormController：getSnapshot/ subscribe/ set/ mutate
  const card = new TurnStatusTextCardController(scope)   // 包住平台的 SettingsFormModel
  scoped.configForms.whileServed([NS], () => scoped.slots.inject('plugins.item', () => scoped.slots.register({
    name: 'plugins.item', id: NS, order: 20, label: () => t('title'), locale: CARD_NS,
    inject: () => card.inject(),                         // { hooks, edit, resetField, discard, save }
  }, TurnStatusTextCard)))
})
```

`whileServed` 是平台提供的"只在 Host 真的提供这个设置条目时才挂卡片"的守卫：没组合这一行的部署里，插件页看不到这张卡片的任何痕迹。
暂存/保存/放弃/恢复默认由平台表单模型负责，插件只把 scope 交给它、并把自己投影成组件要读的 snapshot。

### 颜色规则为什么这样写

0.2.0-rc 那行的流光不是 `background-clip: text` 的渐变，而是一层用遮罩扫过的文字：
`TextShimmer` 的着色变量是 `--dsw-alias-label-shimmer`，而 `.X_running` 把它映射自 `--dsw-alias-label-deep-diving-shimmer`。
所以规则里**两个自定义属性是必需的**（不是锦上添花）：改了它们，流光就换成新颜色，而几何与动画完全不动。
`color` 一起写是为了兼容更老的版本（那时确实是 `currentColor` + `background-clip:text`），也顺手让小鲸鱼与整行统一。

## 结构

```
dsh-turn-status-text/
├── package.json          # dsh.bundle.patch / dsh.client.platform = web；exports["./client"] → 浏览器 bundle
├── cordis.patch.yml      # bundle 层：insert 一行 dsh-turn-status-text
├── lib/
│   ├── host.js           # host 半侧：注册设置命名空间 turn-status-text（text + color）
│   ├── index.js          # 包入口（package.json main）：re-export ./host.js
│   └── client.js         # 浏览器半侧：改文案 + 上色 + 配置卡片
├── tools/
│   ├── selfcheck.mjs     # headless 自检（假 DOM + 假 LocaleRuntime/SettingsScope 跑真实 bundle）
│   ├── verify-live.mjs   # 向运行中的实例查询/写入设置命名空间
│   ├── live-probe.mjs    # 无依赖 CDP 探针：在真实页面里读状态行的文字与计算颜色，可截图
│   ├── preview.mjs       # 渲染一张卡片对照页（浅色/深色）
│   └── hmr-probe.mjs     # 监听 /plugins/events 的热重载帧
├── docs/                 # README 用的实测截图
└── README.md / README.en.md / LICENSE
```

浏览器半侧不需要任何 `node_modules`：它 `require("react")` / `require("react/jsx-runtime")`，走页面里的模块表。
host 半侧只 import `@deepseek-ai/schemastery`（声明为普通依赖，harness 自带 3.18.4）。

## 开发与验证

```bash
# 1) 浏览器半侧自检：假 DOM + 与线上同语义的 LocaleRuntime/ConfigForms/设置表单跑真实 bundle
node tools/selfcheck.mjs
node tools/selfcheck.mjs <服务器下发的 client.js 副本>   # 检线上真正下发的字节

# 2) 向运行中的实例确认设置条目被提供（卡片会被挂上）
node tools/verify-live.mjs
node tools/verify-live.mjs --set "宝宝正在努力思考… {duration}"
node tools/verify-live.mjs --color "#ff5500"
node tools/verify-live.mjs --color -        # 清掉颜色
node tools/verify-live.mjs --clear          # 两个字段都清

# 3) 在真实页面里读状态行（无第三方依赖，自带 cookie 签名与 headless Chromium）
node tools/live-probe.mjs --wait 30 --shot probe.png

# 4) 生成卡片对照页（浅色/深色）
node tools/preview.mjs && start tools/preview.html

# 5) 观察浏览器侧热重载帧
node tools/hmr-probe.mjs 15
```

`selfcheck.mjs` 覆盖：文案优先级（含 `{duration}` 填充与"没填就吃掉占位符"）、非目标键原样转发、
颜色归一化（`#ABC` → `#aabbcc`、`4d6bfe` → `#4d6bfe`、`red`/`#12345` 拒绝）、
两个属性选择器与旧版 `_turnStatus` 渐变规则的**精确 CSS 文本**、页面全局覆盖与回退、
`configForms.get(row id)` 的绑定、`whileServed` 守卫（没提供这个设置条目时不挂卡片）、
卡片投影与表单动作的注入、字段编辑/恢复默认经平台表单保存后落到设置并渲染到状态行、
没有 `mutate` 的 scope 退回 `set`/`unset`、清理后样式元素与词典都被移除。

`verify-live.mjs` 用本机 `$DSH_HOME/.credentials.yaml` 里的 browser-session 密钥签一个 loopback 页面 cookie，
再调 `settings/describe` / `settings/mutate`（密钥不会被打印）。

`live-probe.mjs` 同样自带 cookie 签名，然后拉起 `%LOCALAPPDATA%\ms-playwright\chromium-*` 里的 headless Chromium，
用 CDP（Node 自带 `WebSocket`）读 `[data-chat-running]` 的文本与计算颜色。注意：Web 应用**没有 URL 路由**，
新开标签页永远落在空状态，所以探针只有在页面上已经打开着「正在跑的那轮对话」时才找得到状态行——
它只读不点，找不到时会打印诊断 JSON（含页面当前可见文字）并以 1 退出。

### 本机实测记录

在 DSH 桌面端（0.2.0-rc.2）上，用 `live-probe.mjs` 对一个真实进行中的会话读数：

```
# 部署原样（未设任何覆盖）
{"found":true,"rows":1,"rowClass":"xz4KEq_running","text":"深度求索中深度求索中，用时 6分29秒 ···",
 "rowColor":"color(srgb 0.20549 0.367451 0.730196)",
 "deepDivingVar":"color-mix(in srgb, #4176e6 70%, #172554)",
 "shimmerVar":"color-mix(in srgb, #4176e6 30%, #172554)",
 "ruleInjected":["…","dsh-turn-status-text/card","…"]}

# 打开插件的页面全局覆盖之后
{"found":true,"rows":1,"rowClass":"xz4KEq_running","text":"硬邦邦思考中…硬邦邦思考中…",
 "rowColor":"rgb(255, 85, 0)",
 "deepDivingVar":"#ff5500","shimmerVar":"#ff5500",
 "ruleInjected":["…","dsh-turn-status-text","dsh-turn-status-text/card","…"]}
```

第一行文字里前半段是 `aria-live` 的无障碍播报（同一个键）、后半段是可见的那行；
两组数据分别对应 `docs/before.png` 与 `docs/after.png`。

插件已按上面的 GitHub 地址装进这台机器的桌面端 profile（`github:WONGIII/dsh-turn-status-text`，由插件管理页写入 `dsh.profile.bundles`）后，
再对**本会话自己**（真正在跑的那轮）读一次，验证 `{duration}` 占位符：

```
{"found":true,"rows":1,"rowClass":"xz4KEq_running","text":"硬邦邦思考中…硬邦邦思考中… 34分21秒",
 "rowColor":"rgb(255, 85, 0)","deepDivingVar":"#ff5500","shimmerVar":"#ff5500"}
```

即 `docs/after-duration.png`：文字是自定义的，用时仍是实时的。

设置卡片本身要求 Host 真的提供这个设置条目（`whileServed` 守卫）。本机这个 DSH 进程是在插件装好之前启动的，
设置目录在启动时就组合好了，所以**卡片要重启一次 DSH 才会出现**；重启前两条效果路径（文案 / 颜色）用上面的页面全局即可验证，
而卡片那半边由 `selfcheck.mjs` 用与线上同形的 `ConfigForms`（含 `get`/`whileServed`/`mutate`）和平台设置表单的同一组接口
（`SettingsFormModel.shell/field/bind/actions/dispose`）跑过：注册时机、投影字段、编辑、恢复默认、保存落库、未提供条目时不挂卡片。

## 兼容性

| 部署 | 文案键 | 上色锚点 | 设置条目 | 支持 |
| --- | --- | --- | --- | --- |
| 0.2.0-rc（当前桌面端） | `chat.deepDiving` / `chat.deepDivingFor` | `[data-chat-running]` | row id `dsh-turn-status-text` + `configForms` | ✅ 实测（文案/颜色；卡片见下） |
| 0.1.7-rc | `message.turnProcess.deepDivingFor` | `[data-turn-process]` | 旧版 `settingsScope` 服务 | ⚠️ 文案/颜色可用，设置卡片按 0.2.0-rc 契约实现 |
| 0.1.7 之前 | `chat.deepDiving` | `.<hash>_turnStatus`（运行时发现） | 同上 | ⚠️ 同上 |

host 半侧依赖 `@deepseek-ai/schemastery@^3.18.4`（harness 自带同版本）；不声明 `prepare`，git 安装无需放行构建脚本。

## 限制

- 只改「进行中」那行；轮次结束后汇总行的文案（`message.turnProcess.took` 等）不在覆盖范围。
- 颜色作用于**整行**（含左侧小鲸鱼），因为它就是这一行的 `color`/着色变量；没有单独的小鲸鱼开关。
- 颜色字段是文本输入（平台设置表单给的控件），没有取色盘；填的颜色在渲染时归一化，非法值等于"不上色"。
- 内容哈希类名只在旧版路径上需要发现，极老的部署若把 `_turnStatus` 换了名字则拿不到颜色（文字覆盖仍然有效）。
- 0.1.7 及更早的部署：文案与颜色两条路径都还在，但设置卡片是按 0.2.0-rc 的 `configForms` + `plugins.item` 契约写的，
  在这些老版本上不会出现（那两版本来也没有这套设置 API）。
- `{duration}` 之外的占位符会被原样显示。

## License

[MIT](LICENSE) © 2026 WONGIII
