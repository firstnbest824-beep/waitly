const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  resolveCommandMode,
  runObservableCommand
} = require("../lib/observable-command");

const failures = [];
const tests = [];

test("pty mode forwards terminal data, stdin, and exit events", async () => {
  const ptyProcess = new FakePtyProcess();
  const ptyAdapter = {
    spawn(command, args, options) {
      assert.equal(command, "cmd.exe");
      assert.deepEqual(args, ["/d", "/s", "/c", "codex.cmd --no-alt-screen"]);
      assert.equal(options.cwd, "C:\\repo");
      assert.equal(options.cols, 100);
      assert.equal(options.rows, 30);
      return ptyProcess;
    }
  };
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = (enabled) => {
    stdin.rawMode = enabled;
  };
  stdin.resume = () => {
    stdin.resumed = true;
  };
  stdin.pause = () => {
    stdin.paused = true;
  };

  const chunks = [];
  const runner = runObservableCommand("codex.cmd", ["--no-alt-screen"], {
    mode: "pty",
    cwd: "C:\\repo",
    env: { TERM: "xterm-256color" },
    stdin,
    stdout: { write: (chunk) => chunks.push(String(chunk)) },
    stderr: { write: (chunk) => chunks.push(String(chunk)) },
    columns: 100,
    rows: 30,
    platform: "win32",
    ptyAdapter
  });

  const exitPromise = onceExit(runner);

  ptyProcess.emitData("Thinking...\r\n");
  stdin.emit("data", Buffer.from("hello"));
  ptyProcess.emitExit({ exitCode: 0, signal: 0 });

  const exit = await exitPromise;
  assert.deepEqual(chunks, ["Thinking...\r\n"]);
  assert.deepEqual(ptyProcess.writes, ["hello"]);
  assert.deepEqual(exit, { code: 0, signal: 0 });
  assert.equal(stdin.rawMode, false);
  assert.equal(stdin.paused, true);
});

test("windows pty mode resolves extensionless interactive commands through cmd", async () => {
  const ptyProcess = new FakePtyProcess();
  const ptyAdapter = {
    spawn(command, args) {
      assert.equal(command, "cmd.exe");
      assert.deepEqual(args, ["/d", "/s", "/c", "codex --no-alt-screen"]);
      return ptyProcess;
    }
  };

  const runner = runObservableCommand("codex", ["--no-alt-screen"], {
    mode: "pty",
    stdin: new EventEmitter(),
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    platform: "win32",
    ptyAdapter
  });

  const exitPromise = onceExit(runner);
  ptyProcess.emitExit({ exitCode: 0, signal: 0 });

  assert.deepEqual(await exitPromise, { code: 0, signal: 0 });
});

test("auto mode uses pty only for interactive terminal commands", () => {
  const ttyStreams = { stdin: { isTTY: true }, stdout: { isTTY: true } };
  const pipedStreams = { stdin: { isTTY: false }, stdout: { isTTY: true } };

  assert.equal(resolveCommandMode("codex.cmd", "auto", ttyStreams), "pty");
  assert.equal(resolveCommandMode("claude", "auto", ttyStreams), "pty");
  assert.equal(resolveCommandMode("node", "auto", ttyStreams), "pipe");
  assert.equal(resolveCommandMode("codex.cmd", "auto", pipedStreams), "pipe");
  assert.equal(resolveCommandMode("codex.cmd", "pipe", ttyStreams), "pipe");
  assert.equal(resolveCommandMode("node", "pty", pipedStreams), "pty");
});

class FakePtyProcess {
  constructor() {
    this.dataHandlers = [];
    this.exitHandlers = [];
    this.writes = [];
  }

  onData(handler) {
    this.dataHandlers.push(handler);
    return { dispose() {} };
  }

  onExit(handler) {
    this.exitHandlers.push(handler);
    return { dispose() {} };
  }

  write(chunk) {
    this.writes.push(String(chunk));
  }

  kill() {}

  emitData(chunk) {
    for (const handler of this.dataHandlers) {
      handler(chunk);
    }
  }

  emitExit(event) {
    for (const handler of this.exitHandlers) {
      handler(event);
    }
  }
}

function onceExit(runner) {
  return new Promise((resolve) => {
    runner.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
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
