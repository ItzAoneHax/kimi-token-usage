import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  BUNDLE_NAME,
  CONTEXT_NAME,
  INPAGE_ASSET_DIR,
  VERSION,
  WEB_DIR,
  logLine,
  writeTextAtomic,
} from './paths.mjs';
import { buildContextData, writeContextAsset } from './context.mjs';

export const MARKER_START = '<!-- kimi-token-usage:inpage:start -->';
export const MARKER_END = '<!-- kimi-token-usage:inpage:end -->';

const BUNDLE_SOURCE = path.join(WEB_DIR, 'inpage', 'token-usage.js');

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function bundleHash(bundle) {
  return crypto.createHash('sha1').update(bundle).digest('hex').slice(0, 10);
}

function webDirFor(exe) {
  const root = path.dirname(exe);
  const candidates =
    process.platform === 'darwin'
      ? [path.join(root, '..', 'Resources', 'desktop-dist'), path.join(root, 'desktop-dist')]
      : [path.join(root, 'resources', 'desktop-dist'), path.join(root, 'desktop-dist')];
  for (const dir of candidates) {
    try {
      if (fs.statSync(path.join(dir, 'index.html')).isFile()) return { root, webDir: dir };
    } catch {
      // keep looking
    }
  }
  return null;
}

function runningAppPath() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "(Get-Process -Name 'Kimi Code' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)",
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 4000 }
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

function commonAppPaths() {
  const out = [];
  const local = process.env.LOCALAPPDATA;
  const pf = process.env.ProgramFiles;
  const pf86 = process.env['ProgramFiles(x86)'];
  if (process.platform === 'win32') {
    for (const base of [local && path.join(local, 'Programs'), pf, pf86]) {
      if (base) out.push(path.join(base, 'Kimi Code', 'Kimi Code.exe'));
    }
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      out.push(`${letter}:\\Kimi Code\\Kimi Code.exe`);
      out.push(`${letter}:\\Program Files\\Kimi Code\\Kimi Code.exe`);
    }
  }
  if (process.platform === 'darwin') {
    out.push('/Applications/Kimi Code.app/Contents/MacOS/Kimi Code');
    out.push(path.join(os.homedir(), 'Applications', 'Kimi Code.app', 'Contents', 'MacOS', 'Kimi Code'));
  }
  if (process.platform === 'linux') {
    out.push('/opt/Kimi Code/kimi-code');
    out.push('/usr/lib/kimi-code/kimi-code');
    out.push(path.join(os.homedir(), '.local', 'share', 'kimi-code', 'kimi-code'));
  }
  return out;
}

let cachedApp = null;
let cachedAppAt = 0;

export function findKimiCodeApp({ refresh = false, maxAgeMs = 60_000 } = {}) {
  if (!refresh && cachedApp && Date.now() - cachedAppAt < maxAgeMs) return cachedApp;
  const candidates = [process.env.KIMI_CODE_APP, runningAppPath(), ...commonAppPaths()].filter(Boolean);
  const seen = new Set();
  for (const file of candidates) {
    if (seen.has(file)) continue;
    seen.add(file);
    const found = webDirFor(file);
    if (found) {
      cachedApp = { exe: file, ...found };
      cachedAppAt = Date.now();
      return cachedApp;
    }
  }
  return null;
}

function assetsDirFor(webDir) {
  return path.join(webDir, 'assets', INPAGE_ASSET_DIR);
}

function bundleFile(webDir) {
  return path.join(assetsDirFor(webDir), BUNDLE_NAME);
}

function contextFile(webDir) {
  return path.join(assetsDirFor(webDir), CONTEXT_NAME);
}

function writeIfChanged(file, content) {
  try {
    if (readText(file) === content) return false;
  } catch {
    // missing file: write it
  }
  writeTextAtomic(file, content);
  return true;
}

function syncAssets(webDir, bundle, contextData) {
  const assetsDir = assetsDirFor(webDir);
  fs.mkdirSync(assetsDir, { recursive: true });
  let changed = false;
  changed = writeIfChanged(path.join(assetsDir, BUNDLE_NAME), bundle) || changed;
  if (contextData) {
    changed =
      writeIfChanged(path.join(assetsDir, CONTEXT_NAME), JSON.stringify(contextData)) || changed;
  }
  return { assetsDir, changed };
}

function markerPattern() {
  return new RegExp(
    `\\s*${MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MARKER_END.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )}`,
    'g'
  );
}

function patchIndex(webDir, hash) {
  const file = path.join(webDir, 'index.html');
  const original = readText(file);
  const backup = `${file}.kimi-token-usage.bak`;
  try {
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  } catch {
    // a backup is nice to have, not required
  }
  const markerBlock = `${MARKER_START}
<script src="/assets/${INPAGE_ASSET_DIR}/${BUNDLE_NAME}?v=${hash}"></script>
${MARKER_END}`;
  let next = original.replace(markerPattern(), '');
  const moduleAt = next.search(/<script\s+type=["']module["']/i);
  if (moduleAt >= 0) {
    next = `${next.slice(0, moduleAt)}${markerBlock}\n${next.slice(moduleAt)}`;
  } else {
    next = next.replace(/<\/head>/i, `${markerBlock}\n</head>`);
  }
  if (next === original) return false;
  writeTextAtomic(file, next);
  return true;
}

function hasMarker(webDir) {
  try {
    return readText(path.join(webDir, 'index.html')).includes(MARKER_START);
  } catch {
    return false;
  }
}

function markerCurrent(webDir, hash) {
  try {
    const html = readText(path.join(webDir, 'index.html'));
    return html.includes(MARKER_START) && html.includes(`${BUNDLE_NAME}?v=${hash}`);
  } catch {
    return false;
  }
}

function appOrRefresh() {
  let app = findKimiCodeApp();
  if (app && !fs.existsSync(path.join(app.webDir, 'index.html'))) {
    app = findKimiCodeApp({ refresh: true });
  }
  return app;
}

export function inPageStatus() {
  const app = appOrRefresh();
  if (!app) {
    return { ok: false, installed: false, error: '没有找到 Kimi Code 安装目录' };
  }
  const sourceBundle = readText(BUNDLE_SOURCE);
  const hash = bundleHash(sourceBundle);
  let bundleCurrent = false;
  try {
    bundleCurrent = readText(bundleFile(app.webDir)) === sourceBundle;
  } catch {
    bundleCurrent = false;
  }
  let contextOk = false;
  try {
    contextOk = fs.statSync(contextFile(app.webDir)).isFile();
  } catch {
    contextOk = false;
  }
  const installed = hasMarker(app.webDir) && fs.existsSync(bundleFile(app.webDir));
  const current = installed && bundleCurrent && contextOk && markerCurrent(app.webDir, hash);
  return {
    ok: true,
    installed,
    current,
    bundleCurrent,
    contextOk,
    markerCurrent: markerCurrent(app.webDir, hash),
    hash,
    app: app.exe,
    webDir: app.webDir,
    assetsDir: assetsDirFor(app.webDir),
    bundle: bundleFile(app.webDir),
    version: VERSION,
  };
}

export function installInPage({ quiet = false, context = true } = {}) {
  const app = appOrRefresh();
  if (!app) {
    return { ok: false, error: '没有找到 Kimi Code 安装目录，请确认客户端已安装并运行过一次' };
  }
  try {
    fs.accessSync(app.webDir, fs.constants.W_OK);
  } catch {
    return {
      ok: false,
      error: `没有写入权限：${app.webDir}。请以管理员身份运行一次安装命令。`,
      app: app.exe,
      webDir: app.webDir,
    };
  }
  if (!fs.existsSync(BUNDLE_SOURCE)) {
    return { ok: false, error: `插件缺少页内脚本：${BUNDLE_SOURCE}` };
  }

  const bundle = readText(BUNDLE_SOURCE);
  const hash = bundleHash(bundle);
  const contextData = context ? buildContextData() : null;
  const synced = syncAssets(app.webDir, bundle, contextData);
  const patched = patchIndex(app.webDir, hash);
  const changed = synced.changed || patched;
  const result = {
    ok: true,
    app: app.exe,
    webDir: app.webDir,
    assetsDir: synced.assetsDir,
    bundle: bundleFile(app.webDir),
    hash,
    contextFile: contextFile(app.webDir),
    changed,
    needsRestart: changed,
  };
  if (!quiet) logLine('inpage-install', app.webDir, changed ? 'changed' : 'unchanged');
  return result;
}

export function writeContext(webDir) {
  return writeContextAsset(webDir);
}

export function removeInPage() {
  const app = appOrRefresh();
  if (!app) return { ok: false, error: '没有找到 Kimi Code 安装目录' };
  const file = path.join(app.webDir, 'index.html');
  try {
    fs.accessSync(app.webDir, fs.constants.W_OK);
  } catch {
    return { ok: false, error: `没有写入权限：${app.webDir}` };
  }
  try {
    const original = readText(file);
    const next = original.replace(markerPattern(), '');
    if (next !== original) writeTextAtomic(file, next);
  } catch {
    // ignore
  }
  try {
    fs.rmSync(assetsDirFor(app.webDir), { recursive: true, force: true });
  } catch {
    // ignore
  }
  try {
    fs.rmSync(`${file}.kimi-token-usage.bak`, { force: true });
  } catch {
    // ignore
  }
  logLine('inpage-remove', app.webDir);
  return { ok: true, app: app.exe, webDir: app.webDir };
}

export function ensureInPage() {
  try {
    return installInPage({ quiet: true });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export { BUNDLE_SOURCE };
