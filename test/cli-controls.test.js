const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const waitlyBin = path.join(root, "bin", "waitly.js");
const failures = [];
const tests = [];

test("disable, status, pause, and enable update local config", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-cli-controls-test-"));
  const env = {
    ...process.env,
    WAITLY_HOME: tempDir,
    WAITLY_CONFIG: path.join(tempDir, "config.json"),
    WAITLY_EVENT_LOG: path.join(tempDir, "events.jsonl")
  };

  try {
    assert.match(runWaitly(["status"], env).stdout, /Waitly ads: enabled/);
    assert.match(runWaitly(["disable"], env).stdout, /Waitly ads disabled/);
    assert.equal(readConfig(env).disabled, true);
    assert.match(runWaitly(["status"], env).stdout, /Waitly ads: disabled/);

    assert.match(runWaitly(["pause", "1h"], env).stdout, /Waitly ads paused until/);
    const pausedConfig = readConfig(env);
    assert.equal(pausedConfig.disabled, false);
    assert.equal(pausedConfig.adsDisabled, false);
    assert.equal(typeof pausedConfig.pauseUntil, "string");
    assert.equal("adsPausedUntil" in pausedConfig, false);
    assert.match(runWaitly(["status"], env).stdout, /Waitly ads: paused until/);

    assert.match(runWaitly(["enable"], env).stdout, /Waitly ads enabled/);
    const enabledConfig = readConfig(env);
    assert.equal(enabledConfig.disabled, false);
    assert.equal(enabledConfig.adsDisabled, false);
    assert.equal("pauseUntil" in enabledConfig, false);
    assert.equal("adsPausedUntil" in enabledConfig, false);
    assert.match(runWaitly(["status"], env).stdout, /Waitly ads: enabled/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("pause rejects invalid values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-cli-controls-test-"));
  const env = {
    ...process.env,
    WAITLY_HOME: tempDir,
    WAITLY_CONFIG: path.join(tempDir, "config.json")
  };

  try {
    const result = childProcess.spawnSync(
      process.execPath,
      [waitlyBin, "pause", "not-a-date"],
      { cwd: root, env, encoding: "utf8" }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid pause value/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function runWaitly(args, env) {
  const result = childProcess.spawnSync(
    process.execPath,
    [waitlyBin, ...args],
    { cwd: root, env, encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(`waitly ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }

  return result;
}

function readConfig(env) {
  return JSON.parse(fs.readFileSync(env.WAITLY_CONFIG, "utf8"));
}

function test(name, fn) {
  tests.push({ name, fn });
}

function run() {
  for (const { name, fn } of tests) {
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
}

run();
