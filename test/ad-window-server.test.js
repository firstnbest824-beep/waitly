const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { startAdWindowServer } = require("../lib/ad-window-server");
const { EventLog } = require("../lib/event-log");

const failures = [];
const tests = [];

test("ad-window server records open and shutdown lifecycle with openAds disabled", async () => {
  const sessionId = "qa-lifecycle-session";
  const sponsorTarget = "QA sponsor target";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-ad-window-test-"));
  const eventPath = path.join(tempDir, "events.jsonl");
  let adWindow = null;

  try {
    adWindow = await startAdWindowServer({
      sessionId,
      sponsorTarget,
      creatives: testCreatives(),
      eventLog: new EventLog(eventPath),
      openAds: false,
      adRotationMs: 1200,
      adWindow: {
        width: 300,
        height: 420,
        margin: 8,
        animationMs: 0,
        x: null,
        y: null
      }
    });

    const initialState = await getJson(`${adWindow.baseUrl}/state`);
    assert.equal(initialState.ok, true);
    assert.equal(initialState.sessionId, sessionId);
    assert.equal(initialState.active, true);
    assert.equal(initialState.shutdownReason, null);

    const ad = adWindow.showAd({
      creativeIndex: 1,
      waitDurationMs: 2500,
      reason: "qa_wait_detected"
    });

    assert.equal(ad.creative.id, "creative-b");
    assert.match(ad.url, /^http:\/\/127\.0\.0\.1:\d+\/ad\?adId=/);

    const openedRecords = readRecords(eventPath);
    assert.equal(openedRecords.length, 1);
    assert.equal(openedRecords[0].type, "ad_opened");
    assert.equal(openedRecords[0].sessionId, sessionId);
    assert.equal(openedRecords[0].adId, ad.adId);
    assert.equal(openedRecords[0].creativeId, "creative-b");
    assert.equal(openedRecords[0].sponsorTarget, sponsorTarget);
    assert.equal(openedRecords[0].waitDurationMs, 2500);
    assert.equal(openedRecords[0].reason, "qa_wait_detected");
    assert.equal(openedRecords[0].openMode, "printed");
    assert.equal(openedRecords[0].windowWidth, 300);
    assert.equal(openedRecords[0].windowHeight, 420);
    assert.equal(openedRecords[0].rotationMs, 1200);
    assert.equal(openedRecords[0].rotationCount, 2);

    const activeState = await getJson(`${adWindow.baseUrl}/state`);
    assert.equal(activeState.active, true);
    assert.equal(activeState.shutdownReason, null);

    adWindow.endSession("qa_session_finished");

    const shutdownRecords = readRecords(eventPath);
    assert.deepEqual(shutdownRecords.map((record) => record.type), [
      "ad_opened",
      "ad_window_shutdown_requested"
    ]);
    assert.equal(shutdownRecords[1].sessionId, sessionId);
    assert.equal(shutdownRecords[1].reason, "qa_session_finished");
    assert.equal(shutdownRecords[1].openAds, 1);

    const shutdownState = await getJsonOrClosed(`${adWindow.baseUrl}/state`);
    if (shutdownState.closed) {
      assert.match(shutdownState.code, /^(ECONNREFUSED|ECONNRESET)$/);
    } else {
      assert.equal(shutdownState.active, false);
      assert.equal(shutdownState.shutdownReason, "qa_session_finished");
    }
  } finally {
    if (adWindow) {
      adWindow.closeNow();
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function testCreatives() {
  return [
    {
      id: "creative-a",
      headline: "A headline",
      body: "A body",
      sponsor: "Waitly",
      cta: "Open",
      url: "https://example.com/a",
      imageDataUrl: "",
      imageAlt: ""
    },
    {
      id: "creative-b",
      headline: "B headline",
      body: "B body",
      sponsor: "Waitly",
      cta: "Open",
      url: "https://example.com/b",
      imageDataUrl: "",
      imageAlt: ""
    }
  ];
}

function readRecords(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, {
      agent: false,
      headers: {
        Connection: "close"
      }
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`GET ${url} returned ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
  });
}

async function getJsonOrClosed(url) {
  try {
    return await getJson(url);
  } catch (error) {
    if (error && (error.code === "ECONNREFUSED" || error.code === "ECONNRESET")) {
      return {
        closed: true,
        code: error.code
      };
    }
    throw error;
  }
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
