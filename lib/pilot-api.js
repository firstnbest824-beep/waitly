const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SESSION_COOKIE = "waitly_session";
const IMAGE_DATA_URL_LIMIT_BYTES = 2 * 1024 * 1024;
const JSON_LIMIT_BYTES = IMAGE_DATA_URL_LIMIT_BYTES + (256 * 1024);
const DEFAULT_CURRENCY = "USD";
const IMPRESSION_AMOUNT_MINOR = 12;
const CLICK_AMOUNT_MINOR = 25;
const sponsorStatuses = new Set(["pending_review", "approved", "rejected", "archived"]);
const creativeStatuses = new Set(["pending_review", "approved", "rejected", "archived"]);
const campaignStatuses = new Set(["draft", "active", "paused", "archived"]);

const allowedSponsorCategories = new Set([
  "cloud",
  "database",
  "api",
  "security",
  "monitoring",
  "deployment",
  "ai-devtool",
  "developer-saas",
  "education",
  "hiring",
  "open-source"
]);

const disallowedSponsorCategories = new Set([
  "malware",
  "spyware",
  "adult",
  "gambling",
  "political",
  "hate",
  "counterfeit",
  "illegal",
  "misleading-health",
  "forced-download",
  "get-rich",
  "trading"
]);

const prohibitedFieldNames = [
  "prompt",
  "code",
  "output",
  "stdout",
  "stderr",
  "command",
  "args",
  "path",
  "filename",
  "repo",
  "repository",
  "remote",
  "env",
  "token",
  "secret",
  "clipboard",
  "screenshot",
  "keystroke",
  "apiKey",
  "password",
  "modelResponse"
];

function createPilotApi({
  projectRoot,
  dataPath = resolvePilotDataPath(projectRoot),
  now = () => new Date()
} = {}) {
  ensureStateFile(dataPath);

  return async function handlePilotApi(request, response, requestUrl) {
    if (!requestUrl.pathname.startsWith("/v1/")) {
      return false;
    }

    try {
      await routeRequest({ request, response, requestUrl, dataPath, now });
    } catch (error) {
      if (error.code === "unsupported_field" || error.code === "prohibited_field") {
        sendJson(response, 400, {
          error: error.code,
          message: error.message
        });
        return true;
      }
      sendJson(response, 500, {
        error: "internal_error",
        message: error.message
      });
    }

    return true;
  };
}

async function routeRequest(context) {
  const { request, response, requestUrl } = context;
  const method = request.method;
  const pathname = requestUrl.pathname;

  if (method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (method === "GET" && pathname === "/v1/session") {
    const session = getSessionUser(context);
    sendJson(response, 200, {
      signedIn: Boolean(session.user),
      user: session.user ? publicUser(session.user) : null
    });
    return;
  }

  if (method === "POST" && pathname === "/v1/auth/signup") {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, ["email", "displayName"]);
    const email = normalizeEmail(body.email);
    if (!email) {
      sendJson(response, 400, { error: "email_required" });
      return;
    }

    const { user, sessionId } = writeState(context.dataPath, (state) => {
      let existing = state.users.find((item) => item.email === email);
      if (!existing) {
        existing = {
          id: createId("usr"),
          email,
          displayName: String(body.displayName || email.split("@")[0]).slice(0, 80),
          role: email === "admin@waitly.local" ? "admin" : "user",
          createdAt: context.now().toISOString()
        };
        state.users.push(existing);
        state.accountSettings[existing.id] = defaultAccountSettings(existing.id, context.now);
      }
      const createdSessionId = createId("ses");
      state.sessions[createdSessionId] = {
        userId: existing.id,
        createdAt: context.now().toISOString()
      };
      return { user: existing, sessionId: createdSessionId };
    });

    sendJson(response, 200, { user: publicUser(user) }, sessionCookie(sessionId));
    return;
  }

  if (method === "POST" && pathname === "/v1/auth/login") {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, ["email"]);
    const email = normalizeEmail(body.email);
    const result = writeState(context.dataPath, (state) => {
      const user = state.users.find((item) => item.email === email);
      if (!user) {
        return null;
      }
      const sessionId = createId("ses");
      state.sessions[sessionId] = {
        userId: user.id,
        createdAt: context.now().toISOString()
      };
      return { user, sessionId };
    });

    if (!result) {
      sendJson(response, 401, { error: "invalid_login" });
      return;
    }

    sendJson(response, 200, { user: publicUser(result.user) }, sessionCookie(result.sessionId));
    return;
  }

  if (method === "POST" && pathname === "/v1/auth/logout") {
    const cookie = parseCookies(request.headers.cookie || "")[SESSION_COOKIE];
    if (cookie) {
      writeState(context.dataPath, (state) => {
        delete state.sessions[cookie];
      });
    }
    sendJson(response, 200, { ok: true }, clearSessionCookie());
    return;
  }

  if (method === "GET" && pathname === "/v1/public/contribution-total") {
    const state = readState(context.dataPath);
    sendJson(response, 200, publicContributionTotal(state));
    return;
  }

  if (method === "POST" && pathname === "/v1/events/ingest") {
    const body = await readJsonBody(request);
    const violation = findProhibitedField(body);
    if (violation) {
      sendJson(response, 400, {
        error: "prohibited_field",
        field: violation
      });
      return;
    }

    const allowed = pickAllowed(body, [
      "eventId",
      "installId",
      "type",
      "occurredAt",
      "sessionId",
      "adId",
      "campaignId",
      "creativeId",
      "sponsorId",
      "donationTargetId",
      "roomId",
      "durationMs",
      "waitDurationMs"
    ]);

    const result = writeState(context.dataPath, (state) => ingestEvent(state, allowed, context.now));
    sendJson(response, result.status, result.body);
    return;
  }

  if (method === "POST" && pathname === "/v1/install-links/consume") {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, ["code", "installId", "appVersion", "osFamily", "osArch"]);
    const result = writeState(context.dataPath, (state) => consumeLinkCode(state, body, context.now));
    sendJson(response, result.status, result.body);
    return;
  }

  const auth = requireUser(context);
  if (!auth.ok) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  if (method === "GET" && pathname === "/v1/me/dashboard") {
    const state = readState(context.dataPath);
    sendJson(response, 200, buildDashboard(state, auth.user));
    return;
  }

  if (method === "GET" && pathname === "/v1/me/settings") {
    const state = readState(context.dataPath);
    sendJson(response, 200, getSettings(state, auth.user.id));
    return;
  }

  if (method === "PATCH" && pathname === "/v1/me/settings") {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, [
      "activeRouteType",
      "activeRouteId",
      "sponsorTargetId",
      "pauseUntil",
      "disabled",
      "syncEnabled",
      "version"
    ]);

    const result = writeState(context.dataPath, (state) => {
      const settings = getSettings(state, auth.user.id);
      if (Number.isInteger(body.version) && body.version !== settings.version) {
        return { status: 409, body: { error: "version_conflict", currentVersion: settings.version } };
      }

      const updated = {
        ...settings,
        ...pickAllowed(body, [
          "activeRouteType",
          "activeRouteId",
          "sponsorTargetId",
          "pauseUntil",
          "disabled",
          "syncEnabled"
        ]),
        version: settings.version + 1,
        updatedAt: context.now().toISOString()
      };
      state.accountSettings[auth.user.id] = normalizeSettings(updated);
      return { status: 200, body: state.accountSettings[auth.user.id] };
    });
    sendJson(response, result.status, result.body);
    return;
  }

  if (method === "POST" && pathname === "/v1/me/link-codes") {
    const result = writeState(context.dataPath, (state) => {
      const code = createLinkCode();
      const id = createId("lnk");
      state.linkCodes[id] = {
        id,
        userId: auth.user.id,
        codeHash: hashLinkCode(code),
        expiresAt: new Date(context.now().getTime() + 10 * 60 * 1000).toISOString(),
        consumedAt: null,
        createdAt: context.now().toISOString()
      };
      return { id, code, expiresAt: state.linkCodes[id].expiresAt };
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "GET" && pathname === "/v1/me/installations") {
    const state = readState(context.dataPath);
    sendJson(response, 200, {
      installations: state.installations.filter((item) => item.userId === auth.user.id)
    });
    return;
  }

  if (method === "GET" && pathname === "/v1/me/ledger") {
    const state = readState(context.dataPath);
    sendJson(response, 200, {
      ledger: state.ledger.filter((entry) => entry.userId === auth.user.id)
    });
    return;
  }

  if (pathname.startsWith("/v1/admin/")) {
    if (auth.user.role !== "admin") {
      sendJson(response, 403, { error: "admin_required" });
      return;
    }
    await routeAdminRequest(context, auth.user);
    return;
  }

  sendJson(response, 404, { error: "not_found" });
}

async function routeAdminRequest(context, adminUser) {
  const { request, response, requestUrl } = context;
  const method = request.method;
  const pathname = requestUrl.pathname;

  if (method === "GET" && pathname === "/v1/admin/overview") {
    const state = readState(context.dataPath);
    sendJson(response, 200, buildAdminOverview(state));
    return;
  }

  if (method === "GET" && pathname === "/v1/admin/reports/summary") {
    const state = readState(context.dataPath);
    sendJson(response, 200, buildAdminReportSummary(state));
    return;
  }

  if (method === "POST" && pathname === "/v1/admin/instant-ad") {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, [
      "imageDataUrl",
      "imageAlt",
      "headline",
      "body",
      "cta",
      "destinationUrl",
      "sponsorName",
      "category"
    ]);

    const image = validateImageDataUrl(body.imageDataUrl);
    if (!image.ok) {
      sendJson(response, 400, { error: image.error });
      return;
    }

    const categoryName = String(body.category || "developer-saas");
    const category = validateSponsorCategory(categoryName);
    if (!category.ok) {
      sendJson(response, 400, { error: category.error });
      return;
    }

    const destinationUrl = String(body.destinationUrl || "https://waitly.dev/").trim();
    if (!isHttpsUrl(destinationUrl)) {
      sendJson(response, 400, { error: "https_destination_required" });
      return;
    }

    const published = writeState(context.dataPath, (state) => {
      const nowIso = context.now().toISOString();
      for (const campaign of state.campaigns) {
        if (campaign.status === "active") {
          campaign.status = "paused";
          campaign.updatedAt = nowIso;
        }
      }

      const sponsor = {
        id: createId("spn"),
        name: String(body.sponsorName || "Waitly uploaded ad").trim().slice(0, 120),
        category: categoryName,
        status: "approved",
        createdAt: nowIso,
        reviewedAt: nowIso
      };
      const creative = {
        id: createId("crv"),
        sponsorId: sponsor.id,
        headline: String(body.headline || "Uploaded image ad").trim().slice(0, 120),
        body: String(body.body || "Published from the Waitly admin image uploader.").trim().slice(0, 280),
        cta: String(body.cta || "Open").trim().slice(0, 60),
        destinationUrl,
        category: categoryName,
        imageAlt: String(body.imageAlt || "Waitly uploaded sponsored image").trim().slice(0, 120),
        imageDataUrl: image.value,
        status: "approved",
        createdAt: nowIso,
        reviewedAt: nowIso
      };
      const campaign = {
        id: createId("cmp"),
        sponsorId: sponsor.id,
        creativeId: creative.id,
        budgetMinor: 50000,
        rateMinor: IMPRESSION_AMOUNT_MINOR,
        currency: DEFAULT_CURRENCY,
        status: "active",
        startsAt: null,
        endsAt: null,
        dailyCap: null,
        frequencyCap: null,
        createdAt: nowIso
      };

      state.sponsors.unshift(sponsor);
      state.creatives.unshift(creative);
      state.campaigns.unshift(campaign);
      appendAuditEvent(state, adminUser, "publish_instant_ad", "campaign", campaign.id, null, {
        sponsorId: sponsor.id,
        creativeId: creative.id,
        destinationUrl: creative.destinationUrl,
        imageAlt: creative.imageAlt
      }, context.now);
      return { sponsor, creative, campaign };
    });

    sendJson(response, 201, published);
    return;
  }

  if (method === "GET" && pathname === "/v1/admin/sponsors") {
    const state = readState(context.dataPath);
    sendJson(response, 200, { sponsors: state.sponsors });
    return;
  }

  if (method === "POST" && pathname === "/v1/admin/sponsors") {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, ["name", "category"]);
    const validation = validateSponsorCategory(body.category);
    if (!validation.ok) {
      sendJson(response, 400, { error: validation.error });
      return;
    }
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) {
      sendJson(response, 400, { error: "sponsor_name_required" });
      return;
    }

    const sponsor = writeState(context.dataPath, (state) => {
      const record = {
        id: createId("spn"),
        name,
        category: body.category,
        status: "pending_review",
        createdAt: context.now().toISOString()
      };
      state.sponsors.push(record);
      appendAuditEvent(state, adminUser, "create", "sponsor", record.id, null, sponsorAuditSummary(record), context.now);
      return record;
    });
    sendJson(response, 201, { sponsor });
    return;
  }

  const sponsorPatch = pathname.match(/^\/v1\/admin\/sponsors\/([^/]+)$/);
  if (method === "PATCH" && sponsorPatch) {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, ["status"]);
    if (!sponsorStatuses.has(body.status)) {
      sendJson(response, 400, { error: "invalid_sponsor_status" });
      return;
    }
    const sponsor = writeState(context.dataPath, (state) => {
      const record = state.sponsors.find((item) => item.id === sponsorPatch[1]);
      if (!record) {
        return null;
      }
      const before = sponsorAuditSummary(record);
      record.status = body.status;
      record.reviewedAt = context.now().toISOString();
      record.updatedAt = context.now().toISOString();
      appendAuditEvent(state, adminUser, "update_status", "sponsor", record.id, before, sponsorAuditSummary(record), context.now);
      return record;
    });
    if (!sponsor) {
      sendJson(response, 404, { error: "sponsor_not_found" });
      return;
    }
    sendJson(response, 200, { sponsor });
    return;
  }

  if (method === "POST" && pathname === "/v1/admin/creatives") {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, [
      "sponsorId",
      "headline",
      "body",
      "cta",
      "destinationUrl",
      "category",
      "imageAlt"
    ]);
    const category = validateSponsorCategory(body.category);
    if (!category.ok) {
      sendJson(response, 400, { error: category.error });
      return;
    }
    if (!isHttpsUrl(body.destinationUrl)) {
      sendJson(response, 400, { error: "https_destination_required" });
      return;
    }

    const creative = writeState(context.dataPath, (state) => {
      if (!state.sponsors.some((sponsor) => sponsor.id === body.sponsorId)) {
        return null;
      }
      const record = {
        id: createId("crv"),
        sponsorId: body.sponsorId,
        headline: String(body.headline || "").slice(0, 120),
        body: String(body.body || "").slice(0, 280),
        cta: String(body.cta || "Learn more").slice(0, 60),
        destinationUrl: body.destinationUrl,
        category: body.category,
        imageAlt: String(body.imageAlt || "Waitly sponsored developer ad").slice(0, 120),
        status: "pending_review",
        createdAt: context.now().toISOString()
      };
      state.creatives.push(record);
      appendAuditEvent(state, adminUser, "create", "creative", record.id, null, creativeAuditSummary(record), context.now);
      return record;
    });

    if (!creative) {
      sendJson(response, 404, { error: "sponsor_not_found" });
      return;
    }
    sendJson(response, 201, { creative });
    return;
  }

  const creativePatch = pathname.match(/^\/v1\/admin\/creatives\/([^/]+)$/);
  if (method === "PATCH" && creativePatch) {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, ["status"]);
    if (!creativeStatuses.has(body.status)) {
      sendJson(response, 400, { error: "invalid_creative_status" });
      return;
    }
    const creative = writeState(context.dataPath, (state) => {
      const record = state.creatives.find((item) => item.id === creativePatch[1]);
      if (!record) {
        return null;
      }
      const before = creativeAuditSummary(record);
      record.status = body.status;
      record.reviewedAt = context.now().toISOString();
      record.updatedAt = context.now().toISOString();
      appendAuditEvent(state, adminUser, "update_status", "creative", record.id, before, creativeAuditSummary(record), context.now);
      return record;
    });
    if (!creative) {
      sendJson(response, 404, { error: "creative_not_found" });
      return;
    }
    sendJson(response, 200, { creative });
    return;
  }

  if (method === "GET" && pathname === "/v1/admin/creatives") {
    const state = readState(context.dataPath);
    sendJson(response, 200, { creatives: state.creatives });
    return;
  }

  if (method === "GET" && pathname === "/v1/admin/campaigns") {
    const state = readState(context.dataPath);
    sendJson(response, 200, { campaigns: state.campaigns });
    return;
  }

  if (method === "POST" && pathname === "/v1/admin/campaigns") {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, [
      "sponsorId",
      "creativeId",
      "budgetMinor",
      "rateMinor",
      "currency",
      "status",
      "startsAt",
      "endsAt",
      "dailyCap",
      "frequencyCap"
    ]);
    const requestedStatus = normalizeCampaignStatus(body.status);
    const campaign = writeState(context.dataPath, (state) => {
      const readiness = validateCampaignReadiness(state, {
        sponsorId: body.sponsorId,
        creativeId: body.creativeId || null,
        status: requestedStatus,
        budgetMinor: toPositiveInteger(body.budgetMinor, 0)
      });
      if (!readiness.ok) {
        return readiness;
      }
      const record = {
        id: createId("cmp"),
        sponsorId: body.sponsorId,
        creativeId: body.creativeId || null,
        budgetMinor: toPositiveInteger(body.budgetMinor, 0),
        rateMinor: toPositiveInteger(body.rateMinor, IMPRESSION_AMOUNT_MINOR),
        currency: String(body.currency || DEFAULT_CURRENCY).slice(0, 3).toUpperCase(),
        status: requestedStatus,
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        dailyCap: toPositiveInteger(body.dailyCap, null),
        frequencyCap: toPositiveInteger(body.frequencyCap, null),
        createdAt: context.now().toISOString()
      };
      state.campaigns.push(record);
      appendAuditEvent(state, adminUser, "create", "campaign", record.id, null, campaignAuditSummary(record), context.now);
      return record;
    });
    if (campaign && campaign.ok === false) {
      sendJson(response, campaign.status, { error: campaign.error });
      return;
    }
    sendJson(response, 201, { campaign });
    return;
  }

  const campaignPatch = pathname.match(/^\/v1\/admin\/campaigns\/([^/]+)$/);
  if (method === "PATCH" && campaignPatch) {
    const body = await readJsonBody(request);
    rejectProhibitedPayload(body, [
      "creativeId",
      "budgetMinor",
      "rateMinor",
      "status",
      "startsAt",
      "endsAt",
      "dailyCap",
      "frequencyCap"
    ]);
    const campaign = writeState(context.dataPath, (state) => {
      const record = state.campaigns.find((item) => item.id === campaignPatch[1]);
      if (!record) {
        return { ok: false, status: 404, error: "campaign_not_found" };
      }
      const next = {
        ...record,
        ...pickAllowed(body, [
          "creativeId",
          "startsAt",
          "endsAt"
        ]),
        ...(Object.prototype.hasOwnProperty.call(body, "budgetMinor")
          ? { budgetMinor: toPositiveInteger(body.budgetMinor, record.budgetMinor) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(body, "rateMinor")
          ? { rateMinor: toPositiveInteger(body.rateMinor, record.rateMinor) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(body, "dailyCap")
          ? { dailyCap: toPositiveInteger(body.dailyCap, null) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(body, "frequencyCap")
          ? { frequencyCap: toPositiveInteger(body.frequencyCap, null) }
          : {}),
        status: Object.prototype.hasOwnProperty.call(body, "status") ? normalizeCampaignStatus(body.status) : record.status
      };
      const readiness = validateCampaignReadiness(state, {
        sponsorId: next.sponsorId,
        creativeId: next.creativeId,
        status: next.status,
        budgetMinor: next.budgetMinor
      });
      if (!readiness.ok) {
        return readiness;
      }
      const before = campaignAuditSummary(record);
      Object.assign(record, next, {
        updatedAt: context.now().toISOString()
      });
      appendAuditEvent(state, adminUser, "update", "campaign", record.id, before, campaignAuditSummary(record), context.now);
      return record;
    });
    if (campaign && campaign.ok === false) {
      sendJson(response, campaign.status, { error: campaign.error });
      return;
    }
    sendJson(response, 200, { campaign });
    return;
  }

  if (method === "GET" && pathname === "/v1/admin/ledger") {
    const state = readState(context.dataPath);
    sendJson(response, 200, { ledger: state.ledger });
    return;
  }

  if (method === "GET" && pathname === "/v1/admin/events") {
    const state = readState(context.dataPath);
    sendJson(response, 200, { events: state.events.slice(-100) });
    return;
  }

  if (method === "POST" && pathname === "/v1/admin/ledger/confirm") {
    const result = writeState(context.dataPath, (state) => {
      let confirmed = 0;
      for (const entry of state.ledger) {
        if (entry.status === "pending") {
          entry.status = "confirmed";
          entry.confirmedAt = context.now().toISOString();
          confirmed += 1;
        }
      }
      appendAuditEvent(state, adminUser, "confirm_pending", "ledger", "all_pending", null, { confirmed }, context.now);
      return { confirmed };
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && pathname === "/v1/admin/reporting-periods") {
    const body = await readJsonBody(request);
    if (body.status === "settled" && process.env.WAITLY_ENABLE_SETTLEMENT !== "1") {
      sendJson(response, 409, {
        error: "settlement_future_only",
        message: "Settled reporting is disabled until payout, legal, and tax ownership are approved."
      });
      return;
    }
    const period = writeState(context.dataPath, (state) => {
      const record = {
        id: createId("rpt"),
        startsAt: body.startsAt || null,
        endsAt: body.endsAt || null,
        status: body.status === "settled" ? "settled" : "confirmed",
        createdAt: context.now().toISOString()
      };
      state.reportingPeriods.push(record);
      appendAuditEvent(state, adminUser, "create", "reporting_period", record.id, null, record, context.now);
      return record;
    });
    sendJson(response, 201, { reportingPeriod: period });
    return;
  }

  sendJson(response, 404, { error: "not_found" });
}

function ingestEvent(state, event, now) {
  const type = String(event.type || "");
  const eventId = String(event.eventId || createId("evt"));
  if (state.events.some((item) => item.eventId === eventId)) {
    return { status: 409, body: { error: "duplicate_event" } };
  }

  const record = {
    eventId,
    type,
    installId: event.installId || null,
    occurredAt: event.occurredAt || now().toISOString(),
    sessionId: event.sessionId || null,
    adId: event.adId || null,
    campaignId: event.campaignId || null,
    creativeId: event.creativeId || null,
    sponsorId: event.sponsorId || null,
    donationTargetId: event.donationTargetId || null,
    roomId: event.roomId || null,
    durationMs: toPositiveInteger(event.durationMs, null),
    waitDurationMs: toPositiveInteger(event.waitDurationMs, null)
  };
  state.events.push(record);

  const eligible = type === "ad_impression" || type === "ad_click";
  if (!eligible) {
    return { status: 202, body: { accepted: true, ledgerEntry: null } };
  }

  const install = state.installations.find((item) => item.installId === record.installId);
  const settings = install && install.userId ? getSettings(state, install.userId) : null;
  const amountMinor = type === "ad_click" ? CLICK_AMOUNT_MINOR : IMPRESSION_AMOUNT_MINOR;
  const ledgerEntry = {
    id: createId("led"),
    createdAt: now().toISOString(),
    eventId,
    installId: record.installId,
    userId: install ? install.userId : null,
    roomId: record.roomId || (settings && settings.activeRouteType === "room" ? settings.activeRouteId : null),
    donationTargetId: record.donationTargetId || (settings ? settings.sponsorTargetId : "vitejs/vite"),
    campaignId: record.campaignId,
    sponsorId: record.sponsorId,
    amountMinor,
    currency: DEFAULT_CURRENCY,
    status: "pending",
    reasonCode: "eligible_" + type,
    reportingPeriod: reportingPeriodFor(record.occurredAt)
  };
  state.ledger.push(ledgerEntry);
  return { status: 201, body: { accepted: true, ledgerEntry } };
}

function consumeLinkCode(state, body, now) {
  const codeHash = hashLinkCode(String(body.code || ""));
  const link = Object.values(state.linkCodes).find((item) => item.codeHash === codeHash);
  if (!link || link.consumedAt || new Date(link.expiresAt).getTime() < now().getTime()) {
    return { status: 400, body: { error: "invalid_or_expired_code" } };
  }

  const installId = String(body.installId || "").slice(0, 120);
  if (!installId) {
    return { status: 400, body: { error: "install_id_required" } };
  }

  link.consumedAt = now().toISOString();
  let install = state.installations.find((item) => item.installId === installId);
  if (!install) {
    install = {
      id: createId("ins"),
      installId,
      userId: link.userId,
      appVersion: body.appVersion || null,
      osFamily: body.osFamily || os.platform(),
      osArch: body.osArch || os.arch(),
      syncEnabled: true,
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
      linkedAt: now().toISOString(),
      lastSeenAt: now().toISOString()
    };
    state.installations.push(install);
  } else {
    install.userId = link.userId;
    install.linkedAt = now().toISOString();
    install.lastSeenAt = now().toISOString();
    install.updatedAt = now().toISOString();
  }

  return { status: 200, body: { installation: install } };
}

function buildDashboard(state, user) {
  const ledger = state.ledger.filter((entry) => entry.userId === user.id);
  const totals = totalsByStatus(ledger);
  const settings = getSettings(state, user.id);
  return {
    user: publicUser(user),
    totals,
    activeRoute: {
      type: settings.activeRouteType,
      id: settings.activeRouteId,
      sponsorTargetId: settings.sponsorTargetId
    },
    settings,
    linkedInstallCount: state.installations.filter((item) => item.userId === user.id).length,
    breakdownByTarget: groupLedger(ledger, "donationTargetId"),
    breakdownByRoom: groupLedger(ledger, "roomId")
  };
}

function buildAdminOverview(state) {
  const eligibleAds = buildEligibleAds(state);
  return {
    summary: {
      sponsors: state.sponsors.length,
      approvedSponsors: state.sponsors.filter((item) => item.status === "approved").length,
      creatives: state.creatives.length,
      approvedCreatives: state.creatives.filter((item) => item.status === "approved").length,
      campaigns: state.campaigns.length,
      activeCampaigns: state.campaigns.filter((item) => item.status === "active").length,
      pendingLedger: state.ledger.filter((item) => item.status === "pending").length,
      confirmedLedger: state.ledger.filter((item) => item.status === "confirmed").length,
      eligibleAdCount: eligibleAds.length
    },
    sponsors: state.sponsors,
    creatives: state.creatives,
    campaigns: state.campaigns,
    reportingPeriods: state.reportingPeriods,
    eligibleAds,
    ledgerSummary: totalsByStatus(state.ledger),
    recentEvents: state.events.slice(-25).reverse(),
    auditEvents: state.auditEvents.slice(-50).reverse()
  };
}

function buildAdminReportSummary(state) {
  return {
    sponsors: countByStatus(state.sponsors),
    creatives: countByStatus(state.creatives),
    campaigns: countByStatus(state.campaigns),
    ledger: {
      pending: sumAmount(state.ledger.filter((entry) => entry.status === "pending")),
      confirmed: sumAmount(state.ledger.filter((entry) => entry.status === "confirmed")),
      rejected: sumAmount(state.ledger.filter((entry) => entry.status === "rejected")),
      settled: sumAmount(state.ledger.filter((entry) => entry.status === "settled")),
      currency: DEFAULT_CURRENCY
    },
    events: {
      total: state.events.length,
      impressions: state.events.filter((event) => event.type === "ad_impression").length,
      clicks: state.events.filter((event) => event.type === "ad_click").length
    },
    eligibleAds: buildEligibleAds(state).length
  };
}

function buildEligibleAds(state) {
  return state.campaigns
    .filter((campaign) => campaign.status === "active")
    .map((campaign) => {
      const sponsor = state.sponsors.find((item) => item.id === campaign.sponsorId);
      const creative = state.creatives.find((item) => item.id === campaign.creativeId);
      if (!sponsor || sponsor.status !== "approved" || !creative || creative.status !== "approved") {
        return null;
      }
      return {
        campaignId: campaign.id,
        sponsorId: sponsor.id,
        sponsorName: sponsor.name,
        creativeId: creative.id,
        headline: creative.headline,
        body: creative.body,
        cta: creative.cta,
        destinationUrl: creative.destinationUrl,
        category: creative.category,
        imageDataUrl: creative.imageDataUrl || "",
        imageAlt: creative.imageAlt || "Waitly sponsored developer ad",
        budgetMinor: campaign.budgetMinor,
        rateMinor: campaign.rateMinor,
        currency: campaign.currency
      };
    })
    .filter(Boolean);
}

function validateCampaignReadiness(state, { sponsorId, creativeId, status, budgetMinor }) {
  if (!campaignStatuses.has(status)) {
    return { ok: false, status: 400, error: "invalid_campaign_status" };
  }
  const sponsor = state.sponsors.find((item) => item.id === sponsorId);
  if (!sponsor) {
    return { ok: false, status: 404, error: "sponsor_not_found" };
  }
  if (status === "active" && sponsor.status !== "approved") {
    return { ok: false, status: 409, error: "approved_sponsor_required" };
  }
  if (!creativeId) {
    if (status === "active") {
      return { ok: false, status: 409, error: "approved_creative_required" };
    }
    return { ok: true };
  }
  const creative = state.creatives.find((item) => item.id === creativeId);
  if (!creative) {
    return { ok: false, status: 404, error: "creative_not_found" };
  }
  if (creative.sponsorId !== sponsorId) {
    return { ok: false, status: 409, error: "creative_sponsor_mismatch" };
  }
  if (status === "active" && creative.status !== "approved") {
    return { ok: false, status: 409, error: "approved_creative_required" };
  }
  if (status === "active" && budgetMinor <= 0) {
    return { ok: false, status: 409, error: "campaign_budget_required" };
  }
  return { ok: true };
}

function normalizeCampaignStatus(status) {
  return campaignStatuses.has(status) ? status : "draft";
}

function countByStatus(items) {
  return items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
}

function appendAuditEvent(state, actor, action, entityType, entityId, beforeSummary, afterSummary, now) {
  state.auditEvents.push({
    id: createId("aud"),
    actorUserId: actor.id,
    action,
    entityType,
    entityId,
    beforeSummary,
    afterSummary,
    createdAt: now().toISOString()
  });
}

function sponsorAuditSummary(sponsor) {
  return {
    name: sponsor.name,
    category: sponsor.category,
    status: sponsor.status
  };
}

function creativeAuditSummary(creative) {
  return {
    sponsorId: creative.sponsorId,
    headline: creative.headline,
    category: creative.category,
    destinationUrl: creative.destinationUrl,
    status: creative.status
  };
}

function campaignAuditSummary(campaign) {
  return {
    sponsorId: campaign.sponsorId,
    creativeId: campaign.creativeId,
    budgetMinor: campaign.budgetMinor,
    rateMinor: campaign.rateMinor,
    currency: campaign.currency,
    status: campaign.status
  };
}

function publicContributionTotal(state) {
  const confirmed = state.ledger.filter((entry) => entry.status === "confirmed" || entry.status === "settled");
  const pending = state.ledger.filter((entry) => entry.status === "pending");
  return {
    headline: {
      amountMinor: sumAmount(confirmed),
      currency: DEFAULT_CURRENCY,
      status: "confirmed",
      reportingPeriodStart: null,
      reportingPeriodEnd: null,
      lastUpdatedAt: latestTimestamp(state.ledger)
    },
    pendingEstimate: {
      amountMinor: sumAmount(pending),
      currency: DEFAULT_CURRENCY,
      status: "estimated",
      reportingPeriodStart: null,
      reportingPeriodEnd: null,
      lastUpdatedAt: latestTimestamp(pending)
    }
  };
}

function totalsByStatus(ledger) {
  return {
    lifetimeEstimatedMinor: sumAmount(ledger.filter((entry) => entry.status === "pending")),
    confirmedMinor: sumAmount(ledger.filter((entry) => entry.status === "confirmed")),
    settledMinor: sumAmount(ledger.filter((entry) => entry.status === "settled")),
    currency: DEFAULT_CURRENCY
  };
}

function groupLedger(ledger, field) {
  const groups = new Map();
  for (const entry of ledger) {
    const key = entry[field] || "none";
    groups.set(key, (groups.get(key) || 0) + entry.amountMinor);
  }
  return Array.from(groups.entries()).map(([id, amountMinor]) => ({ id, amountMinor, currency: DEFAULT_CURRENCY }));
}

function getSessionUser({ request, dataPath }) {
  const sessionId = parseCookies(request.headers.cookie || "")[SESSION_COOKIE];
  if (!sessionId) {
    return { user: null };
  }
  const state = readState(dataPath);
  const session = state.sessions[sessionId];
  if (!session) {
    return { user: null };
  }
  return {
    user: state.users.find((item) => item.id === session.userId) || null
  };
}

function requireUser(context) {
  const session = getSessionUser(context);
  if (!session.user) {
    return { ok: false };
  }
  return { ok: true, user: session.user };
}

function getSettings(state, userId) {
  if (!state.accountSettings[userId]) {
    state.accountSettings[userId] = defaultAccountSettings(userId, () => new Date());
  }
  return state.accountSettings[userId];
}

function defaultAccountSettings(userId, now) {
  return {
    userId,
    activeRouteType: "target",
    activeRouteId: "vitejs/vite",
    sponsorTargetId: "vitejs/vite",
    pauseUntil: null,
    disabled: false,
    syncEnabled: false,
    version: 1,
    updatedBy: "user",
    updatedAt: now().toISOString()
  };
}

function normalizeSettings(settings) {
  const activeRouteType = settings.activeRouteType === "room" ? "room" : "target";
  const activeRouteId = String(settings.activeRouteId || settings.sponsorTargetId || "vitejs/vite").slice(0, 120);
  const sponsorTargetId = String(settings.sponsorTargetId || activeRouteId || "vitejs/vite").slice(0, 120);
  return {
    ...settings,
    activeRouteType,
    activeRouteId,
    sponsorTargetId,
    pauseUntil: settings.pauseUntil || null,
    disabled: Boolean(settings.disabled),
    syncEnabled: Boolean(settings.syncEnabled)
  };
}

function ensureStateFile(dataPath) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify(defaultState(), null, 2));
  }
}

function readState(dataPath) {
  ensureStateFile(dataPath);
  const raw = fs.readFileSync(dataPath, "utf8");
  return { ...defaultState(), ...JSON.parse(raw || "{}") };
}

function writeState(dataPath, mutator) {
  const state = readState(dataPath);
  const result = mutator(state);
  fs.writeFileSync(dataPath, JSON.stringify(state, null, 2));
  return result;
}

function defaultState() {
  return {
    users: [],
    sessions: {},
    accountSettings: {},
    installations: [],
    linkCodes: {},
    events: [],
    ledger: [],
    sponsors: [],
    campaigns: [],
    creatives: [],
    reportingPeriods: [],
    auditEvents: []
  };
}

function resolvePilotDataPath(projectRoot = process.cwd()) {
  if (process.env.WAITLY_PILOT_DATA) {
    return process.env.WAITLY_PILOT_DATA;
  }
  const home = process.env.WAITLY_HOME || path.join(os.homedir(), ".waitly");
  return path.join(home, "pilot-state.json");
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    ...corsHeaders(),
    ...extraHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "http://127.0.0.1",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function sessionCookie(sessionId) {
  return {
    "Set-Cookie": `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/`
  };
}

function clearSessionCookie() {
  return {
    "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > JSON_LIMIT_BYTES) {
        reject(new Error("JSON body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function parseCookies(header) {
  const cookies = {};
  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(valueParts.join("="));
    }
  }
  return cookies;
}

function rejectProhibitedPayload(payload, allowedFields) {
  const extras = Object.keys(payload || {}).filter((key) => !allowedFields.includes(key));
  if (extras.length > 0) {
    const error = new Error(`Unsupported field: ${extras[0]}`);
    error.code = "unsupported_field";
    throw error;
  }
  const violation = findProhibitedField(payload);
  if (violation && !allowedFields.includes(violation)) {
    const error = new Error(`Prohibited field: ${violation}`);
    error.code = "prohibited_field";
    throw error;
  }
}

function findProhibitedField(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findProhibitedField(item);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    if (prohibitedFieldNames.some((name) => key.toLowerCase() === name.toLowerCase())) {
      return key;
    }
    const nested = findProhibitedField(value[key]);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function pickAllowed(source, allowedFields) {
  const picked = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) {
      picked[field] = source[field];
    }
  }
  return picked;
}

function validateSponsorCategory(category) {
  if (disallowedSponsorCategories.has(category)) {
    return { ok: false, error: "disallowed_category" };
  }
  if (!allowedSponsorCategories.has(category)) {
    return { ok: false, error: "unknown_category" };
  }
  return { ok: true };
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch (_) {
    return false;
  }
}

function validateImageDataUrl(value) {
  const imageDataUrl = String(value || "").trim();
  if (!imageDataUrl) {
    return { ok: false, error: "image_required" };
  }
  if (Buffer.byteLength(imageDataUrl, "utf8") > IMAGE_DATA_URL_LIMIT_BYTES) {
    return { ok: false, error: "image_too_large" };
  }
  if (!/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-zA-Z0-9+/=]+$/.test(imageDataUrl)) {
    return { ok: false, error: "unsupported_image" };
  }
  return { ok: true, value: imageDataUrl };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role
  };
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createLinkCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function hashLinkCode(code) {
  return crypto.createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex");
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sumAmount(entries) {
  return entries.reduce((sum, entry) => sum + entry.amountMinor, 0);
}

function latestTimestamp(entries) {
  const timestamps = entries.map((entry) => entry.createdAt || entry.occurredAt).filter(Boolean).sort();
  return timestamps[timestamps.length - 1] || null;
}

function reportingPeriodFor(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

module.exports = {
  createPilotApi,
  resolvePilotDataPath,
  readState,
  defaultState
};
