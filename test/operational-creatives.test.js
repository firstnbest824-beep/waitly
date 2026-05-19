const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { defaultState } = require("../lib/pilot-api");
const { loadCreatives } = require("../lib/creatives");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-operational-creatives-"));
const statePath = path.join(tempDir, "pilot-state.json");
const previousDataPath = process.env.WAITLY_PILOT_DATA;

try {
  const state = defaultState();
  state.sponsors.push({
    id: "spn_acme",
    name: "Acme Cloud",
    category: "cloud",
    status: "approved",
    createdAt: "2026-04-25T08:00:00.000Z"
  });
  state.creatives.push({
    id: "crv_acme",
    sponsorId: "spn_acme",
    headline: "Local AI infra credits",
    body: "Credits for developers running AI coding agents.",
    cta: "Open",
    destinationUrl: "https://example.com/waitly",
    category: "cloud",
    status: "approved",
    imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    imageAlt: "Acme Cloud ad",
    createdAt: "2026-04-25T08:01:00.000Z"
  });
  state.campaigns.push({
    id: "cmp_acme",
    sponsorId: "spn_acme",
    creativeId: "crv_acme",
    budgetMinor: 50000,
    rateMinor: 15,
    currency: "USD",
    status: "active",
    createdAt: "2026-04-25T08:02:00.000Z"
  });

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  process.env.WAITLY_PILOT_DATA = statePath;

  const creatives = loadCreatives(path.resolve(__dirname, ".."));
  assert.equal(creatives[0].id, "crv_acme");
  assert.equal(creatives[0].campaignId, "cmp_acme");
  assert.equal(creatives[0].sponsorId, "spn_acme");
  assert.equal(creatives[0].sponsor, "Acme Cloud");
  assert.equal(creatives[0].url, "https://example.com/waitly");
  assert.equal(creatives[0].imageDataUrl, "data:image/png;base64,iVBORw0KGgo=");

  console.log("ok - operational campaigns feed the ad creative loader");
} finally {
  if (previousDataPath === undefined) {
    delete process.env.WAITLY_PILOT_DATA;
  } else {
    process.env.WAITLY_PILOT_DATA = previousDataPath;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
