import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WATCH_LOG_PATH,
  WATCH_PATH,
  ensureDataDir,
  isAlive,
  logLine,
  readJson,
  writeJson,
} from './paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WATCH_ENTRY = path.join(ROOT, 'lib', 'watch.mjs');
const DEFAULT_INTERVAL_MS = 5000;

export function readWatch() {
  return readJson(WATCH_PATH, null);
}

export function watchdogStatus() {
  const watch = readWatch();
  if (!watch) return { running: false, intervalMs: DEFAULT_INTERVAL_MS };
  const running = isAlive(watch.pid);
  return {
    ...watch,
    running,
    intervalMs: Number(watch.intervalMs) || DEFAULT_INTERVAL_MS,
  };
}

export function startWatchdog() {
  ensureDataDir();
  const current = watchdogStatus();
  if (current.running) return { ok: true, alreadyRunning: true, pid: current.pid };
  const child = spawn(process.execPath, [WATCH_ENTRY], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, KIMI_TOKEN_USAGE_WATCH: '1' },
  });
  child.unref();
  const record = {
    pid: child.pid,
    running: true,
    intervalMs: DEFAULT_INTERVAL_MS,
    startedAt: new Date().toISOString(),
    lastCheckAt: null,
    lastAction: 'started',
    lastError: null,
  };
  writeJson(WATCH_PATH, record);
  logLine('watchdog-start', child.pid);
  return { ok: true, pid: child.pid };
}

export function stopWatchdog() {
  const current = readWatch();
  if (!current || !isAlive(current.pid)) {
    try {
      fs.rmSync(WATCH_PATH, { force: true });
    } catch {
      // ignore
    }
    return { ok: true, stopped: false };
  }
  try {
    process.kill(current.pid);
  } catch {
    // ignore
  }
  try {
    fs.rmSync(WATCH_PATH, { force: true });
  } catch {
    // ignore
  }
  logLine('watchdog-stop', current.pid);
  return { ok: true, stopped: true, pid: current.pid };
}

export function touchWatch(patch) {
  const current = readWatch() || {};
  writeJson(WATCH_PATH, {
    ...current,
    ...patch,
    pid: current.pid || process.pid,
    intervalMs: Number(current.intervalMs) || DEFAULT_INTERVAL_MS,
  });
}

export function watchLog(line) {
  try {
    ensureDataDir();
    const text = `${new Date().toISOString()} ${line}\n`;
    if (fs.existsSync(WATCH_LOG_PATH) && fs.statSync(WATCH_LOG_PATH).size > 2 * 1024 * 1024) {
      fs.renameSync(WATCH_LOG_PATH, `${WATCH_LOG_PATH}.1`);
    }
    fs.appendFileSync(WATCH_LOG_PATH, text);
  } catch {
    // ignore
  }
}
