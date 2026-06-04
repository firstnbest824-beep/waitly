const path = require("node:path");

class CodexJsonObserver {
  constructor({ adState, logger = () => {} }) {
    this.adState = adState;
    this.logger = logger;
    this.buffer = "";
  }

  observeOutput({ source, chunk }) {
    if (source !== "stdout" || !chunk) {
      return;
    }

    this.buffer += String(chunk);
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const event = parseJsonLine(line);
      if (!event) {
        continue;
      }

      observeCodexJsonEvent(event, {
        adState: this.adState,
        logger: this.logger
      });
    }
  }
}

function observeCodexJsonEvent(event, { adState, logger = () => {} }) {
  const type = event && event.type;
  if (!type) {
    return { handled: false };
  }

  logger("rpc_event_seen", {
    reason: `exec_${type}`,
    eventType: type
  });

  if (type === "turn.started") {
    adState.scheduleOpen("exec_turn_started");
    return { handled: true };
  }

  if (type === "item.started" && event.item && event.item.type === "reasoning") {
    adState.scheduleOpen("exec_reasoning_started");
    return { handled: true };
  }

  if (type === "item.completed" && event.item && event.item.type === "agent_message") {
    adState.close("exec_agent_message_completed");
    return { handled: true };
  }

  if (type === "turn.completed") {
    adState.close("exec_turn_completed");
    return { handled: true };
  }

  if (type === "turn.failed") {
    adState.close("exec_turn_failed");
    return { handled: true };
  }

  if (type === "error") {
    adState.close("exec_error");
    return { handled: true };
  }

  return { handled: false };
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

module.exports = {
  CodexJsonObserver,
  observeCodexJsonEvent,
  usesCodexJsonEvents
};
