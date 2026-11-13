---
name: kimi-token-usage
description: 查看、排查或调整 Kimi Code 的上下文用量面板：左键上下文按钮打开系统提示词/工具定义/对话消息明细，壁纸插件运行时自动透明模糊。
---

# Kimi 上下文用量

## 何时使用

- 用户问「上下文都用在哪里」「为什么上下文涨这么快」「系统提示词占多少」。
- 用户说上下文按钮左键没反应、面板三段显示 `—`、壁纸开启后面板不透明。
- 用户要安装、更新或移除本插件。

## 快速检查

```powershell
$tu = "$env:KIMI_CODE_HOME\plugins\managed\kimi-token-usage\lib\cli.mjs"
node $tu status
node $tu doctor
```

`status` 会显示页内注入、`context.json` 会话数量和自动刷新进程。`doctor` 逐项自检。

## 安装 / 更新

```powershell
node $tu install
```

然后重启 Kimi Code，或在窗口里按 Ctrl+R。安装会把页内脚本写入 `resources/desktop-dist/assets/kimi-token-usage/`，并在 `index.html` 的主模块前插入一段带标记的 `<script>`。

## 数据口径

- 总量和百分比来自原生 `.ctx-group` 的 `aria-label`，与悬浮提示完全一致。
- 三段明细来自当前会话 `~/.kimi-code/sessions/<workspace>/<session>/agents/main/wire.jsonl`：
  - `profile.bind.systemPrompt` → 系统提示词
  - `llm.tools_snapshot.tools` → 工具定义
  - `context.append_message.message` → 对话消息
- 字符启发式估算后，按原生总量等比校准；面板用 `~` 标记近似值。
- 后台每 5 秒重算，页内每 4 秒读取。

## 壁纸适配

不修改壁纸插件源码。页内脚本检测 `html.kimi-wallpaper-on` / `#kimi-wallpaper-style`，在运行时把一段带标记的玻璃规则追加到壁纸注入的样式里，使用 `--kw-menu-surface`、`--kw-card-border` 和 `blur(20px) saturate(1.15)`。壁纸关闭或重新注入后会自动补回。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 左键没反应 | `node $tu install`，重启或 Ctrl+R |
| 三段是 `—` | 当前会话还没有 wire 日志；发一条消息，或 `node $tu refresh` |
| 壁纸开启后面板不透明 | 确认壁纸已注入；本插件会自动追加规则，仍不行就重启 |
| 数字有偏差 | 三段是近似值；总量和百分比来自原生按钮 |
| Kimi Code 更新后消失 | `node $tu install`；自动刷新进程通常会自动补回 |

## 移除

```powershell
node $tu remove
```

然后重启 Kimi Code，再 `/plugins remove kimi-token-usage`。
