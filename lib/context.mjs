import fs from 'node:fs';
import path from 'node:path';
import {
  CONTEXT_NAME,
  INPAGE_ASSET_DIR,
  SESSIONS_DIR,
  logLine,
  writeTextAtomic,
} from './paths.mjs';

const CACHE = new Map();
const MAX_CACHE_ENTRIES = 120;

function isCjk(code) {
  return (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60)
  );
}

// The backend counts with the model tokenizer; this heuristic tracks that
// closely enough for a "~" breakdown while staying dependency-free.
export function estimateText(text) {
  if (!text) return 0;
  const value = String(text);
  let ascii = 0;
  let cjk = 0;
  let other = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code <= 0x7f) ascii += 1;
    else if (isCjk(code)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(ascii / 4 + cjk / 1.5 + other / 2.5);
}

function estimateMessage(message) {
  if (!message || typeof message !== 'object') return 0;
  let text = '';
  if (typeof message.content === 'string') {
    text += message.content;
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!part || typeof part !== 'object') {
        text += String(part ?? '');
        continue;
      }
      if (typeof part.text === 'string') text += part.text;
      else if (typeof part.thinking === 'string') text += part.thinking;
      else text += JSON.stringify(part);
    }
  }
  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
    text += JSON.stringify(message.toolCalls);
  }
  return estimateText(text) + 4;
}

function estimateTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return 0;
  return estimateText(JSON.stringify(tools));
}

function sessionFiles() {
  const out = [];
  let workspaces = [];
  try {
    workspaces = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const workspace of workspaces) {
    if (!workspace.isDirectory() || !workspace.name.startsWith('wm_')) continue;
    const workspaceDir = path.join(SESSIONS_DIR, workspace.name);
    let sessions = [];
    try {
      sessions = fs.readdirSync(workspaceDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const session of sessions) {
      if (!session.isDirectory() || !session.name.startsWith('session_')) continue;
      const sessionDir = path.join(workspaceDir, session.name);
      const wire = path.join(sessionDir, 'agents', 'main', 'wire.jsonl');
      const state = path.join(sessionDir, 'state.json');
      try {
        if (!fs.statSync(wire).isFile()) continue;
      } catch {
        continue;
      }
      out.push({ id: session.name, wire, state });
    }
  }
  return out;
}

function parseWire(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const cached = CACHE.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.value;
  }

  let systemPrompt = '';
  let tools = [];
  let messages = [];
  let loopText = '';
  let model = '';
  let measured = 0;
  let usageTotal = 0;
  let cacheRead = 0;
  let cacheInput = 0;
  let decodeTokens = 0;
  let decodeMs = 0;
  let decodeSteps = 0;
  let latestDecodeTokens = 0;
  let latestDecodeMs = 0;
  let latestDecodeSpeed = 0;
  let stepStartTime = 0;
  let fallbackSteps = 0;
  let lastTime = 0;
  let truncated = false;

  let content = '';
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const type = event && event.type;
    if (!type) continue;
    if (typeof event.time === 'number') lastTime = Math.max(lastTime, event.time);
    switch (type) {
      case 'profile.bind':
        if (typeof event.systemPrompt === 'string' && event.systemPrompt.length > 0) {
          systemPrompt = event.systemPrompt;
        }
        if (typeof event.modelAlias === 'string' && event.modelAlias.length > 0) {
          model = event.modelAlias;
        }
        break;
      case 'llm.tools_snapshot':
        if (Array.isArray(event.tools) && event.tools.length > 0) tools = event.tools;
        break;
      case 'context.append_message':
        if (event.message && typeof event.message === 'object') messages.push(event.message);
        break;
      case 'context.append_loop_event': {
        const loopEvent = event.event && typeof event.event === 'object' ? event.event : null;
        if (!loopEvent) break;
        if (loopEvent.type === 'step.begin') {
          stepStartTime = Number(event.time) || 0;
        } else if (loopEvent.type === 'content.part' && loopEvent.part) {
          const part = loopEvent.part;
          if (typeof part.text === 'string') loopText += part.text;
          else if (typeof part.think === 'string') loopText += part.think;
        } else if (loopEvent.type === 'tool.call') {
          loopText += JSON.stringify({ name: loopEvent.name, args: loopEvent.args });
        } else if (loopEvent.type === 'tool.result') {
          const result = loopEvent.result;
          if (result && typeof result === 'object' && typeof result.output === 'string') {
            loopText += result.output;
          } else if (result !== undefined) {
            loopText += JSON.stringify(result);
          }
        } else if (loopEvent.type === 'step.end') {
          const usage = loopEvent.usage && typeof loopEvent.usage === 'object' ? loopEvent.usage : null;
          const output = Math.max(0, Number(usage && usage.output) || 0);
          // Port of DeepSeek Harness session-stats:
          //   decodeTokens += usage.output
          //   decodeMs    += assistantMessageTime - firstTokenTime
          // Kimi Code's llmStreamDurationMs is that same first-token-to-message
          // span, so it is used directly. Tool-call steps are included exactly
          // as DSH includes them.
          const streamMs = Math.max(
            0,
            Number(loopEvent.llmStreamDurationMs) || Number(loopEvent.llmServerDecodeMs) || 0
          );
          const firstToken = loopEvent.llmFirstTokenLatencyMs;
          const hasFirstToken =
            firstToken !== undefined && firstToken !== null && Number.isFinite(Number(firstToken));
          const endAt = Number(event.time) || 0;
          const stepMs =
            stepStartTime > 0 && endAt > stepStartTime ? endAt - stepStartTime : 0;
          let effectiveMs = streamMs;
          let collapsed = false;
          if (hasFirstToken && output > 0 && streamMs > 0 && streamMs < 50) {
            // DSH's known tool-call collapse: stream chunks are flushed
            // together, so first-token->message can be 1-4ms for a whole
            // step. Fall back to the step envelope for this step only.
            if (stepMs >= 50) {
              effectiveMs = stepMs;
              collapsed = true;
            } else {
              effectiveMs = 0;
            }
          }
          if (hasFirstToken && output > 0 && effectiveMs > 0) {
            decodeTokens += output;
            decodeMs += effectiveMs;
            decodeSteps += 1;
            if (collapsed) fallbackSteps += 1;
            latestDecodeTokens = output;
            latestDecodeMs = effectiveMs;
            latestDecodeSpeed = Math.round((output / (effectiveMs / 1000)) * 10) / 10;
          }
          stepStartTime = 0;
        }
        break;
      }
      case 'context.undo':
      case 'context.undone':
        // Undo rewinds the loop; the next turn re-appends what is still in
        // context. Keeping the old messages only affects the estimate slightly.
        break;
      case 'token_counting.truncated':
        truncated = true;
        break;
      case 'token_counting.measured':
      case 'token_counting.turn_recorded':
        if (Number.isFinite(event.tokens) && event.tokens >= 0) measured = Math.round(event.tokens);
        break;
      case 'usage.record':
        if (event.usage && typeof event.usage === 'object') {
          const u = event.usage;
          const other = Math.max(0, Number(u.inputOther) || 0);
          const read = Math.max(0, Number(u.inputCacheRead) || 0);
          const creation = Math.max(0, Number(u.inputCacheCreation) || 0);
          cacheRead += read;
          cacheInput += other + read + creation;
          usageTotal = Math.round(other + read + creation);
        }
        break;
      default:
        break;
    }
  }

  let rawSystem = estimateText(systemPrompt);
  let rawTools = estimateTools(tools);
  let rawMessages = estimateText(loopText);
  for (const message of messages) rawMessages += estimateMessage(message);
  const rawSum = rawSystem + rawTools + rawMessages;
  const total = measured > 0 ? measured : usageTotal > 0 ? usageTotal : rawSum;

  let system = rawSystem;
  let toolsTokens = rawTools;
  let messageTokens = rawMessages;
  if (total > 0) {
    const overhead = rawSystem + rawTools;
    if (overhead >= total && overhead > 0) {
      // The fixed overhead alone exceeds the measured total; scale both down.
      const factor = total / overhead;
      system = Math.round(rawSystem * factor);
      toolsTokens = Math.round(rawTools * factor);
      messageTokens = Math.max(0, total - system - toolsTokens);
    } else {
      // System prompt and tool definitions are fixed per request; the rest of
      // the measured context is conversation and tool output.
      system = Math.round(rawSystem);
      toolsTokens = Math.round(rawTools);
      messageTokens = Math.max(0, total - system - toolsTokens);
    }
  } else if (rawSum === 0) {
    system = 0;
    toolsTokens = 0;
    messageTokens = 0;
  }

  const value = {
    used: total,
    system,
    tools: toolsTokens,
    messages: messageTokens,
    cacheRead: Math.round(cacheRead),
    cacheInput: Math.round(cacheInput),
    cacheHit: cacheInput > 0 ? Math.round((cacheRead / cacheInput) * 10000) / 10000 : 0,
    outputTokens: Math.round(decodeTokens),
    decodeMs: Math.round(decodeMs),
    outputSteps: decodeSteps,
    outputFallbackSteps: fallbackSteps,
    outputSpeed: decodeMs > 0 ? Math.round((decodeTokens / (decodeMs / 1000)) * 10) / 10 : 0,
    outputSpeedScope:
      fallbackSteps > 0 ? 'dsh-session-stats+step-envelope-fallback' : 'dsh-session-stats',
    outputLatestSpeed: latestDecodeSpeed,
    outputLatestTokens: Math.round(latestDecodeTokens),
    outputLatestMs: Math.round(latestDecodeMs),
    model,
    measured: measured > 0,
    truncated,
    updatedAt: lastTime || stat.mtimeMs,
  };
  CACHE.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value });
  if (CACHE.size > MAX_CACHE_ENTRIES) {
    const first = CACHE.keys().next();
    if (!first.done) CACHE.delete(first.value);
  }
  return value;
}

export function buildContextData() {
  const sessions = {};
  const files = sessionFiles();
  for (const entry of files) {
    const parsed = parseWire(entry.wire);
    if (!parsed) continue;
    sessions[entry.id] = parsed;
  }
  return {
    version: 1,
    source: 'wire',
    updatedAt: new Date().toISOString(),
    sessions,
  };
}

export function contextFileFor(webDir) {
  return path.join(webDir, 'assets', INPAGE_ASSET_DIR, CONTEXT_NAME);
}

export function writeContextAsset(webDir, data) {
  const payload = data || buildContextData();
  const file = contextFileFor(webDir);
  try {
    writeTextAtomic(file, JSON.stringify(payload));
    return { ok: true, file, sessions: Object.keys(payload.sessions).length, data: payload };
  } catch (err) {
    logLine('context-write-failed', file, err instanceof Error ? err.message : String(err));
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
