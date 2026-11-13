---
description: 查看或刷新当前会话的上下文用量面板
---

用户想查看上下文用量。先检查插件页内注入和自动刷新状态：

```powershell
$tu = "$env:KIMI_CODE_HOME\plugins\managed\kimi-token-usage\lib\cli.mjs"
node $tu status
```

如果未安装或不是最新，执行 `node $tu install`，并提醒用户重启 Kimi Code 或按 Ctrl+R。

如果用户只是问面板怎么看：说明鼠标悬浮上下文按钮仍显示原生提示，左键点击按钮会打开「上下文已用」面板，展示系统提示词、工具定义、对话消息三段。

如果用户说面板三段是 `—`：执行 `node $tu refresh`，再让用户点一次按钮。如果仍然没有，说明当前会话还没有 `wire.jsonl`，发送一条消息后即可。

用户这次的要求：$ARGUMENTS
