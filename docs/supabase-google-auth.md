# Supabase Google Login Setup

Status: implementation guide for Waitly product login.

## Current App Wiring

The product app loads `public/supabase-config.js` before `public/app.js`.

When both `window.WAITLY_SUPABASE.url` and `window.WAITLY_SUPABASE.anonKey` are present, `/login/` uses:

```js
client.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: new URL(loginRedirectPath(), window.location.origin).href
    scopes: "openid email"
  }
});
```

When Supabase config is blank, local development falls back to the local pilot API login.

## Required Supabase Settings

Set the Supabase project browser values before local testing or Netlify build:

```sh
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
node scripts/write-supabase-config.js
```

Accepted key aliases:

- `SUPABASE_ANON_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_SUPABASE_ANON_KEY`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Google OAuth Provider

Current local pilot configuration:

- Supabase project ref: `jjpypvgtukbaodtaqhhc`
- Supabase callback URL: `https://jjpypvgtukbaodtaqhhc.supabase.co/auth/v1/callback`
- Google Cloud project: `e-minutia-488702-p4`
- Google OAuth provider status: pending standard Google Auth Platform Web Client credentials.

Important: `gcloud iam oauth-clients` creates IAM OAuth clients that are not accepted by regular Google Account sign-in through Supabase social login. Supabase Google login needs a standard Google Auth Platform Web Client ID that ends with `.apps.googleusercontent.com`.

For a new environment, create equivalent credentials in Google Cloud:

1. Create an OAuth Client ID with type `Web application`.
2. Add authorized JavaScript origins:
   - local: `http://127.0.0.1:5173`
   - alternate local port if used: `http://127.0.0.1:5174`
   - production site origin when deployed.
3. Add the Supabase callback URL as an authorized redirect URI:
   - `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copy the Google Client ID and Client Secret.

In Supabase Dashboard:

1. Open Authentication > Providers > Google.
2. Enable Google.
3. Paste the Google Client ID and Client Secret.
4. Save.

In Supabase Auth URL Configuration:

1. Set Site URL to the production site when available.
2. Add local redirect URLs:
   - `http://127.0.0.1:5173/**`
   - `http://127.0.0.1:5174/**`
3. Add production and preview redirect URLs before external testing.

## MCP Status

Codex has a Supabase remote MCP server registered globally:

```text
name: supabase
url: https://mcp.supabase.com/mcp
auth: SUPABASE_ACCESS_TOKEN bearer token
```

Set `SUPABASE_ACCESS_TOKEN` in the shell before starting a new Codex session to let Codex query or manage Supabase through MCP.

Google Calendar and Gmail connectors are already enabled in Codex and profile access was verified. They do not create Google Cloud OAuth clients for Supabase; the Google OAuth client still needs Google Auth Platform credentials.

Google Cloud CLI and IAM MCP are also installed:

```text
gcloud: /home/kyl5822/.local/bin/gcloud
MCP name: google-iam
MCP url: https://iam.googleapis.com/mcp
MCP auth: GOOGLE_OAUTH_ACCESS_TOKEN bearer token
```

Before starting a new Codex session that needs Google IAM MCP access, export:

```sh
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
```
