# dsh-turn-status-text

[English](README.en.md) | 中文

给 DSH（DeepSeek Harness）聊天区那行**「深度求索中，用时 12秒 ···」**换成你自己写的文字和你自己选的颜色，
在**设置 → 插件 → 可配置**里改，保存即生效，不用刷新页面。

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
| 颜色 | 调色盘或手填 `#4d6bfe` / `#abc`（`#` 可省略）。整行统一上色——文字、左边的小鲸鱼、以及文字的流光渐变都跟着走（原理见下）。 |
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

**1. 图形界面（推荐）**：设置 → **插件** → **可配置** → 展开 **「状态文案」** 卡片。

卡片与部署自带的插件卡片同款：同边框/圆角/背景层、同字号间距、hover 与 focus-visible 状态、标题栏可折叠并**记住折叠状态**；
「展开设置/收起设置」「放弃修改」「已覆盖」「恢复默认」「本部署的设置为只读。」这些文案取自平台自己的词典，
图标与 `Tag` 组件用平台自己的（`@deepseek-ai/dsh-client-ui-primitives`）。

卡片底部有一行**预览**，用当前草稿的文字和颜色直接显示；颜色非法（比如 `#12345`）会红字提示并禁用保存。

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

### 颜色：一条更高优先级的规则 + `currentColor`

那行文字不是用 `color` 直接画的平面文字，而是 `TextShimmer`：一层用 `currentColor` 生成的渐变，
配合 `background-clip: text` + `-webkit-text-fill-color: transparent` 做流光。所以**只要把这一行的 `color` 定下来，流光会自己用新颜色重画**，
几何、动画、节奏全部保持原样。

插件注入的就是这一条（选择器写两遍 = 0,2,0，稳压生成类名的 0,1,0，与样式表先后无关）：

```css
[data-chat-running][data-chat-running]{
  color:#ff5500;
  --dsw-alias-label-deep-diving:#ff5500;   /* 部署自己用的两个变量也一并改掉 */
  --dsw-alias-label-shimmer:#ff5500;
}
[data-turn-process][data-turn-process]{color:#ff5500}   /* 0.1.7 的 turn-process 行 */
```

行本身用**属性**定位（`data-chat-running` / `data-turn-process`），不依赖会随构建变化的内容哈希类名。
更老的部署（0.1.7 之前）那行是 `.<hash>_turnStatus` 加一条渐变背景，插件会从 `document.styleSheets` 里
用 `/\.([A-Za-z0-9_-]*_turnStatus)(?![\w-])/` 找出真实类名，再用同样的渐变几何重建一条规则，
`<style>` 元素上带 `data-plugin-css="dsh-turn-status-text"`，卸载时移除。颜色留空时规则内容为空字符串，等于完全不干预部署样式。

### 配置卡片

Host 半侧注册设置命名空间 `turn-status-text`（schemastery：`text` 与 `color`，默认值都是空串 = 继承部署原文案/主题原色）；
浏览器半侧向 `settings.plugin.item` 槽位注册同 key 的卡片——Web 插件页的「可配置」标签会为 host 提供的每个命名空间 dispatch 一次这个槽位，
这是官方给仓库外插件准备的扩展点。

写入契约与平台一致：`edit(field, text)` 暂存、`resetField(field)` 暂存清空、`discard()` 放弃、`save()` 落盘；
保存走 `scope.mutate([...ops])` **一次原子写**（两个字段一起改也只写一次），没有 `mutate` 的实现退回 `set`/`unset`。
保存后的校验读的是 **user 层**而不是解析后的值：`unset` 之后 Host 会按 schema 默认值重新解析这个分区，
所以「颜色被清空」表现为 `user` 里没有这个字段、`value` 里是默认值——按 `value === undefined` 判断会把清空误报成保存失败。
颜色在保存时归一化为小写 `#rrggbb`。

卡片样式只走主题别名 token（`--dsw-alias-bg-layer-2/3`、`--dsw-alias-label-primary/secondary/tertiary`、
`--dsw-alias-border-l2/l4`、`--dsw-alias-label-error`、`--dsw-alias-brand-primary`、`--dsw-alias-label-dimmed`），
没有任何硬编码颜色，浅色/深色切换交给主题。
（踩过的坑：`--dsw-alias-bg-layer` 这个名字**不存在**，写了会一路 fallback 到深色兜底值，在浅色主题下就是一块黑输入框。）

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
# 1) 浏览器半侧自检：假 DOM + 与线上同语义的 LocaleRuntime/SettingsScope 跑真实 bundle
node tools/selfcheck.mjs
node tools/selfcheck.mjs <服务器下发的 client.js 副本>   # 检线上真正下发的字节

# 2) 向运行中的实例确认设置命名空间被提供（卡片会被 dispatch）
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
非法颜色禁用保存且不写盘、「恢复默认」清空字段、两字段一次原子写、清理后样式元素被移除。

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

## 兼容性

| 部署 | 文案键 | 上色锚点 | 支持 |
| --- | --- | --- | --- |
| 0.2.0-rc（当前桌面端） | `chat.deepDiving` / `chat.deepDivingFor` | `[data-chat-running]` | ✅ 实测 |
| 0.1.7-rc | `message.turnProcess.deepDivingFor` | `[data-turn-process]` | ✅ |
| 0.1.7 之前 | `chat.deepDiving` | `.<hash>_turnStatus`（运行时发现） | ✅ |

host 半侧依赖 `@deepseek-ai/schemastery@^3.18.4`（harness 自带同版本）；不声明 `prepare`，git 安装无需放行构建脚本。

## 限制

- 只改「进行中」那行；轮次结束后汇总行的文案（`message.turnProcess.took` 等）不在覆盖范围。
- 颜色作用于**整行**（含左侧小鲸鱼），因为它就是这一行的 `color`；没有单独的小鲸鱼开关。
- 内容哈希类名只在旧版路径上需要发现，极老的部署若把 `_turnStatus` 换了名字则拿不到颜色（文字覆盖仍然有效）。
- `{duration}` 之外的占位符会被原样显示。

## License

[MIT](LICENSE) © 2026 WONGIII
