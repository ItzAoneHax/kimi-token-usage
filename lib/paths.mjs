import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEB_DIR = path.join(PLUGIN_ROOT, 'web');

export const KIMI_CODE_HOME =
  process.env.KIMI_CODE_HOME && process.env.KIMI_CODE_HOME.trim().length > 0
    ? process.env.KIMI_CODE_HOME
    : path.join(os.homedir(), '.kimi-code');

export const SESSIONS_DIR = path.join(KIMI_CODE_HOME, 'sessions');
export const SERVER_DIR = path.join(KIMI_CODE_HOME, 'server');

export const DATA_DIR =
  process.env.KIMI_TOKEN_USAGE_HOME && process.env.KIMI_TOKEN_USAGE_HOME.trim().length > 0
    ? process.env.KIMI_TOKEN_USAGE_HOME
    : path.join(KIMI_CODE_HOME, 'token-usage');

export const WATCH_PATH = path.join(DATA_DIR, 'watch.json');
export const WATCH_LOG_PATH = path.join(DATA_DIR, 'watch.log');
export const LOG_PATH = path.join(DATA_DIR, 'token-usage.log');
export const INPAGE_DISABLED_PATH = path.join(DATA_DIR, 'inpage-disabled.json');

export const INPAGE_ASSET_DIR = 'kimi-token-usage';
export const BUNDLE_NAME = 'token-usage.js';
export const CONTEXT_NAME = 'context.json';
export const VERSION = '1.3.1';

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  ensureDataDir();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export function writeTextAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, content);
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // ignore
    }
  }
}

export function isAlive(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

export function logLine(...parts) {
  try {
    ensureDataDir();
    const line = `${new Date().toISOString()} ${parts.join(' ')}\n`;
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > 2 * 1024 * 1024) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.1`);
    }
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    // Logging must never break the panel.
  }
}
