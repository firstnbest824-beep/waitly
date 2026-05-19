#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { createPilotApi } = require("../lib/pilot-api");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const port = Number.parseInt(process.argv[2] || process.env.PORT || "5173", 10);
const pilotApi = createPilotApi({ projectRoot: root });

// Minimal MIME map for the static product app assets.
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

  // API routes are handled first; everything else falls through to static files.
  if (await pilotApi(request, response, requestUrl)) {
    return;
  }

  const filePath = resolvePath(requestUrl.pathname);

  if (!filePath.startsWith(root)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Waitly local web: http://127.0.0.1:${port}/home/`);
});

function resolvePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  // Product app routes all share the single-page app shell.
  if (isProductAppRoute(decoded)) {
    return path.join(publicRoot, "index.html");
  }
  // Normalize requested paths before joining them to the local project root.
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const publicFilePath = path.join(publicRoot, normalized);

  if (fs.existsSync(publicFilePath) && fs.statSync(publicFilePath).isFile()) {
    return publicFilePath;
  }

  let filePath = path.join(root, normalized);

  if (decoded.endsWith("/")) {
    filePath = path.join(filePath, "index.html");
  }

  return filePath;
}

function isProductAppRoute(pathname) {
  // Keep this list explicit so unknown paths still return a real 404.
  return [
    "/",
    "/home",
    "/home/",
    "/dashboard",
    "/dashboard/",
    "/leaderboard",
    "/leaderboard/",
    "/rooms",
    "/rooms/",
    "/rooms/new",
    "/rooms/new/",
    "/rooms/vite-sprint",
    "/rooms/vite-sprint/",
    "/targets",
    "/targets/",
    "/admin",
    "/admin/",
    "/settings",
    "/settings/",
    "/login",
    "/login/"
  ].includes(pathname);
}
