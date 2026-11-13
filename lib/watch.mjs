#!/usr/bin/env node
import { findKimiCodeApp, installInPage, writeContext } from './inpage.mjs';
import { touchWatch, watchLog } from './watchdog.mjs';

const INTERVAL_MS = 5000;

let stopped = false;
let timer = 0;
let lastRefreshAt = 0;

function tick() {
  if (stopped) return;
  const at = new Date().toISOString();
  try {
    let app = findKimiCodeApp();
    if (!app && Date.now() - lastRefreshAt > 60_000) {
      lastRefreshAt = Date.now();
      app = findKimiCodeApp({ refresh: true });
    }
    if (!app) {
      touchWatch({ running: true, lastCheckAt: at, lastAction: 'app-not-found', lastError: null });
    } else {
      const install = installInPage({ quiet: true, context: false });
      if (!install.ok) {
        touchWatch({ running: true, lastCheckAt: at, lastAction: 'install-failed', lastError: install.error });
      } else {
        const context = writeContext(app.webDir);
        touchWatch({
          running: true,
          lastCheckAt: at,
          lastAction: context.ok ? `context:${context.sessions}` : 'context-failed',
          lastError: context.ok ? null : context.error,
          webDir: app.webDir,
        });
      }
    }
  } catch (err) {
    touchWatch({
      running: true,
      lastCheckAt: at,
      lastAction: 'error',
      lastError: err instanceof Error ? err.message : String(err),
    });
    watchLog(`watch-error ${err instanceof Error ? err.stack || err.message : String(err)}`);
  }
  timer = setTimeout(tick, INTERVAL_MS);
}

function stop() {
  stopped = true;
  clearTimeout(timer);
  touchWatch({ running: false, lastAction: 'stopped' });
  process.exit(0);
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('uncaughtException', (err) => {
  watchLog(`uncaught ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (err) => {
  watchLog(`unhandled ${err && err.stack ? err.stack : err}`);
});

watchLog(`watch-start pid=${process.pid}`);
tick();
