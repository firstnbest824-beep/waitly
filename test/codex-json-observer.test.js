const assert = require("node:assert/strict");

const { CodexJsonObserver, usesCodexJsonEvents } = require("../lib/codex-json-observer");

const failures = [];

test("turn.started schedules an ad", () => {
  const calls = [];
  const observer = new CodexJsonObserver({ adState: fakeAdState(calls), logger: () => {} });

  observer.observeOutput({
    source: "stdout",
    chunk: '{"type":"turn.started"}\n'
  });

  assert.deepEqual(calls, [["open", "exec_turn_started"]]);
});

test("reasoning item.started schedules an ad", () => {
  const calls = [];
  const observer = new CodexJsonObserver({ adState: fakeAdState(calls), logger: () => {} });

  observer.observeOutput({
    source: "stdout",
    chunk: '{"type":"item.started","item":{"type":"reasoning"}}\n'
  });

  assert.deepEqual(calls, [["open", "exec_reasoning_started"]]);
});

test("agent_message item.completed closes the ad", () => {
  const calls = [];
  const observer = new CodexJsonObserver({ adState: fakeAdState(calls), logger: () => {} });

  observer.observeOutput({
    source: "stdout",
    chunk: '{"type":"item.completed","item":{"type":"agent_message"}}\n'
  });

  assert.deepEqual(calls, [["close", "exec_agent_message_completed"]]);
});

test("turn.completed and turn.failed close the ad", () => {
  const calls = [];
  const observer = new CodexJsonObserver({ adState: fakeAdState(calls), logger: () => {} });

  observer.observeOutput({
    source: "stdout",
    chunk: '{"type":"turn.completed"}\n{"type":"turn.failed"}\n'
  });

  assert.deepEqual(calls, [
    ["close", "exec_turn_completed"],
    ["close", "exec_turn_failed"]
  ]);
});

test("broken JSON lines are ignored", () => {
  const calls = [];
  const observer = new CodexJsonObserver({ adState: fakeAdState(calls), logger: () => {} });

  observer.observeOutput({
    source: "stdout",
    chunk: 'not json\n{"type":"error"}\n'
  });

  assert.deepEqual(calls, [["close", "exec_error"]]);
});

test("recognizes only explicit codex exec --json", () => {
  assert.equal(usesCodexJsonEvents("codex", ["exec", "--json", "summarize"]), true);
  assert.equal(usesCodexJsonEvents("codex", ["exec", "summarize"]), false);
  assert.equal(usesCodexJsonEvents("codex", ["--json", "summarize"]), false);
  assert.equal(usesCodexJsonEvents("node", ["exec", "--json"]), false);
});

function fakeAdState(calls) {
  return {
    scheduleOpen(reason) {
      calls.push(["open", reason]);
    },
    close(reason) {
      calls.push(["close", reason]);
    }
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
