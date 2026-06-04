#!/usr/bin/env node

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");

const { AdStateMachine } = require("../lib/ad-state-machine");
const { startAdWindowServer } = require("../lib/ad-window-server");
const { startCodexAppServerObserver } = require("../lib/codex-appserver-observer");
const { CodexJsonObserver } = require("../lib/codex-json-observer");
const { loadCreatives } = require("../lib/creatives");
const { formatCodexDoctor, inspectCodexDoctor, runCodexDoctor } = require("../lib/doctor");
const { EventLog } = require("../lib/event-log");
const { runObservableCommand } = require("../lib/observable-command");
const {
  loadSettings,
  parsePauseUntil,
  readConfig,
  resolveAdAvailability,
  writeConfig
} = require("../lib/settings");
const { installCommandShim } = require("../lib/shims");
const { createWaitObservation, selectObserverKind } = require("../lib/wait-observer");
const packageInfo = require("../package.json");

const projectRoot = path.resolve(__dirname, "..");

main().catch((error) => {
  console.error(`[waitly] ${error.message}`);
  process.exit(1);
});

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    printVersion();
    return;
  }

  if (command === "run") {
    await runWrappedCommand(args);
    return;
  }

  if (command === "codex") {
    await runCodexShortcut(args);
    return;
  }

  if (command === "preview-ad") {
    await previewAd();
    return;
  }

  if (command === "status") {
    showStatus();
    return;
  }

  if (command === "doctor") {
    await doctor(args);
    return;
  }

  if (command === "pause") {
    pauseAds(args);
    return;
  }

  if (command === "disable") {
    disableAds();
    return;
  }

  if (command === "enable") {
    enableAds();
    return;
  }

  if (command === "install-shim") {
    installShim(args);
    return;
  }

  console.error(`[waitly] Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

async function runWrappedCommand(args) {
  const [wrappedCommand, ...wrappedArgs] = args;

  if (!wrappedCommand) {
    console.error("[waitly] Missing command. Example: waitly run codex");
    process.exit(1);
  }

  const settings = loadSettings(projectRoot);
  const config = readConfig(settings);
  const adAvailability = resolveAdAvailability(settings, config);

  if (adAvailability.disabled) {
    await runPassthroughOnly(wrappedCommand, wrappedArgs);
    return;
  }

  const eventLog = new EventLog(settings.eventLogPath);
  const sponsorTarget =
    process.env.WAITLY_SPONSOR_TARGET ||
    config.sponsorTarget ||
    "vitejs/vite";

  const sessionId = crypto.randomUUID();
  const adWindow = await startAdWindowServer({
    sessionId,
    sponsorTarget,
    creatives: () => loadCreatives(projectRoot),
    eventLog,
    openAds: settings.openAds,
    adRotationMs: settings.adRotationMs,
    adWindow: {
      width: settings.adWindowWidth,
      height: settings.adWindowHeight,
      margin: settings.adWindowMargin,
      animationMs: settings.adWindowAnimationMs,
      x: settings.adWindowX,
      y: settings.adWindowY
    }
  });

  const commandMeta = summarizeCommand(wrappedCommand, wrappedArgs);

  eventLog.write("session_started", {
    sessionId,
    sponsorTarget,
    ...commandMeta
  });

  let activeChild = null;
  let activeCleanup = () => {};
  let lastAdAt = 0;
  let adCount = 0;
  let childFinished = false;

  const logEvent = (type, payload = {}) => {
    eventLog.write(type, {
      sessionId,
      reason: payload.reason || type,
      ...payload
    });
  };

  const adState = new AdStateMachine({
    delayMs: settings.adDelayMs,
    openAd: (reason) => {
      const now = Date.now();
      const canOpen =
        !childFinished &&
        adCount < settings.maxAds &&
        now - lastAdAt >= settings.cooldownMs;

      if (!canOpen) {
        logEvent("ad_open_skipped", {
          reason,
          adCount,
          maxAds: settings.maxAds,
          cooldownMs: settings.cooldownMs
        });
        return false;
      }

      const ad = adWindow.showAd({
        creativeIndex: adCount,
        waitDurationMs: settings.adDelayMs,
        reason
      });

      adCount += 1;
      lastAdAt = now;

      if (!settings.openAds) {
        console.error(`[waitly] Sponsored window URL: ${ad.url}`);
      }

      return ad;
    },
    closeAd: (reason) => {
      dismissAdWindow(reason);
    },
    logger: logEvent
  });

  const closeAdWindow = (reason = "wrapped_process_finished") => {
    try {
      adWindow.endSession(reason);
    } catch (_) {
      // Server may already be closed.
    }
  };

  const dismissAdWindow = (reason) => {
    try {
      adWindow.dismissOpenAds(reason);
    } catch (_) {
      // The ad window may already be closed by the browser or session cleanup.
    }
  };

  const finish = ({ code, signal, failure }) => {
    if (childFinished) {
      return;
    }

    childFinished = true;
    activeCleanup();
    adState.forceClose(failure ? "process_error" : "process_exit");

    eventLog.write(failure ? "session_failed" : "session_finished", {
      sessionId,
      exitCode: code,
      signal,
      adsShown: adCount,
      ...commandMeta
    });

    closeAdWindow(failure ? "wrapped_process_failed" : "wrapped_process_finished");
    setTimeout(() => {
      process.exit(process.exitCode || 0);
    }, 1800);
  };

  process.once("SIGINT", () => {
    if (activeChild && typeof activeChild.kill === "function") {
      activeChild.kill("SIGINT");
    }
  });

  process.once("SIGTERM", () => {
    if (activeChild && typeof activeChild.kill === "function") {
      activeChild.kill("SIGTERM");
    }
  });

  await startSelectedObserver();

  async function startSelectedObserver() {
    const observerKind = selectObserverKind({
      command: wrappedCommand,
      args: wrappedArgs,
      settings
    });

    if (observerKind === "appserver") {
      await startAppServerObserver();
      return;
    }

    if (observerKind === "json") {
      startJsonObserver();
      return;
    }

    startScreenObserver();
  }

  async function startAppServerObserver() {
    logEvent("observer_selected", {
      reason: "appserver",
      observer: "appserver",
      detectionMode: settings.detectionMode
    });

    const result = await startCodexAppServerObserver({
      command: wrappedCommand,
      args: wrappedArgs,
      settings,
      cwd: process.cwd(),
      env: process.env,
      streams: {
        stdin: process.stdin,
        stdout: process.stdout,
        stderr: process.stderr
      },
      adState,
      logger: logEvent
    });

    if (result.fallbackReason) {
      logEvent("observer_fallback", {
        reason: result.fallbackReason,
        from: "appserver",
        to: "screen"
      });
      startScreenObserver(result.fallbackReason);
      return;
    }

    attachChild(result.runner, {
      onFallback: (fallback) => {
        if (childFinished) {
          return;
        }

        activeCleanup();
        adState.forceClose(fallback.reason || "observer_fallback");
        logEvent("observer_fallback", {
          reason: fallback.reason || "observer_fallback",
          from: "appserver",
          to: "screen"
        });
        startScreenObserver(fallback.reason || "observer_fallback");
      }
    });
  }

  function startJsonObserver() {
    logEvent("observer_selected", {
      reason: "json",
      observer: "json",
      detectionMode: settings.detectionMode
    });

    const observer = new CodexJsonObserver({
      adState,
      logger: logEvent
    });
    const child = runObservableCommand(wrappedCommand, wrappedArgs, {
      mode: "pipe",
      cwd: process.cwd(),
      env: {
        ...process.env,
        WAITLY_INNER: "1"
      },
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr
    });

    child.on("data", (source, chunk) => {
      observer.observeOutput({ source, chunk });
    });

    attachChild(child);
  }

  function startScreenObserver(fallbackReason = null) {
    logEvent("observer_selected", {
      reason: "screen",
      observer: "screen",
      detectionMode: settings.detectionMode,
      fallbackReason
    });

    const waitObservation = createWaitObservation({
      command: wrappedCommand,
      args: wrappedArgs,
      settings: {
        ...settings,
        detectionMode: "screen"
      },
      streams: {
        stdin: process.stdin,
        stdout: process.stdout
      },
      now: Date.now()
    });
    const waitDetector = waitObservation.detector;
    const child = runObservableCommand(wrappedCommand, wrappedArgs, {
      mode: waitObservation.commandMode,
      cwd: process.cwd(),
      env: {
        ...process.env,
        WAITLY_INNER: "1"
      },
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr
    });

    child.on("data", (source, chunk) => {
      handleScreenEvents(waitDetector.observeOutput({
        source,
        chunk,
        now: Date.now()
      }));
    });

    const detector = setInterval(() => {
      if (childFinished) {
        return;
      }
      handleScreenEvents(waitDetector.check({ now: Date.now() }));
    }, 500);

    attachChild(child, {
      cleanup: () => {
        clearInterval(detector);
        handleScreenEvents(waitDetector.finish({
          source: "process_exit",
          now: Date.now()
        }));
      }
    });
  }

  function attachChild(child, { cleanup = () => {}, onFallback = null } = {}) {
    activeChild = child;
    activeCleanup = cleanup;

    if (typeof child.on === "function" && onFallback) {
      child.on("fallback", onFallback);
    }

    child.on("error", (error) => {
      finish({ code: 127, signal: null, failure: true });
      console.error(`[waitly] Failed to start wrapped command: ${error.message}`);
      process.exitCode = 127;
    });

    child.on("exit", (code, signal) => {
      process.exitCode = code === null ? 1 : code;
      finish({ code, signal, failure: false });
    });
  }

  function handleScreenEvents(events) {
    for (const event of events) {
      if (event.type === "wait_detected") {
        if (event.reason === "ai_thinking_status") {
          logEvent("screen_status_detected", {
            reason: event.reason
          });
        }

        if (event.reason === "idle_output_silence") {
          logEvent("screen_idle_detected", {
            reason: event.reason
          });
        }

        adState.scheduleOpen(event.reason || "screen_wait_detected");
      }

      if (event.type === "wait_ended") {
        adState.close(event.source || "screen_wait_ended");
      }

      if (event.type === "wait_suppressed" && event.reason === "interactive_prompt") {
        logEvent("screen_prompt_detected", {
          reason: event.reason,
          source: event.source
        });
      }

      const { type, ...payload } = event;
      eventLog.write(type, {
        sessionId,
        ...payload
      });
    }
  }
}

async function runCodexShortcut(codexArgs) {
  applyCodexShortcutDefaults();

  const settings = loadSettings(projectRoot);
  const report = inspectCodexDoctor({
    commandName: "codex",
    settings,
    waitlyBinPath: __filename
  });

  if (!report.realCodexPath || !report.realCodexExists || !report.realCodexIsAbsolute) {
    console.error("Cannot find real Codex path.");
    console.error("Run: waitly doctor codex");
    process.exit(1);
  }

  if (normalizePath(report.realCodexPath) === normalizePath(report.shimPath)) {
    console.error("Cannot use Waitly shim as the real Codex path.");
    console.error("Run: waitly doctor codex");
    process.exit(1);
  }

  if (isDebugEnabled()) {
    console.error(`[waitly] Launching Codex through Waitly: ${report.realCodexPath}`);
  }

  await runWrappedCommand([report.realCodexPath, ...codexArgs]);
}

function applyCodexShortcutDefaults() {
  if (!process.env.WAITLY_DETECTION_MODE) {
    process.env.WAITLY_DETECTION_MODE = "auto";
  }

  if (!process.env.WAITLY_AD_DELAY_MS) {
    process.env.WAITLY_AD_DELAY_MS = "2000";
  }
}

async function runPassthroughOnly(command, args) {
  const child = childProcess.spawn(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32"
  });

  child.on("error", (error) => {
    console.error(`[waitly] Failed to start wrapped command: ${error.message}`);
    process.exitCode = 127;
  });

  child.on("exit", (code) => {
    process.exitCode = code === null ? 1 : code;
  });
}

async function previewAd() {
  const settings = loadSettings(projectRoot);
  const eventLog = new EventLog(settings.eventLogPath);
  const config = readConfig(settings);
  const sponsorTarget =
    process.env.WAITLY_SPONSOR_TARGET ||
    config.sponsorTarget ||
    "vitejs/vite";

  const sessionId = crypto.randomUUID();
  const adWindow = await startAdWindowServer({
    sessionId,
    sponsorTarget,
    creatives: () => loadCreatives(projectRoot),
    eventLog,
    openAds: settings.openAds,
    adRotationMs: settings.adRotationMs,
    adWindow: {
      width: settings.adWindowWidth,
      height: settings.adWindowHeight,
      margin: settings.adWindowMargin,
      animationMs: settings.adWindowAnimationMs,
      x: settings.adWindowX,
      y: settings.adWindowY
    }
  });

  const ad = adWindow.showAd({
    creativeIndex: 0,
    waitDurationMs: 0,
    reason: "manual_preview"
  });

  if (!settings.openAds) {
    console.error(`[waitly] Sponsored window URL: ${ad.url}`);
  }

  console.error(`[waitly] Preview server: ${ad.url}`);
  console.error("[waitly] Press Ctrl+C to stop.");

  process.on("SIGINT", () => {
    adWindow.closeNow();
    process.exit(0);
  });
}

function showStatus() {
  const settings = loadSettings(projectRoot);
  const config = readConfig(settings);
  const adAvailability = resolveAdAvailability(settings, config);
  const sponsorTarget =
    process.env.WAITLY_SPONSOR_TARGET ||
    config.sponsorTarget ||
    "vitejs/vite";

  console.log(`Waitly version: ${packageInfo.version}`);
  console.log(`Waitly ads: ${formatAvailability(adAvailability)}`);
  console.log(`Config: ${settings.configPath}`);
  console.log(`Event log: ${settings.eventLogPath}`);
  console.log(`Sponsor target: ${sponsorTarget}`);
}

async function doctor(args) {
  const target = args[0] || "codex";
  if (target !== "codex") {
    console.error(`[waitly] Unsupported doctor target: ${target}`);
    process.exit(1);
  }

  const settings = loadSettings(projectRoot);
  const report = await runCodexDoctor({
    commandName: target,
    settings,
    waitlyBinPath: __filename
  });

  console.log(formatCodexDoctor(report));
}

function pauseAds(args) {
  const settings = loadSettings(projectRoot);
  const config = readConfig(settings);
  const pauseUntil = resolvePauseArgument(args);

  config.disabled = false;
  config.adsDisabled = false;
  config.pauseUntil = pauseUntil;
  delete config.adsPausedUntil;

  writeConfig(settings, config);
  console.log(`Waitly ads paused until ${pauseUntil}`);
  console.log(`Config: ${settings.configPath}`);
}

function disableAds() {
  const settings = loadSettings(projectRoot);
  const config = readConfig(settings);

  config.disabled = true;
  delete config.adsDisabled;

  writeConfig(settings, config);
  console.log("Waitly ads disabled");
  console.log(`Config: ${settings.configPath}`);
}

function enableAds() {
  const settings = loadSettings(projectRoot);
  const config = readConfig(settings);

  config.disabled = false;
  config.adsDisabled = false;
  delete config.pauseUntil;
  delete config.adsPausedUntil;

  writeConfig(settings, config);
  console.log("Waitly ads enabled");
  console.log(`Config: ${settings.configPath}`);
}

function installShim(args) {
  let parsed;
  try {
    parsed = parseInstallShimArgs(args);
  } catch (error) {
    console.error(`[waitly] ${error.message}`);
    process.exit(1);
  }

  const settings = loadSettings(projectRoot);

  try {
    const shim = installCommandShim({
      commandName: parsed.commandName,
      targetCommand: parsed.targetCommand,
      settings,
      waitlyBinPath: __filename
    });

    console.log(`Waitly shim installed for ${shim.commandName}`);
    console.log(`Shim: ${shim.shimPath}`);
    console.log(`Target: ${shim.targetCommand}`);
    console.log(`Add this directory to the front of PATH: ${shim.shimDir}`);
  } catch (error) {
    console.error(`[waitly] ${error.message}`);
    process.exit(1);
  }
}

function parseInstallShimArgs(args) {
  const commandName = args[0];
  if (!commandName) {
    throw new Error("Missing shim command. Example: waitly install-shim codex");
  }

  let targetCommand = null;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target") {
      targetCommand = args[index + 1];
      index += 1;
      if (!targetCommand) {
        throw new Error("Missing --target value");
      }
      continue;
    }

    throw new Error(`Unknown install-shim option: ${arg}`);
  }

  return { commandName, targetCommand };
}

function resolvePauseArgument(args) {
  let raw = args.join(" ").trim();

  if (!raw) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }

  if (args[0] === "until") {
    raw = args.slice(1).join(" ").trim();
  }

  if (args[0] === "--until") {
    raw = args.slice(1).join(" ").trim();
  }

  if (!raw) {
    throw new Error("Missing pause time. Example: waitly pause 1h");
  }

  const durationMs = parseDuration(raw);
  const pauseUntilMs = durationMs === null
    ? parsePauseUntil(raw)
    : Date.now() + durationMs;

  if (pauseUntilMs === null) {
    throw new Error(`Invalid pause value: ${raw}`);
  }

  return new Date(pauseUntilMs).toISOString();
}

function parseDuration(value) {
  const match = /^(\d+)(ms|s|m|h|d)$/i.exec(value.trim());
  if (!match) {
    return null;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

function formatAvailability(adAvailability) {
  if (!adAvailability.disabled) {
    return "enabled";
  }

  if (adAvailability.reason === "paused") {
    return `paused until ${adAvailability.pauseUntil}`;
  }

  return "disabled";
}

function normalizePath(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function isDebugEnabled() {
  return process.env.WAITLY_DEBUG === "1" ||
    String(process.env.WAITLY_LOG_LEVEL || "").toLowerCase() === "debug";
}

function summarizeCommand(command, args) {
  return {
    wrappedCommand: path.basename(command),
    wrappedArgCount: args.length
  };
}

function printVersion() {
  console.log(`Waitly ${packageInfo.version}`);
}

function printHelp() {
  console.log(`Waitly core ad-display prototype

Usage:
  waitly version                 Show the installed Waitly version
  waitly codex [...args]         Launch Codex through Waitly using the installed shim target
  waitly run <command> [args...]  Wrap an AI CLI and show a sponsored window during wait time
  waitly preview-ad              Open a sponsored window without running a CLI
  waitly status                  Show current ad control state
  waitly doctor codex            Diagnose Codex shim and observer selection
  waitly pause [1h|until <time>] Pause sponsored windows outside the ad popup
  waitly disable                 Disable sponsored windows
  waitly enable                  Enable sponsored windows and clear pauses
  waitly install-shim codex      Create a PATH shim that routes codex through Waitly

Environment:
  WAITLY_DISABLED=1              Disable ad display and run the command directly
  WAITLY_PAUSE_UNTIL             Disable ad display until an ISO timestamp or epoch ms
  WAITLY_IDLE_MS=15000           Silence threshold before wait detection
  WAITLY_INPUT_PROMPT_GRACE_MS=90000
                                  Suppress ads after CLI input/confirmation prompts
  WAITLY_THINKING_AD_DELAY_MS=0
                                  Thinking/reasoning status duration before ad display
  WAITLY_DETECTION_MODE=auto     Detection source: auto, appserver, json, or screen
  WAITLY_AD_DELAY_MS=2000        Delay before opening a scheduled sponsored window
  WAITLY_AD_COOLDOWN_MS=0        Minimum time between ads
  WAITLY_MAX_ADS=999             Max ads per wrapped session
  WAITLY_AD_ROTATION_MS=8000     Rotate creative inside the popup
  WAITLY_AD_WINDOW_WIDTH=320     Sponsored window width
  WAITLY_AD_WINDOW_HEIGHT=430    Sponsored window height
  WAITLY_AD_WINDOW_MARGIN=0      Bottom/right screen margin
  WAITLY_AD_WINDOW_ANIMATION_MS=450
                                  Slide-up animation duration
  WAITLY_AD_WINDOW_X             Optional fixed window X position
  WAITLY_AD_WINDOW_Y             Optional fixed window Y position
  WAITLY_OPEN_AD=0               Print the ad URL instead of opening a browser
  WAITLY_SPONSOR_TARGET=vitejs/vite
  WAITLY_HOME=~/.waitly
`);
}
