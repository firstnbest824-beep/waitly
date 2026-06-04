function observeCodexRpcPayload(payload, { adState, logger = () => {} }) {
  let message;
  try {
    message = JSON.parse(String(payload));
  } catch (_) {
    return { parsed: false, handled: false };
  }

  const event = extractRpcEvent(message);
  if (!event.name && !message.error) {
    return { parsed: true, handled: false };
  }

  if (message.error || event.name === "error") {
    logger("rpc_event_seen", {
      reason: "codex_error",
      eventType: event.name || "jsonrpc_error"
    });
    adState.close("codex_error");
    return { parsed: true, handled: true };
  }

  logger("rpc_event_seen", {
    reason: event.name,
    eventType: event.name
  });

  if (matchesEvent(event.name, "turn/started")) {
    adState.scheduleOpen("turn_started");
    return { parsed: true, handled: true };
  }

  if (matchesEvent(event.name, "item/started") && event.item && event.item.type === "reasoning") {
    adState.scheduleOpen("reasoning_started");
    return { parsed: true, handled: true };
  }

  if (matchesEvent(event.name, "item/agentMessage/delta")) {
    adState.close("visible_output_started");
    return { parsed: true, handled: true };
  }

  if (matchesEvent(event.name, "turn/completed")) {
    adState.close("turn_completed");
    return { parsed: true, handled: true };
  }

  if (matchesEvent(event.name, "turn/failed")) {
    adState.close("turn_failed");
    return { parsed: true, handled: true };
  }

  return { parsed: true, handled: false };
}

function extractRpcEvent(message) {
  const params = message.params || {};
  const name = message.method || message.type || message.event || params.type || "";
  return {
    name,
    item: params.item || message.item || null
  };
}

function matchesEvent(actual, expected) {
  return normalizeEventName(actual) === normalizeEventName(expected);
}

function normalizeEventName(value) {
  return String(value || "")
    .replace(/\./g, "/")
    .replace(/_/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

module.exports = {
  observeCodexRpcPayload,
  matchesEvent,
  normalizeEventName
};
