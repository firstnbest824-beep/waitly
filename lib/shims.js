const fs = require("node:fs");
const path = require("node:path");

const WINDOWS_PATHEXT = [".COM", ".EXE", ".BAT", ".CMD"];

function installCommandShim({
  commandName,
  targetCommand,
  settings,
  waitlyBinPath,
  nodePath = process.execPath,
  env = process.env,
  platform = process.platform
}) {
  validateCommandName(commandName);

  const shimDir = path.join(settings.waitlyHome, "shims");
  const shimPath = path.join(shimDir, platform === "win32" ? `${commandName}.cmd` : commandName);
  const resolvedTarget =
    targetCommand ||
    findOriginalCommand(commandName, {
      env,
      platform,
      excludeDirs: [shimDir]
    });

  if (!resolvedTarget) {
    throw new Error(`Could not find original command for shim: ${commandName}`);
  }

  fs.mkdirSync(shimDir, { recursive: true });

  const script =
    platform === "win32"
      ? buildWindowsShim({ nodePath, waitlyBinPath, targetCommand: resolvedTarget })
      : buildPosixShim({ nodePath, waitlyBinPath, targetCommand: resolvedTarget });

  fs.writeFileSync(shimPath, script, "utf8");
  if (platform !== "win32") {
    fs.chmodSync(shimPath, 0o755);
  }

  return {
    commandName,
    shimDir,
    shimPath,
    targetCommand: resolvedTarget
  };
}

function findOriginalCommand(commandName, { env = process.env, platform = process.platform, excludeDirs = [] } = {}) {
  const pathValue = getPathValue(env);
  if (!pathValue) {
    return null;
  }

  const excluded = excludeDirs.map((dir) => normalizePath(dir));
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) {
      continue;
    }

    const normalizedDir = normalizePath(dir);
    if (excluded.includes(normalizedDir)) {
      continue;
    }

    for (const candidate of commandCandidates(dir, commandName, platform, env)) {
      if (isExecutableFile(candidate)) {
        return path.resolve(candidate);
      }
    }
  }

  return null;
}

function commandCandidates(dir, commandName, platform, env) {
  const extension = path.extname(commandName);
  if (platform !== "win32" || extension) {
    return [path.join(dir, commandName)];
  }

  const pathExt = String(env.PATHEXT || "")
    .split(";")
    .filter(Boolean);
  const extensions = pathExt.length > 0 ? pathExt : WINDOWS_PATHEXT;
  const seen = new Set();
  const candidates = [];

  for (const ext of extensions) {
    const candidate = path.join(dir, `${commandName}${ext.toLowerCase()}`);
    const key = normalizePath(candidate);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(candidate);
    }
  }

  return candidates;
}

function buildWindowsShim({ nodePath, waitlyBinPath, targetCommand }) {
  return [
    "@echo off",
    "setlocal",
    "if not \"%WAITLY_INNER%\"==\"\" (",
    `  ${quoteWindowsBatch(targetCommand)} %*`,
    "  exit /b %ERRORLEVEL%",
    ")",
    `${quoteWindowsBatch(nodePath)} ${quoteWindowsBatch(waitlyBinPath)} run ${quoteWindowsBatch(targetCommand)} %*`,
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

function buildPosixShim({ nodePath, waitlyBinPath, targetCommand }) {
  return [
    "#!/bin/sh",
    "if [ -n \"$WAITLY_INNER\" ]; then",
    `  exec ${quotePosix(targetCommand)} "$@"`,
    "fi",
    `exec ${quotePosix(nodePath)} ${quotePosix(waitlyBinPath)} run ${quotePosix(targetCommand)} "$@"`,
    ""
  ].join("\n");
}

function validateCommandName(commandName) {
  if (!/^[A-Za-z0-9._-]+$/.test(String(commandName || ""))) {
    throw new Error("Shim command must be a simple command name");
  }
}

function getPathValue(env) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
  return pathKey ? env[pathKey] : "";
}

function isExecutableFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function normalizePath(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function quoteWindowsBatch(value) {
  return `"${String(value).replace(/%/g, "%%")}"`;
}

function quotePosix(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

module.exports = {
  installCommandShim,
  findOriginalCommand,
  buildWindowsShim,
  buildPosixShim
};
