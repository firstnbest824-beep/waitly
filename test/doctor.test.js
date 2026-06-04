const assert = require("node:assert/strict");

const {
  formatCodexDoctor,
  parseShimTarget
} = require("../lib/doctor");

const failures = [];

test("parses Windows shim target", () => {
  const source = [
    "@echo off",
    "\"C:\\node\\node.exe\" \"C:\\waitly\\bin\\waitly.js\" run \"C:\\tools\\codex.cmd\" %*"
  ].join("\r\n");

  assert.equal(parseShimTarget(source), "C:\\tools\\codex.cmd");
});

test("parses POSIX shim target", () => {
  const source = "#!/bin/sh\nexec '/usr/bin/node' '/opt/waitly/bin/waitly.js' run '/usr/local/bin/codex' \"$@\"\n";

  assert.equal(parseShimTarget(source), "/usr/local/bin/codex");
});

test("doctor output includes detector and fallback fields", () => {
  const output = formatCodexDoctor({
    commandName: "codex",
    pathCommand: "C:\\Users\\me\\.waitly\\shims\\codex.cmd",
    pathPointsToShim: true,
    shimPath: "C:\\Users\\me\\.waitly\\shims\\codex.cmd",
    shimExists: true,
    realCodexPath: "C:\\tools\\codex.cmd",
    realCodexExists: true,
    realCodexIsAbsolute: true,
    usesRealCodexPath: true,
    innerEnvGuard: "WAITLY_INNER=1",
    detectionMode: "auto",
    appServerObserverEligible: true,
    appServerProbe: { ok: true, reason: "exit_0" },
    remoteProbe: { ok: false, reason: "timeout" },
    willFallbackToScreen: true
  });

  assert.match(output, /Detection mode: auto/);
  assert.match(output, /App-server observer eligible: yes/);
  assert.match(output, /Fallback to screen observer: yes/);
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
