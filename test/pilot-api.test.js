const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { createPilotApi } = require("../lib/pilot-api");

const failures = [];
const tests = [];

test("auth session, dashboard, and settings version conflict work", async () => {
  await withServer(async (client) => {
    const signup = await client.post("/v1/auth/signup", {
      email: "pilot@example.com",
      displayName: "Pilot User"
    });
    assert.equal(signup.status, 200);
    assert.equal(signup.body.user.role, "user");
    assert.ok(client.cookie.includes("waitly_session="));

    const session = await client.get("/v1/session");
    assert.equal(session.body.signedIn, true);
    assert.equal(session.body.user.email, "pilot@example.com");

    const settings = await client.get("/v1/me/settings");
    assert.equal(settings.status, 200);
    assert.equal(settings.body.sponsorTargetId, "vitejs/vite");

    const updated = await client.patch("/v1/me/settings", {
      version: settings.body.version,
      sponsorTargetId: "pytorch/pytorch",
      activeRouteId: "pytorch/pytorch",
      syncEnabled: true
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.version, settings.body.version + 1);
    assert.equal(updated.body.sponsorTargetId, "pytorch/pytorch");

    const stale = await client.patch("/v1/me/settings", {
      version: settings.body.version,
      sponsorTargetId: "oss-security-fund"
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "version_conflict");

    const dashboard = await client.get("/v1/me/dashboard");
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.activeRoute.sponsorTargetId, "pytorch/pytorch");
  });
});

test("device link code links one install exactly once", async () => {
  await withServer(async (client) => {
    await client.post("/v1/auth/signup", {
      email: "linker@example.com"
    });

    const code = await client.post("/v1/me/link-codes", {});
    assert.equal(code.status, 200);
    assert.match(code.body.code, /^[A-F0-9]{8}$/);

    const linked = await client.post("/v1/install-links/consume", {
      code: code.body.code,
      installId: "install-alpha",
      appVersion: "0.1.0",
      osFamily: "linux",
      osArch: "x64"
    }, { useCookie: false });
    assert.equal(linked.status, 200);
    assert.equal(linked.body.installation.installId, "install-alpha");

    const reused = await client.post("/v1/install-links/consume", {
      code: code.body.code,
      installId: "install-beta"
    }, { useCookie: false });
    assert.equal(reused.status, 400);
    assert.equal(reused.body.error, "invalid_or_expired_code");

    const installations = await client.get("/v1/me/installations");
    assert.equal(installations.body.installations.length, 1);
    assert.equal(installations.body.installations[0].installId, "install-alpha");
  });
});

test("event ingestion rejects prohibited fields and creates content-free ledger entries", async () => {
  await withServer(async (client) => {
    await client.post("/v1/auth/signup", {
      email: "ledger@example.com"
    });
    const code = await client.post("/v1/me/link-codes", {});
    await client.post("/v1/install-links/consume", {
      code: code.body.code,
      installId: "install-ledger"
    }, { useCookie: false });

    const rejected = await client.post("/v1/events/ingest", {
      eventId: "evt-bad",
      installId: "install-ledger",
      type: "ad_impression",
      prompt: "do not store this"
    }, { useCookie: false });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, "prohibited_field");

    const impression = await client.post("/v1/events/ingest", {
      eventId: "evt-good",
      installId: "install-ledger",
      type: "ad_impression",
      campaignId: "cmp-demo",
      creativeId: "creative-demo",
      sponsorId: "sponsor-demo",
      donationTargetId: "vitejs/vite",
      waitDurationMs: 18000
    }, { useCookie: false });
    assert.equal(impression.status, 201);
    assert.equal(impression.body.ledgerEntry.status, "pending");
    assert.equal(impression.body.ledgerEntry.amountMinor, 12);

    const duplicate = await client.post("/v1/events/ingest", {
      eventId: "evt-good",
      installId: "install-ledger",
      type: "ad_impression"
    }, { useCookie: false });
    assert.equal(duplicate.status, 409);

    const ignored = await client.post("/v1/events/ingest", {
      eventId: "evt-wait",
      installId: "install-ledger",
      type: "wait_detected",
      durationMs: 1000
    }, { useCookie: false });
    assert.equal(ignored.status, 202);
    assert.equal(ignored.body.ledgerEntry, null);

    const ledger = await client.get("/v1/me/ledger");
    assert.equal(ledger.body.ledger.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(ledger.body.ledger[0], "prompt"), false);
  });
});

test("admin sponsor ops validate categories, destinations, and settlement boundary", async () => {
  await withServer(async (client) => {
    await client.post("/v1/auth/signup", {
      email: "regular@example.com"
    });

    const forbidden = await client.post("/v1/admin/sponsors", {
      name: "Regular Sponsor",
      category: "cloud"
    });
    assert.equal(forbidden.status, 403);

    await client.post("/v1/auth/logout", {});
    await client.post("/v1/auth/signup", {
      email: "admin@waitly.local",
      displayName: "Admin"
    });

    const disallowed = await client.post("/v1/admin/sponsors", {
      name: "Bad Sponsor",
      category: "gambling"
    });
    assert.equal(disallowed.status, 400);
    assert.equal(disallowed.body.error, "disallowed_category");

    const sponsor = await client.post("/v1/admin/sponsors", {
      name: "Cloud Sponsor",
      category: "cloud"
    });
    assert.equal(sponsor.status, 201);

    const insecureCreative = await client.post("/v1/admin/creatives", {
      sponsorId: sponsor.body.sponsor.id,
      headline: "Ship faster",
      body: "Developer platform",
      category: "cloud",
      destinationUrl: "http://example.com"
    });
    assert.equal(insecureCreative.status, 400);
    assert.equal(insecureCreative.body.error, "https_destination_required");

    const creative = await client.post("/v1/admin/creatives", {
      sponsorId: sponsor.body.sponsor.id,
      headline: "Ship faster",
      body: "Developer platform",
      category: "cloud",
      destinationUrl: "https://example.com",
      cta: "Open"
    });
    assert.equal(creative.status, 201);
    assert.equal(creative.body.creative.status, "pending_review");

    const approved = await client.patch(`/v1/admin/creatives/${creative.body.creative.id}`, {
      status: "approved"
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.creative.status, "approved");

    const settlement = await client.post("/v1/admin/reporting-periods", {
      startsAt: "2026-04-01T00:00:00.000Z",
      endsAt: "2026-04-30T23:59:59.999Z",
      status: "settled"
    });
    assert.equal(settlement.status, 409);
    assert.equal(settlement.body.error, "settlement_future_only");
  });
});

test("admin ops can approve sponsors, approve creatives, activate campaigns, and read reports", async () => {
  await withServer(async (client) => {
    await client.post("/v1/auth/signup", {
      email: "admin@waitly.local",
      displayName: "Admin"
    });

    const emptyOverview = await client.get("/v1/admin/overview");
    assert.equal(emptyOverview.status, 200);
    assert.equal(emptyOverview.body.summary.sponsors, 0);
    assert.equal(emptyOverview.body.summary.activeCampaigns, 0);

    const sponsor = await client.post("/v1/admin/sponsors", {
      name: "Acme Cloud",
      category: "cloud"
    });
    assert.equal(sponsor.status, 201);

    const activeBeforeApproval = await client.post("/v1/admin/campaigns", {
      sponsorId: sponsor.body.sponsor.id,
      status: "active",
      budgetMinor: 50000
    });
    assert.equal(activeBeforeApproval.status, 409);
    assert.equal(activeBeforeApproval.body.error, "approved_sponsor_required");

    const sponsorApproval = await client.patch(`/v1/admin/sponsors/${sponsor.body.sponsor.id}`, {
      status: "approved"
    });
    assert.equal(sponsorApproval.status, 200);
    assert.equal(sponsorApproval.body.sponsor.status, "approved");

    const creative = await client.post("/v1/admin/creatives", {
      sponsorId: sponsor.body.sponsor.id,
      headline: "Local AI infra credits",
      body: "Credits for developers running AI coding agents.",
      category: "cloud",
      destinationUrl: "https://example.com/waitly",
      cta: "Open"
    });
    assert.equal(creative.status, 201);

    const blockedCampaign = await client.post("/v1/admin/campaigns", {
      sponsorId: sponsor.body.sponsor.id,
      creativeId: creative.body.creative.id,
      status: "active",
      budgetMinor: 50000
    });
    assert.equal(blockedCampaign.status, 409);
    assert.equal(blockedCampaign.body.error, "approved_creative_required");

    await client.patch(`/v1/admin/creatives/${creative.body.creative.id}`, {
      status: "approved"
    });

    const campaign = await client.post("/v1/admin/campaigns", {
      sponsorId: sponsor.body.sponsor.id,
      creativeId: creative.body.creative.id,
      status: "active",
      budgetMinor: 50000,
      rateMinor: 15,
      currency: "usd"
    });
    assert.equal(campaign.status, 201);
    assert.equal(campaign.body.campaign.status, "active");
    assert.equal(campaign.body.campaign.currency, "USD");

    const paused = await client.patch(`/v1/admin/campaigns/${campaign.body.campaign.id}`, {
      status: "paused"
    });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.campaign.status, "paused");

    const reactivated = await client.patch(`/v1/admin/campaigns/${campaign.body.campaign.id}`, {
      status: "active"
    });
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.campaign.status, "active");

    const overview = await client.get("/v1/admin/overview");
    assert.equal(overview.status, 200);
    assert.equal(overview.body.summary.sponsors, 1);
    assert.equal(overview.body.summary.approvedCreatives, 1);
    assert.equal(overview.body.summary.activeCampaigns, 1);
    assert.equal(overview.body.eligibleAds.length, 1);
    assert.equal(overview.body.eligibleAds[0].headline, "Local AI infra credits");
    assert.ok(overview.body.auditEvents.length >= 5);

    const sponsors = await client.get("/v1/admin/sponsors");
    assert.equal(sponsors.body.sponsors.length, 1);

    const campaigns = await client.get("/v1/admin/campaigns");
    assert.equal(campaigns.body.campaigns.length, 1);

    const report = await client.get("/v1/admin/reports/summary");
    assert.equal(report.status, 200);
    assert.equal(report.body.campaigns.active, 1);
    assert.equal(report.body.creatives.approved, 1);
  });
});

test("admin instant ad upload publishes one image campaign immediately", async () => {
  await withServer(async (client) => {
    await client.post("/v1/auth/signup", {
      email: "admin@waitly.local",
      displayName: "Admin"
    });

    const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const published = await client.post("/v1/admin/instant-ad", {
      imageDataUrl,
      headline: "Generated launch ad",
      body: "A finished image ad from the admin uploader.",
      cta: "Open",
      destinationUrl: "https://example.com/launch",
      sponsorName: "Waitly Studio",
      imageAlt: "Generated Waitly ad"
    });
    assert.equal(published.status, 201);
    assert.equal(published.body.creative.status, "approved");
    assert.equal(published.body.creative.imageDataUrl, imageDataUrl);
    assert.equal(published.body.campaign.status, "active");

    const replacement = await client.post("/v1/admin/instant-ad", {
      imageDataUrl,
      headline: "Replacement image ad",
      destinationUrl: "https://example.com/replacement"
    });
    assert.equal(replacement.status, 201);

    const overview = await client.get("/v1/admin/overview");
    assert.equal(overview.status, 200);
    assert.equal(overview.body.summary.activeCampaigns, 1);
    assert.equal(overview.body.eligibleAds.length, 1);
    assert.equal(overview.body.eligibleAds[0].headline, "Replacement image ad");
    assert.equal(overview.body.eligibleAds[0].imageDataUrl, imageDataUrl);
    assert.equal(overview.body.campaigns.filter((campaign) => campaign.status === "paused").length, 1);
  });
});

test("admin can confirm pending ledger for public aggregate reporting", async () => {
  await withServer(async (client) => {
    await client.post("/v1/auth/signup", {
      email: "admin@waitly.local"
    });
    const code = await client.post("/v1/me/link-codes", {});
    await client.post("/v1/install-links/consume", {
      code: code.body.code,
      installId: "install-public"
    }, { useCookie: false });
    await client.post("/v1/events/ingest", {
      eventId: "evt-public",
      installId: "install-public",
      type: "ad_click"
    }, { useCookie: false });

    const before = await client.get("/v1/public/contribution-total", { useCookie: false });
    assert.equal(before.body.headline.amountMinor, 0);
    assert.equal(before.body.pendingEstimate.amountMinor, 25);

    const confirmed = await client.post("/v1/admin/ledger/confirm", {});
    assert.equal(confirmed.body.confirmed, 1);

    const after = await client.get("/v1/public/contribution-total", { useCookie: false });
    assert.equal(after.body.headline.amountMinor, 25);
    assert.equal(after.body.pendingEstimate.amountMinor, 0);
  });
});

function withServer(fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "waitly-pilot-api-test-"));
  const dataPath = path.join(tempDir, "state.json");
  const api = createPilotApi({ dataPath, now: () => new Date("2026-04-25T08:00:00.000Z") });
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (!(await api(request, response, requestUrl))) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const client = createClient(`http://127.0.0.1:${address.port}`);
      try {
        await fn(client);
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        server.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
}

function createClient(baseUrl) {
  const client = {
    cookie: "",
    get(pathname, options) {
      return request("GET", pathname, null, options);
    },
    post(pathname, body, options) {
      return request("POST", pathname, body, options);
    },
    patch(pathname, body, options) {
      return request("PATCH", pathname, body, options);
    }
  };
  return client;

  function request(method, pathname, body, options = {}) {
    const useCookie = options.useCookie !== false;
    const payload = body ? JSON.stringify(body) : "";
    return new Promise((resolve, reject) => {
      const url = new URL(pathname, baseUrl);
      const req = http.request(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(useCookie && client.cookie ? { Cookie: client.cookie } : {})
        }
      }, (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          const setCookie = response.headers["set-cookie"];
          if (setCookie && setCookie[0]) {
            client.cookie = setCookie[0].split(";")[0];
          }
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: data ? JSON.parse(data) : null
          });
        });
      });
      req.on("error", reject);
      req.end(payload);
    });
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
