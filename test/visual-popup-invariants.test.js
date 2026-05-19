const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const failures = [];
const tests = [];

const adWindowSourcePath = path.join(__dirname, "..", "lib", "ad-window-server.js");
const adWindowSource = fs.readFileSync(adWindowSourcePath, "utf8");
const adPageSource = sliceBetween(
  adWindowSource,
  "function renderAdPage",
  "function readJsonBody"
);

test("ad page source preserves WP2 visual invariants", () => {
  const linkTags = adPageSource.match(/<a\b[^>]*>/gi) || [];
  const forbiddenControls = adPageSource.match(/<(button|input|select|textarea)\b/gi) || [];

  assert.match(adPageSource, /<strong>Waitly<\/strong>/);
  assert.match(adPageSource, /AI wait sponsor ad/);
  assert.match(adPageSource, /<img class="mark" src="\/favicon\.png" alt="">/);
  assert.match(adPageSource, /<span class="label">Sponsored<\/span>/);
  assert.match(adPageSource, /animation: rise-in 420ms/);
  assert.match(adPageSource, /\.body::after/);
  assert.match(adPageSource, /height: 100vh/);
  assert.match(adPageSource, /object-fit: cover/);
  assert.match(adPageSource, /@keyframes rise-in/);
  assert.match(adPageSource, /transform: translateY\(26px\)/);
  assert.match(adPageSource, /data-rotation-strip/);
  assert.match(adPageSource, /send\("rotation_impression"\)/);
  assert.match(adPageSource, /send\("auto_close"\)/);
  assert.match(adPageSource, /window.close\(\)/);

  assert.deepEqual(forbiddenControls, []);
  assert.equal(linkTags.length, 1);
  assert.match(linkTags[0], /data-click/);
  assert.match(linkTags[0], /data-creative-cta/);
  assert.doesNotMatch(adPageSource, /data-(close|pause|disable)\b/i);
});

test("ad_opened event keeps WP2 placement evidence fields", () => {
  const requiredFields = [
    "openMode",
    "placement",
    "windowWidth",
    "windowHeight",
    "windowX",
    "windowY",
    "windowRightGap",
    "windowBottomGap",
    "windowMargin",
    "popupPid",
    "animationMs",
    "rotationMs",
    "rotationCount"
  ];

  for (const field of requiredFields) {
    assert.match(adWindowSource, new RegExp(`${field}:`));
  }
});

test("ad event normalization keeps rotation and auto-close evidence events", () => {
  assert.match(adWindowSource, /"rotation_impression"/);
  assert.match(adWindowSource, /"auto_close"/);
  assert.match(adWindowSource, /`ad_\$\{event\}`/);
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  assert.notEqual(start, -1, `Could not find ${startMarker}`);
  assert.notEqual(end, -1, `Could not find ${endMarker}`);
  assert.ok(end > start, `${endMarker} must appear after ${startMarker}`);

  return source.slice(start, end);
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
