const assert = require("node:assert/strict");

const {
  CodexJsonEventDetector,
  usesCodexJsonEvents
} = require("../lib/codex-json-events");
const { createWaitObservation } = require("../lib/wait-observer");

const failures = [];

test("detects Codex JSON reasoning immediately", () => {
  const detector = new CodexJsonEventDetector({ thinkingAdDelayMs: 0, now: 0 });

  const events = detector.observeOutput({
    source: "stdout",
    chunk: '{"type":"thread.started","thread_id":"thread_1"}\n{"type":"item.started","item":{"type":"reasoning"}}\n',
    now: 200
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "wait_detected");
  assert.equal(events[0].reason, "codex_json_reasoning");
  assert.equal(events[0].activeForMs, 0);
  assert.equal(detector.isWaiting(), true);
});

test("does not treat Codex turn start alone as reasoning", () => {
  const detector = new CodexJsonEventDetector({ thinkingAdDelayMs: 0, now: 0 });

  assert.deepEqual(detector.observeOutput({
    source: "stdout",
    chunk: '{"type":"turn.started"}\n',
    now: 100
  }), []);
  assert.deepEqual(detector.check({ now: 10000 }), []);
  assert.equal(detector.isWaiting(), false);
});

test("ends a Codex JSON wait when reasoning is completed", () => {
  const detector = new CodexJsonEventDetector({ thinkingAdDelayMs: 0, now: 0 });

  detector.observeOutput({
    source: "stdout",
    chunk: '{"type":"item.started","item":{"type":"reasoning"}}\n',
    now: 100
  });

  const events = detector.observeOutput({
    source: "stdout",
    chunk: '{"type":"item.completed","item":{"type":"reasoning"}}\n',
    now: 1400
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "wait_ended");
  assert.equal(events[0].source, "codex_json_reasoning_completed");
  assert.equal(events[0].durationMs, 1300);
  assert.equal(detector.isWaiting(), false);
});

test("parses Codex JSON events split across stdout chunks", () => {
  const detector = new CodexJsonEventDetector({ thinkingAdDelayMs: 0, now: 0 });

  assert.deepEqual(detector.observeOutput({
    source: "stdout",
    chunk: '{"type":"item.started","item":{"type":"reason',
    now: 100
  }), []);

  const events = detector.observeOutput({
    source: "stdout",
    chunk: 'ing"}}\n',
    now: 120
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "wait_detected");
  assert.equal(events[0].reason, "codex_json_reasoning");
});

test("ignores non-JSON output and non-stdout chunks", () => {
  const detector = new CodexJsonEventDetector({ thinkingAdDelayMs: 0, now: 0 });

  assert.deepEqual(detector.observeOutput({
    source: "stderr",
    chunk: '{"type":"turn.started"}\n',
    now: 100
  }), []);

  assert.deepEqual(detector.observeOutput({
    source: "stdout",
    chunk: "not json\n",
    now: 200
  }), []);

  assert.equal(detector.isWaiting(), false);
});

test("recognizes Codex exec JSON commands", () => {
  assert.equal(usesCodexJsonEvents("codex", ["exec", "--json", "summarize"]), true);
  assert.equal(usesCodexJsonEvents("codex.cmd", ["-m", "gpt-5.1-codex", "e", "--json", "summarize"]), true);
  assert.equal(usesCodexJsonEvents("codex", ["exec", "summarize"]), false);
  assert.equal(usesCodexJsonEvents("codex", ["--json", "summarize"]), false);
  assert.equal(usesCodexJsonEvents("node", ["script.js", "--json"]), false);
});

test("auto uses JSON observer for Codex exec JSON", () => {
  const observation = createWaitObservation({
    command: "codex",
    args: ["exec", "--json", "summarize"],
    settings: baseSettings(),
    streams: ttyStreams(),
    now: 0
  });

  assert.equal(observation.kind, "json");
  assert.equal(observation.commandMode, "pipe");
  assert.equal(observation.detector, null);
});

test("can force screen detector for Codex exec JSON", () => {
  const observation = createWaitObservation({
    command: "codex",
    args: ["exec", "--json", "summarize"],
    settings: {
      ...baseSettings(),
      detectionMode: "screen"
    },
    streams: ttyStreams(),
    now: 0
  });

  assert.equal(observation.commandMode, "pty");
  assert.equal(observation.kind, "screen");
  assert.equal(observation.detector.constructor.name, "WaitDetector");
});

test("auto selects appserver for interactive Codex", () => {
  const observation = createWaitObservation({
    command: "codex",
    args: [],
    settings: baseSettings(),
    streams: ttyStreams(),
    now: 0
  });

  assert.equal(observation.kind, "appserver");
  assert.equal(observation.commandMode, "pty");
  assert.equal(observation.detector, null);
});

function baseSettings() {
  return {
    idleMs: 1000,
    inputPromptGraceMs: 90000,
    thinkingAdDelayMs: 1500,
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
