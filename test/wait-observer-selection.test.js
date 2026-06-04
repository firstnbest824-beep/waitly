const assert = require("node:assert/strict");

const {
  createWaitObservation,
  selectObserverKind
} = require("../lib/wait-observer");

const failures = [];

test("auto selects appserver for interactive Codex", () => {
  assert.equal(selectObserverKind({
    command: "C:\\tools\\codex.cmd",
    args: [],
    settings: baseSettings()
  }), "appserver");
});

test("auto selects JSON observer for explicit codex exec --json", () => {
  assert.equal(selectObserverKind({
    command: "codex",
    args: ["exec", "--json", "summarize"],
    settings: baseSettings()
  }), "json");
});

test("auto keeps Codex help and version on screen observer", () => {
  assert.equal(selectObserverKind({
    command: "codex",
    args: ["--help"],
    settings: baseSettings()
  }), "screen");

  assert.equal(selectObserverKind({
    command: "codex",
    args: ["--version"],
    settings: baseSettings()
  }), "screen");
});

test("auto does not wrap an already remote Codex command", () => {
  assert.equal(selectObserverKind({
    command: "codex",
    args: ["--remote", "ws://127.0.0.1:1234"],
    settings: baseSettings()
  }), "screen");
});

test("forced screen uses screen detector", () => {
  const observation = createWaitObservation({
    command: "codex",
    args: [],
    settings: {
      ...baseSettings(),
      detectionMode: "screen"
    },
    streams: ttyStreams(),
    now: 0
  });

  assert.equal(observation.kind, "screen");
  assert.equal(observation.commandMode, "pty");
  assert.equal(observation.detector.constructor.name, "WaitDetector");
});

test("forced JSON only selects JSON for explicit codex exec --json", () => {
  assert.equal(selectObserverKind({
    command: "codex",
    args: ["exec", "--json", "summarize"],
    settings: {
      ...baseSettings(),
      detectionMode: "json"
    }
  }), "json");

  assert.equal(selectObserverKind({
    command: "codex",
    args: ["exec", "summarize"],
    settings: {
      ...baseSettings(),
      detectionMode: "json"
    }
  }), "screen");
});

function baseSettings() {
  return {
    idleMs: 1000,
    inputPromptGraceMs: 90000,
    thinkingAdDelayMs: 0,
    commandMode: "auto",
    detectionMode: "auto"
  };
}

function ttyStreams() {
  return {
    stdin: { isTTY: true },
    stdout: { isTTY: true }
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    failures.push(error);
  }
}

if (failures.length > 0) {
  process.exitCode = 1;
}
