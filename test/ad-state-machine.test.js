const assert = require("node:assert/strict");

const { AdStateMachine } = require("../lib/ad-state-machine");

const failures = [];
const tests = [];

test("scheduleOpen calls openAd after delay", async () => {
  const calls = [];
  const machine = new AdStateMachine({
    delayMs: 10,
    openAd: (reason) => calls.push(["open", reason]),
    closeAd: (reason) => calls.push(["close", reason]),
    logger: (type, payload) => calls.push(["log", type, payload.reason])
  });

  machine.scheduleOpen("turn_started");
  await wait(25);

  assert.deepEqual(calls.filter((call) => call[0] === "open"), [["open", "turn_started"]]);
});

test("close before delay cancels pending open", async () => {
  const calls = [];
  const machine = new AdStateMachine({
    delayMs: 25,
    openAd: (reason) => calls.push(["open", reason]),
    closeAd: (reason) => calls.push(["close", reason]),
    logger: () => {}
  });

  machine.scheduleOpen("reasoning_started");
  machine.close("visible_output_started");
  await wait(40);

  assert.deepEqual(calls, []);
});

test("scheduleOpen does not duplicate while already open", async () => {
  const calls = [];
  const machine = new AdStateMachine({
    delayMs: 0,
    openAd: (reason) => calls.push(["open", reason]),
    closeAd: (reason) => calls.push(["close", reason]),
    logger: () => {}
  });

  machine.scheduleOpen("turn_started");
  await wait(5);
  machine.scheduleOpen("reasoning_started");
  await wait(5);

  assert.deepEqual(calls, [["open", "turn_started"]]);
});

test("forceClose clears pending timer and closes open ad", async () => {
  const calls = [];
  const machine = new AdStateMachine({
    delayMs: 25,
    openAd: (reason) => calls.push(["open", reason]),
    closeAd: (reason) => calls.push(["close", reason]),
    logger: (type, payload) => calls.push(["log", type, payload.reason])
  });

  machine.scheduleOpen("turn_started");
  machine.forceClose("process_exit");
  await wait(40);

  assert.equal(calls.some((call) => call[0] === "open"), false);

  machine.scheduleOpen("reasoning_started");
  await wait(40);
  machine.forceClose("process_exit");

  assert.deepEqual(calls.filter((call) => call[0] !== "log"), [
    ["open", "reasoning_started"],
    ["close", "process_exit"]
  ]);
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  for (const { name, fn } of tests) {
    try {
      await fn();
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
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
