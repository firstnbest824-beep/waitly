const assert = require("node:assert/strict");

const { observeCodexRpcPayload } = require("../lib/codex-rpc-events");

const failures = [];

test("turn started schedules an ad", () => {
  const calls = [];

  const result = observeCodexRpcPayload('{"method":"turn/started","params":{}}', {
    adState: fakeAdState(calls),
    logger: () => {}
  });

  assert.equal(result.parsed, true);
  assert.deepEqual(calls, [["open", "turn_started"]]);
});

test("reasoning item started schedules an ad", () => {
  const calls = [];

  observeCodexRpcPayload('{"method":"item/started","params":{"item":{"type":"reasoning"}}}', {
    adState: fakeAdState(calls),
    logger: () => {}
  });

  assert.deepEqual(calls, [["open", "reasoning_started"]]);
});

test("agent message delta closes the ad", () => {
  const calls = [];

  observeCodexRpcPayload('{"method":"item/agentMessage/delta","params":{"delta":"hello"}}', {
    adState: fakeAdState(calls),
    logger: () => {}
  });

  assert.deepEqual(calls, [["close", "visible_output_started"]]);
});

test("agent_message delta variant closes the ad", () => {
  const calls = [];

  observeCodexRpcPayload('{"method":"item.agent_message.delta","params":{"delta":"hello"}}', {
    adState: fakeAdState(calls),
    logger: () => {}
  });

  assert.deepEqual(calls, [["close", "visible_output_started"]]);
});

test("turn completed and failed close the ad", () => {
  const calls = [];
  const adState = fakeAdState(calls);

  observeCodexRpcPayload('{"method":"turn/completed","params":{}}', { adState, logger: () => {} });
  observeCodexRpcPayload('{"method":"turn/failed","params":{}}', { adState, logger: () => {} });

  assert.deepEqual(calls, [
    ["close", "turn_completed"],
    ["close", "turn_failed"]
  ]);
});

test("JSON-RPC errors close the ad", () => {
  const calls = [];

  observeCodexRpcPayload('{"id":1,"error":{"message":"failed"}}', {
    adState: fakeAdState(calls),
    logger: () => {}
  });

  assert.deepEqual(calls, [["close", "codex_error"]]);
});

test("parse failures are ignored", () => {
  const calls = [];
  const result = observeCodexRpcPayload("not json", {
    adState: fakeAdState(calls),
    logger: () => {}
  });

  assert.equal(result.parsed, false);
  assert.deepEqual(calls, []);
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
