# Waitly Install And Distribution

Status: pilot local/tarball distribution. The package is intentionally marked private, so this is not a public npm registry release yet.

## Prerequisites

- Node.js 18 or newer.
- npm.
- One supported browser opener:
  - Windows/WSL: PowerShell and Microsoft Edge.
  - macOS: Chrome, Edge, or Chromium preferred; `open` fallback.
  - Linux: Chrome, Chromium, Edge, or `msedge` preferred; `xdg-open` fallback. `wmctrl` and `xrandr` improve placement.

## Install From This Checkout

From the Waitly project directory:

```sh
npm install -g .
waitly version
waitly status
```

Run an AI CLI through Waitly:

```sh
waitly run codex
waitly run claude
```

For a headless smoke test that does not open a browser:

```sh
WAITLY_OPEN_AD=0 WAITLY_IDLE_MS=1000 WAITLY_MAX_ADS=1 waitly run node -e "setTimeout(() => {}, 1700)"
```

## Build A Pilot Tarball

Before handing a build to a pilot user:

```sh
npm run waitly:test
npm run waitly:package-check
npm pack
```

This creates `waitly-prototype-0.1.0.tgz` for the current package version.

Install that tarball on a pilot machine:

```sh
npm install -g ./waitly-prototype-0.1.0.tgz
waitly version
waitly status
```

No source files need to be edited after install. Runtime config lives under `~/.waitly` by default and can be moved with `WAITLY_HOME` or `WAITLY_CONFIG`.

## Update Strategy

1. Bump `package.json` `version`.
2. Run `npm run waitly:test`.
3. Run `npm run waitly:package-check` and confirm the tarball only contains the runtime files.
4. Run `npm pack` and distribute the new `.tgz`.
5. Pilot users run `npm install -g ./waitly-prototype-<version>.tgz` and confirm `waitly version`.

Installing a newer tarball over the same package name updates the global `waitly` binary.

## Uninstall

Stop any active `waitly run ...` or `waitly preview-ad` command first. Then uninstall the package:

```sh
npm uninstall -g waitly-prototype
```

Waitly does not install a daemon or background service. Popup windows are tied to the running Waitly process and are requested to close when the wrapped command exits.

Temporary browser profiles are removed best-effort when the popup closes. If a process is killed abruptly, stale profiles can be deleted after all Waitly popups are closed:

- Windows/WSL: `%TEMP%\WaitlyAdProfiles\waitly-ad-*`
- macOS/Linux: `$TMPDIR/waitly-ad-*` or `/tmp/waitly-ad-*`

## Platform Notes

- Windows and WSL use Microsoft Edge app windows through PowerShell.
- macOS and Linux use Chromium-style app windows when available and fall back to the system URL opener.
- `WAITLY_AD_WINDOW_X` and `WAITLY_AD_WINDOW_Y` can force placement when bottom-right placement is unreliable.
- `WAITLY_OPEN_AD=0` prints the localhost ad URL instead of launching a browser.

## Rollback

If global install fails on a pilot machine, run directly from a checkout:

```sh
node ./bin/waitly.js version
node ./bin/waitly.js run codex
```

