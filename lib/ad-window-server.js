const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { openUrl } = require("./open-url");

const projectRoot = path.resolve(__dirname, "..");
const waitlyLogoPath = path.join(projectRoot, "로고", "ChatGPT Image Apr 25, 2026, 12_26_49 AM.png");

async function startAdWindowServer({
  sessionId,
  sponsorTarget,
  creatives,
  eventLog,
  openAds,
  adRotationMs = 8000,
  adWindow = { width: 320, height: 430, margin: 0, animationMs: 450, x: null, y: null }
}) {
  const ads = new Map();
  const fallbackCreatives = Array.isArray(creatives) ? creatives : [];
  const getCreatives = typeof creatives === "function" ? creatives : () => fallbackCreatives;
  let active = true;
  let shutdownReason = null;
  let shutdownTimer = null;
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    const isHead = request.method === "HEAD";
    const isGet = request.method === "GET" || isHead;

    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders());
      response.end();
      return;
    }

    if (isGet && (requestUrl.pathname === "/favicon.png" || requestUrl.pathname === "/favicon.ico")) {
      sendLogoPng(response, isHead);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/manifest.webmanifest") {
      sendJson(response, {
        name: "Waitly",
        short_name: "Waitly",
        start_url: "/ad",
        display: "standalone",
        background_color: "#fffaf0",
        theme_color: "#171615",
        icons: [
          {
            src: "/favicon.png",
            sizes: "1254x1254",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/ad") {
      const adId = requestUrl.searchParams.get("adId");
      const ad = ads.get(adId);

      if (!ad) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Ad not found");
        return;
      }

      sendHtml(response, renderAdPage({
        adId,
        sessionId,
        sponsorTarget,
        creative: ad.creative,
        creatives: ad.rotationCreatives,
        rotationMs: adRotationMs,
        waitDurationMs: ad.waitDurationMs
      }));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/event") {
      readJsonBody(request, 2048)
        .then((body) => {
          const ad = ads.get(body.adId);
          const eventName = normalizeAdEvent(body.event);
          const eventCreative = resolveEventCreative(ad, body);

          eventLog.write(eventName, {
            sessionId,
            adId: body.adId,
            sponsorTarget,
            creativeId: eventCreative ? eventCreative.id : undefined,
            campaignId: eventCreative ? eventCreative.campaignId : undefined,
            sponsorId: eventCreative ? eventCreative.sponsorId : undefined,
            creativeIndex: Number.isInteger(body.creativeIndex) ? body.creativeIndex : undefined
          });

          response.writeHead(204, corsHeaders());
          response.end();
        })
        .catch(() => {
          response.writeHead(400, corsHeaders());
          response.end();
        });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(response, { ok: true, sessionId });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/state") {
      sendJson(response, {
        ok: true,
        sessionId,
        active,
        shutdownReason
      });
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    showAd({ creativeIndex, waitDurationMs, reason }) {
      const adId = crypto.randomUUID();
      const activeCreatives = resolveCreatives(getCreatives, fallbackCreatives);
      const creative = activeCreatives[creativeIndex % activeCreatives.length];
      const rotationCreatives = rotateCreatives(activeCreatives, creativeIndex);
      const url = `${baseUrl}/ad?adId=${encodeURIComponent(adId)}`;
      const launch = openUrl(url, {
        openAds,
        width: adWindow.width,
        height: adWindow.height,
        margin: adWindow.margin,
        animationMs: adWindow.animationMs,
        x: adWindow.x,
        y: adWindow.y
      });

      ads.set(adId, {
        creative,
        rotationCreatives,
        waitDurationMs,
        launch,
        openedAt: new Date().toISOString()
      });

      eventLog.write("ad_opened", {
        sessionId,
        adId,
        creativeId: creative.id,
        campaignId: creative.campaignId,
        sponsorId: creative.sponsorId,
        sponsorTarget,
        waitDurationMs,
        reason,
        openMode: launch.mode,
        placement: launch.placement,
        windowWidth: adWindow.width,
        windowHeight: adWindow.height,
        windowX: launch.position ? launch.position.x : null,
        windowY: launch.position ? launch.position.y : null,
        windowRightGap: launch.position ? launch.position.rightGap : null,
        windowBottomGap: launch.position ? launch.position.bottomGap : null,
        windowMargin: adWindow.margin,
        popupPid: launch.pid,
        animationMs: adWindow.animationMs,
        rotationMs: adRotationMs,
        rotationCount: rotationCreatives.length
      });

      return { adId, url, creative };
    },
    endSession(reason = "wrapped_process_finished") {
      active = false;
      shutdownReason = reason;

      eventLog.write("ad_window_shutdown_requested", {
        sessionId,
        reason,
        openAds: ads.size
      });

      for (const ad of ads.values()) {
        if (ad.launch && typeof ad.launch.close === "function") {
          ad.launch.close();
        }
      }

      clearTimeout(shutdownTimer);
      shutdownTimer = setTimeout(() => {
        server.close();
      }, 1500);
    },
    closeNow() {
      active = false;
      clearTimeout(shutdownTimer);

      for (const ad of ads.values()) {
        if (ad.launch && typeof ad.launch.close === "function") {
          ad.launch.close();
        }
      }

      server.close();
    }
  };
}

function renderAdPage({ adId, sessionId, sponsorTarget, creative, creatives, rotationMs, waitDurationMs }) {
  const waitSeconds = Math.max(0, Math.round(waitDurationMs / 1000));
  const creativePayload = creatives.map(serializeCreative);
  const escaped = {
    adId: escapeHtml(adId || ""),
    sessionId: escapeHtml(sessionId),
    sponsorTarget: escapeHtml(sponsorTarget),
    headline: escapeHtml(creative.headline),
    body: escapeHtml(creative.body),
    sponsor: escapeHtml(creative.sponsor),
    cta: escapeHtml(creative.cta || "보기"),
    url: escapeAttribute(creative.url),
    imageDataUrl: escapeImageSource(creative.imageDataUrl || ""),
    imageAlt: escapeHtml(creative.imageAlt || "Sponsored image")
  };
  const imageHidden = escaped.imageDataUrl ? "" : " hidden";

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Waitly</title>
  <meta name="application-name" content="Waitly">
  <meta name="theme-color" content="#171615">
  <link rel="icon" type="image/png" sizes="1254x1254" href="/favicon.png">
  <link rel="shortcut icon" href="/favicon.png">
  <link rel="apple-touch-icon" href="/favicon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <style>
    :root {
      color-scheme: light;
      --ink: #171615;
      --muted: #67615a;
      --paper: #fffaf0;
      --line: #d9cebf;
      --green: #1f8a5b;
      --yellow: #f0bf35;
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      background: #f4f0e8;
      color: var(--ink);
      font-family: Inter, Pretendard, "Noto Sans KR", Arial, sans-serif;
      letter-spacing: 0;
      overflow: hidden;
    }

    main {
      width: 100vw;
      min-height: 100vh;
      border: 0;
      border-radius: 0;
      background: var(--paper);
      overflow: hidden;
      animation: rise-in 420ms cubic-bezier(0.18, 0.86, 0.28, 1) both;
    }

    @keyframes rise-in {
      from {
        transform: translateY(26px);
        opacity: 0.92;
      }

      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .bar {
      position: absolute;
      z-index: 4;
      top: 8px;
      left: 8px;
      right: 8px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 0 8px;
      border: 1px solid rgba(255, 255, 255, 0.42);
      border-radius: 999px;
      background: rgba(12, 14, 18, 0.76);
      color: var(--paper);
      backdrop-filter: blur(12px);
      font-size: 12px;
      font-weight: 900;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .mark {
      width: 22px;
      height: 22px;
      display: block;
      flex: 0 0 22px;
      border: 1px solid rgba(255, 250, 240, 0.58);
      border-radius: 6px;
      background: #ffffff;
      object-fit: contain;
    }

    .brand-name {
      display: flex;
      flex-direction: column;
      line-height: 1.05;
    }

    .brand-name strong {
      font-size: 12px;
      font-weight: 950;
    }

    .brand-name span {
      color: #d8cec0;
      font-size: 9px;
      font-weight: 800;
    }

    .ad-kind {
      margin-left: auto;
      padding: 3px 7px;
      border: 1px solid rgba(255, 250, 240, 0.58);
      border-radius: 999px;
      color: var(--paper);
      font-size: 9px;
      font-weight: 950;
      white-space: nowrap;
    }

    .body {
      position: relative;
      height: 100vh;
      display: block;
      padding: 0;
      overflow: hidden;
    }

    .body::after {
      content: "";
      position: absolute;
      z-index: 1;
      left: 0;
      right: 0;
      bottom: 0;
      height: 44%;
      background: linear-gradient(0deg, rgba(5, 7, 11, 0.94) 0%, rgba(5, 7, 11, 0.72) 48%, rgba(5, 7, 11, 0) 100%);
      pointer-events: none;
    }

    .creative-image {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      margin: 0;
      border: 0;
      border-radius: 0;
      background: #05070b;
      transition: opacity 180ms ease, transform 180ms ease;
    }

    .creative-image[hidden] {
      display: none;
    }

    .label {
      display: inline-flex;
      position: absolute;
      z-index: 4;
      top: 48px;
      right: 10px;
      margin: 0;
      padding: 3px 7px;
      border: 1px solid rgba(255, 255, 255, 0.48);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.88);
      color: #101317;
      font-size: 9px;
      font-weight: 950;
      text-transform: uppercase;
    }

    h1 {
      position: absolute;
      z-index: 2;
      left: 14px;
      right: 14px;
      bottom: 78px;
      margin: 0;
      color: #ffffff;
      font-size: 21px;
      line-height: 1.05;
      letter-spacing: 0;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.42);
      transition: opacity 180ms ease, transform 180ms ease;
    }

    p {
      position: absolute;
      z-index: 2;
      left: 14px;
      right: 14px;
      bottom: 54px;
      display: -webkit-box;
      margin: 0;
      color: rgba(255, 255, 255, 0.82);
      font-size: 11px;
      line-height: 1.2;
      font-weight: 800;
      overflow: hidden;
      word-break: keep-all;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      transition: opacity 180ms ease, transform 180ms ease;
    }

    .creative-changing .creative-image,
    .creative-changing h1,
    .creative-changing p {
      opacity: 0.28;
      transform: translateY(5px);
    }

    .rotation-strip {
      position: absolute;
      z-index: 3;
      left: 14px;
      right: 14px;
      bottom: 58px;
      display: flex;
      gap: 5px;
      margin: 0;
    }

    .rotation-dot {
      height: 3px;
      flex: 1;
      border-radius: 999px;
      background: #d8cec0;
      overflow: hidden;
    }

    .rotation-dot.active {
      background: var(--ink);
    }

    .funding {
      display: none;
    }

    .funding strong {
      color: var(--green);
    }

    .actions {
      position: absolute;
      z-index: 3;
      left: 12px;
      right: 12px;
      bottom: 12px;
      display: flex;
      gap: 8px;
      margin: 0;
    }

    .actions a {
      min-height: 38px;
      flex: 1;
      border: 0;
      border-radius: 10px;
      font: inherit;
      font-size: 13px;
      font-weight: 950;
      cursor: pointer;
    }

    .actions a {
      display: grid;
      place-items: center;
      background: #ffffff;
      color: #101317;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
      text-decoration: none;
    }

    .meta {
      display: none;
    }
  </style>
</head>
<body>
  <main>
    <div class="bar">
      <div class="brand" aria-label="Waitly">
        <img class="mark" src="/favicon.png" alt="">
        <span class="brand-name">
          <strong>Waitly</strong>
          <span>AI wait sponsor ad</span>
        </span>
      </div>
      <span class="ad-kind">후원 광고</span>
    </div>
    <div class="body">
      <span class="label">Sponsored</span>
      <img class="creative-image" data-creative-image src="${escaped.imageDataUrl}" alt="${escaped.imageAlt}"${imageHidden}>
      <h1 data-creative-headline>${escaped.headline}</h1>
      <p data-creative-body>${escaped.body}</p>
      <div class="funding">
        이 광고 수익 일부가 <strong>${escaped.sponsorTarget}</strong>에 후원됩니다.
      </div>
      <div class="actions">
        <a data-click data-creative-cta href="${escaped.url}" target="_blank" rel="noreferrer">${escaped.cta}</a>
      </div>
      <div class="rotation-strip" data-rotation-strip aria-hidden="true"></div>
      <div class="meta">
        AI 작업이 끝나면 자동으로 닫힙니다. 코드 내용은 수집하지 않습니다. 대기 시간: ${waitSeconds}초.
      </div>
    </div>
  </main>
  <script>
    const adId = ${JSON.stringify(adId || "")};
    const sessionId = ${JSON.stringify(sessionId)};
    const creatives = ${safeJson(creativePayload)};
    const rotationMs = ${JSON.stringify(rotationMs)};
    let creativeIndex = 0;
    let currentCreative = creatives[0];
    let closing = false;
    let sessionTimer = null;

    function send(event, extra = {}) {
      const payload = JSON.stringify({
        event,
        adId,
        sessionId,
        creativeId: currentCreative ? currentCreative.id : undefined,
        creativeIndex,
        ...extra
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/event", new Blob([payload], { type: "application/json" }));
        return;
      }

      fetch("/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }

    function renderDots() {
      const strip = document.querySelector("[data-rotation-strip]");
      if (!strip || creatives.length <= 1) {
        if (strip) {
          strip.hidden = true;
        }
        return;
      }

      strip.innerHTML = creatives
        .map((_, index) => '<span class="rotation-dot' + (index === creativeIndex ? ' active' : '') + '"></span>')
        .join("");
    }

    function applyCreative(nextIndex, reason) {
      if (!creatives.length) {
        return;
      }

      creativeIndex = nextIndex % creatives.length;
      currentCreative = creatives[creativeIndex];
      document.body.classList.add("creative-changing");

      setTimeout(() => {
        const image = document.querySelector("[data-creative-image]");
        const headline = document.querySelector("[data-creative-headline]");
        const body = document.querySelector("[data-creative-body]");
        const cta = document.querySelector("[data-creative-cta]");

        if (image) {
          if (currentCreative.imageDataUrl) {
            image.hidden = false;
            image.src = currentCreative.imageDataUrl;
            image.alt = currentCreative.imageAlt || "Sponsored image";
          } else {
            image.hidden = true;
            image.removeAttribute("src");
          }
        }

        if (headline) {
          headline.textContent = currentCreative.headline;
        }

        if (body) {
          body.textContent = currentCreative.body;
        }

        if (cta) {
          cta.textContent = currentCreative.cta || "보기";
          cta.href = currentCreative.url;
        }

        renderDots();
        document.body.classList.remove("creative-changing");

        if (reason === "rotation") {
          send("rotation_impression");
        }
      }, 130);
    }

    applyCreative(0, "initial");
    send("impression");

    if (creatives.length > 1 && rotationMs > 0) {
      setInterval(() => {
        applyCreative(creativeIndex + 1, "rotation");
      }, rotationMs);
    }

    document.querySelector("[data-click]").addEventListener("click", () => {
      send("click");
    });

    async function checkSessionState() {
      try {
        const response = await fetch("/state", { cache: "no-store" });
        const state = await response.json();
        if (!state.active) {
          closing = true;
          if (sessionTimer) {
            clearInterval(sessionTimer);
          }
          send("auto_close");
          window.close();
          document.body.innerHTML = "";
        }
      } catch (_) {
        closing = true;
        window.close();
      }
    }

    sessionTimer = setInterval(checkSessionState, 700);

    window.addEventListener("beforeunload", () => {
      if (!closing) {
        send("unload");
      }
    });
  </script>
</body>
</html>`;
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error("body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendHtml(response, html) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders()
  });
  response.end(html);
}

function sendJson(response, body) {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders()
  });
  response.end(JSON.stringify(body));
}

function sendLogoPng(response, headOnly = false) {
  try {
    const logo = fs.readFileSync(waitlyLogoPath);
    response.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": logo.length,
      "Cache-Control": "public, max-age=3600",
      ...corsHeaders()
    });
    response.end(headOnly ? undefined : logo);
  } catch (_) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      ...corsHeaders()
    });
    response.end(headOnly ? undefined : "Waitly logo not found");
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function normalizeAdEvent(event) {
  const allowed = new Set(["impression", "rotation_impression", "click", "close", "auto_close", "unload"]);
  return allowed.has(event) ? `ad_${event}` : "ad_event";
}

function rotateCreatives(creatives, startIndex) {
  return creatives.map((_, offset) => creatives[(startIndex + offset) % creatives.length]);
}

function resolveCreatives(getCreatives, fallbackCreatives) {
  try {
    const currentCreatives = getCreatives();
    if (Array.isArray(currentCreatives) && currentCreatives.length > 0) {
      return currentCreatives;
    }
  } catch (_) {
    // Keep the ad window usable if a live creative refresh fails.
  }
  return fallbackCreatives;
}

function serializeCreative(creative) {
  return {
    id: creative.id,
    campaignId: creative.campaignId,
    sponsorId: creative.sponsorId,
    headline: creative.headline,
    body: creative.body,
    sponsor: creative.sponsor,
    cta: creative.cta,
    url: creative.url,
    imageDataUrl: creative.imageDataUrl || "",
    imageAlt: creative.imageAlt || "Sponsored image"
  };
}

function resolveEventCreative(ad, body) {
  if (!ad) {
    return undefined;
  }

  const matched = ad.rotationCreatives.find((creative) => creative.id === body.creativeId);
  if (matched) {
    return matched;
  }

  return ad.creative;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  const stringValue = String(value || "#");
  if (!/^https?:\/\//.test(stringValue)) {
    return "#";
  }
  return escapeHtml(stringValue);
}

function escapeImageSource(value) {
  const stringValue = String(value || "");
  if (!/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-zA-Z0-9+/=]+$/.test(stringValue)) {
    return "";
  }
  return stringValue;
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

module.exports = {
  startAdWindowServer
};
