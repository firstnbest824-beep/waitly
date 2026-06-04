const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  loadSettings,
  parsePauseUntil,
  readConfig,
  resolveAdAvailability
} = require("../lib/settings");

const failures = [];
const tests = [];
const NOW = new Date("2026-04-25T12:00:00.000Z");
const FUTURE = "2026-04-25T12:30:00.000Z";
const EXPIRED = "2026-04-25T11:59:59.000Z";

test("WAITLY_PAUSE_UNTIL parses through settings and pauses ad availability", () => {
  withWaitlyEnv({
    WAITLY_PAUSE_UNTIL: FUTURE,
    WAITLY_DISABLED: undefined
  }, () => {
    const settings = loadSettings("/tmp/waitly-project");
    const availability = resolveAdAvailability(settings, {}, NOW);

    assert.equal(settings.pauseUntil, FUTURE);
    assert.deepEqual(availability, {
      disabled: true,
      reason: "paused",
      pauseUntil: FUTURE
    });
  });
});

test("config pauseUntil pauses ad availability when no env pause is set", () => {
  withTempConfig({ pauseUntil: FUTURE }, (settings) => {
    const availability = resolveAdAvailability(settings, readConfig(settings), NOW);

    assert.deepEqual(availability, {
      disabled: true,
      reason: "paused",
      pauseUntil: FUTURE
    });
  });
});

test("config adsPausedUntil pauses ad availability as a fallback field", () => {
  withTempConfig({ adsPausedUntil: Date.parse(FUTURE) }, (settings) => {
    const availability = resolveAdAvailability(settings, readConfig(settings), NOW);

    assert.deepEqual(availability, {
      disabled: true,
      reason: "paused",
      pauseUntil: FUTURE
    });
  });
});

test("disabled true disables ad availability from env or config", () => {
  withWaitlyEnv({
    WAITLY_DISABLED: "1",
    WAITLY_PAUSE_UNTIL: undefined
  }, () => {
    const settings = loadSettings("/tmp/waitly-project");
    assert.equal(settings.disabled, true);
    assert.deepEqual(resolveAdAvailability(settings, {}, NOW), {
      disabled: true,
      reason: "disabled"
    });
  });

  withTempConfig({ disabled: true }, (settings) => {
    assert.deepEqual(resolveAdAvailability(settings, readConfig(settings), NOW), {
      disabled: true,
      reason: "disabled"
    });
  });

  withTempConfig({ adsDisabled: true }, (settings) => {
    assert.deepEqual(resolveAdAvailability(settings, readConfig(settings), NOW), {
      disabled: true,
      reason: "disabled"
    });
  });
});

test("expired pause values do not disable ad availability", () => {
  withTempConfig({ pauseUntil: EXPIRED }, (settings) => {
    assert.deepEqual(resolveAdAvailability(settings, readConfig(settings), NOW), {
      disabled: false
    });
  });

  withWaitlyEnv({
    WAITLY_PAUSE_UNTIL: EXPIRED,
    WAITLY_DISABLED: undefined
  }, () => {
    const settings = loadSettings("/tmp/waitly-project");
    assert.deepEqual(resolveAdAvailability(settings, {}, NOW), {
      disabled: false
    });
  });
});

test("invalid pause values are ignored", () => {
  assert.equal(parsePauseUntil("not-a-date"), null);
  assert.equal(parsePauseUntil("123abc"), null);
  assert.equal(parsePauseUntil({ pauseUntil: FUTURE }), null);

  withTempConfig({ pauseUntil: "not-a-date" }, (settings) => {
    assert.deepEqual(resolveAdAvailability(settings, readConfig(settings), NOW), {
      disabled: false
    });
  });
});

test("pause parser accepts ISO strings, epoch milliseconds, and numeric strings", () => {
  const futureMs = Date.parse(FUTURE);

  assert.equal(parsePauseUntil(FUTURE), futureMs);
  assert.equal(parsePauseUntil(futureMs), futureMs);
  assert.equal(parsePauseUntil(String(futureMs)), futureMs);
  assert.equal(parsePauseUntil(""), null);
  assert.equal(parsePauseUntil(null), null);
});

test("command mode defaults to auto and accepts explicit pipe or pty", () => {
  withWaitlyEnv({ WAITLY_COMMAND_MODE: undefined }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").commandMode, "auto");
  });

  withWaitlyEnv({ WAITLY_COMMAND_MODE: "pipe" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").commandMode, "pipe");
  });

  withWaitlyEnv({ WAITLY_COMMAND_MODE: "pty" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").commandMode, "pty");
  });

  withWaitlyEnv({ WAITLY_COMMAND_MODE: "invalid" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").commandMode, "auto");
  });
});

test("thinking ad delay defaults and accepts zero for immediate display", () => {
  withWaitlyEnv({ WAITLY_THINKING_AD_DELAY_MS: undefined }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").thinkingAdDelayMs, 0);
  });

  withWaitlyEnv({ WAITLY_THINKING_AD_DELAY_MS: "0" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").thinkingAdDelayMs, 0);
  });

  withWaitlyEnv({ WAITLY_THINKING_AD_DELAY_MS: "2500" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").thinkingAdDelayMs, 2500);
  });
});

test("ad open delay defaults to two seconds and accepts zero", () => {
  withWaitlyEnv({ WAITLY_AD_DELAY_MS: undefined }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").adDelayMs, 2000);
  });

  withWaitlyEnv({ WAITLY_AD_DELAY_MS: "0" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").adDelayMs, 0);
  });
});

test("ad frequency defaults allow one ad per detected reasoning window", () => {
  withWaitlyEnv({
    WAITLY_AD_COOLDOWN_MS: undefined,
    WAITLY_MAX_ADS: undefined
  }, () => {
    const settings = loadSettings("/tmp/waitly-project");
    assert.equal(settings.cooldownMs, 0);
    assert.equal(settings.maxAds, 999);
  });
});

test("detection mode defaults to auto and accepts explicit observers", () => {
  withWaitlyEnv({ WAITLY_DETECTION_MODE: undefined }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").detectionMode, "auto");
  });

  withWaitlyEnv({ WAITLY_DETECTION_MODE: "json" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").detectionMode, "json");
  });

  withWaitlyEnv({ WAITLY_DETECTION_MODE: "appserver" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").detectionMode, "appserver");
  });

  withWaitlyEnv({ WAITLY_DETECTION_MODE: "screen" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").detectionMode, "screen");
  });

  withWaitlyEnv({ WAITLY_DETECTION_MODE: "invalid" }, () => {
    assert.equal(loadSettings("/tmp/waitly-project").detectionMode, "auto");
  });
});

function withTempConfig(config, fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-settings-pause-test-"));
  const configPath = path.join(tempDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config), "utf8");

  try {
    withWaitlyEnv({
      WAITLY_HOME: tempDir,
      WAITLY_CONFIG: configPath,
      WAITLY_EVENT_LOG: path.join(tempDir, "events.jsonl"),
      WAITLY_PAUSE_UNTIL: undefined,
      WAITLY_DISABLED: undefined
    }, () => {
      fn(loadSettings("/tmp/waitly-project"));
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function withWaitlyEnv(overrides, fn) {
  const keys = new Set([
    "WAITLY_HOME",
    "WAITLY_CONFIG",
    "WAITLY_EVENT_LOG",
    "WAITLY_PAUSE_UNTIL",
    "WAITLY_DISABLED",
    "WAITLY_COMMAND_MODE",
    "WAITLY_THINKING_AD_DELAY_MS",
    "WAITLY_AD_DELAY_MS",
    "WAITLY_DETECTION_MODE"
  ]);

  for (const key of Object.keys(overrides)) {
    keys.add(key);
  }

  const previous = {};
  for (const key of keys) {
    previous[key] = process.env[key];
  }

  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    fn();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
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
