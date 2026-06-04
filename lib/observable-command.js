const childProcess = require("node:child_process");
const { EventEmitter } = require("node:events");
const path = require("node:path");

const interactiveCommands = new Set([
  "aider",
  "claude",
  "codex",
  "gemini"
]);

function runObservableCommand(command, args = [], options = {}) {
  const mode = options.mode || "pipe";
  if (mode === "pty") {
    return runPtyCommand(command, args, options);
  }
  return runPipeCommand(command, args, options);
}

function resolveCommandMode(command, requestedMode = "auto", streams = {}) {
  if (requestedMode === "pipe" || requestedMode === "pty") {
    return requestedMode;
  }

  const stdin = streams.stdin || process.stdin;
  const stdout = streams.stdout || process.stdout;
  if (!stdin.isTTY || !stdout.isTTY) {
    return "pipe";
  }

  return interactiveCommands.has(normalizeCommandName(command)) ? "pty" : "pipe";
}

function normalizeCommandName(command) {
  const baseName = path.basename(String(command || "")).toLowerCase();
  return baseName.replace(/\.(?:cmd|exe|ps1|bat)$/i, "");
}

function runPipeCommand(command, args, options) {
  const runner = new EventEmitter();
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const child = childProcess.spawn(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: ["inherit", "pipe", "pipe"],
    env: options.env || process.env,
    shell: process.platform === "win32"
  });

  child.stdout.on("data", (chunk) => {
    stdout.write(chunk);
    runner.emit("data", "stdout", chunk);
  });

  child.stderr.on("data", (chunk) => {
    stderr.write(chunk);
    runner.emit("data", "stderr", chunk);
  });

  child.on("error", (error) => {
    runner.emit("error", error);
  });

  child.on("exit", (code, signal) => {
    runner.emit("exit", code, signal);
  });

  runner.kill = (signal) => {
    child.kill(signal);
  };

  return runner;
}

function runPtyCommand(command, args, options) {
  const runner = new EventEmitter();
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  let ptyProcess = null;
  let stdinHandler = null;
  let resizeHandler = null;
  let rawModeWasSet = false;
  let stdinWasResumed = false;
  let dataSubscription = null;
  let exitSubscription = null;

  const cleanup = () => {
    if (stdinHandler && typeof stdin.off === "function") {
      stdin.off("data", stdinHandler);
    } else if (stdinHandler && typeof stdin.removeListener === "function") {
      stdin.removeListener("data", stdinHandler);
    }

    if (resizeHandler && stdout && typeof stdout.off === "function") {
      stdout.off("resize", resizeHandler);
    } else if (resizeHandler && stdout && typeof stdout.removeListener === "function") {
      stdout.removeListener("resize", resizeHandler);
    }

    if (rawModeWasSet && typeof stdin.setRawMode === "function") {
      stdin.setRawMode(false);
    }

    if (stdinWasResumed && typeof stdin.pause === "function") {
      stdin.pause();
    }

    if (dataSubscription && typeof dataSubscription.dispose === "function") {
      dataSubscription.dispose();
    }

    if (exitSubscription && typeof exitSubscription.dispose === "function") {
      exitSubscription.dispose();
    }
  };

  try {
    const pty = options.ptyAdapter || require("node-pty");
    const spawnTarget = resolvePtySpawn(command, args, options.platform || process.platform);
    ptyProcess = pty.spawn(spawnTarget.command, spawnTarget.args, {
      name: options.term || process.env.TERM || "xterm-256color",
      cols: options.columns || stdout.columns || 80,
      rows: options.rows || stdout.rows || 24,
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env
    });
  } catch (error) {
    process.nextTick(() => {
      runner.emit("error", error);
      runner.emit("exit", 127, null);
    });
    runner.kill = () => {};
    return runner;
  }

  dataSubscription = ptyProcess.onData((chunk) => {
    stdout.write(chunk);
    runner.emit("data", "stdout", chunk);
  });

  exitSubscription = ptyProcess.onExit((event) => {
    cleanup();
    runner.emit("exit", event.exitCode, event.signal);
  });

  stdinHandler = (chunk) => {
    ptyProcess.write(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
  };

  if (typeof stdin.setRawMode === "function" && stdin.isTTY) {
    stdin.setRawMode(true);
    rawModeWasSet = true;
  }
  if (typeof stdin.resume === "function") {
    stdin.resume();
    stdinWasResumed = true;
  }
  if (typeof stdin.on === "function") {
    stdin.on("data", stdinHandler);
  }

  if (stdout && typeof stdout.on === "function" && typeof ptyProcess.resize === "function") {
    resizeHandler = () => {
      ptyProcess.resize(stdout.columns || 80, stdout.rows || 24);
    };
    stdout.on("resize", resizeHandler);
  }

  runner.kill = (signal) => {
    try {
      ptyProcess.kill(signal);
    } catch (error) {
      stderr.write(`[waitly] Failed to stop PTY command: ${error.message}\n`);
    }
  };

  return runner;
}

function resolvePtySpawn(command, args, platform = process.platform) {
  if (platform === "win32" && shouldRunThroughWindowsShell(command)) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", [quoteWindowsArg(command), ...args.map(quoteWindowsArg)].join(" ")]
    };
  }

  return { command, args };
}

function shouldRunThroughWindowsShell(command) {
  const extension = path.extname(String(command || "")).toLowerCase();
  return extension === "" || extension === ".cmd" || extension === ".bat";
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"&|<>^]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\\\"")}"`;
}

module.exports = {
  resolveCommandMode,
  runObservableCommand
};
