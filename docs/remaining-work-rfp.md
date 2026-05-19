# Waitly Remaining Work RFP

Status: draft for owner review and Ralph-loop execution.

## 1. Purpose

This RFP defines the remaining work needed to move Waitly from a verified local prototype to a pilot-ready product.

The core ad-display loop is already implemented and verified:

- `waitly run <tool>` wraps AI CLI tools.
- Codex and Claude smoke tests pass.
- Waitly detects AI wait time.
- A small bottom-right sponsored popup opens during inference.
- The popup has Waitly branding and no in-ad close button.
- The popup auto-closes when the wrapped AI process exits.
- Creatives rotate during longer waits.
- Events are logged without collecting prompts, code, terminal output, command arguments, paths, or environment variables.
- External ad controls exist through `waitly status`, `waitly pause`, `waitly disable`, and `waitly enable`.

This RFP covers what remains: product surfaces, account/credit systems, sponsor operations, trust/compliance, packaging, and pilot execution.

## 2. Product Goal

Waitly should let developers fund open source, research, or community targets by allowing sponsored windows to appear during AI coding wait time.

The pilot product must prove four things:

- Developers can install and use Waitly without disrupting AI CLI workflows.
- Sponsored windows are visible enough to create advertiser value.
- Users can understand and control funding, pause, and disable behavior.
- Donation credit, reporting, and sponsor operations can run without collecting sensitive developer content.

## 3. Current Baseline

### Completed

- Core CLI wrapper.
- Wait-state detector.
- Branded sponsored popup.
- Bottom-right placement and slide-up behavior.
- Auto-close lifecycle.
- Creative rotation.
- Local event logging.
- External pause/disable commands.
- Codex real CLI smoke.
- Claude real CLI smoke.
- Visible Claude popup verification.
- Core tests:
  - wait detector
  - settings pause/disable
  - CLI controls
  - ad-window lifecycle
- Draft docs:
  - product account plan
  - trust policy
  - README

### Known Constraints

- The sponsored popup must not include in-window close, pause, or disable controls in the current product direction.
- Pause/disable controls must live outside the ad window.
- Waitly must not collect prompts, code, terminal output, command arguments, file paths, repository data, environment variables, clipboard data, screenshots, or keystrokes.
- Login, credits, sponsor UI, advertiser admin, and settlement are not implemented yet.
- Windows/WSL placement has been verified locally; macOS/Linux adapters exist but need real-device verification.

## 4. Scope Of Work

### WP1: Installer And Distribution

Owner: Core/platform.

Objective: Make Waitly installable and runnable by a pilot developer without manual repo setup.

Deliverables:

- npm package or equivalent local installer.
- `waitly` binary available after install.
- install/uninstall instructions.
- version command.
- update strategy.
- platform notes for Windows/WSL/macOS/Linux.
- safe cleanup of temporary browser profiles.

Acceptance Criteria:

- A fresh pilot machine can install Waitly and run `waitly run codex` or `waitly run claude`.
- `waitly status`, `waitly pause`, `waitly disable`, and `waitly enable` work after install.
- uninstall leaves no running popup process.
- install docs do not require editing source files.

Risk Level: Medium.

Rollback Plan:

- Fall back to repo-based local prototype instructions.
- Keep the current `node ./bin/waitly.js` path documented for development.

### WP2: Cross-OS Visual QA

Owner: QA/platform.

Objective: Verify that the visible popup behaves correctly across operating systems and screen layouts.

Deliverables:

- Windows/WSL verification.
- macOS verification.
- Linux verification.
- multi-monitor checks.
- high-DPI checks.
- bottom-edge placement report.
- screenshot/video evidence for:
  - popup appears
  - no in-ad close button
  - Waitly logo visible
  - slide-up behavior
  - creative rotation
  - auto-close after AI process exits

Acceptance Criteria:

- Placement logs record verified or requested placement.
- Windows/WSL records `windowRightGap=0` and `windowBottomGap=0`.
- macOS/Linux behavior is documented with exact observed limits.
- Any fallback mode is visible in logs.

Risk Level: Medium.

Rollback Plan:

- Keep OS-specific fallback launchers.
- Allow manual fixed `WAITLY_AD_WINDOW_X/Y` placement.

### WP3: Account, Login, And User Dashboard

Owner: 김대리 / product-account surface.

Objective: Add account features without touching the core popup lifecycle.

Deliverables:

- login/signup flow.
- signed-in user identity.
- install identity linkage plan.
- personal contribution dashboard.
- public all-user cumulative contribution display.
- settings page for sponsor target, pause, disable, and account sync.
- no-login state for basic Waitly use.

Acceptance Criteria:

- Anonymous users can still use Waitly locally.
- Logged-in users can see personal estimated contribution.
- Public users can see aggregate contribution without login.
- Settings do not expose prompt/code/terminal data.
- Account work does not alter `bin/`, `lib/`, or `ads/` without explicit core ownership coordination.

Risk Level: High.

Rollback Plan:

- Ship pilot with local-only config and public aggregate placeholder.
- Defer historical anonymous credit merge.

### WP4: Donation Target Selection And Rooms

Owner: 김대리 / product.

Objective: Let users choose where Waitly-attributed funding goes.

Deliverables:

- sponsor target selector.
- local config persistence feeding Waitly.
- donation room creation plan.
- join/leave room flow.
- room visibility rules.
- room moderation flow.
- target verification flow.

Acceptance Criteria:

- selected target can be written to Waitly config as `sponsorTarget`.
- donation rooms have owner, target, visibility, join policy, and moderation status.
- room totals are aggregate-only and respect cohort thresholds.
- users cannot withdraw donation credit as cash.

Risk Level: Medium.

Rollback Plan:

- Start with a fixed set of approved targets.
- Defer user-created rooms to pilot phase 2.

### WP5: Donation Credit Ledger

Owner: backend/product analytics.

Objective: Convert eligible ad events into auditable donation credit records.

Deliverables:

- ledger schema.
- event ingestion model.
- eligibility rules.
- pending/confirmed/rejected/adjusted/settled states.
- reporting-period model.
- fraud/dedupe hooks.
- privacy-safe aggregation.

Acceptance Criteria:

- every eligible impression can map to a ledger entry.
- ledger entries are append-only or adjustment-based, not overwritten counters.
- pending values are labeled estimated.
- sponsor reports cannot identify individual users.
- no sensitive developer content enters the ledger.

Risk Level: High.

Rollback Plan:

- Use offline JSONL export for first pilot reports.
- Keep all public totals estimated until settlement rules are approved.

### WP6: Sponsor And Creative Operations

Owner: admin/pilot ops.

Objective: Manage sponsors, campaigns, creatives, and destinations safely.

Deliverables:

- sponsor registry.
- creative registry.
- campaign budget/rate fields.
- destination URL validation.
- manual approval workflow.
- creative preview.
- ad quality checklist.
- sponsor reporting export.

Acceptance Criteria:

- no sponsor can self-publish in the pilot.
- every creative has sponsor identity, destination URL, CTA, and approved status.
- disallowed categories are blocked.
- destination URLs use HTTPS.
- reporting is aggregate-only.

Risk Level: Medium.

Rollback Plan:

- Maintain `ads/creatives.json` as the pilot creative registry.
- Use manual review and static campaign setup until admin UI exists.

### WP7: Trust, Privacy, And Policy

Owner: trust/policy.

Objective: Make the trust boundary explicit before any public pilot.

Deliverables:

- public privacy statement.
- telemetry allowlist.
- prohibited data list.
- sponsored-label policy.
- opt-out/pause policy.
- ad quality policy.
- incident response flow.
- legal review queue for donation wording.

Acceptance Criteria:

- public docs state Waitly does not collect prompts, code, terminal output, command arguments, file paths, repository data, environment variables, clipboard data, screenshots, or keystrokes.
- sponsored windows are clearly labeled.
- external pause/disable controls are documented.
- donation claims avoid fixed revenue-share promises until pricing and settlement are approved.

Risk Level: High.

Rollback Plan:

- Keep pilot invite-only.
- Disable public reporting until policy is approved.

### WP8: Pilot Reporting And Operations

Owner: 김부장 / pilot ops.

Objective: Run a small pilot with evidence, not guesswork.

Deliverables:

- pilot success metrics.
- user interview script.
- advertiser pitch.
- sponsor target list.
- reporting cadence.
- issue triage process.
- pilot feedback form.
- post-pilot decision memo.

Acceptance Criteria:

- pilot can answer whether developers tolerate the popup.
- pilot can answer whether sponsors value impressions.
- pilot can report aggregate donation credit without sensitive content.
- every issue has owner, severity, and next action.

Risk Level: Medium.

Rollback Plan:

- Run internal-only pilot before external users.
- Use `waitly disable` as immediate user recovery path.

## 5. Non-Goals

The following are not required for the next milestone unless explicitly approved:

- payment settlement automation.
- sponsor self-serve campaign launch.
- public marketplace.
- browser extension.
- collecting prompt/code content for targeting.
- in-ad close, pause, or disable controls.
- replacing existing landing page without assignment.

## 6. Required Proposal Response Format

Any agent or implementation owner responding to this RFP must provide:

- work package ID.
- proposed implementation approach.
- owned files/directories.
- dependencies.
- acceptance tests.
- rollback plan.
- risk estimate.
- expected duration.
- open decisions needed from the owner.

## 7. Ralph Loop Unit Decomposition

### RFP-WP1

- depends_on: current core prototype.
- scope: installer, binary, versioning, install docs.
- acceptance_tests: fresh install command, `waitly status`, `waitly run node -e`.
- risk_level: medium.
- rollback_plan: repo-based local usage.

### RFP-WP2

- depends_on: current ad window implementation.
- scope: visual popup verification across OS/screen setups.
- acceptance_tests: screenshot/video plus event log evidence.
- risk_level: medium.
- rollback_plan: fixed coordinates and fallback launchers.

### RFP-WP3

- depends_on: product/account architecture decision.
- scope: login and user dashboard.
- acceptance_tests: anonymous use, signed-in dashboard, public aggregate.
- risk_level: high.
- rollback_plan: local-only config and deferred account merge.

### RFP-WP4

- depends_on: account basics or local config.
- scope: donation target and room model.
- acceptance_tests: selected target persists to Waitly config.
- risk_level: medium.
- rollback_plan: fixed approved target list.

### RFP-WP5

- depends_on: event schema and target selection.
- scope: donation credit ledger and aggregation.
- acceptance_tests: eligible event creates ledger record.
- risk_level: high.
- rollback_plan: offline JSONL reporting.

### RFP-WP6

- depends_on: creative model and policy.
- scope: sponsor and campaign operations.
- acceptance_tests: approved creative can be served; rejected category cannot.
- risk_level: medium.
- rollback_plan: static `ads/creatives.json`.

### RFP-WP7

- depends_on: trust policy draft.
- scope: public policy, telemetry guardrails, opt-out rules.
- acceptance_tests: telemetry field allowlist review.
- risk_level: high.
- rollback_plan: invite-only pilot.

### RFP-WP8

- depends_on: pilot scope approval.
- scope: pilot ops, interviews, reporting, post-pilot decision.
- acceptance_tests: pilot report with metrics and decision memo.
- risk_level: medium.
- rollback_plan: internal-only pilot.

## 8. Suggested Milestones

### Milestone A: Pilot-Ready Local Product

Target outcome:

- installable CLI.
- cross-OS visible popup QA.
- external pause/disable stable.
- sponsor target persistence.
- public trust copy draft.

### Milestone B: Account And Donation MVP

Target outcome:

- login.
- personal contribution dashboard.
- public aggregate contribution.
- target selection.
- donation credit ledger MVP.

### Milestone C: Sponsor Pilot Ops

Target outcome:

- approved sponsor/creative registry.
- aggregate sponsor reporting.
- pilot advertiser pitch.
- pilot user cohort.

### Milestone D: Pilot Review

Target outcome:

- usage metrics.
- user feedback.
- sponsor feedback.
- privacy review.
- go/no-go decision for broader beta.

## 9. Open Decisions

- Auth provider.
- anonymous credit merge policy.
- donation credit formula.
- sponsor pricing model.
- eligible impression definition.
- public cohort threshold for aggregate reporting.
- first pilot sponsor categories.
- donation payout/legal/tax handling.
- whether donation rooms ship in pilot phase 1 or phase 2.
- package/distribution channel.
- macOS/Linux support level for first pilot.

## 10. Immediate Next Actions

1. Assign WP1 and WP2 to core/platform.
2. Assign WP3 and WP4 to 김대리.
3. Assign WP5 and WP6 to backend/admin ops.
4. Assign WP7 to trust/policy.
5. 김부장 keeps integration ownership and updates `.codex-multi-agent/status.md` after each unit.

## 11. Cycle 4 Review Addendum

Read-only Claude review identified several prerequisite gaps that should be resolved before deeper account, ledger, and sponsor implementation.

### New Prerequisite Units

#### WP0: Event Schema And Telemetry Contract

Owner: core/backend/trust.

Purpose: define the content-free event contract before account, ledger, reporting, or server ingestion work starts.

Deliverables:

- event type list.
- allowed field list per event type.
- schema versioning.
- local-to-server transport proposal.
- retention policy.
- red-team tests proving prohibited fields cannot be logged.

Acceptance Criteria:

- schema excludes prompts, code, terminal output, command arguments, file paths, repository data, environment variables, clipboard data, screenshots, and keystrokes.
- WP5 ledger can consume the schema without inventing new sensitive fields.
- WP7 policy can review the schema against the telemetry allowlist.

#### WP0A: Auth And Identity Decision

Owner: product/account.

Purpose: close the implementation blockers for WP3 before dashboard work begins.

Deliverables:

- auth provider decision.
- MVP login methods.
- session model.
- install-to-account linkage protocol.
- anonymous historical merge decision.
- linkability threat model for account plus event correlation.

Acceptance Criteria:

- WP3 implementation can proceed without choosing auth architecture during coding.
- anonymous use remains available.
- historical credit is never attached silently.

#### WP0B: Settlement Boundary

Owner: finance/ops/trust.

Purpose: avoid promising settlement behavior before payout and legal handling exist.

Deliverables:

- decision to either remove `settled` from pilot ledger states or keep it as a future-only state.
- payout/legal/tax owner.
- approved wording for estimated, confirmed, and settled values.

Acceptance Criteria:

- dashboard and ledger copy do not imply withdrawable user money.
- pilot reports do not claim settled payments unless settlement has actually occurred.

### Acceptance-Test Additions

- WP2 must include negative checks that popups do not appear while paused/disabled and do not appear outside detected wait state.
- WP2 must verify the popup does not steal focus from the active AI CLI workflow where the platform allows focus inspection.
- WP5 must test that ineligible or duplicate impressions do not create ledger entries.
- WP6 must specify whether disallowed sponsor categories are blocked at registry time, serve time, or both.
- WP7 must include tests or audits proving prohibited telemetry fields cannot be emitted.
- WP1 must verify `waitly version` matches `package.json` version and document update behavior.

### Sequencing Adjustments

- WP0 should precede WP3, WP5, and WP7 implementation.
- WP0A should precede WP3 implementation.
- WP7 policy freeze should precede WP6 sponsor/admin implementation.
- WP4 should either ship as local target persistence first or explicitly wait for WP3 account identity.
- WP8 pilot reporting format should be defined before WP5 ledger schema freezes.
