# Waitly Pilot API

Status: local pilot MVP.

This API is served by `npm run waitly:web` under `/v1/*`. It uses a local JSON state file and is intended for pilot product validation, not production authentication or settlement.

Default state path:

```text
$WAITLY_HOME/pilot-state.json
```

Override:

```text
WAITLY_PILOT_DATA=/path/to/pilot-state.json
```

## Implemented Capabilities

- Local signup, login, logout, and session inspection.
- Public aggregate contribution total.
- Signed-in dashboard totals derived from ledger entries.
- Account settings with optimistic `version` conflict checks.
- Device-code install linking with one-time expiring codes.
- Content-free event ingestion.
- Donation ledger entries for eligible impressions and clicks.
- Admin sponsor, creative, and campaign setup.
- Creative approval/rejection workflow.
- Pending ledger confirmation for public reporting.
- Settlement boundary: `settled` reporting is rejected unless `WAITLY_ENABLE_SETTLEMENT=1`.

## Privacy Contract

Event ingestion rejects prohibited developer-content fields, including:

```text
prompt, code, output, stdout, stderr, command, args, path, filename,
repo, repository, env, token, secret, clipboard, screenshot, keystroke,
password, modelResponse
```

The event ingestion allowlist is:

```text
eventId, installId, type, occurredAt, sessionId, adId, campaignId,
creativeId, sponsorId, donationTargetId, roomId, durationMs, waitDurationMs
```

## Auth Endpoints

```text
POST /v1/auth/signup
POST /v1/auth/login
POST /v1/auth/logout
GET  /v1/session
```

Signup/login set an HTTP-only local `waitly_session` cookie. `admin@waitly.local` is treated as the local pilot admin account.

## Account Endpoints

```text
GET   /v1/me/dashboard
GET   /v1/me/settings
PATCH /v1/me/settings
POST  /v1/me/link-codes
GET   /v1/me/installations
GET   /v1/me/ledger
```

Settings updates should include the current `version`. Stale writes return `409 version_conflict`.

## Install Link Endpoint

```text
POST /v1/install-links/consume
```

The CLI or local install surface submits:

```json
{
  "code": "AB12CD34",
  "installId": "local-install-id",
  "appVersion": "0.1.0",
  "osFamily": "linux",
  "osArch": "x64"
}
```

Codes are stored hashed and can be consumed once.

## Ledger Endpoint

```text
POST /v1/events/ingest
```

Eligible event types:

```text
ad_impression
ad_click
```

Other content-free event types are accepted but do not create ledger entries.

## Public Reporting

```text
GET /v1/public/contribution-total
```

Returns confirmed headline total and separate pending estimate. Pending values are not mixed into confirmed totals.

## Admin Endpoints

```text
POST  /v1/admin/sponsors
POST  /v1/admin/creatives
PATCH /v1/admin/creatives/:id
GET   /v1/admin/creatives
POST  /v1/admin/campaigns
POST  /v1/admin/ledger/confirm
POST  /v1/admin/reporting-periods
```

Admin rules:

- Sponsor categories must be allowlisted.
- Disallowed categories such as gambling, malware, spyware, political, or misleading financial claims are rejected.
- Creative destination URLs must use HTTPS.
- Creatives start in `pending_review`.
- Sponsor self-publishing is not enabled.
- `settled` reporting remains future-only unless explicitly enabled by environment.
