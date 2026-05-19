#!/usr/bin/env node

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");

const { startAdWindowServer } = require("../lib/ad-window-server");
const { loadCreatives } = require("../lib/creatives");
const { EventLog } = require("../lib/event-log");
const {
  loadSettings,
  parsePauseUntil,
  readConfig,
  resolveAdAvailability,
  writeConfig
} = require("../lib/settings");
const { WaitDetector } = require("../lib/wait-detector");
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

  if (command === "preview-ad") {
    await previewAd();
    return;
  }

  if (command === "status") {
    showStatus();
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

  const waitDetector = new WaitDetector({
    idleMs: settings.idleMs,
    inputPromptGraceMs: settings.inputPromptGraceMs,
    now: Date.now()
  });
  let adShownForCurrentWait = false;
  let lastAdAt = 0;
  let adCount = 0;
  let childFinished = false;

  const child = childProcess.spawn(wrappedCommand, wrappedArgs, {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
    shell: process.platform === "win32"
  });

  const closeAdWindow = () => {
    try {
      adWindow.endSession("wrapped_process_finished");
    } catch (_) {
      // Server may already be closed.
    }
  };

  const markActivity = (source, chunk) => {
    const now = Date.now();
    handleDetectorEvents(waitDetector.observeOutput({ source, chunk, now }));
  };

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    markActivity("stdout", chunk);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    markActivity("stderr", chunk);
  });

  const detector = setInterval(() => {
    if (childFinished) {
      return;
    }

    const now = Date.now();

    handleDetectorEvents(waitDetector.check({ now }));

    const canShowAd =
      waitDetector.isWaiting() &&
      !adShownForCurrentWait &&
      adCount < settings.maxAds &&
      now - lastAdAt >= settings.cooldownMs;

    if (!canShowAd) {
      return;
    }

    const waitDurationMs = now - waitDetector.getWaitStartedAt();
    const ad = adWindow.showAd({
      creativeIndex: adCount,
      waitDurationMs,
      reason: "idle_output_silence"
    });

    adCount += 1;
    adShownForCurrentWait = true;
    lastAdAt = now;

    if (!settings.openAds) {
      console.error(`[waitly] Sponsored window URL: ${ad.url}`);
    }
  }, 500);

  const finish = ({ code, signal, failure }) => {
    childFinished = true;
    clearInterval(detector);

    handleDetectorEvents(waitDetector.finish({
      source: failure ? "process_error" : "process_exit",
      now: Date.now()
    }));

    eventLog.write(failure ? "session_failed" : "session_finished", {
      sessionId,
      exitCode: code,
      signal,
      adsShown: adCount,
      ...commandMeta
    });

    closeAdWindow();
  };

  child.on("error", (error) => {
    finish({ code: 127, signal: null, failure: true });
    console.error(`[waitly] Failed to start wrapped command: ${error.message}`);
    process.exitCode = 127;
  });

  child.on("exit", (code, signal) => {
    finish({ code, signal, failure: false });
    process.exitCode = code === null ? 1 : code;
  });

  process.once("SIGINT", () => {
    child.kill("SIGINT");
  });

  process.once("SIGTERM", () => {
    child.kill("SIGTERM");
  });

  function handleDetectorEvents(events) {
    for (const event of events) {
      if (event.type === "wait_detected") {
        adShownForCurrentWait = false;
      }

      if (event.type === "wait_ended") {
        adShownForCurrentWait = false;
      }

      const { type, ...payload } = event;
      eventLog.write(type, {
        sessionId,
        ...payload
      });
    }
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
  waitly run <command> [args...]  Wrap an AI CLI and show a sponsored window during wait time
  waitly preview-ad              Open a sponsored window without running a CLI
  waitly status                  Show current ad control state
  waitly pause [1h|until <time>] Pause sponsored windows outside the ad popup
  waitly disable                 Disable sponsored windows
  waitly enable                  Enable sponsored windows and clear pauses

Environment:
  WAITLY_DISABLED=1              Disable ad display and run the command directly
  WAITLY_PAUSE_UNTIL             Disable ad display until an ISO timestamp or epoch ms
  WAITLY_IDLE_MS=15000           Silence threshold before wait detection
  WAITLY_INPUT_PROMPT_GRACE_MS=90000
                                  Suppress ads after CLI input/confirmation prompts
  WAITLY_AD_COOLDOWN_MS=120000   Minimum time between ads
  WAITLY_MAX_ADS=3               Max ads per wrapped session
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
