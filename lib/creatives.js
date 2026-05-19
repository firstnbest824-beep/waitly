const fs = require("node:fs");
const path = require("node:path");

const { readState, resolvePilotDataPath } = require("./pilot-api");

const fallbackCreatives = [
  {
    id: "fallback",
    headline: "Developer tool sponsor",
    body: "AI 작업 대기 시간에만 표시되는 개발자 맥락의 후원 광고입니다.",
    sponsor: "Waitly",
    cta: "보기",
    url: "https://waitly.dev/",
    imageDataUrl: "",
    imageAlt: ""
  }
];

function loadCreatives(projectRoot) {
  const operationalCreatives = loadOperationalCreatives(projectRoot);
  if (operationalCreatives.length > 0) {
    return operationalCreatives;
  }

  const creativesPath = path.join(projectRoot, "ads", "creatives.json");

  try {
    const parsed = JSON.parse(fs.readFileSync(creativesPath, "utf8"));
    const normalized = Array.isArray(parsed)
      ? parsed.map((creative, index) => normalizeCreative(creative, index, projectRoot)).filter(Boolean)
      : [];

    return normalized.length > 0 ? normalized : fallbackCreatives;
  } catch (_) {
    return fallbackCreatives;
  }
}

function loadOperationalCreatives(projectRoot) {
  const dataPath = resolvePilotDataPath(projectRoot);
  if (!fs.existsSync(dataPath)) {
    return [];
  }

  try {
    const state = readState(dataPath);
    const now = Date.now();
    return state.campaigns
      .filter((campaign) => isCampaignLive(campaign, now))
      .map((campaign) => {
        const sponsor = state.sponsors.find((item) => item.id === campaign.sponsorId);
        const creative = state.creatives.find((item) => item.id === campaign.creativeId);
        if (!sponsor || sponsor.status !== "approved" || !creative || creative.status !== "approved") {
          return null;
        }
        if (creative.sponsorId !== sponsor.id) {
          return null;
        }
        return normalizeOperationalCreative({ campaign, sponsor, creative });
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function isCampaignLive(campaign, now) {
  if (!campaign || campaign.status !== "active") {
    return false;
  }
  if (Number.isFinite(campaign.budgetMinor) && campaign.budgetMinor <= 0) {
    return false;
  }
  const startsAt = campaign.startsAt ? new Date(campaign.startsAt).getTime() : null;
  const endsAt = campaign.endsAt ? new Date(campaign.endsAt).getTime() : null;
  if (startsAt && startsAt > now) {
    return false;
  }
  if (endsAt && endsAt < now) {
    return false;
  }
  return true;
}

function normalizeOperationalCreative({ campaign, sponsor, creative }) {
  const headline = stringOrEmpty(creative.headline);
  const body = stringOrEmpty(creative.body);
  const url = stringOrEmpty(creative.destinationUrl);
  if (!headline || !body || !/^https:\/\//.test(url)) {
    return null;
  }
  return {
    id: stringOrEmpty(creative.id),
    campaignId: campaign.id,
    sponsorId: sponsor.id,
    headline,
    body,
    sponsor: stringOrEmpty(sponsor.name) || "Sponsor",
    cta: stringOrEmpty(creative.cta) || "보기",
    url,
    imageDataUrl: normalizeImageDataUrl(creative.imageDataUrl),
    imageAlt: stringOrEmpty(creative.imageAlt) || "Waitly sponsored developer ad"
  };
}

function normalizeCreative(creative, index, projectRoot) {
  if (!creative || typeof creative !== "object") {
    return null;
  }

  const headline = stringOrEmpty(creative.headline);
  const body = stringOrEmpty(creative.body);
  const url = stringOrEmpty(creative.url);

  if (!headline || !body || !/^https?:\/\//.test(url)) {
    return null;
  }

  return {
    id: stringOrEmpty(creative.id) || `creative-${index + 1}`,
    headline,
    body,
    sponsor: stringOrEmpty(creative.sponsor) || "Sponsor",
    cta: stringOrEmpty(creative.cta) || "보기",
    url,
    imageDataUrl: readImageDataUrl(projectRoot, creative.imagePath),
    imageAlt: stringOrEmpty(creative.imageAlt) || "Sponsored image"
  };
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readImageDataUrl(projectRoot, imagePath) {
  const relativePath = stringOrEmpty(imagePath);

  if (!relativePath) {
    return "";
  }

  const absolutePath = path.resolve(projectRoot, relativePath);

  if (!absolutePath.startsWith(`${projectRoot}${path.sep}`)) {
    return "";
  }

  try {
    const image = fs.readFileSync(absolutePath);
    const mime = mimeForPath(absolutePath);
    return `data:${mime};base64,${image.toString("base64")}`;
  } catch (_) {
    return "";
  }
}

function normalizeImageDataUrl(value) {
  const imageDataUrl = stringOrEmpty(value);
  if (!/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-zA-Z0-9+/=]+$/.test(imageDataUrl)) {
    return "";
  }
  return imageDataUrl;
}

function mimeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/png";
}

module.exports = {
  loadCreatives,
  loadOperationalCreatives
};
