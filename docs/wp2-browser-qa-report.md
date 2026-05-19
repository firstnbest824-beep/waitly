# Waitly WP2 Browser QA Report

Date: 2026-04-25 KST.

Scope: local browser QA for Waitly console and sponsored popup rendering. This pass used the CLI-Anything methodology as a QA harness workflow: inspect target, plan tests, run the real backend where possible, capture artifacts, and record gaps.

## Environment

- Project: `/home/kyl5822/project/ai광고 플랫폼`
- Local console server: `http://127.0.0.1:5173/app/`
- Ad preview mode: `WAITLY_OPEN_AD=0`
- Browser used for screenshots: Windows Microsoft Edge headless from WSL.
- Native Playwright Chromium status: blocked by missing Linux dependency `libnspr4.so`; `npx playwright install-deps chromium` requires sudo password and did not complete.

## Evidence Artifacts

| Check | Artifact |
| --- | --- |
| Console desktop render | `/tmp/waitly-wp2-app-1440-fixed.png` |
| Console mobile render | `/tmp/waitly-wp2-app-375-final4.png` |
| Initial ad popup render | `/tmp/waitly-wp2-ad-320x430-final3.png` |
| Rotated ad popup render | `/tmp/waitly-wp2-ad-rotation-320x430-final.png` |
| Ad event log | `/tmp/waitly-wp2-browser-qa-final3/events.jsonl` |

Final artifact dimensions:

```text
/tmp/waitly-wp2-app-1440-fixed.png:            1440 x 1000
/tmp/waitly-wp2-app-375-final4.png:            375 x 900
/tmp/waitly-wp2-ad-320x430-final3.png:         320 x 430
/tmp/waitly-wp2-ad-rotation-320x430-final.png: 320 x 430
```

## Findings And Fixes

### Fixed: 320x430 Ad Popup Content Clipping

The first ad capture showed that the CTA, rotation strip, and auto-close/privacy meta text could be clipped inside the target `320 x 430` popup.

Changed:

- Compacted ad body spacing and typography.
- Fixed the creative image to a predictable 74px height.
- Kept Waitly logo, Sponsored label, creative headline/body, funding copy, CTA, rotation strip, and auto-close/privacy text visible inside the popup.

File changed:

- `lib/ad-window-server.js`

### Fixed: Mobile Console Width And Wrapping

The first mobile console capture showed copy clipping on the right edge. Root cause was mobile CSS using invalid width math in `min(100% - 24px, 1220px)` and insufficient mobile wrapping constraints.

Changed:

- Replaced mobile width with `calc(100vw - 24px)`.
- Added mobile spacing and text wrapping for page subtitle and anonymous-mode copy.
- Made the signed-in preview button fit within the mobile content width.

File changed:

- `app/index.html`

## Verification Results

Commands passed:

```text
npm run waitly:test
npm run waitly:package-check
node ./bin/waitly.js version matches package.json version
```

Ad rotation evidence:

```text
ad_rotation_impression creativeId=sentry-ai-debugging creativeIndex=1
ad_rotation_impression creativeId=railway-deploy creativeIndex=2
```

Static invariant coverage still passes:

- Waitly branding present.
- Sponsored label present.
- No in-ad close, pause, disable, dismiss, or opt-out controls.
- Exactly one ad-content link/CTA.
- Rotation and auto-close event hooks present.
- WP2 placement evidence fields still present in `ad_opened`.

## Remaining WP2 Gaps

- Native Playwright Chromium on WSL still needs system dependencies or sudo access.
- This pass is local Edge-headless evidence, not real visible popup video evidence.
- Real Windows/WSL visible popup placement evidence still needs user-visible screenshot or video.
- macOS, native Linux, multi-monitor, and high-DPI physical-device checks remain open.
- Focus-stealing behavior still needs real desktop inspection.
