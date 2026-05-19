# Waitly Account And Dashboard RFP

Status: implementation-ready RFP for Ralph Cycle 4 WP3.

Work package: RFP-WP3 - Account, Login, And User Dashboard.

Owner: product-account surface.

Source inputs:

- `docs/remaining-work-rfp.md` WP3.
- `docs/product-account-plan.md`.
- Privacy alignment with `docs/trust-policy.md`.

## Capability

After WP3 ships, Waitly still works for anonymous developers with no login, while signed-in users can link installs, sync allowed settings, and view personal estimated and confirmed contribution totals. Public visitors can view an all-user aggregate contribution total without login. Account settings control funding target, pause, disable, and account sync from outside the sponsored window. This work must not change the core sponsored-window lifecycle unless coordinated with the core owner.

## Fixed Constraints

- Anonymous local use is required. `waitly run ...` must not require an account or a reachable account API.
- Login is required only for cross-device totals, install linkage, account setting sync, room ownership or membership, personal history export, and admin operations.
- The sponsored window must not gain close, pause, disable, or login controls.
- Pause and disable controls must live outside the sponsored window.
- When globally disabled, wrapped CLI execution continues normally, no new sponsored windows open, and no impression or click donation credit accrues.
- Donation credit belongs to the selected target or room. It is not cash owed to the user and must not be presented as withdrawable.
- Pre-settlement values must be labeled estimated.
- Personal totals must be derived from ledger or aggregate records, not manually mutated dashboard counters.
- Historical anonymous activity must never be attached to an account silently.
- Account APIs, dashboard responses, and setting sync must not collect or expose prompts, code, terminal output, command arguments, file paths, repository data, environment variables, clipboard data, screenshots, keystrokes, secrets, or AI model responses.
- Account work must not edit `bin/`, `lib/`, or `ads/` without explicit core ownership coordination.

## Scope

WP3 owns the product/account contract for:

- Login and signup flow.
- Signed-in user identity.
- Install identity linkage plan.
- Personal contribution dashboard.
- Public all-user cumulative contribution display.
- Settings page for sponsor target, pause, disable, and account sync.
- No-login state for basic Waitly use.
- API and data model contract needed by dashboard, install linking, settings sync, and contribution summaries.
- Acceptance tests and rollback plan for account/dashboard behavior.

## Non-Goals

- Sponsor self-serve campaign launch.
- Sponsor admin UI beyond any role checks needed by account surfaces.
- Donation room creation, moderation, and membership flows except as route references exposed by WP4.
- Donation credit formula, pricing, settlement, tax, or payout automation.
- Core popup rendering or lifecycle changes.
- In-window close, pause, disable, or login controls.
- Landing page replacement.
- README, package, CLI, or ad creative edits by this work package.

## Actors

- Anonymous install: a local Waitly install with an `install_id`, local settings, and no signed-in account.
- Signed-in user: an account that can link one or more installs, sync settings, select a funding route, and view personal contribution summaries.
- Public visitor: any unauthenticated visitor viewing aggregate Waitly contribution totals.
- Admin: a signed-in user with an admin role for future target, sponsor, campaign, creative, and reporting approvals. WP3 only needs role-aware account plumbing if admin links are present.

## Identity States

```text
anonymous_install
- has install_id
- has local settings
- may have local-only estimated contribution records
- cannot view cross-device personal totals

signed_in_unlinked
- has user_id
- can use dashboard settings
- sees account totals from already-linked installs only
- is prompted to link the current install if applicable

signed_in_linked
- has user_id
- has one or more linked install_id values
- can sync selected settings to linked installs
- can view personal contribution summaries across linked installs

sync_paused
- user is signed in
- account sync is disabled for one or more settings
- local config remains authoritative for that install
```

Required transitions:

- Anonymous install to signed-in linked install requires explicit user action.
- Historical anonymous credit merge, if enabled, requires explicit consent after login.
- Linked install removal must stop future account sync to that install without deleting already-created ledger records.
- Logout must not delete local Waitly settings.

## Anonymous Use Requirements

- Basic Waitly execution must remain available with no account, no cookie, and no account API call.
- Anonymous users may view the public aggregate total.
- Anonymous installs may keep local settings, including sponsor target, pause, and disabled state.
- Anonymous installs may accrue eligible local events for future ledger processing only if the event schema is content-free.
- Anonymous local contribution display, if implemented, must be labeled local-only and estimated.
- Account service downtime must degrade to local-only mode rather than blocking wrapped CLI commands.

## Login Requirements

The MVP may use a hosted auth provider or first-party auth. The provider choice is open, but the product contract is fixed:

- Users can sign up, log in, log out, and restore an active session.
- Protected dashboard APIs require an authenticated `user_id`.
- Public aggregate APIs do not require authentication.
- Account metadata should be minimal: email or provider subject, display name if provided, created timestamp, and role.
- Login cannot imply that prior anonymous activity is automatically merged.
- Session handling must use secure, HTTP-only cookies or an equivalent provider-managed secure session mechanism.
- Admin and sponsor-operator roles must be explicit. Sponsor operator is future-only unless separately approved.

## Install Identity Linkage Plan

Preferred linkage model: device-code linking.

1. A signed-in dashboard user starts an install-link session.
2. The account service creates a short-lived one-time code with expiration.
3. A core-owned CLI/account command, future local app bridge, or equivalent install-owned surface submits the code with the local `install_id`.
4. The account service validates the code, links the `install_id` to the `user_id`, and records content-free install metadata.
5. The dashboard shows the linked install and sync status.

Required install metadata:

```text
install_identity
- id
- install_id
- user_id nullable
- app_version nullable
- os_family nullable
- os_arch nullable
- linked_at nullable
- last_seen_at nullable
- sync_enabled
- created_at
- updated_at
```

Linkage privacy rules:

- The link request must not include prompts, code, terminal output, raw command arguments, file paths, repository names, environment variables, or secrets.
- The one-time link code is an account credential. It must not be written to event logs or analytics records.
- The dashboard must distinguish "linked install" from "merged historical credit".
- If the first pilot skips anonymous historical merge, account totals start after link/login and the UI must say so plainly.

Historical anonymous merge, if enabled:

- Show a consent step before attaching historical local eligible records.
- Attach only content-free event or ledger references.
- Preserve original event timestamps, campaign IDs, route IDs, and eligibility status.
- Do not rewrite historical route ownership unless a future migration rule is approved.
- Allow the user to skip merge and continue with post-login credit only.

## Contribution Dashboard Requirements

The signed-in dashboard must show:

- Lifetime estimated contribution.
- Current reporting-period estimated contribution.
- Confirmed contribution.
- Settled contribution, if available.
- Active funding route.
- Breakdown by donation target.
- Breakdown by room when WP4 room data exists and cohort/privacy rules allow it.
- Linked installs and last sync status.
- Opt-out state: enabled, paused until timestamp, or disabled.
- Empty state for users with no eligible contribution.

Presentation rules:

- Estimated, confirmed, and settled values must be visually and textually distinct.
- Dashboard copy must not say the user earned, owns, can withdraw, or can cash out donation credit.
- Any pre-settlement total must use estimated language.
- Raw event logs must not be shown in the dashboard.
- Per-event drilldown, if ever added, must use content-free fields only and is out of scope for WP3 MVP.

## Public Aggregate Requirements

The public aggregate total must be available without login.

Recommended pilot definition:

- Headline total: confirmed donation credit across all pilot users.
- Optional secondary total: estimated pending credit for the current reporting period, displayed separately.

Required fields:

```text
public_contribution_total
- amount_minor
- currency
- status: confirmed | estimated
- reporting_period_start
- reporting_period_end
- last_updated_at
```

Privacy rules:

- No per-user data.
- No raw install IDs.
- No target, room, or sponsor subtotal unless minimum cohort thresholds are met.
- No claim that confirmed or estimated credit is settled cash unless settlement has occurred.
- If pending estimated credit is shown, it must not be added into the confirmed headline number without a label.

## Settings Requirements

The settings page must support these account-level controls:

- Funding route: direct sponsor target for WP3; room route may appear later through WP4.
- Pause sponsored-window opens until a timestamp, including an "until tomorrow" preset.
- Disable sponsored windows globally.
- Enable sponsored windows and clear account-level pause.
- Account sync on or off.
- Manual sync request or status refresh.

Local config compatibility:

- Current local config fields include `sponsorTarget`, `pauseUntil`, `disabled`, and legacy `adsPausedUntil` or `adsDisabled` fallbacks.
- WP3 should define account-side equivalents without directly editing local settings code.
- Core-owned sync integration should map account settings to local config only after explicit install link and sync opt-in.

Suggested account setting model:

```text
account_setting
- user_id
- active_route_type: target | room
- active_route_id
- sponsor_target_id nullable
- pause_until nullable
- disabled
- sync_enabled
- version
- updated_by: user | install | admin_support
- updated_at
```

Conflict rules for implementation:

- If sync is off, account changes do not overwrite local install settings.
- If disabled is true in either account or local config, the effective state is disabled until the user explicitly enables from an allowed control surface.
- Effective pause uses the latest future `pause_until` from synced account or local config.
- Funding route uses the latest explicit update by `updated_at` only when sync is enabled.
- Each synced setting update increments `version` so installs can detect stale writes.

Settings privacy rules:

- Do not record why the user paused or disabled unless they explicitly submit feedback.
- Do not include prompt, code, terminal output, command arguments, paths, repositories, or environment data with settings events.
- Settings sync cannot be used for ad targeting beyond selected funding route and allowed campaign eligibility metadata.

## API Contract Sketch

Provider-specific auth routes may vary. The following app APIs should remain stable.

### Session

```text
GET /v1/session
Response:
- authenticated
- user nullable
- roles
```

### Install Linking

```text
POST /v1/install-link-sessions
Auth: user
Response:
- link_session_id
- code
- expires_at

POST /v1/install-links
Auth: install link code or signed install flow
Request:
- code
- install_id
- app_version optional
- os_family optional
- os_arch optional
Response:
- linked
- install_id
- user_id
- linked_at

GET /v1/me/installs
Auth: user
Response:
- installs[]

DELETE /v1/me/installs/{install_id}
Auth: user
Response:
- unlinked
```

### Contribution Dashboard

```text
GET /v1/me/contribution-summary?period=current
Auth: user
Response:
- lifetime_estimated
- current_period_estimated
- confirmed
- settled
- currency
- active_route
- by_target[]
- by_room[]
- reporting_period
- last_updated_at
```

```text
GET /v1/public/contribution-total
Auth: none
Response:
- headline_confirmed_total
- pending_estimated_total optional
- currency
- reporting_period
- last_updated_at
```

### Settings

```text
GET /v1/me/settings
Auth: user
Response:
- active_route_type
- active_route_id
- sponsor_target_id
- pause_until
- disabled
- sync_enabled
- version
- effective_state

PATCH /v1/me/settings
Auth: user
Request:
- active_route_type optional
- active_route_id optional
- sponsor_target_id optional
- pause_until optional
- disabled optional
- sync_enabled optional
- expected_version optional
Response:
- settings
- conflicts[] optional
```

### Anonymous Merge

```text
POST /v1/me/anonymous-merge-intents
Auth: user
Request:
- install_id
- eligible_event_count
- estimated_amount_minor optional
- currency optional
Response:
- merge_intent_id
- expires_at
- requires_consent: true

POST /v1/me/anonymous-merge-intents/{merge_intent_id}/accept
Auth: user
Response:
- accepted
- attached_event_count
- skipped_event_count
```

The merge endpoints are optional for pilot phase 1 if the open decision is to defer historical merge.

## Data Model Sketch

```text
user_account
- id
- auth_provider
- provider_subject
- email nullable
- display_name nullable
- role: user | admin | sponsor_operator
- created_at
- updated_at

install_identity
- id
- install_id
- user_id nullable
- app_version nullable
- os_family nullable
- os_arch nullable
- sync_enabled
- linked_at nullable
- last_seen_at nullable
- created_at
- updated_at

install_link_session
- id
- user_id
- code_hash
- expires_at
- consumed_at nullable
- created_at

account_setting
- user_id
- active_route_type: target | room
- active_route_id
- sponsor_target_id nullable
- pause_until nullable
- disabled
- sync_enabled
- version
- updated_by
- updated_at

donation_ledger_entry
- id
- created_at
- event_id
- install_id
- user_id nullable
- room_id nullable
- donation_target_id nullable
- campaign_id
- sponsor_id
- amount_minor
- currency
- status: pending | confirmed | rejected | adjusted | settled
- reason_code
- reporting_period

contribution_summary_view
- subject_type: user | public | target | room
- subject_id nullable
- reporting_period
- estimated_amount_minor
- confirmed_amount_minor
- settled_amount_minor
- currency
- cohort_count nullable
- last_updated_at
```

WP3 should consume `donation_ledger_entry` or `contribution_summary_view`; WP5 owns final ledger ingestion and eligibility logic.

## Privacy And Security Requirements

- Use allowlisted request and response fields for every account/dashboard API.
- Add automated schema or response tests that fail on prohibited field names such as `prompt`, `code`, `output`, `stdout`, `stderr`, `command`, `args`, `path`, `filename`, `repo`, `env`, `token`, `secret`, `clipboard`, and `screenshot`.
- Store auth provider identifiers separately from install and ledger records where practical.
- Hash one-time install link codes at rest.
- Expire unused link sessions.
- Rate-limit login, link session creation, and merge acceptance endpoints.
- Public aggregate endpoints must use aggregate read models, not raw event scans exposed to the client.
- Dashboard exports, if included, must contain contribution summaries only and no raw developer content.
- Sponsor-facing reports are out of scope for WP3 but must remain aggregate-only if linked from account surfaces.

## Acceptance Tests

### Anonymous Use

- Given no account session, a pilot user can still run Waitly locally through the existing CLI path.
- Given account APIs are unreachable, local pause, disable, and enabled states still determine sponsored-window availability.
- Given no account session, `GET /v1/public/contribution-total` returns a public aggregate response without user or install identifiers.

### Login And Session

- A user can create an account or authenticate through the chosen provider, load `/v1/session`, and log out.
- Protected `/v1/me/*` APIs return unauthorized without a valid session.
- User role is present in session data and defaults to `user`.

### Install Linkage

- A signed-in user can create an install-link session with an expiring one-time code.
- A valid code can link exactly one `install_id` to the signed-in `user_id`.
- Reusing an expired or consumed code fails.
- Linkage requests and resulting records contain only allowlisted install metadata.
- Linked install removal stops future sync for that install.

### Anonymous Merge

- Historical anonymous records are not attached on login by default.
- If merge is enabled, the consent screen appears before merge.
- Accepting merge attaches only content-free eligible records.
- Skipping merge leaves account totals based only on already-linked or future records.

### Personal Dashboard

- A signed-in user with ledger records sees lifetime estimated, current-period estimated, confirmed, and settled totals where available.
- A signed-in user with no ledger records sees a zero/empty state without error.
- Estimated values are labeled estimated.
- The dashboard does not imply donation credit is withdrawable by the user.
- Dashboard responses do not include raw event logs or prohibited developer-content fields.

### Public Aggregate

- Public aggregate is visible without login.
- Headline total uses confirmed credit by default.
- Pending estimated credit, if shown, is separate from confirmed credit.
- Target, room, or sponsor subtotals are hidden until cohort threshold rules are satisfied.

### Settings

- A signed-in user can update sponsor target or active route through `PATCH /v1/me/settings`.
- A signed-in user can pause sponsored windows until a future timestamp.
- A signed-in user can globally disable sponsored windows.
- Disabling prevents future sponsored windows and donation credit after sync while preserving wrapped CLI execution.
- Enabling clears account-level disabled and pause state without adding controls inside the sponsored window.
- Turning account sync off prevents account settings from overwriting local install settings.
- Settings updates increment `version` and stale writes return a conflict response.

### Privacy Regression

- API schema tests fail if account, settings, install-link, merge, dashboard, or public aggregate responses contain prohibited field names.
- No endpoint returns prompt text, source code, terminal output, command arguments, file paths, repository identifiers, environment variables, clipboard data, screenshots, keystrokes, secrets, or AI responses.
- Link codes are not persisted in plaintext and are not logged as event telemetry.

### Ownership Boundary

- WP3 account/dashboard implementation does not modify `bin/`, `lib/`, or `ads/` without explicit core-owner coordination.
- Any future CLI sync work has a separate core-owned acceptance test proving `waitly run ...` still works without login.

## Rollout Plan

1. Ship account/dashboard behind an account feature flag.
2. Enable public aggregate with static or aggregate-read-model data first.
3. Enable login and personal dashboard for internal users.
4. Enable install linking for pilot users.
5. Enable settings sync only after local conflict behavior is verified.
6. Decide whether anonymous historical merge ships in pilot phase 1.

## Rollback Plan

- Disable account feature flag and keep anonymous local Waitly use.
- Keep public aggregate as a placeholder or hide it if aggregate data is not trustworthy.
- Disable install linking without deleting local settings.
- Disable settings sync and fall back to local-only config.
- Defer historical anonymous merge and start account totals from post-login events only.
- If privacy review finds a disallowed field, disable affected endpoint or export, remove the field, and review stored records for cleanup.
- If auth provider fails, turn off protected dashboard routes while preserving public aggregate and local CLI behavior.

## Dependencies

- WP1/core: installable CLI and stable local config behavior.
- Core owner: future install-link command or bridge if device-code linking uses CLI.
- WP4: donation target and room catalog for route selection beyond direct target.
- WP5: ledger ingestion and contribution summary read model.
- WP7: final privacy, telemetry allowlist, and donation wording review.
- Pilot ops: approved first sponsor targets and reporting periods.

## Risk Estimate

Risk level: high.

Primary risks:

- Account work accidentally couples core CLI execution to auth or network availability.
- Install linking or merge collects more than content-free metadata.
- Dashboard totals imply withdrawable user earnings.
- Settings sync creates confusing conflict behavior across local and account surfaces.
- Public aggregate leaks small-cohort room, target, sponsor, or user behavior.

Mitigations:

- Keep anonymous local mode as the default fallback.
- Use allowlisted API schemas.
- Keep merge explicit and optional.
- Treat ledger as append-only and totals as derived.
- Hide small-cohort subtotals until thresholds are approved.
- Feature-flag account, sync, and merge separately.

## Open Decisions Needed

- Auth provider and MVP login methods.
- Whether first pilot includes historical anonymous credit merge.
- Exact install-link UX and core-owner implementation surface.
- Whether the conflict rules in this RFP are approved for account/local settings sync.
- Donation credit formula and eligible impression definition.
- Ledger owner and whether WP3 reads from ledger directly or from a summary view.
- Public cohort threshold for target, room, and sponsor subtotals.
- Whether the public total shows pending estimated credit in pilot phase 1.
- Approved first sponsor target list and target verification requirement.
- Whether donation rooms appear in WP3 route selection during pilot phase 1.
- Currency, reporting-period boundaries, and settlement labels.
- Data retention period for content-free events, link sessions, and account exports.
- Account deletion, unlinking, and contribution-history export policy.

## Handoff

This RFP is ready for engineering estimation once the auth provider, install-link UX, and anonymous merge policy are decided. Implementation should start with the account/session shell, public aggregate endpoint, and dashboard read model, then add install linking and settings sync behind separate feature flags.
