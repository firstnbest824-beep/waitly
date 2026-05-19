const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appJs = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const appCss = fs.readFileSync(path.join(root, "public", "app.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const configJs = fs.readFileSync(path.join(root, "public", "supabase-config.js"), "utf8");
const localWeb = fs.readFileSync(path.join(root, "scripts", "local-web.js"), "utf8");
const netlifyToml = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");

[
  '<link rel="stylesheet" href="/app.css">',
  '<script src="/supabase-config.js"></script>',
  '<script src="/app.js"></script>'
].forEach((snippet) => {
  assert.ok(indexHtml.includes(snippet), `missing product shell snippet: ${snippet}`);
});

[
  "signInWithOAuth",
  'provider: "google"',
  'scopes: "openid email"',
  "skipBrowserRedirect: true",
  "window.location.assign(data.url)",
  "redirectTo: new URL(loginRedirectPath(), window.location.origin).href",
  "protectedRoutes",
  '"/dashboard/"',
  '"/settings/"',
  '"/rooms/new/"',
  '"/admin/"',
  "renderAuthRequired",
  "renderAdmin",
  "renderAdminLogin",
  "data-admin-instant-ad-form",
  "data-admin-image-input",
  "data-admin-image-preview",
  '"/v1/admin/overview"',
  '"/v1/admin/instant-ad"',
  "readAdminImageFile",
  "previewInstantAdImage",
  "submitInstantAd",
  "imageDataUrl",
  "data-google-login",
  "data-pilot-login-form",
  "callPilotApi",
  '"/v1/auth/signup"',
  '"/v1/auth/login"',
  '"/v1/auth/logout"',
  '"/v1/session"',
  "data-sign-out-panel",
  'next !== "/home/"',
  'next !== "/login/"',
  "detectSessionInUrl: true"
].forEach((snippet) => {
  assert.ok(appJs.includes(snippet), `missing auth wiring snippet: ${snippet}`);
});

assert.equal(
  appJs.includes('<a class="button" href="/login/?next=${encodeURIComponent(currentPath())}">로그인</a>'),
  false,
  "global login button should not preserve public currentPath as next"
);

[
  "SUPABASE_DATABASE_URL",
  "PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY"
].forEach((snippet) => {
  const configWriter = fs.readFileSync(path.join(root, "scripts", "write-supabase-config.js"), "utf8");
  assert.ok(configWriter.includes(snippet), `missing Supabase env fallback: ${snippet}`);
});

[
  "SUPABASE_PUBLISHABLE_KEY",
  "PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY"
].forEach((snippet) => {
  const configWriter = fs.readFileSync(path.join(root, "scripts", "write-supabase-config.js"), "utf8");
  assert.ok(configWriter.includes(snippet), `missing Supabase publishable key fallback: ${snippet}`);
});

assert.ok(appCss.includes("button:disabled"), "login button needs disabled state styling");
assert.ok(appCss.includes(".pilot-login-form"), "pilot login form needs styling");
assert.ok(appCss.includes(".admin-grid"), "admin ops console needs styling");
assert.ok(appCss.includes(".instant-ad-form"), "instant ad upload form needs styling");
assert.ok(appCss.includes(".admin-live-ad"), "live image ad preview needs styling");
assert.ok(configJs.includes("window.WAITLY_SUPABASE"), "Supabase browser config must be present");
assert.ok(localWeb.includes("isProductAppRoute"), "local web server must serve product app routes");
assert.ok(localWeb.includes('"/admin/"'), "local web server must serve admin route");

[
  'from = "/home/*"',
  'from = "/dashboard/*"',
  'from = "/rooms/*"',
  'from = "/settings/*"',
  'from = "/login/*"'
].forEach((snippet) => {
  assert.ok(netlifyToml.includes(snippet), `missing Netlify route rewrite: ${snippet}`);
});

new Function(appJs);

console.log("ok - product auth wiring is present");
