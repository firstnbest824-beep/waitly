const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const { runObservableCommand, resolveCommandMode } = require("./observable-command");
const { observeCodexRpcPayload } = require("./codex-rpc-events");

async function startCodexAppServerObserver({
  command,
  args = [],
  settings,
  cwd = process.cwd(),
  env = process.env,
  streams = {},
  adState,
  logger = () => {}
}) {
  if (!isCodexInteractive(command, args)) {
    return { fallbackReason: "not_interactive_codex" };
  }

  if (!path.isAbsolute(String(command || ""))) {
    return { fallbackReason: "real_codex_path_not_absolute" };
  }

  const runner = new EventEmitter();
  const upstreamPort = await getFreePort();
  const upstreamUrl = `ws://127.0.0.1:${upstreamPort}`;
  const innerEnv = {
    ...env,
    WAITLY_INNER: "1"
  };

  let appServerExited = false;
  let appServerExit = null;
  const appServer = spawnCodex(command, ["app-server", "--listen", upstreamUrl], {
    cwd,
    env: innerEnv
  });

  appServer.on("exit", (code, signal) => {
    appServerExited = true;
    appServerExit = { code, signal };
  });

  appServer.on("error", (error) => {
    appServerExited = true;
    appServerExit = { error };
  });

  if (appServer.stdout) {
    appServer.stdout.on("data", () => {});
  }
  if (appServer.stderr) {
    appServer.stderr.on("data", () => {});
  }

  await wait(settings.appServerStartupMs || 500);

  if (appServerExited) {
    killProcess(appServer);
    return {
      fallbackReason: "codex_appserver_failed",
      detail: appServerExit
    };
  }

  logger("appserver_started", {
    reason: "codex_appserver_started",
    upstreamUrl
  });

  const proxy = await startCodexWebSocketProxy({
    upstreamPort,
    adState,
    logger
  });

  logger("proxy_started", {
    reason: "codex_proxy_started",
    proxyUrl: proxy.url,
    upstreamUrl
  });

  const tuiArgs = buildRemoteCodexArgs(args, proxy.url);
  const tui = runObservableCommand(command, tuiArgs, {
    mode: resolveCommandMode(command, settings.commandMode, streams),
    cwd,
    env: innerEnv,
    stdin: streams.stdin || process.stdin,
    stdout: streams.stdout || process.stdout,
    stderr: streams.stderr || process.stderr
  });

  logger("codex_tui_started", {
    reason: "codex_remote_started",
    proxyUrl: proxy.url
  });

  let finished = false;
  const startedAt = Date.now();
  const fallbackWindowMs = settings.appServerFallbackMs || 1200;

  const cleanup = () => {
    proxy.close();
    killProcess(appServer);
  };

  tui.on("data", (source, chunk) => {
    runner.emit("data", source, chunk);
  });

  tui.on("error", (error) => {
    if (finished) {
      return;
    }
    finished = true;
    cleanup();
    runner.emit("fallback", {
      reason: "codex_remote_error",
      error
    });
  });

  tui.on("exit", (code, signal) => {
    if (finished) {
      return;
    }

    finished = true;
    cleanup();

    const quickRemoteFailure =
      code !== 0 &&
      Date.now() - startedAt <= fallbackWindowMs;

    if (quickRemoteFailure) {
      runner.emit("fallback", {
        reason: "codex_remote_failed",
        code,
        signal
      });
      return;
    }

    runner.emit("exit", code, signal);
  });

  runner.kill = (signal) => {
    try {
      tui.kill(signal);
    } catch (_) {
      // The TUI process may already be gone.
    }
    cleanup();
  };

  return {
    runner,
    kind: "appserver",
    proxyUrl: proxy.url,
    upstreamUrl
  };
}

async function startCodexWebSocketProxy({ upstreamPort, adState, logger = () => {} }) {
  const server = http.createServer();
  const sockets = new Set();

  server.on("upgrade", (request, downstream, head) => {
    sockets.add(downstream);
    downstream.once("close", () => {
      sockets.delete(downstream);
    });

    connectUpstreamWebSocket({ upstreamPort, request })
      .then(({ upstream, buffered }) => {
        sockets.add(upstream);
        upstream.once("close", () => {
          sockets.delete(upstream);
        });

        downstream.write(buildWebSocketAcceptResponse(request));

        const downstreamTap = new WebSocketFrameTap({
          adState,
          logger,
          direction: "client_to_appserver"
        });
        const upstreamTap = new WebSocketFrameTap({
          adState,
          logger,
          direction: "appserver_to_client"
        });

        if (buffered.length > 0) {
          downstream.write(buffered);
          upstreamTap.push(buffered);
        }

        if (head && head.length > 0) {
          upstream.write(head);
          downstreamTap.push(head);
        }

        downstream.on("data", (chunk) => {
          upstream.write(chunk);
          downstreamTap.push(chunk);
        });
        upstream.on("data", (chunk) => {
          downstream.write(chunk);
          upstreamTap.push(chunk);
        });

        downstream.on("close", () => upstream.destroy());
        upstream.on("close", () => downstream.destroy());
        downstream.on("error", () => upstream.destroy());
        upstream.on("error", () => downstream.destroy());
      })
      .catch(() => {
        downstream.destroy();
      });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    url: `ws://127.0.0.1:${address.port}`,
    close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
    }
  };
}

function connectUpstreamWebSocket({ upstreamPort, request }) {
  return new Promise((resolve, reject) => {
    const upstream = net.connect(upstreamPort, "127.0.0.1");
    const key = crypto.randomBytes(16).toString("base64");
    let buffer = Buffer.alloc(0);

    upstream.once("error", reject);
    upstream.once("connect", () => {
      upstream.write(buildUpstreamWebSocketRequest({ request, key }));
    });

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const endIndex = buffer.indexOf("\r\n\r\n");
      if (endIndex === -1) {
        return;
      }

      upstream.off("data", onData);
      const header = buffer.slice(0, endIndex).toString("latin1");
      const statusOk = /^HTTP\/1\.[01] 101\b/i.test(header);
      if (!statusOk) {
        upstream.destroy();
        reject(new Error("Codex app-server did not accept WebSocket upgrade"));
        return;
      }

      resolve({
        upstream,
        buffered: buffer.slice(endIndex + 4)
      });
    };

    upstream.on("data", onData);
  });
}

class WebSocketFrameTap {
  constructor({ adState, logger, direction }) {
    this.adState = adState;
    this.logger = logger;
    this.direction = direction;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);

    while (this.buffer.length >= 2) {
      const frame = readFrame(this.buffer);
      if (!frame) {
        return;
      }

      this.buffer = this.buffer.slice(frame.frameLength);

      if (frame.opcode !== 0x1) {
        continue;
      }

      const payload = frame.payload.toString("utf8");
      observeCodexRpcPayload(payload, {
        adState: this.adState,
        logger: (type, fields) => {
          this.logger(type, {
            direction: this.direction,
            ...fields
          });
        }
      });
    }
  }
}

function readFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let payloadLength = second & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }
    const length = buffer.readBigUInt64BE(offset);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    payloadLength = Number(length);
    offset += 8;
  }

  const maskOffset = offset;
  if (masked) {
    offset += 4;
  }

  const frameLength = offset + payloadLength;
  if (buffer.length < frameLength) {
    return null;
  }

  const payload = Buffer.from(buffer.slice(offset, frameLength));
  if (masked) {
    const mask = buffer.slice(maskOffset, maskOffset + 4);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }

  return {
    opcode,
    payload,
    frameLength
  };
}

function buildRemoteCodexArgs(args, proxyUrl) {
  const remoteArgs = ["--remote", proxyUrl];

  if (!args.some((arg) => arg === "--no-alt-screen")) {
    remoteArgs.push("--no-alt-screen");
  }

  return [...remoteArgs, ...args];
}

function buildWebSocketAcceptResponse(request) {
  const key = request.headers["sec-websocket-key"];
  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  const lines = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`
  ];

  if (request.headers["sec-websocket-protocol"]) {
    lines.push(`Sec-WebSocket-Protocol: ${request.headers["sec-websocket-protocol"]}`);
  }

  return `${lines.join("\r\n")}\r\n\r\n`;
}

function buildUpstreamWebSocketRequest({ request, key }) {
  const lines = [
    `GET ${request.url || "/"} HTTP/1.1`,
    `Host: 127.0.0.1`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13"
  ];

  if (request.headers["sec-websocket-protocol"]) {
    lines.push(`Sec-WebSocket-Protocol: ${request.headers["sec-websocket-protocol"]}`);
  }

  return `${lines.join("\r\n")}\r\n\r\n`;
}

function spawnCodex(command, args, options) {
  const spawnTarget = resolveWindowsShellSpawn(command, args);
  return childProcess.spawn(spawnTarget.command, spawnTarget.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function isCodexInteractive(command, args = []) {
  if (normalizeCommandName(command) !== "codex") {
    return false;
  }

  if (args.some((arg) => ["--help", "-h", "--version", "-v", "-V"].includes(arg))) {
    return false;
  }

  if (args.includes("--remote")) {
    return false;
  }

  const subcommand = firstSubcommand(args);
  if (!subcommand) {
    return true;
  }

  return ![
    "app-server",
    "completion",
    "debug",
    "doctor",
    "exec",
    "e",
    "help",
    "mcp",
    "version"
  ].includes(subcommand);
}

function firstSubcommand(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg.startsWith("-")) {
      if (arg === "--remote") {
        index += 1;
      }
      continue;
    }
    return arg;
  }
  return null;
}

function normalizeCommandName(command) {
  const baseName = path.basename(String(command || "")).toLowerCase();
  return baseName.replace(/\.(?:cmd|exe|ps1|bat)$/i, "");
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

function killProcess(child) {
  if (!child || child.killed) {
    return;
  }

  try {
    child.kill();
  } catch (_) {
    // Already gone.
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  startCodexAppServerObserver,
  startCodexWebSocketProxy,
  WebSocketFrameTap,
  readFrame,
  buildRemoteCodexArgs,
  isCodexInteractive
};
