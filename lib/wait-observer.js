const { isCodexInteractive } = require("./codex-appserver-observer");
const { usesCodexJsonEvents } = require("./codex-json-observer");
const { resolveCommandMode } = require("./observable-command");
const { WaitDetector } = require("./wait-detector");

function createWaitObservation({ command, args = [], settings, streams = {}, now = Date.now() }) {
  const kind = selectObserverKind({ command, args, settings });

  if (kind === "json") {
    return {
      kind,
      commandMode: "pipe",
      detector: null
    };
  }

  if (kind === "appserver") {
    return {
      kind,
      commandMode: resolveCommandMode(command, settings.commandMode, streams),
      detector: null
    };
  }

  return {
    kind,
    commandMode: resolveCommandMode(command, settings.commandMode, streams),
    detector: new WaitDetector({
      idleMs: settings.idleMs,
      inputPromptGraceMs: settings.inputPromptGraceMs,
      thinkingAdDelayMs: settings.thinkingAdDelayMs,
      now
    })
  };
}

function selectObserverKind({ command, args = [], settings }) {
  const mode = settings.detectionMode || "auto";

  if (mode === "screen") {
    return "screen";
  }

  if (mode === "json") {
    return usesCodexJsonEvents(command, args) ? "json" : "screen";
  }

  if (mode === "appserver") {
    return isCodexInteractive(command, args) ? "appserver" : "screen";
  }

  if (isCodexInteractive(command, args)) {
    return "appserver";
  }

  if (usesCodexJsonEvents(command, args)) {
    return "json";
  }

  return "screen";
}

module.exports = {
  createWaitObservation,
  selectObserverKind
};
