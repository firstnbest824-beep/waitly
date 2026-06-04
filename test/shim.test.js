const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const waitlyBin = path.join(root, "bin", "waitly.js");
const failures = [];
const tests = [];

test("install-shim creates a codex shim that wraps the original command", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-shim-test-"));
  const fakeBin = path.join(tempDir, "bin");
  const waitlyHome = path.join(tempDir, "home");
  const originalCodex = path.join(fakeBin, process.platform === "win32" ? "codex.cmd" : "codex");
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(originalCodex, process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n", "utf8");
  if (process.platform !== "win32") {
    fs.chmodSync(originalCodex, 0o755);
  }

  const env = {
    ...process.env,
    WAITLY_HOME: waitlyHome,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
    Path: `${fakeBin}${path.delimiter}${process.env.Path || process.env.PATH || ""}`
  };

  try {
    const result = childProcess.spawnSync(
      process.execPath,
      [waitlyBin, "install-shim", "codex"],
      { cwd: root, env, encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Waitly shim installed for codex/);
    assert.match(result.stdout, /Add this directory to the front of PATH/);

    const shimPath = path.join(
      waitlyHome,
      "shims",
      process.platform === "win32" ? "codex.cmd" : "codex"
    );
    assert.equal(fs.existsSync(shimPath), true);

    const shim = fs.readFileSync(shimPath, "utf8");
    assert.match(shim, new RegExp(escapeRegExp(waitlyBin)));
    assert.match(shim, new RegExp(escapeRegExp(originalCodex)));
    assert.match(shim, /WAITLY_INNER/);
    assert.doesNotMatch(shim, /run codex(?:\s|$)/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
