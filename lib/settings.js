const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function loadSettings(projectRoot) {
  const waitlyHome = process.env.WAITLY_HOME || path.join(os.homedir(), ".waitly");

  return {
    projectRoot,
    waitlyHome,
    configPath: process.env.WAITLY_CONFIG || path.join(waitlyHome, "config.json"),
    eventLogPath: process.env.WAITLY_EVENT_LOG || path.join(waitlyHome, "events.jsonl"),
    idleMs: numberFromEnv("WAITLY_IDLE_MS", 15000),
    inputPromptGraceMs: numberFromEnv("WAITLY_INPUT_PROMPT_GRACE_MS", 90000),
    cooldownMs: numberFromEnv("WAITLY_AD_COOLDOWN_MS", 120000),
    maxAds: numberFromEnv("WAITLY_MAX_ADS", 3),
    adRotationMs: numberFromEnv("WAITLY_AD_ROTATION_MS", 8000),
    adWindowWidth: numberFromEnv("WAITLY_AD_WINDOW_WIDTH", 320),
    adWindowHeight: numberFromEnv("WAITLY_AD_WINDOW_HEIGHT", 430),
    adWindowMargin: numberFromEnv("WAITLY_AD_WINDOW_MARGIN", 0, { allowZero: true }),
    adWindowAnimationMs: numberFromEnv("WAITLY_AD_WINDOW_ANIMATION_MS", 450),
    adWindowX: optionalNumberFromEnv("WAITLY_AD_WINDOW_X"),
    adWindowY: optionalNumberFromEnv("WAITLY_AD_WINDOW_Y"),
    openAds: process.env.WAITLY_OPEN_AD !== "0",
    pauseUntil: process.env.WAITLY_PAUSE_UNTIL || "",
    disabled: process.env.WAITLY_DISABLED === "1"
  };
}

function readConfig(settings) {
  try {
    return JSON.parse(fs.readFileSync(settings.configPath, "utf8"));
  } catch (_) {
    return {};
  }
}

function writeConfig(settings, config) {
  fs.mkdirSync(path.dirname(settings.configPath), { recursive: true });
  fs.writeFileSync(settings.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function numberFromEnv(name, fallback, options = {}) {
  const value = Number.parseInt(process.env[name] || "", 10);
  const min = options.allowZero ? 0 : 1;
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function optionalNumberFromEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return null;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function resolveAdAvailability(settings, config = {}, now = new Date()) {
  if (settings.disabled || config.disabled === true || config.adsDisabled === true) {
    return { disabled: true, reason: "disabled" };
  }

  const pauseUntil = settings.pauseUntil || config.pauseUntil || config.adsPausedUntil;
  const pauseUntilMs = parsePauseUntil(pauseUntil);

  if (pauseUntilMs !== null && pauseUntilMs > now.getTime()) {
    return {
      disabled: true,
      reason: "paused",
      pauseUntil: new Date(pauseUntilMs).toISOString()
    };
  }

  return { disabled: false };
}

function parsePauseUntil(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

module.exports = {
  loadSettings,
  readConfig,
  writeConfig,
  resolveAdAvailability,
  parsePauseUntil,
  numberFromEnv,
  optionalNumberFromEnv
};
