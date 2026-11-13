/* Kimi Code in-page context usage panel.
 *
 * Injected by lib/inpage.mjs into resources/desktop-dist/index.html. The page
 * is same-origin with Kimi Code's own server, so context.json is loaded from
 * /assets/kimi-token-usage/. No network access, no tokens.
 *
 * The native hover tooltip is left untouched. A capture-phase click handler on
 * .ctx-group opens a panel built from Kimi Code's own menu/component classes
 * and CSS variables. When the wallpaper plugin is running, the panel's glass
 * rules are appended to the wallpaper's injected stylesheet at runtime.
 */
(() => {
  'use strict';

  if (window.__kimiTokenUsage && typeof window.__kimiTokenUsage.destroy === 'function') {
    try {
      window.__kimiTokenUsage.destroy();
    } catch {
      // Re-initialise below even if the old instance failed to clean up.
    }
  }

  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  const ASSET_BASE = SCRIPT_SRC ? new URL('./', SCRIPT_SRC).href : '/assets/kimi-token-usage/';
  const DATA_URL = new URL('context.json', ASSET_BASE).href;
  const PANEL_ID = 'kimi-token-usage-panel';
  const STYLE_ID = 'kimi-token-usage-style';
  const WALLPAPER_STYLE_ID = 'kimi-token-usage-wallpaper';
  const WALLPAPER_MARK_START = '/* kimi-token-usage:wallpaper:start */';
  const WALLPAPER_MARK_END = '/* kimi-token-usage:wallpaper:end */';
  const REFRESH_MS = 4000;
  const PANEL_WIDTH = 360;
  // Scoped-style attribute used by Kimi Code's own .ui-menu component. Read
  // from the live DOM when possible; this is only a fallback for the first
  // click before any native menu has rendered.
  const SCOPE_FALLBACK = 'data-v-c52eb4dd';

  function detectUiLanguage() {
    // index.html is hardcoded to lang="en" even when the app UI is Chinese,
    // so read the native context tooltip first: it is rendered in the active
    // UI language ("使用 ..." vs "Used ...").
    const group = document.querySelector('.ctx-group');
    const label = group ? group.getAttribute('aria-label') || '' : '';
    if (label.includes('使用') || label.includes('上下文')) return 'zh';
    if (/\bUsed\b/i.test(label)) return 'en';
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('zh')) return 'zh';
    if (nav.startsWith('en')) return 'en';
    const doc = (document.documentElement.lang || '').toLowerCase();
    if (doc.startsWith('en')) return 'en';
    return 'zh';
  }

  function makeText() {
    if (detectUiLanguage() === 'en') {
      return {
        lang: 'en',
        title: 'Context used',
        system: 'System prompt',
        tools: 'Tool definitions',
        messages: 'Conversation',
        cache: 'Cache hit rate',
        speed: 'Output speed',
        loading: 'Measuring this session…',
        hint: 'Approximate breakdown for this session',
        aria: 'Context usage',
        meter: (pct) => `Context usage ${pct}%`,
      };
    }
    return {
      lang: 'zh',
      title: '上下文已用',
      system: '系统提示词',
      tools: '工具定义',
      messages: '对话消息',
      cache: '缓存命中率',
      speed: '模型输出速度',
      loading: '正在统计当前会话…',
      hint: '按当前会话近似统计',
      aria: '上下文用量',
      meter: (pct) => `上下文占用 ${pct}%`,
    };
  }

  let TEXT = makeText();

  const PANEL_CSS = `
#${PANEL_ID} {
  position: fixed;
  z-index: 2147483000;
  box-sizing: border-box;
  width: ${PANEL_WIDTH}px;
  max-width: calc(100vw - 16px);
  padding: 14px 16px 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--color-line, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-lg, 12px);
  background: var(--color-menu-bg, rgba(41, 41, 41, 0.95));
  -webkit-backdrop-filter: var(--p-menu-backdrop, blur(24px) saturate(1.8));
  backdrop-filter: var(--p-menu-backdrop, blur(24px) saturate(1.8));
  box-shadow: var(--shadow-menu, 0 18px 48px rgba(0, 0, 0, 0.3));
  color: var(--color-text, #fff);
  font-family: var(--font-ui, system-ui, -apple-system, "Segoe UI", sans-serif);
  font-size: var(--text-sm, 13px);
  line-height: 1.45;
  text-align: left;
  transform-origin: bottom center;
  animation: ktu-panel-in 120ms var(--ease-out, ease-out);
}
#${PANEL_ID}[hidden] {
  display: none !important;
}
#${PANEL_ID} .ktu-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
#${PANEL_ID} .ktu-title {
  min-width: 0;
  color: var(--color-text, #fff);
  font-weight: var(--weight-medium, 500);
}
#${PANEL_ID} .ktu-title strong {
  font-weight: var(--weight-semibold, 600);
  font-variant-numeric: tabular-nums;
}
#${PANEL_ID} .ktu-total {
  flex: none;
  color: var(--color-text-muted, #9a9a9a);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
#${PANEL_ID} .ktu-meter {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-line, rgba(255, 255, 255, 0.12));
}
#${PANEL_ID} .ktu-track {
  display: flex;
  width: 100%;
  height: 100%;
}
#${PANEL_ID} .ktu-seg {
  height: 100%;
  min-width: 0;
  transition: width 220ms var(--ease-out, ease-out);
}
#${PANEL_ID} .ktu-seg-system {
  background: #8b93a7;
}
#${PANEL_ID} .ktu-seg-tools {
  background: #a78bfa;
}
#${PANEL_ID} .ktu-seg-messages {
  background: #4f8cff;
}
#${PANEL_ID} .ktu-rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-top: 1px;
}
#${PANEL_ID} .ktu-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 3px 6px;
  margin: 0 -6px;
  border-radius: var(--radius-sm, 6px);
  transition: background 120ms var(--ease-out, ease-out);
}
#${PANEL_ID} .ktu-row:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.06));
}
#${PANEL_ID} .ktu-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
#${PANEL_ID} .ktu-dot-system {
  background: #8b93a7;
}
#${PANEL_ID} .ktu-dot-tools {
  background: #a78bfa;
}
#${PANEL_ID} .ktu-dot-messages {
  background: #4f8cff;
}
#${PANEL_ID} .ktu-dot-cache {
  background: #34d399;
}
#${PANEL_ID} .ktu-dot-speed {
  background: #f59e0b;
}
#${PANEL_ID} .ktu-sep {
  height: 1px;
  margin: 5px 0 3px;
  background: var(--color-line, rgba(255, 255, 255, 0.12));
}
#${PANEL_ID} .ktu-label {
  flex: 1;
  min-width: 0;
  color: var(--color-text, #fff);
}
#${PANEL_ID} .ktu-value {
  flex: none;
  color: var(--color-text-muted, #9a9a9a);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
#${PANEL_ID} .ktu-note {
  color: var(--color-text-faint, #7c7c7c);
  font-size: var(--text-xs, 12px);
}
#${PANEL_ID} .ktu-note[hidden] {
  display: none !important;
}
#kimi-token-usage-row-tip {
  position: fixed;
  z-index: 2147483001;
  max-width: 280px;
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
  background: var(--color-text, #fff);
  color: var(--color-bg, #121212);
  font-family: var(--font-ui, system-ui, -apple-system, "Segoe UI", sans-serif);
  font-size: var(--text-xs, 12px);
  line-height: 1.4;
  pointer-events: none;
  box-shadow: var(--shadow-md, 0 6px 18px rgba(0, 0, 0, 0.2));
  opacity: 0;
  transform: translateY(2px);
  transition: opacity 90ms var(--ease-out, ease-out), transform 90ms var(--ease-out, ease-out);
}
#kimi-token-usage-row-tip.is-on {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  #kimi-token-usage-row-tip {
    transition: none;
  }
}
@keyframes ktu-panel-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  #${PANEL_ID} {
    animation: none;
  }
  #${PANEL_ID} .ktu-seg {
    transition: none;
  }
}
html.ktu-ready .ctx-group {
  position: relative;
  cursor: pointer;
  border-radius: 999px;
}
html.ktu-ready .ctx-group::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 999px;
  background: transparent;
  pointer-events: none;
  transition: background 120ms var(--ease-out, ease-out);
}
html.ktu-ready .ctx-group:hover::before {
  background: color-mix(in srgb, #ffffff 14%, transparent);
}
html.ktu-ready.ktu-clicked .ctx-group::before {
  background: transparent;
}
@media (prefers-reduced-motion: reduce) {
  html.ktu-ready .ctx-group::before {
    transition: none;
  }
}
html.ktu-panel-open .ui-tip__bubble.ktu-context-tip,
html.ktu-panel-open .tooltip-element.ktu-context-tip {
  display: none !important;
}
`;

  const WALLPAPER_CSS = `
${WALLPAPER_MARK_START}
html.kimi-wallpaper-on #${PANEL_ID} {
  background: var(--kw-menu-surface, var(--color-menu-bg, rgba(41, 41, 41, 0.44))) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.15) !important;
  backdrop-filter: blur(20px) saturate(1.15) !important;
  border-color: var(--kw-card-border, var(--color-line, rgba(255, 255, 255, 0.18))) !important;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32) !important;
}
html.kimi-wallpaper-on #${PANEL_ID} .ktu-meter {
  background: color-mix(in srgb, var(--color-line, #ffffff) 55%, transparent) !important;
}
html.kimi-wallpaper-on #${PANEL_ID} .ktu-row:hover {
  background: color-mix(in srgb, var(--color-text, #ffffff) 6%, transparent) !important;
}
html.kimi-wallpaper-on #kimi-token-usage-row-tip {
  background: var(--kw-tip-surface, rgba(41, 41, 41, 0.72)) !important;
  color: var(--color-text, #ffffff) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.15) !important;
  backdrop-filter: blur(20px) saturate(1.15) !important;
  border: 1px solid var(--kw-card-border, rgba(255, 255, 255, 0.18)) !important;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28) !important;
}
${WALLPAPER_MARK_END}
`;

  let styleEl = null;
  let wallpaperStyleEl = null;
  let panel = null;
  let open = false;
  let anchor = null;
  let data = null;
  let dataAt = 0;
  let dataPromise = null;
  let refreshTimer = 0;
  let resizeFrame = 0;
  let rootObserver = null;
  let headObserver = null;
  let panelEls = null;
  let scopeAttr = '';
  let destroyed = false;
  let tipObserver = null;
  let tipLastAt = 0;
  let rowTipEl = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function resolveScopeAttr() {
    const selectors = ['.ui-menu', '.ui-card', '.ui-menu-item', '.ui-seg'];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      for (const attr of node.attributes) {
        if (attr.name.startsWith('data-v-')) return attr.name;
      }
    }
    return SCOPE_FALLBACK;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      styleEl = document.getElementById(STYLE_ID);
      return;
    }
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = PANEL_CSS;
    (document.head || document.documentElement).appendChild(styleEl);
    document.documentElement.classList.add('ktu-ready');
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function wallpaperActive() {
    return (
      document.documentElement.classList.contains('kimi-wallpaper-on') ||
      !!document.getElementById('kimi-wallpaper-layer') ||
      !!window.__kimiWallpaper
    );
  }

  function injectWallpaperStyle() {
    if (!wallpaperStyleEl || !wallpaperStyleEl.isConnected) {
      wallpaperStyleEl = document.getElementById(WALLPAPER_STYLE_ID);
      if (!wallpaperStyleEl) {
        wallpaperStyleEl = document.createElement('style');
        wallpaperStyleEl.id = WALLPAPER_STYLE_ID;
        (document.head || document.documentElement).appendChild(wallpaperStyleEl);
      }
    }
    if (wallpaperStyleEl.textContent !== WALLPAPER_CSS) {
      wallpaperStyleEl.textContent = WALLPAPER_CSS;
    }

    // The wallpaper plugin injects #kimi-wallpaper-style. Append our glass
    // rules to that injected stylesheet at runtime, so its own surface
    // variables (--kw-menu-surface, --kw-card-border) drive this panel too.
    const wpStyle = document.getElementById('kimi-wallpaper-style');
    if (!wpStyle) return;
    let css = wpStyle.textContent || '';
    if (css.includes(WALLPAPER_MARK_START)) return;
    const markerRe = new RegExp(
      `${escapeRegExp(WALLPAPER_MARK_START)}[\\s\\S]*?${escapeRegExp(WALLPAPER_MARK_END)}`,
      'g'
    );
    css = css.replace(markerRe, '');
    wpStyle.textContent = `${css}\n${WALLPAPER_CSS}\n`;
  }

  function syncWallpaper() {
    injectWallpaperStyle();
    if (panel) panel.classList.toggle('ktu-wallpaper-on', wallpaperActive());
  }

  function buildPanel() {
    if (panel && panel.isConnected) return panel;
    TEXT = makeText();
    scopeAttr = resolveScopeAttr();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'ui-menu ktu-panel';
    if (scopeAttr) panel.setAttribute(scopeAttr, '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', TEXT.aria);
    panel.setAttribute('aria-modal', 'false');
    panel.hidden = true;

    const head = el('div', 'ktu-head');
    const title = el('div', 'ktu-title');
    const titleLabel = el('span', 'ktu-title-label', TEXT.title);
    const pct = el('strong', 'ktu-pct', '—');
    title.append(titleLabel, document.createTextNode(' '), pct);
    const total = el('div', 'ktu-total', '—');
    head.append(title, total);

    const meter = el('div', 'ktu-meter');
    meter.setAttribute('role', 'img');
    const track = el('div', 'ktu-track');
    const segSystem = el('span', 'ktu-seg ktu-seg-system');
    const segTools = el('span', 'ktu-seg ktu-seg-tools');
    const segMessages = el('span', 'ktu-seg ktu-seg-messages');
    track.append(segSystem, segTools, segMessages);
    meter.appendChild(track);

    const rows = el('div', 'ktu-rows');
    const makeRow = (key, label, dotClass) => {
      const row = el('div', 'ktu-row');
      const dot = el('span', `ktu-dot ${dotClass}`);
      const name = el('span', 'ktu-label', label);
      const value = el('span', 'ktu-value', '—');
      row.append(dot, name, value);
      rows.appendChild(row);
      return { row, value, label: name };
    };
    const systemRow = makeRow('system', TEXT.system, 'ktu-dot-system');
    const toolsRow = makeRow('tools', TEXT.tools, 'ktu-dot-tools');
    const messagesRow = makeRow('messages', TEXT.messages, 'ktu-dot-messages');
    rows.appendChild(el('div', 'ktu-sep'));
    const cacheRow = makeRow('cache', TEXT.cache, 'ktu-dot-cache');
    const speedRow = makeRow('speed', TEXT.speed, 'ktu-dot-speed');

    const note = el('div', 'ktu-note', TEXT.loading);
    note.hidden = true;

    panel.append(head, meter, rows, note);
    document.body.appendChild(panel);
    panel.addEventListener('pointerover', onRowTipOver);
    panel.addEventListener('pointerout', onRowTipOut);

    panelEls = {
      titleLabel,
      pct,
      total,
      meter,
      segSystem,
      segTools,
      segMessages,
      system: systemRow.value,
      tools: toolsRow.value,
      messages: messagesRow.value,
      systemLabel: systemRow.label,
      toolsLabel: toolsRow.label,
      messagesLabel: messagesRow.label,
      systemRow: systemRow.row,
      toolsRow: toolsRow.row,
      messagesRow: messagesRow.row,
      cache: cacheRow.value,
      cacheLabel: cacheRow.label,
      cacheRow: cacheRow.row,
      speed: speedRow.value,
      speedLabel: speedRow.label,
      speedRow: speedRow.row,
      note,
    };
    syncWallpaper();
    return panel;
  }

  function toNumber(value, suffix) {
    const n = Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(n)) return 0;
    const s = (suffix || '').toLowerCase();
    if (s === 'k') return n * 1000;
    if (s === 'm') return n * 1_000_000;
    return n;
  }

  function parseUsageText(text) {
    if (!text) return null;
    const match = String(text).match(
      /(?:使用|Used)\s*([\d.,]+)\s*([kKmM]?)\s*\/\s*([\d.,]+)\s*([kKmM]?)\s*tokens\s*\((\d+)%\)/i
    );
    if (!match) return null;
    const used = toNumber(match[1], match[2]);
    const max = toNumber(match[3], match[4]);
    const pct = Number(match[5]);
    if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) return null;
    return { used, max, pct };
  }

  function nativeUsage() {
    const group = anchor && anchor.isConnected ? anchor : document.querySelector('.ctx-group');
    const label = group ? group.getAttribute('aria-label') : '';
    let parsed = parseUsageText(label);
    if (parsed) return parsed;
    const bubbles = document.querySelectorAll('.ui-tip__bubble, .tooltip-element, .mention-tip');
    for (const bubble of bubbles) {
      parsed = parseUsageText(bubble.textContent || '');
      if (parsed) return parsed;
    }
    return null;
  }

  function currentSessionId() {
    const match = window.location.pathname.match(/^\/sessions\/([^/?#]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    const active = document.querySelector(
      '.se-item.is-active[data-session-id], .se-item.active[data-session-id], [data-session-id].is-active, [data-session-id].active, [data-session-id][aria-current="page"]'
    );
    return active ? active.getAttribute('data-session-id') || '' : '';
  }

  function formatTokens(value) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    if (n >= 1_000_000) {
      const v = n / 1_000_000;
      return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (n >= 100_000) return `${Math.round(n / 1000)}K`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
  }

  async function loadData(force) {
    if (!force && data && Date.now() - dataAt < 2000) return data;
    if (dataPromise) return dataPromise;
    dataPromise = (async () => {
      try {
        const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return data;
        const json = await response.json();
        if (json && json.sessions && typeof json.sessions === 'object') {
          data = json;
          dataAt = Date.now();
        }
      } catch {
        // Keep the previous snapshot; the panel still shows the native total.
      }
      return data;
    })().finally(() => {
      dataPromise = null;
    });
    return dataPromise;
  }

  function entryFor(sessionId) {
    if (!data || !data.sessions) return null;
    if (sessionId) return data.sessions[sessionId] || null;
    let best = null;
    let bestAt = -Infinity;
    for (const entry of Object.values(data.sessions)) {
      if (!entry || typeof entry !== 'object') continue;
      const at = Number(entry.updatedAt) || 0;
      if (at > bestAt) {
        bestAt = at;
        best = entry;
      }
    }
    return best;
  }

  function scaleBreakdown(entry, used) {
    if (!entry) return { system: 0, tools: 0, messages: 0, known: false };
    let system = Math.max(0, Math.round(Number(entry.system) || 0));
    let tools = Math.max(0, Math.round(Number(entry.tools) || 0));
    let messages = Math.max(0, Math.round(Number(entry.messages) || 0));
    const sum = system + tools + messages;
    if (sum > 0 && used > 0 && Math.abs(sum - used) > 1) {
      const factor = used / sum;
      system = Math.round(system * factor);
      tools = Math.round(tools * factor);
      messages = Math.max(0, used - system - tools);
    }
    return { system, tools, messages, known: sum > 0 };
  }

  function ensureRowTip() {
    if (rowTipEl && rowTipEl.isConnected) return rowTipEl;
    rowTipEl = document.createElement('div');
    rowTipEl.id = 'kimi-token-usage-row-tip';
    rowTipEl.setAttribute('role', 'tooltip');
    rowTipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(rowTipEl);
    return rowTipEl;
  }

  function placeRowTip(row) {
    if (!rowTipEl) return;
    const rect = row.getBoundingClientRect();
    const tipRect = rowTipEl.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = rect.top - tipRect.height - 6;
    if (top < 8) top = rect.bottom + 6;
    rowTipEl.style.left = `${Math.round(left)}px`;
    rowTipEl.style.top = `${Math.round(top)}px`;
  }

  function showRowTip(row) {
    const text = row && row.dataset ? row.dataset.ktuTip : '';
    if (!text) return;
    const tip = ensureRowTip();
    tip.textContent = text;
    tip.classList.add('is-on');
    tip.setAttribute('aria-hidden', 'false');
    placeRowTip(row);
  }

  function hideRowTip() {
    if (!rowTipEl) return;
    rowTipEl.classList.remove('is-on');
    rowTipEl.setAttribute('aria-hidden', 'true');
  }

  function onRowTipOver(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const row = target.closest('.ktu-row');
    if (!row || !panel || !panel.contains(row)) return;
    showRowTip(row);
  }

  function onRowTipOut(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const row = target.closest('.ktu-row');
    if (!row) return;
    if (event.relatedTarget && row.contains(event.relatedTarget)) return;
    hideRowTip();
  }

  function applyText() {
    if (!panel || !panelEls) return;
    hideRowTip();
    panel.setAttribute('aria-label', TEXT.aria);
    if (panelEls.titleLabel) panelEls.titleLabel.textContent = TEXT.title;
    if (panelEls.systemLabel) panelEls.systemLabel.textContent = TEXT.system;
    if (panelEls.toolsLabel) panelEls.toolsLabel.textContent = TEXT.tools;
    if (panelEls.messagesLabel) panelEls.messagesLabel.textContent = TEXT.messages;
    if (panelEls.cacheLabel) panelEls.cacheLabel.textContent = TEXT.cache;
    if (panelEls.speedLabel) panelEls.speedLabel.textContent = TEXT.speed;
  }

  function render() {
    if (!panel || !panelEls) return;
    const nextText = makeText();
    if (nextText.lang !== TEXT.lang) {
      TEXT = nextText;
      applyText();
    }
    const native = nativeUsage();
    const sessionId = currentSessionId();
    const entry = entryFor(sessionId);
    const used = native ? native.used : Number(entry && entry.used) || 0;
    const max = native ? native.max : Number(entry && entry.limit) || 0;
    const pct = native
      ? native.pct
      : max > 0
        ? Math.min(100, Math.ceil((used / max) * 100))
        : 0;
    const breakdown = scaleBreakdown(entry, used);

    const hasTotal = used > 0 || max > 0;
    panelEls.pct.textContent = hasTotal ? `${pct}%` : '—';
    panelEls.total.textContent = hasTotal
      ? `~${formatTokens(used)}${max > 0 ? ` / ${formatTokens(max)}` : ''}`
      : '—';
    panelEls.meter.setAttribute('aria-label', TEXT.meter(hasTotal ? pct : 0));

    const limit = Math.max(max, used, 1);
    const width = (value) => `${Math.max(0, Math.min(100, (value / limit) * 100))}%`;
    panelEls.segSystem.style.width = breakdown.known ? width(breakdown.system) : '0%';
    panelEls.segTools.style.width = breakdown.known ? width(breakdown.tools) : '0%';
    panelEls.segMessages.style.width = breakdown.known ? width(breakdown.messages) : '0%';

    const values = [
      [panelEls.system, breakdown.system],
      [panelEls.tools, breakdown.tools],
      [panelEls.messages, breakdown.messages],
    ];
    for (const [node, value] of values) {
      if (breakdown.known) {
        node.textContent = `~${formatTokens(value)}`;
      } else {
        node.textContent = '—';
      }
    }

    const setRowTip = (row, text) => {
      if (!row) return;
      if (text) row.dataset.ktuTip = text;
      else delete row.dataset.ktuTip;
    };
    const tokenTip = (label, value) =>
      TEXT.lang === 'en'
        ? `${label}: ~${Math.max(0, Math.round(Number(value) || 0)).toLocaleString()} tokens`
        : `${label}：约 ${Math.max(0, Math.round(Number(value) || 0)).toLocaleString()} tokens`;
    setRowTip(panelEls.systemRow, breakdown.known ? tokenTip(TEXT.system, breakdown.system) : '');
    setRowTip(panelEls.toolsRow, breakdown.known ? tokenTip(TEXT.tools, breakdown.tools) : '');
    setRowTip(panelEls.messagesRow, breakdown.known ? tokenTip(TEXT.messages, breakdown.messages) : '');

    const cacheKnown = !!entry && Number(entry.cacheInput) > 0;
    const cacheHit = cacheKnown ? Math.max(0, Math.min(1, Number(entry.cacheHit) || 0)) : 0;
    panelEls.cache.textContent = cacheKnown ? `${Math.round(cacheHit * 100)}%` : '—';
    if (cacheKnown) {
      const cacheRead = Number(entry.cacheRead || 0).toLocaleString();
      const cacheInput = Number(entry.cacheInput || 0).toLocaleString();
      setRowTip(
        panelEls.cacheRow,
        TEXT.lang === 'en'
          ? `Cache read ${cacheRead} / input ${cacheInput} tokens`
          : `缓存读取 ${cacheRead} / 输入 ${cacheInput} tokens`
      );
    } else {
      setRowTip(panelEls.cacheRow, '');
    }

    const speedKnown = !!entry && Number(entry.decodeMs) > 0 && Number(entry.outputTokens) > 0;
    const outputSpeed = speedKnown ? Number(entry.outputSpeed) || 0 : 0;
    panelEls.speed.textContent = speedKnown ? `${outputSpeed.toFixed(1)} tok/s` : '—';
    if (speedKnown) {
      const totalTokens = Number(entry.outputTokens || 0).toLocaleString();
      const decodeSeconds = (Number(entry.decodeMs) / 1000).toFixed(1);
      const steps = Number(entry.outputSteps) || 0;
      const fallbackSteps = Number(entry.outputFallbackSteps) || 0;
      const fallbackPart =
        fallbackSteps > 0
          ? TEXT.lang === 'en'
            ? ` · ${fallbackSteps} steps corrected`
            : ` · ${fallbackSteps} 步修正`
          : '';
      const latestSpeed = Number(entry.outputLatestSpeed || outputSpeed) || 0;
      const latestTokens = Number(entry.outputLatestTokens || 0).toLocaleString();
      const latestSeconds = (Number(entry.outputLatestMs || 0) / 1000).toFixed(1);
      setRowTip(
        panelEls.speedRow,
        TEXT.lang === 'en'
          ? `${totalTokens} output tokens / ${decodeSeconds}s decode · ${steps} steps${fallbackPart} · latest ${latestSpeed.toFixed(1)} (${latestTokens} tokens / ${latestSeconds}s)`
          : `输出 ${totalTokens} tokens / 解码 ${decodeSeconds} 秒 · ${steps} 步${fallbackPart} · 最近一步 ${latestSpeed.toFixed(1)}（${latestTokens} tokens / ${latestSeconds} 秒）`
      );
    } else {
      setRowTip(panelEls.speedRow, '');
    }

    panelEls.note.hidden = breakdown.known;
    panelEls.note.textContent = breakdown.known ? TEXT.hint : TEXT.loading;
  }

  function placePanel() {
    if (!panel || !panel.isConnected) return;
    if (!anchor || !anchor.isConnected) anchor = document.querySelector('.ctx-group');
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      closePanel();
      return;
    }
    const width = panel.offsetWidth || PANEL_WIDTH;
    const height = panel.offsetHeight || 0;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let bottom = window.innerHeight - rect.top + 10;
    if (bottom + height > window.innerHeight - 8) {
      bottom = Math.max(8, window.innerHeight - height - 8);
    }
    panel.style.left = `${Math.round(left)}px`;
    panel.style.bottom = `${Math.round(bottom)}px`;
  }

  function schedulePlace() {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      placePanel();
    });
  }

  function startRefresh() {
    stopRefresh();
    refreshTimer = window.setInterval(() => {
      if (!open) return;
      loadData(true).then(render);
    }, REFRESH_MS);
  }

  function stopRefresh() {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = 0;
    }
  }

  function contextTipText() {
    return anchor ? (anchor.getAttribute('aria-label') || '').trim() : '';
  }

  function hideContextTooltip() {
    if (!open) return;
    const label = contextTipText();
    for (const bubble of document.querySelectorAll('.ui-tip__bubble, .tooltip-element')) {
      const text = (bubble.textContent || '').trim();
      bubble.classList.toggle('ktu-context-tip', !!label && text === label);
    }
  }

  function scheduleHideContextTooltip() {
    if (!open) return;
    const now = Date.now();
    if (now - tipLastAt < 50) return;
    tipLastAt = now;
    hideContextTooltip();
  }

  function startTipSuppression() {
    stopTipSuppression();
    // Only hide the matching bubble; never stop pointer/focus events. Other
    // tooltips in the app must keep working while the panel is open.
    document.addEventListener('pointermove', scheduleHideContextTooltip, true);
    document.addEventListener('focusin', scheduleHideContextTooltip, true);
    tipObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (
            node.matches?.('.ui-tip__bubble, .tooltip-element') ||
            node.querySelector?.('.ui-tip__bubble, .tooltip-element')
          ) {
            hideContextTooltip();
            return;
          }
        }
      }
    });
    tipObserver.observe(document.body, { childList: true });
    hideContextTooltip();
  }

  function stopTipSuppression() {
    document.removeEventListener('pointermove', scheduleHideContextTooltip, true);
    document.removeEventListener('focusin', scheduleHideContextTooltip, true);
    tipLastAt = 0;
    if (tipObserver) tipObserver.disconnect();
    tipObserver = null;
    document.querySelectorAll('.ui-tip__bubble.ktu-context-tip, .tooltip-element.ktu-context-tip').forEach((bubble) => {
      bubble.classList.remove('ktu-context-tip');
    });
  }

  function openPanel(target) {
    if (!document.body) return;
    anchor = target;
    buildPanel();
    open = true;
    document.documentElement.classList.add('ktu-panel-open');
    panel.hidden = false;
    startTipSuppression();
    syncWallpaper();
    render();
    placePanel();
    startRefresh();
    loadData(true).then(() => {
      if (open) {
        render();
        placePanel();
      }
    });
  }

  function closePanel() {
    open = false;
    document.documentElement.classList.remove('ktu-panel-open');
    if (panel) panel.hidden = true;
    hideRowTip();
    stopRefresh();
    stopTipSuppression();
  }

  function togglePanel(target) {
    if (open && anchor === target) {
      closePanel();
      return;
    }
    openPanel(target);
  }

  function onDocumentClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const group = target.closest('.ctx-group');
    if (!group) return;
    event.preventDefault();
    event.stopPropagation();
    document.documentElement.classList.add('ktu-clicked');
    togglePanel(group);
  }

  function onDocumentPointerDown(event) {
    if (!open || !panel) return;
    const target = event.target;
    if (!target || !target.closest) return;
    if (panel.contains(target)) return;
    if (target.closest('.ctx-group')) return;
    closePanel();
  }

  function onDocumentPointerOut(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const group = target.closest('.ctx-group');
    if (!group) return;
    if (event.relatedTarget && group.contains(event.relatedTarget)) return;
    document.documentElement.classList.remove('ktu-clicked');
  }

  function onDocumentKeyDown(event) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closePanel();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    const target = event.target;
    if (!target || !target.closest) return;
    const group = target.closest('.ctx-group');
    if (!group) return;
    event.preventDefault();
    event.stopPropagation();
    document.documentElement.classList.add('ktu-clicked');
    togglePanel(group);
  }

  function onViewportChange() {
    hideRowTip();
    if (open) schedulePlace();
  }

  function observeWallpaper() {
    rootObserver = new MutationObserver(() => {
      syncWallpaper();
    });
    rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    headObserver = new MutationObserver(() => {
      if (document.getElementById('kimi-wallpaper-style') || document.getElementById('kimi-wallpaper-layer')) {
        syncWallpaper();
      }
    });
    if (document.head) headObserver.observe(document.head, { childList: true });
  }

  function init() {
    if (destroyed) return;
    injectStyle();
    injectWallpaperStyle();
    observeWallpaper();
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('pointerout', onDocumentPointerOut, true);
    document.addEventListener('keydown', onDocumentKeyDown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    window.__kimiTokenUsage = {
      open: () => {
        const group = document.querySelector('.ctx-group');
        if (group) openPanel(group);
      },
      close: closePanel,
      refresh: () => loadData(true).then(render),
      get open() {
        return open;
      },
      get data() {
        return data;
      },
      destroy,
    };
  }

  function destroy() {
    destroyed = true;
    stopRefresh();
    stopTipSuppression();
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    document.removeEventListener('click', onDocumentClick, true);
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('pointerout', onDocumentPointerOut, true);
    document.removeEventListener('keydown', onDocumentKeyDown, true);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
    if (rootObserver) rootObserver.disconnect();
    if (headObserver) headObserver.disconnect();
    rootObserver = null;
    headObserver = null;
    document.documentElement.classList.remove('ktu-ready');
    document.documentElement.classList.remove('ktu-clicked');
    document.documentElement.classList.remove('ktu-panel-open');
    if (panel) panel.remove();
    if (rowTipEl) rowTipEl.remove();
    rowTipEl = null;
    if (styleEl) styleEl.remove();
    if (wallpaperStyleEl) wallpaperStyleEl.remove();
    panel = null;
    panelEls = null;
    styleEl = null;
    wallpaperStyleEl = null;
    anchor = null;
    open = false;
    data = null;
    dataAt = 0;
    if (window.__kimiTokenUsage) window.__kimiTokenUsage = null;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
