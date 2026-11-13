#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  CONTEXT_NAME,
  DATA_DIR,
  INPAGE_DISABLED_PATH,
  SESSIONS_DIR,
  VERSION,
  ensureDataDir,
  readJson,
} from './paths.mjs';
import { findKimiCodeApp, inPageStatus, installInPage, removeInPage, writeContext } from './inpage.mjs';
import { startWatchdog, stopWatchdog, watchdogStatus } from './watchdog.mjs';

const argv = process.argv.slice(2);
const command = argv[0] || 'help';

function pad(text, width) {
  let w = 0;
  for (const ch of text) {
    w += /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60]/.test(ch)
      ? 2
      : 1;
  }
  return text + ' '.repeat(Math.max(0, width - w));
}

function setDisabled(value) {
  try {
    ensureDataDir();
    if (value) fs.writeFileSync(INPAGE_DISABLED_PATH, JSON.stringify({ disabled: true, at: new Date().toISOString() }, null, 2));
    else fs.rmSync(INPAGE_DISABLED_PATH, { force: true });
  } catch {
    // ignore
  }
}

function readContextSummary() {
  const app = findKimiCodeApp();
  if (!app) return null;
  const file = path.join(app.webDir, 'assets', 'kimi-token-usage', CONTEXT_NAME);
  const data = readJson(file, null);
  if (!data || !data.sessions) return { file, sessions: 0, updatedAt: null };
  return { file, sessions: Object.keys(data.sessions).length, updatedAt: data.updatedAt };
}

function printStatus() {
  const inpage = inPageStatus();
  const watch = watchdogStatus();
  const context = readContextSummary();
  console.log(`Kimi 上下文用量 v${VERSION}`);
  if (!inpage.ok) {
    console.log(`${pad('页内注入', 10)} ${inpage.error}`);
  } else {
    console.log(`${pad('客户端', 10)} ${inpage.app}`);
    console.log(`${pad('页面目录', 10)} ${inpage.webDir}`);
    console.log(
      `${pad('页内注入', 10)} ${
        inpage.installed ? (inpage.current ? '已安装且是最新' : '已安装，需要更新（install）') : '未安装'
      }`
    );
  }
  if (context) {
    console.log(
      `${pad('用量数据', 10)} ${context.sessions} 个会话${
        context.updatedAt ? ` · 更新于 ${context.updatedAt}` : ''
      }`
    );
  }
  console.log(
    `${pad('自动刷新', 10)} ${
      watch.running
        ? `运行中 · pid ${watch.pid} · 每 ${Math.round(watch.intervalMs / 1000)} 秒`
        : '未运行（install 或重启会话）'
    }`
  );
  if (watch.running) {
    console.log(
      `${pad('最近检查', 10)} ${watch.lastCheckAt || '—'} · ${watch.lastAction || '—'}${
        watch.lastError ? ` · ${watch.lastError}` : ''
      }`
    );
  }
  console.log(`${pad('数据目录', 10)} ${DATA_DIR}`);
  if (inpage.ok && inpage.installed) {
    console.log('提示：安装或更新后重启 Kimi Code，或在窗口里按 Ctrl+R 刷新。');
  }
}

function printJson() {
  const inpage = inPageStatus();
  const watch = watchdogStatus();
  const context = readContextSummary();
  console.log(
    JSON.stringify(
      { ok: inpage.ok, version: VERSION, dataDir: DATA_DIR, inpage, context, watch },
      null,
      2
    )
  );
}

async function cmdInstall() {
  setDisabled(false);
  const result = installInPage();
  if (!result.ok) {
    console.error(`安装失败：${result.error}`);
    return 1;
  }
  stopWatchdog();
  const watch = startWatchdog();
  console.log(`已安装页内上下文面板：${result.webDir}`);
  console.log(`用量数据：${result.contextFile}`);
  console.log(watch.alreadyRunning ? `自动刷新已在运行（pid ${watch.pid}）` : `自动刷新已启动（pid ${watch.pid}）`);
  console.log('重启 Kimi Code，或在窗口里按 Ctrl+R 刷新。');
  return 0;
}

function cmdEnsure() {
  setDisabled(false);
  const result = installInPage({ quiet: true });
  if (result.ok) startWatchdog();
  return result.ok ? 0 : 1;
}

function cmdRemove() {
  stopWatchdog();
  const result = removeInPage();
  setDisabled(true);
  if (!result.ok) {
    console.error(`移除失败：${result.error}`);
    return 1;
  }
  console.log(`已移除页内上下文面板：${result.webDir}`);
  console.log('重启 Kimi Code，或在窗口里按 Ctrl+R 刷新。');
  return 0;
}

function cmdRefresh() {
  const app = findKimiCodeApp({ refresh: true });
  if (!app) {
    console.error('没有找到 Kimi Code 安装目录。');
    return 1;
  }
  const result = writeContext(app.webDir);
  if (!result.ok) {
    console.error(`写入用量数据失败：${result.error}`);
    return 1;
  }
  console.log(`已写入 ${result.sessions} 个会话的用量数据：${result.file}`);
  return 0;
}

function cmdDoctor() {
  let failed = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `：${detail}` : ''}`);
    if (!ok) failed += 1;
  };
  const app = findKimiCodeApp({ refresh: true });
  check('Kimi Code 安装目录', !!app, app ? app.webDir : '未找到');
  if (app) {
    try {
      fs.accessSync(app.webDir, fs.constants.W_OK);
      check('页面目录写入权限', true);
    } catch {
      check('页面目录写入权限', false, '需要管理员身份运行 install');
    }
  }
  const inpage = inPageStatus();
  check('页内脚本注入', inpage.installed, inpage.installed ? '已注入' : '未注入');
  check('页内脚本是最新版本', inpage.bundleCurrent, inpage.bundleCurrent ? '' : '运行 install');
  check('注入标记与版本匹配', inpage.markerCurrent, inpage.markerCurrent ? '' : '运行 install');
  check('用量数据文件', inpage.contextOk, inpage.contextOk ? '' : '运行 refresh 或 install');
  try {
    const stat = fs.statSync(SESSIONS_DIR);
    check('会话目录', stat.isDirectory(), SESSIONS_DIR);
  } catch {
    check('会话目录', false, SESSIONS_DIR);
  }
  const watch = watchdogStatus();
  check('自动刷新进程', watch.running, watch.running ? `pid ${watch.pid}` : '未运行');
  console.log(failed === 0 ? '\n自检通过。' : `\n有 ${failed} 项需要处理。`);
  return failed === 0 ? 0 : 1;
}

function printHelp() {
  console.log(`Kimi 上下文用量 v${VERSION}

用法：
  node lib/cli.mjs install     安装页内面板并启动自动刷新
  node lib/cli.mjs ensure      静默安装（SessionStart 使用）
  node lib/cli.mjs remove      移除页内面板并停止自动刷新
  node lib/cli.mjs status      查看注入、用量数据和自动刷新状态
  node lib/cli.mjs status --json
  node lib/cli.mjs refresh     立即重算当前所有会话的用量数据
  node lib/cli.mjs doctor      逐项自检

数据目录：${DATA_DIR}
`);
}

let code = 0;
switch (command) {
  case 'install':
    code = await cmdInstall();
    break;
  case 'ensure':
    code = cmdEnsure();
    break;
  case 'remove':
    code = cmdRemove();
    break;
  case 'status':
    if (argv.includes('--json')) printJson();
    else printStatus();
    break;
  case 'refresh':
    code = cmdRefresh();
    break;
  case 'doctor':
    code = cmdDoctor();
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    console.error(`未知命令：${command}`);
    printHelp();
    code = 1;
}
process.exit(code);
