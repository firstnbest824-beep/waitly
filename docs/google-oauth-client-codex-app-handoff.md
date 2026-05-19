# Google OAuth Client Handoff for Codex App

Updated: 2026-04-27 15:33 KST

## Objective

Create a standard Google Auth Platform **Web application** OAuth client for Waitly Supabase Google login, then store the generated credentials in a local secret file outside the repository.

This task is only for Google Cloud Console credential creation and local secret storage. Do not make broad application code changes.

## Context

- Waitly project path: `/home/kyl5822/project/ai광고 플랫폼`
- Google Cloud project ID: `e-minutia-488702-p4`
- Google Cloud project name: `My Project 27957`
- Supabase project ref: `jjpypvgtukbaodtaqhhc`
- Supabase callback URL:

```text
https://jjpypvgtukbaodtaqhhc.supabase.co/auth/v1/callback
```

The previous attempt used `gcloud iam oauth-clients`. That creates a Google IAM OAuth client with a UUID-style client ID, which is **not valid** for Supabase Google social login. Do not use `gcloud iam oauth-clients` for this task.

The correct Client ID must look like this:

```text
...apps.googleusercontent.com
```

## Scope and Ownership

Codex App owns:

- Google Cloud Console browser work.
- Creating the Google Auth Platform OAuth client.
- Writing the generated Client ID and Client Secret to the local secret file.

Codex App must not edit:

- `public/app.js`
- `public/app.css`
- `public/supabase-config.js`
- `scripts/write-supabase-config.js`
- Supabase provider settings, unless explicitly requested after this handoff.

Kim Manager / WSL Codex owns after this handoff:

- Enabling the Supabase Google provider.
- Running Waitly tests.
- Verifying `/login/` redirects to Google and returns to `/dashboard/`.

## Browser Task

Open this Google Cloud Console page:

```text
https://console.cloud.google.com/auth/clients?project=e-minutia-488702-p4
```

If Google asks for login, use the already authorized owner account:

```text
kimhuw2@gmail.com
```

Create a new OAuth client with these values:

- Application type: `Web application`
- Name: `Waitly Supabase`
- Authorized JavaScript origins:

```text
http://127.0.0.1:5173
http://127.0.0.1:5174
```

- Authorized redirect URI:

```text
https://jjpypvgtukbaodtaqhhc.supabase.co/auth/v1/callback
```

## Secret Storage

Do not paste the Client Secret into chat, commit it, or write it anywhere under the repository.

Create or update this Windows-side file:

```text
C:\Users\kyl58\.codex-secrets\google-oauth.env
```

Equivalent WSL path:

```text
/mnt/c/Users/kyl58/.codex-secrets/google-oauth.env
```

File format:

```dotenv
GOOGLE_OAUTH_CLIENT_ID=replace_with_client_id_ending_apps_googleusercontent_com
GOOGLE_OAUTH_CLIENT_SECRET=replace_with_client_secret
```

After writing the file, confirm only these facts in chat:

- The file was created or updated.
- The Client ID ends with `.apps.googleusercontent.com`.
- The redirect URI saved in Google Cloud is exactly `https://jjpypvgtukbaodtaqhhc.supabase.co/auth/v1/callback`.

Do not print the full Client Secret.

## Acceptance Criteria

The task is complete only when all of these are true:

- A Google Auth Platform Web application OAuth client exists in project `e-minutia-488702-p4`.
- The Client ID ends with `.apps.googleusercontent.com`.
- Authorized JavaScript origins include both local Waitly origins:
  - `http://127.0.0.1:5173`
  - `http://127.0.0.1:5174`
- Authorized redirect URIs include:
  - `https://jjpypvgtukbaodtaqhhc.supabase.co/auth/v1/callback`
- `C:\Users\kyl58\.codex-secrets\google-oauth.env` exists with `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
- No app source files were changed for this credential-only task.

## Handoff Back

When complete, tell Kim Manager:

```text
Google OAuth Web Client credentials are stored at C:\Users\kyl58\.codex-secrets\google-oauth.env.
Client ID ends with .apps.googleusercontent.com.
Supabase callback URI is registered.
No repository source files were changed.
```

