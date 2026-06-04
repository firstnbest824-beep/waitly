const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { isCodexInteractive } = require("./codex-appserver-observer");
const { findOriginalCommand } = require("./shims");

function inspectCodexDoctor({
  commandName = "codex",
  settings,
  env = process.env,
  platform = process.platform,
  waitlyBinPath
}) {
  const shimDir = path.join(settings.waitlyHome, "shims");
  const shimPath = path.join(shimDir, platform === "win32" ? `${commandName}.cmd` : commandName);
  const pathCommand = findOriginalCommand(commandName, { env, platform });
  const shimExists = fileExists(shimPath);
  const shimSource = shimExists ? fs.readFileSync(shimPath, "utf8") : "";
  const realCodexPath = parseShimTarget(shimSource);
  const realCodexExists = realCodexPath ? fileExists(realCodexPath) : false;
  const pathPointsToShim = pathCommand
    ? normalizePath(pathCommand) === normalizePath(shimPath)
    : false;

  return {
    commandName,
    pathCommand,
    pathPointsToShim,
    shimPath,
    shimExists,
    realCodexPath,
    realCodexExists,
    realCodexIsAbsolute: realCodexPath ? path.isAbsolute(realCodexPath) : false,
    waitlyBinPath,
    usesRealCodexPath: Boolean(realCodexPath && path.isAbsolute(realCodexPath)),
    innerEnvGuard: "WAITLY_INNER=1",
    detectionMode: settings.detectionMode,
    appServerObserverEligible: Boolean(
      realCodexPath &&
      path.isAbsolute(realCodexPath) &&
      realCodexExists &&
      isCodexInteractive(realCodexPath, [])
    )
  };
}

async function runCodexDoctor({
  commandName = "codex",
  settings,
  env = process.env,
  platform = process.platform,
  waitlyBinPath,
  probe = true
}) {
  const report = inspectCodexDoctor({
    commandName,
    settings,
    env,
    platform,
    waitlyBinPath
  });

  if (probe && report.realCodexExists) {
    report.appServerProbe = await probeCommand(report.realCodexPath, ["app-server", "--help"], { env });
    report.remoteProbe = await probeCommand(report.realCodexPath, ["--remote", "ws://127.0.0.1:9", "--help"], { env });
  } else {
    report.appServerProbe = { ok: false, reason: "not_probed" };
    report.remoteProbe = { ok: false, reason: "not_probed" };
  }

  report.willFallbackToScreen =
    !report.appServerObserverEligible ||
    report.detectionMode === "screen" ||
    (probe && (!report.appServerProbe.ok || !report.remoteProbe.ok));

  return report;
}

function formatCodexDoctor(report) {
  return [
    `Waitly doctor: ${report.commandName}`,
    `PATH command: ${report.pathCommand || "not found"}`,
    `PATH points to Waitly shim: ${yesNo(report.pathPointsToShim)}`,
    `Shim path: ${report.shimPath}`,
    `Shim exists: ${yesNo(report.shimExists)}`,
    `Real Codex path from shim: ${report.realCodexPath || "not found"}`,
    `Real Codex path exists: ${yesNo(report.realCodexExists)}`,
    `Real Codex path is absolute: ${yesNo(report.realCodexIsAbsolute)}`,
    `Waitly uses real Codex path internally: ${yesNo(report.usesRealCodexPath)}`,
    `Recursion guard env: ${report.innerEnvGuard}`,
    `Detection mode: ${report.detectionMode}`,
    `App-server observer eligible: ${yesNo(report.appServerObserverEligible)}`,
    `codex app-server executable: ${formatProbe(report.appServerProbe)}`,
    `codex --remote executable: ${formatProbe(report.remoteProbe)}`,
    `Fallback to screen observer: ${yesNo(report.willFallbackToScreen)}`
  ].join("\n");
}

function parseShimTarget(source) {
  if (!source) {
    return null;
  }

  const windowsMatch = /\srun\s+"([^"]+)"/i.exec(source);
  if (windowsMatch) {
    return windowsMatch[1];
  }

  const posixMatch = /\srun\s+'((?:[^']|'\\'')+)'/.exec(source);
  if (posixMatch) {
    return posixMatch[1].replace(/'\\''/g, "'");
  }

  return null;
}

function probeCommand(command, args, { env, timeoutMs = 1500 }) {
  return new Promise((resolve) => {
    const spawnTarget = resolveWindowsShellSpawn(command, args);
    const child = childProcess.spawn(spawnTarget.command, spawnTarget.args, {
      env: {
        ...env,
        WAITLY_INNER: "1"
      },
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      resolve({ ok: false, reason: "timeout" });
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, reason: error.message });
    });

    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const unsupported = /unknown|unexpected|unrecognized|invalid/i.test(stderr);
      resolve({
        ok: code === 0 || !unsupported,
        reason: code === 0 ? "exit_0" : `exit_${code}`
      });
    });
  });
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function normalizePath(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function shouldRunThroughWindowsShell(command) {
  const extension = path.extname(String(command || "")).toLowerCase();
  return extension === "" || extension === ".cmd" || extension === ".bat";
}

function resolveWindowsShellSpawn(command, args) {
  if (process.platform !== "win32" || !shouldRunThroughWindowsShell(command)) {
    return { command, args };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [quoteWindowsArg(command), ...args.map(quoteWindowsArg)].join(" ")]
  };
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"&|<>^]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\\\"")}"`;
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function formatProbe(probe) {
  if (!probe) {
    return "not probed";
  }
  return `${yesNo(probe.ok)} (${probe.reason})`;
}

module.exports = {
  inspectCodexDoctor,
  runCodexDoctor,
  formatCodexDoctor,
  parseShimTarget
};
