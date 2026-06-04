const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const waitlyBin = path.join(root, "bin", "waitly.js");
const failures = [];
const tests = [];

test("waitly codex uses the real Codex path from the shim and preserves args", () => {
  withFakeCodex((ctx) => {
    const result = runWaitlyCodex(ctx, ["alpha", "beta"], {
      WAITLY_OPEN_AD: "0"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /FAKE_CODEX/);
    assert.match(result.stdout, /ARGS=alpha beta/);
    assert.match(result.stdout, /DETECTION=auto/);
    assert.match(result.stdout, /AD_DELAY=2000/);
  });
});

test("waitly codex does not overwrite existing observer environment values", () => {
  withFakeCodex((ctx) => {
    const result = runWaitlyCodex(ctx, ["gamma"], {
      WAITLY_DETECTION_MODE: "screen",
      WAITLY_AD_DELAY_MS: "777",
      WAITLY_OPEN_AD: "0"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /ARGS=gamma/);
    assert.match(result.stdout, /DETECTION=screen/);
    assert.match(result.stdout, /AD_DELAY=777/);
  });
});

test("waitly codex reports doctor guidance when no real Codex path exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-codex-shortcut-missing-"));

  try {
    const result = childProcess.spawnSync(
      process.execPath,
      [waitlyBin, "codex"],
      {
        cwd: root,
        env: {
          ...process.env,
          WAITLY_HOME: tempDir,
          WAITLY_CONFIG: path.join(tempDir, "config.json"),
          WAITLY_EVENT_LOG: path.join(tempDir, "events.jsonl")
        },
        encoding: "utf8",
        timeout: 10000
      }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cannot find real Codex path\./);
    assert.match(result.stderr, /Run: waitly doctor codex/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function withFakeCodex(fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-codex-shortcut-test-"));
  const fakeBin = path.join(tempDir, "bin");
  const waitlyHome = path.join(tempDir, "home");
  const fakeCodex = path.join(fakeBin, process.platform === "win32" ? "codex.cmd" : "codex");

  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(fakeCodex, fakeCodexScript(), "utf8");
  if (process.platform !== "win32") {
    fs.chmodSync(fakeCodex, 0o755);
  }

  try {
    const install = childProcess.spawnSync(
      process.execPath,
      [waitlyBin, "install-shim", "codex", "--target", fakeCodex],
      {
        cwd: root,
        env: {
          ...process.env,
          WAITLY_HOME: waitlyHome,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
          Path: `${fakeBin}${path.delimiter}${process.env.Path || process.env.PATH || ""}`
        },
        encoding: "utf8",
        timeout: 10000
      }
    );
    assert.equal(install.status, 0, install.stderr || install.stdout);

    fn({
      tempDir,
      waitlyHome,
      fakeCodex
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runWaitlyCodex(ctx, args, envOverrides = {}) {
  return childProcess.spawnSync(
    process.execPath,
    [waitlyBin, "codex", ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        WAITLY_HOME: ctx.waitlyHome,
        WAITLY_CONFIG: path.join(ctx.waitlyHome, "config.json"),
        WAITLY_EVENT_LOG: path.join(ctx.tempDir, "events.jsonl"),
        ...envOverrides
      },
      encoding: "utf8",
      timeout: 15000
    }
  );
}

function fakeCodexScript() {
  if (process.platform === "win32") {
    return [
      "@echo off",
      "echo FAKE_CODEX=%~f0",
      "echo ARGS=%*",
      "echo DETECTION=%WAITLY_DETECTION_MODE%",
      "echo AD_DELAY=%WAITLY_AD_DELAY_MS%",
      ""
    ].join("\r\n");
  }

  return [
    "#!/bin/sh",
    "echo FAKE_CODEX=$0",
    "echo ARGS=$*",
    "echo DETECTION=$WAITLY_DETECTION_MODE",
    "echo AD_DELAY=$WAITLY_AD_DELAY_MS",
    ""
  ].join("\n");
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
