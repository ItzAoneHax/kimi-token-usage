# Kimi 上下文用量

升级 Kimi Code 输入框右下角的上下文按钮：**鼠标悬浮提示保持原生不变**，**左键点击**打开上下文用量面板，显示已用百分比、总量，以及系统提示词 / 工具定义 / 对话消息三段明细。

面板复用 Kimi Code 自己的菜单组件类（`.ui-menu`）、字体、颜色、圆角和阴影变量，浅色 / 深色主题自动跟随。检测到壁纸插件运行时，会把面板的透明和模糊规则追加进壁纸注入的 `#kimi-wallpaper-style`，让面板使用壁纸的 `--kw-menu-surface` 和 `--kw-card-border`，与背景保持一致。

## 安装

在 Kimi Code 里执行（把路径换成实际克隆位置）：

```text
/plugins install D:\path\to\kimi-token-usage
```

然后 `/reload` 或开一个新会话。插件 id 是 `kimi-token-usage`，命令是 `/kimi-token-usage:context`。

安装插件后，把页内脚本装进客户端：

```powershell
$tu = "$env:KIMI_CODE_HOME\plugins\managed\kimi-token-usage\lib\cli.mjs"
node $tu install
```

**完整退出并重新打开 Kimi Code**（或在窗口里按 Ctrl+R）。之后鼠标悬浮上下文按钮仍然是原生的 `使用 244k / 977k tokens (25%)` 提示，左键点击按钮会打开明细面板。

> 插件安装后会被复制到 `$KIMI_CODE_HOME/plugins/managed/kimi-token-usage/`；之后修改源码需要重新安装或让插件管理器更新。

## 面板

- 顶部：`上下文已用 15%` 和 `~154K / 1M`。
- 进度条：灰色 = 系统提示词，紫色 = 工具定义，蓝色 = 对话消息；按上限比例绘制。
- 明细行：三段各自的 `~` 估算值；鼠标悬停行会显示插件自己的 tooltip，给出精确 token 数，不依赖浏览器 `title`。壁纸开启时该 tooltip 使用壁纸的 `--kw-tip-surface` 和 `blur(20px)`，关闭时回退为原生反色实心气泡。
- 缓存命中率：按当前会话所有 `usage.record` 累计，`缓存读取 /（普通输入 + 缓存读取 + 缓存写入）`；鼠标悬停可看缓存读取和输入 token 数。
- 模型输出速度：显示本次会话累计的 `tok/s`；鼠标悬停可看累计输出 token 数、解码耗时、步数和最近一步速度。统计包含工具调用步骤，个别流式耗时塌缩的步骤会用 step 包络修正。
- 点击反馈：鼠标悬浮时按钮出现白色圆形高亮；点击后面板打开，高亮消失；鼠标移开再悬浮会重新出现。
- 面板打开期间只隐藏文案匹配的原生 token 悬浮提示，隐藏条件绑定在 `html.ktu-panel-open` 上；关闭面板后立即恢复，且不拦截其他按钮的悬浮事件。
- 数据来自当前会话的 `agents/main/wire.jsonl`：`profile.bind` 的系统提示词、`llm.tools_snapshot` 的工具定义、`context.append_message` 的对话消息。后台每 5 秒重新统计，页内每 4 秒读取一次。
- 总量和百分比优先使用原生按钮的 `aria-label`，保证与悬浮提示完全一致；三段明细会按原生总量等比校准。

## 壁纸适配

不修改壁纸插件源码。本插件的页内脚本会：

1. 检测 `html.kimi-wallpaper-on`、`#kimi-wallpaper-layer` 或 `window.__kimiWallpaper`；
2. 找到壁纸注入的 `#kimi-wallpaper-style`，在运行时把一段带标记的规则追加到它的 `textContent`；
3. 规则让 `#kimi-token-usage-panel` 使用 `--kw-menu-surface`、`--kw-card-border`，并加上 `blur(20px) saturate(1.15)`；
4. 壁纸关闭或重新注入样式后，MutationObserver 会自动补回。

壁纸未运行时，面板使用 Kimi Code 原生的 `--color-menu-bg`、`--shadow-menu` 和 `--p-menu-backdrop`。

## 命令

```powershell
$tu = "$env:KIMI_CODE_HOME\plugins\managed\kimi-token-usage\lib\cli.mjs"

node $tu install      # 安装页内面板并启动自动刷新
node $tu remove       # 移除页内面板并停止自动刷新
node $tu status       # 注入、用量数据和自动刷新状态
node $tu status --json
node $tu refresh      # 立即重算所有会话的用量数据
node $tu doctor       # 逐项自检
```

## 数据目录

`~/.kimi-code/token-usage/`（可用 `KIMI_TOKEN_USAGE_HOME` 改）：

| 文件 | 内容 |
| --- | --- |
| `watch.json` | 自动刷新进程状态、最近检查/动作 |
| `watch.log` | 自动刷新日志 |
| `token-usage.log` | 安装/移除日志 |
| `inpage-disabled.json` | `remove` 写入的关闭标记；`install` 删除 |

页内脚本和 `context.json` 写入 `resources/desktop-dist/assets/kimi-token-usage/`。`context.json` 只包含当前机器上会话的 token 估算，不上传。

## 排障

| 现象 | 处理 |
| --- | --- |
| 左键没反应 | `node $tu status`；未安装就 `install`，然后重启 Kimi Code 或按 Ctrl+R |
| 面板只有总量，三段是 `—` | 当前会话还没有 `wire.jsonl`，发送一条消息后再点；或 `node $tu refresh` |
| 数字和悬浮提示不完全一致 | 三段是近似值，会按原生总量校准；总量和百分比始终来自原生按钮 |
| 壁纸开启后面板不透明 | 确认壁纸插件已注入 `#kimi-wallpaper-style`；本插件会在运行时追加规则，重启后自动补回 |
| Kimi Code 更新后消失 | 自动刷新进程会补回注入；未运行就 `install` |
| 提示没有写入权限 | 用管理员身份运行一次 `install` |

调试：在 Kimi Code 里按 F12 打开开发者工具，执行 `window.__kimiTokenUsage.data` 查看当前快照，或 `window.__kimiTokenUsage.open()` 直接打开面板。

## 开发

```powershell
node lib/cli.mjs install          # 把当前源码写入本机 Kimi Code
node lib/cli.mjs status           # 检查注入是否与源码一致
node lib/cli.mjs doctor           # 逐项自检
```

文件分工：

- `web/inpage/token-usage.js`：页内面板、点击/键盘交互、壁纸适配、数据轮询。
- `lib/context.mjs`：读取 `wire.jsonl` 并估算三段 token。
- `lib/inpage.mjs`：同步素材、注入/还原 `desktop-dist/index.html`。
- `lib/watch.mjs` / `lib/watchdog.mjs`：每 5 秒重算用量并确保注入。
- `lib/cli.mjs`：命令行入口。
- `hooks/session-start.mjs`：SessionStart 时静默确保注入和自动刷新。

## 已知限制

- 需要 Kimi Code 桌面端；纯 CLI 没有页面可注入。
- 三段明细是按字符启发式估算，不是模型 tokenizer 的精确值；用 `~` 标记，并按原生总量校准。
- 子智能体（subagent）的上下文不计入主会话面板；面板展示主智能体 `agents/main/wire.jsonl`。
- 注入的是 Kimi Code 安装目录；客户端更新会覆盖，正常情况下自动刷新进程会自动补回。
- 自动刷新是用户态进程，不能自行提权；安装目录只读时需要管理员执行一次 `install`。

## 许可

MIT，见 [LICENSE](LICENSE)。注入与自动修复思路参考同仓库的 `kimi-wallpaper` 和 `kimi-pet`（MIT）。
