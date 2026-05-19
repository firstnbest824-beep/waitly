# Waitly Cross-OS Visual QA

Status: WP2 plan and evidence template for Ralph Cycle 4.

Source scope: `docs/remaining-work-rfp.md` WP2. This document covers only visual popup verification across Windows/WSL, macOS, Linux, multi-monitor, and high-DPI layouts.

## Privacy Guardrail

Use synthetic commands for all captures. Do not record prompts, code, terminal output, repository paths, environment dumps, screenshots of user work, clipboard contents, or keystrokes. Frame screenshots and videos around the sponsored popup and relevant screen edge whenever possible.

## Current Verified Evidence

Discoverable local event logs show current Windows/WSL placement evidence. No macOS or native Linux real-device evidence was discoverable in the workspace or `/tmp` logs during this pass.

| Evidence path | UTC timestamp | Wrapped command | Key WP2 fields | Interpretation |
| --- | --- | --- | --- | --- |
| `/tmp/waitly-cross-os-window-test/events.jsonl` | `2026-04-24T18:03:45.763Z` | `node` | `openMode=edge-bottom-popup`, `placement=verified`, `windowWidth=320`, `windowHeight=430`, `windowX=2240`, `windowY=962`, `windowRightGap=0`, `windowBottomGap=0`, `windowMargin=0`, `animationMs=450`, `rotationMs=5000`, `rotationCount=3` | Windows/WSL bottom-right placement log satisfies the WP2 gap requirement for this run. |
| `/tmp/waitly-visible-check/events.jsonl` | `2026-04-25T07:02:41.067Z` | `node` | Same verified placement fields, `rotationMs=3000`, `rotationCount=3`; `ad_rotation_impression` at `2026-04-25T07:02:44.888Z` | Windows/WSL placement plus rotation event evidence. |
| `/tmp/waitly-claude-visible/events.jsonl` | `2026-04-25T07:07:43.907Z` | `claude` | Same verified placement fields; `session_finished` and `ad_window_shutdown_requested` at `2026-04-25T07:07:46.983Z`; `ad_auto_close` at `2026-04-25T07:07:47.305Z` | Windows/WSL placement plus wrapped-process auto-close event evidence. |

These logs are event evidence only. WP2 still needs screenshot/video artifacts attached for final visual acceptance, including popup appearance, no in-ad close button, Waitly logo visibility, slide-up behavior, creative rotation, and auto-close after wrapped process exit.

## OS Coverage Matrix

| Platform | Expected opener | Current status | Required gap closure |
| --- | --- | --- | --- |
| Windows/WSL | `edge-bottom-popup` | Event logs discovered with `placement=verified`, `windowRightGap=0`, `windowBottomGap=0`. | Add screenshot/video evidence for each required visual behavior. Repeat on single monitor, multi-monitor, and high-DPI display. |
| macOS | `mac-chromium-bottom-popup` | No real-device evidence discovered. Current implementation requests bottom-right placement and logs `placement=requested` unless fallback is used. | Run on real macOS hardware, capture exact observed placement limits, and document browser/permission behavior. |
| Linux desktop | `linux-chromium-bottom-popup` | No real-device evidence discovered. Current implementation logs `placement=verified` only when `wmctrl` can move/verify the window; otherwise `requested`. | Run on real X11 desktop with and without `wmctrl`; if Wayland/fallback is used, document exact limits and fallback log mode. |
| Multi-monitor | OS-specific opener | Windows/WSL log suggests cursor-monitor working-area placement, but no matrix evidence. | Test primary and secondary monitor, left/right/top/bottom arrangements, and monitor containing cursor. |
| High-DPI/scaling | OS-specific opener | No scaling-specific evidence discovered. | Test 125%, 150%, and native scale where available. Record physical screen size, logical work area, and observed gaps. |

## Standard Test Command

Use a synthetic wait command with a dedicated log path. Adjust the log directory name per OS/run.

```bash
WAITLY_HOME=/tmp/waitly-wp2-visual \
WAITLY_EVENT_LOG=/tmp/waitly-wp2-visual/events.jsonl \
WAITLY_IDLE_MS=1000 \
WAITLY_AD_COOLDOWN_MS=60000 \
WAITLY_MAX_ADS=1 \
WAITLY_AD_ROTATION_MS=3000 \
node ./bin/waitly.js run node -e "setTimeout(() => {}, 8000)"
```

For manual fixed placement rollback validation, add `WAITLY_AD_WINDOW_X=<px>` and `WAITLY_AD_WINDOW_Y=<px>` and record that the run is an override run, not default placement evidence.

## Screenshot And Video Checklist

Capture at least one settled screenshot and one screen recording per platform/layout row.

| Check | Evidence artifact | Pass condition |
| --- | --- | --- |
| Popup appears | Settled screenshot | Sponsored popup is visible and readable during detected AI wait. |
| Bottom-edge placement | Settled screenshot plus `ad_opened` log | Popup is aligned to the expected work-area bottom/right edge, with no clipping or taskbar/dock overlap. |
| No in-ad close control | Settled screenshot | Ad content contains no close, pause, disable, dismiss, or opt-out control. Native OS window chrome, if present, must be noted separately. |
| Waitly logo visible | Settled screenshot | Waitly mark/name are visible in the popup header. |
| Sponsored identity visible | Settled screenshot | Sponsored label and sponsor/CTA content are visible. |
| Slide-up behavior | Video first second | Popup visibly rises into final position; no jump from a wrong screen or off-screen clipping. |
| Creative rotation | Video around `WAITLY_AD_ROTATION_MS` boundary plus log | Creative changes while the popup remains open; `ad_rotation_impression` appears with the rotated `creativeId`. |
| Auto-close after exit | Video through wrapped process exit plus log | Popup closes after the wrapped process finishes; log contains `ad_window_shutdown_requested` and preferably `ad_auto_close`. |

## No-Close Control Checks

Manual visual checks:

- Confirm there is no in-ad close button, X button, pause button, disable button, dismiss link, opt-out link, or keyboard-shortcut hint inside the ad content.
- Confirm the only ad-content action is the sponsor CTA.
- If browser or OS window chrome exposes native window controls, record that as OS chrome, not Waitly ad content.

Static checks:

- Rendered ad HTML should not include `<button>`, `data-close`, `data-pause`, or `data-disable`.
- Rendered ad HTML should include the sponsor CTA as the only ad-content link.
- Existing external controls remain outside the popup: `waitly status`, `waitly pause`, `waitly disable`, and `waitly enable`.

## Bottom-Edge Placement Checks

Required `ad_opened` fields:

- `openMode`
- `placement`
- `windowWidth`
- `windowHeight`
- `windowX`
- `windowY`
- `windowRightGap`
- `windowBottomGap`
- `windowMargin`
- `popupPid`
- `animationMs`
- `rotationMs`
- `rotationCount`

Pass conditions:

- Windows/WSL default placement must log `placement=verified`, `windowRightGap=0`, and `windowBottomGap=0`.
- macOS must document exact observed right and bottom gaps from screenshot/video. `placement=requested` is acceptable only with visual evidence and a note that the platform does not currently log verified final bounds.
- Linux must log `placement=verified` when `wmctrl` succeeds. If `placement=requested` or fallback launch occurs, attach visual evidence and document the missing tool/window-manager limitation.
- Fallback modes must be visible in logs through `openMode`, `placement`, null position fields, or documented launcher output.

## Evidence Template

Create one row per OS/layout run.

| Field | Value |
| --- | --- |
| Run ID |  |
| Tester |  |
| Date/time with timezone |  |
| OS and version |  |
| Runtime shell |  |
| Browser/opener used |  |
| Display layout | Single / multi-monitor details |
| Scale factor / DPI |  |
| Command used |  |
| Event log path |  |
| Screenshot path |  |
| Video path |  |
| `sessionId` |  |
| `adId` |  |
| `openMode` |  |
| `placement` |  |
| `windowWidth` / `windowHeight` |  |
| `windowX` / `windowY` |  |
| `windowRightGap` / `windowBottomGap` |  |
| Observed right/bottom gap from screenshot |  |
| Waitly logo visible | Pass / fail / notes |
| No in-ad close/pause/disable controls | Pass / fail / notes |
| Slide-up observed | Pass / fail / notes |
| Rotation observed | Pass / fail / `ad_rotation_impression` timestamp |
| Auto-close observed | Pass / fail / `ad_window_shutdown_requested` and `ad_auto_close` timestamps |
| Fallback mode or platform limitation |  |
| Verdict | Pass / fail / blocked |

## Acceptance Gates

WP2 is accepted only when all gates pass:

1. Windows/WSL has event logs with `placement=verified`, `windowRightGap=0`, and `windowBottomGap=0`, plus screenshot/video evidence for all required visual behaviors.
2. macOS has real-device screenshot/video evidence and documents exact observed placement limits, including whether placement is only `requested`.
3. Linux has real-device screenshot/video evidence and documents exact observed placement limits for verified, requested, or fallback modes.
4. Multi-monitor runs show the popup appears on the intended cursor/display work area without clipping.
5. High-DPI runs show the popup remains readable, visible, and aligned to the expected work-area edge.
6. No screenshot/video shows an in-ad close, pause, disable, dismiss, or opt-out control.
7. Rotation evidence includes both visual change and an `ad_rotation_impression` log record when multiple creatives are configured.
8. Auto-close evidence includes video through process exit and `ad_window_shutdown_requested`; `ad_auto_close` should be captured when the page beacon is emitted.
9. Logs remain privacy-safe and contain command names/counts only, not prompts, code, terminal output, command arguments, paths, repository data, environment variables, screenshots, clipboard data, or keystrokes.
10. Static visual invariant tests pass before final WP2 sign-off.

## Remaining Manual Checks

- Capture Windows/WSL screenshot/video artifacts for the already log-verified placement behavior.
- Run macOS real-device visual QA and fill the evidence template.
- Run Linux real-device visual QA on X11 with `wmctrl`, and document Wayland or fallback behavior separately if applicable.
- Run multi-monitor placement checks on each OS available.
- Run high-DPI/scaling checks on each OS available.
