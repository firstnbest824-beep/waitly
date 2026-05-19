const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  WaitDetector,
  classifyOutput
} = require("../lib/wait-detector");
const { EventLog } = require("../lib/event-log");

const failures = [];

test("detects a silent wait", () => {
  const detector = new WaitDetector({ idleMs: 1000, inputPromptGraceMs: 90000, now: 0 });
  assert.deepEqual(detector.check({ now: 999 }), []);

  const events = detector.check({ now: 1000 });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "wait_detected");
  assert.equal(events[0].silentForMs, 1000);
});

test("spinner output does not reset wait detection", () => {
  const detector = new WaitDetector({ idleMs: 1000, inputPromptGraceMs: 90000, now: 0 });
  detector.observeOutput({ source: "stderr", chunk: "\r⠋ Thinking...", now: 300 });
  detector.observeOutput({ source: "stderr", chunk: "\r⠙ Thinking...", now: 700 });

  const events = detector.check({ now: 1000 });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "wait_detected");
});

test("low-signal status output does not end an active wait", () => {
  const detector = new WaitDetector({ idleMs: 1000, inputPromptGraceMs: 90000, now: 0 });
  detector.check({ now: 1000 });

  const progressEvents = detector.observeOutput({
    source: "stderr",
    chunk: "\rRunning tests 42%",
    now: 1200
  });

  assert.deepEqual(progressEvents, []);
  assert.equal(detector.isWaiting(), true);

  const finishEvents = detector.finish({ source: "process", now: 1600 });
  assert.equal(finishEvents.length, 1);
  assert.equal(finishEvents[0].type, "wait_ended");
  assert.equal(finishEvents[0].durationMs, 1600);
});

test("meaningful output ends an active wait", () => {
  const detector = new WaitDetector({ idleMs: 1000, inputPromptGraceMs: 90000, now: 0 });
  detector.check({ now: 1100 });

  const events = detector.observeOutput({
    source: "stdout",
    chunk: "Updated src/index.ts\n",
    now: 1500
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "wait_ended");
  assert.equal(detector.isWaiting(), false);
});

test("interactive prompts suppress wait detection", () => {
  const detector = new WaitDetector({ idleMs: 1000, inputPromptGraceMs: 90000, now: 0 });
  const events = detector.observeOutput({
    source: "stdout",
    chunk: "Press enter to confirm or esc to cancel",
    now: 200
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "wait_suppressed");
  assert.deepEqual(detector.check({ now: 5000 }), []);
});

test("interactive prompts end an active wait before suppressing detection", () => {
  const detector = new WaitDetector({ idleMs: 1000, inputPromptGraceMs: 90000, now: 0 });
  detector.check({ now: 1000 });

  const events = detector.observeOutput({
    source: "stdout",
    chunk: "Proceed?",
    now: 1300
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].type, "wait_ended");
  assert.equal(events[0].durationMs, 1300);
  assert.equal(events[1].type, "wait_suppressed");
  assert.equal(events[1].reason, "interactive_prompt");
  assert.equal(detector.isWaiting(), false);
  assert.deepEqual(detector.check({ now: 5000 }), []);
});

test("classifies common AI CLI status output as low signal", () => {
  assert.equal(classifyOutput("\r⠋ Analyzing project files").kind, "low_signal");
  assert.equal(classifyOutput("\rRunning tests 42%").kind, "low_signal");
  assert.equal(classifyOutput("Error: test failed\n").kind, "meaningful");
});

test("classifies prompts with y/n suffix as interactive", () => {
  assert.equal(classifyOutput("Continue? [y/n]").kind, "interactive_prompt");
});

test("event log writes ordered JSONL records without undefined fields", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-event-log-test-"));
  const filePath = path.join(tempDir, "events.jsonl");

  try {
    const eventLog = new EventLog(filePath);
    eventLog.write("wait_detected", { silentForMs: 1000, omitted: undefined });
    eventLog.write("wait_ended", { source: "stdout", durationMs: 1500 });

    const records = fs.readFileSync(filePath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.deepEqual(records.map((record) => record.type), ["wait_detected", "wait_ended"]);
    assert.equal(records[0].silentForMs, 1000);
    assert.equal("omitted" in records[0], false);
    assert.equal(records[1].source, "stdout");
    assert.equal(records[1].durationMs, 1500);

    for (const record of records) {
      assert.equal(typeof record.ts, "string");
      assert.equal(Number.isNaN(Date.parse(record.ts)), false);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

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
