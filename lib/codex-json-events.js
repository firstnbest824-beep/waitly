const path = require("node:path");

class CodexJsonEventDetector {
  constructor({ thinkingAdDelayMs = 1500, now = Date.now() } = {}) {
    this.thinkingAdDelayMs = thinkingAdDelayMs;
    this.buffer = "";
    this.activeStartedAt = null;
    this.activeReason = null;
    this.waitStartedAt = null;
    this.waitReason = null;
    this.lastActivityAt = now;
  }

  observeOutput({ source, chunk, now = Date.now() }) {
    if (source !== "stdout" || !chunk) {
      return [];
    }

    this.buffer += String(chunk);
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";

    const events = [];
    for (const line of lines) {
      const parsed = parseJsonLine(line);
      if (!parsed) {
        continue;
      }

      events.push(...this.observeCodexEvent(parsed, now));
    }

    return events;
  }

  observeCodexEvent(event, now) {
    const type = event.type;

    if (type === "item.started" && isReasoningItem(event.item)) {
      return this.startActive({
        now,
        reason: "codex_json_reasoning"
      });
    }

    if (type === "item.completed" && isReasoningItem(event.item)) {
      return this.endActive({ source: "codex_json_reasoning_completed", now });
    }

    if (type === "item.completed" && event.item && event.item.type === "agent_message") {
      return this.endActive({ source: "codex_json_agent_message", now });
    }

    if (type === "turn.completed") {
      return this.endActive({ source: "codex_json_turn_completed", now });
    }

    if (type === "turn.failed" || type === "error") {
      return this.endActive({ source: "codex_json_error", now });
    }

    return [];
  }

  startActive({ now, reason }) {
    this.lastActivityAt = now;

    if (this.activeStartedAt !== null) {
      return [];
    }

    this.activeStartedAt = now;
    this.activeReason = reason;

    if (this.thinkingAdDelayMs <= 0) {
      return [this.startWait({ now })];
    }

    return [];
  }

  check({ now = Date.now() } = {}) {
    if (this.waitStartedAt !== null || this.activeStartedAt === null) {
      return [];
    }

    const activeForMs = now - this.activeStartedAt;
    if (activeForMs < this.thinkingAdDelayMs) {
      return [];
    }

    return [this.startWait({ now })];
  }

  startWait({ now }) {
    this.waitStartedAt = this.activeStartedAt;
    this.waitReason = this.activeReason || "codex_json_reasoning";
    return {
      type: "wait_detected",
      reason: this.waitReason,
      activeForMs: now - this.activeStartedAt,
      thinkingAdDelayMs: this.thinkingAdDelayMs
    };
  }

  endActive({ source, now }) {
    const event = this.waitStartedAt === null
      ? null
      : {
          type: "wait_ended",
          source,
          durationMs: now - this.waitStartedAt
        };

    this.activeStartedAt = null;
    this.activeReason = null;
    this.waitStartedAt = null;
    this.waitReason = null;

    return event ? [event] : [];
  }

  isWaiting() {
    return this.waitStartedAt !== null;
  }

  getWaitStartedAt() {
    return this.waitStartedAt;
  }

  getWaitReason() {
    return this.waitReason;
  }

  finish({ source = "process_exit", now = Date.now() } = {}) {
    if (this.activeStartedAt === null) {
      return [];
    }

    return this.endActive({ source, now });
  }
}

function usesCodexJsonEvents(command, args = []) {
  if (normalizeCommandName(command) !== "codex") {
    return false;
  }

  let hasExec = false;
  let hasJson = false;

  for (const arg of args) {
    if (arg === "exec" || arg === "e") {
      hasExec = true;
    }

    if (arg === "--json") {
      hasJson = true;
    }
  }

  return hasExec && hasJson;
}

function normalizeCommandName(command) {
  const baseName = path.basename(String(command || "")).toLowerCase();
  return baseName.replace(/\.(?:cmd|exe|ps1|bat)$/i, "");
}

function parseJsonLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return null;
  }
}

function isReasoningItem(item) {
  return item && item.type === "reasoning";
}

module.exports = {
  CodexJsonEventDetector,
  usesCodexJsonEvents
};
