# Waitly Prototype

Waitly is a local Node.js prototype that wraps an AI CLI command and shows a small sponsored browser window when the wrapped process appears to be waiting. It watches stdout/stderr, treats normal output as activity, ignores low-signal spinner/progress text, and suppresses ads for a grace period after interactive prompts.

This is not a production ad platform. The current prototype runs locally, serves ad HTML from a temporary localhost HTTP server, loads creatives from `ads/creatives.json`, and writes JSONL events to disk.

## Prerequisites

- Node.js 18 or newer.
- npm, only if you want to use the package scripts below.
- A browser opener for preview windows:
  - Windows/WSL: PowerShell plus Microsoft Edge (`msedge.exe`).
  - macOS: Google Chrome, Microsoft Edge, or Chromium for compact app windows; otherwise `open` is used as a fallback.
  - Linux: Google Chrome, Chromium, Microsoft Edge, or `msedge`; otherwise `xdg-open` is used as a fallback. `wmctrl` and `xrandr` improve positioning when available.

No dependency install is required for the current codebase.

## Pilot Install

From this checkout, install the `waitly` binary globally:

```sh
npm install -g .
waitly version
waitly status
```

For tarball distribution:

```sh
npm run waitly:test
npm run waitly:package-check
npm pack
npm install -g ./waitly-prototype-0.1.0.tgz
waitly version
```

Uninstall:

```sh
npm uninstall -g waitly-prototype
```

See [docs/install-distribution.md](docs/install-distribution.md) for pilot install, update, platform, cleanup, and rollback notes.

## Run A Command

From this directory:

```sh
node ./bin/waitly.js run <command> [args...]
```

Quick start for Codex after installing the shim once:

```sh
node ./bin/waitly.js codex
```

Examples:

```sh
node ./bin/waitly.js run codex
node ./bin/waitly.js run node -e "setTimeout(() => {}, 20000)"
```

After a global install, use the `waitly` binary directly:

```sh
waitly codex
waitly run codex
waitly run claude
```

Waitly starts the wrapped command with inherited stdin and observable stdout/stderr. For interactive Codex, the default `auto` detection mode first tries a Codex app-server WebSocket observer, then falls back to screen detection if app-server or `--remote` startup fails. For `codex exec --json`, Waitly observes the explicit JSONL event stream. Other commands use screen detection. When a turn/reasoning event starts, Waitly schedules a sponsored window after `WAITLY_AD_DELAY_MS`; when visible output starts, the turn completes, or the process exits, it closes any pending or open ad through one ad state machine.

## Route A CLI Through Waitly

Create a command shim when you want `codex` itself to route through Waitly:

```sh
node ./bin/waitly.js install-shim codex
```

The shim is written to `~/.waitly/shims` and calls Waitly with the original command path that was found during installation, so it does not recursively call itself. Put `~/.waitly/shims` at the front of `PATH` before launching Codex. In a PowerShell session:

```powershell
$env:Path = "$HOME\.waitly\shims;$env:Path"
codex
```

Diagnose the Codex route without changing it:

```powershell
Get-Command codex
node ./bin/waitly.js doctor codex
```

For a globally installed Waitly package, use:

```sh
waitly install-shim codex
```

After the shim exists, `waitly codex [...args]` launches the real Codex path stored in the shim through Waitly without requiring you to prepend the shim directory to `PATH` for that command.

Debug mode:

```powershell
$env:WAITLY_LOG_LEVEL = "debug"
$env:WAITLY_AD_DELAY_MS = "500"
waitly codex
```

## Pause Or Disable Ads

Pause and disable controls live outside the sponsored popup. They are evaluated when `waitly run` starts.

Show current state:

```sh
node ./bin/waitly.js status
```

Show the installed version:

```sh
node ./bin/waitly.js version
waitly version
```

Persistently pause ads:

```sh
node ./bin/waitly.js pause 1h
node ./bin/waitly.js pause until 2030-01-01T09:00:00.000Z
```

Persistently disable or re-enable ads:

```sh
node ./bin/waitly.js disable
node ./bin/waitly.js enable
```

Disable ads for one wrapped command:

```sh
WAITLY_DISABLED=1 node ./bin/waitly.js run codex
```

Pause ads until a specific time for one wrapped command:

```sh
WAITLY_PAUSE_UNTIL=2030-01-01T09:00:00.000Z node ./bin/waitly.js run codex
```

When ads are disabled or paused, Waitly runs the wrapped command directly and skips ad display and event logging for that run. Use `node ./bin/waitly.js status` to inspect the current control state.

## Preview And Demo

Open a sponsored window without wrapping another command:

```sh
node ./bin/waitly.js preview-ad
```

Use npm scripts:

```sh
npm run waitly:preview
npm run waitly:demo
npm run waitly:test
```

`waitly:demo` sets `WAITLY_OPEN_AD=0`, lowers the idle threshold, and wraps a short `node -e` sleep so the ad URL is printed instead of opened.

## Product App And Login

Run the product app with the local pilot API:

```sh
npm run waitly:web
```

Open:

```text
http://127.0.0.1:5173/home/
```

The product app is served from `public/` and includes `/home/`, `/dashboard/`, `/leaderboard/`, `/rooms/`, `/targets/`, `/settings/`, and `/login/`. Login uses Supabase Google OAuth when a Supabase project URL and anon/publishable key are set in the deploy environment. `scripts/write-supabase-config.js` accepts `SUPABASE_URL` or `SUPABASE_DATABASE_URL`, and Supabase anon/publishable key aliases.

Generate the browser config locally or during Netlify build:

```sh
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/write-supabase-config.js
```

Without those values, `/login/` uses the local pilot API fallback. Dashboard, settings, and room creation require an authenticated session. See [docs/supabase-google-auth.md](docs/supabase-google-auth.md) for Google OAuth and MCP setup.

## Event Log

Default event log:

```text
~/.waitly/events.jsonl
```

Each record is one JSON object per line with a timestamp and event type. The file is created on first write. Set `WAITLY_EVENT_LOG` to write somewhere else, or set `WAITLY_HOME` to move the default config/log directory.

Common event types include `session_started`, `observer_selected`, `observer_fallback`, `appserver_started`, `proxy_started`, `codex_tui_started`, `rpc_event_seen`, `ad_open_scheduled`, `ad_opened`, `ad_close_requested`, `ad_closed`, `ad_force_closed`, `wait_detected`, `wait_ended`, `wait_suppressed`, `screen_status_detected`, `screen_prompt_detected`, `screen_idle_detected`, `ad_impression`, `ad_rotation_impression`, `ad_click`, `ad_auto_close`, `ad_unload`, `ad_window_shutdown_requested`, `session_finished`, and `session_failed`.

## Configuration

Waitly reads environment variables at startup:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WAITLY_DISABLED` | unset | Set to `1` to run the command directly without ad display or event logging. |
| `WAITLY_PAUSE_UNTIL` | unset | ISO timestamp or epoch milliseconds. Runs directly without ads until that time. |
| `WAITLY_HOME` | `~/.waitly` | Base directory for default config and event log paths. |
| `WAITLY_CONFIG` | `$WAITLY_HOME/config.json` | Optional JSON config path for `sponsorTarget`, disable, and pause settings. |
| `WAITLY_EVENT_LOG` | `$WAITLY_HOME/events.jsonl` | Event log file path. |
| `WAITLY_IDLE_MS` | `15000` | Silent-output threshold before wait detection. |
| `WAITLY_INPUT_PROMPT_GRACE_MS` | `90000` | Suppression window after an interactive prompt is detected. |
| `WAITLY_THINKING_AD_DELAY_MS` | `0` | Thinking/reasoning status duration before showing an ad. Default shows immediately. |
| `WAITLY_AD_DELAY_MS` | `2000` | Delay between an observed turn/reasoning start and opening the sponsored window. |
| `WAITLY_COMMAND_MODE` | `auto` | Command runner mode: `auto`, `pipe`, or `pty`. Auto uses PTY for known interactive AI CLIs when a terminal is attached. |
| `WAITLY_DETECTION_MODE` | `auto` | Wait detection source: `auto`, `appserver`, `json`, or `screen`. `codex-json` is accepted as a legacy alias for `json`. |
| `WAITLY_AD_COOLDOWN_MS` | `0` | Minimum time between ads in one wrapped session. Default allows each detected reasoning window to show. |
| `WAITLY_MAX_ADS` | `999` | Maximum ads per wrapped session. |
| `WAITLY_AD_ROTATION_MS` | `8000` | Creative rotation interval inside the ad page. |
| `WAITLY_AD_WINDOW_WIDTH` | `320` | Requested ad window width. |
| `WAITLY_AD_WINDOW_HEIGHT` | `430` | Requested ad window height. |
| `WAITLY_AD_WINDOW_MARGIN` | `0` | Bottom/right screen margin for default placement. |
| `WAITLY_AD_WINDOW_ANIMATION_MS` | `450` | Windows slide-up animation duration. |
| `WAITLY_AD_WINDOW_X` | unset | Optional fixed window X position. |
| `WAITLY_AD_WINDOW_Y` | unset | Optional fixed window Y position. |
| `WAITLY_OPEN_AD` | `1` | Set to `0` to print the ad URL instead of opening a browser. |
| `WAITLY_SPONSOR_TARGET` | `vitejs/vite` | Sponsor target shown in the ad page and event log. |

Optional config file example:

```json
{
  "sponsorTarget": "vitejs/vite",
  "disabled": false,
  "pauseUntil": "2030-01-01T09:00:00.000Z"
}
```

`WAITLY_SPONSOR_TARGET` takes precedence over `sponsorTarget` in the config file. `WAITLY_DISABLED=1`, `disabled: true`, or `adsDisabled: true` runs the wrapped command directly without opening ads. `WAITLY_PAUSE_UNTIL`, `pauseUntil`, or `adsPausedUntil` accepts an ISO timestamp or epoch milliseconds and pauses ads until that time when the value is in the future. `adsDisabled` and `adsPausedUntil` are accepted config aliases.

`waitly pause`, `waitly disable`, and `waitly enable` write the JSON config file. Environment variables still take precedence for the current process.

## OS And Window Behavior

- Windows and WSL use PowerShell to launch Microsoft Edge as an app-style popup. The default position is bottom-right on the monitor containing the cursor. A temporary Edge profile is created and removed on close.
- macOS launches Chrome, Edge, or Chromium with `--app`, a temporary profile, requested size, and requested bottom-right placement. AppleScript is used to read desktop bounds and request final window bounds. If no supported Chromium browser is found, Waitly falls back to `open`.
- Linux launches Chrome, Chromium, Edge, or `msedge` with `--app`, a temporary profile, requested size, and requested bottom-right placement. `wmctrl` is used to move/verify the window when available; `xrandr` helps determine the screen size. If no supported browser is found, Waitly falls back to `xdg-open`.
- `WAITLY_AD_WINDOW_X` and `WAITLY_AD_WINDOW_Y` override bottom-right placement on supported compact-window launch paths.
- `WAITLY_OPEN_AD=0` skips browser launch entirely and prints the localhost ad URL.

## Troubleshooting

- Use `WAITLY_OPEN_AD=0` when running in a headless terminal, CI, SSH, or an environment where opening a browser is not possible.
- If no ad appears during AI reasoning, confirm the wrapped command is running through `waitly run` or the Waitly shim and that ads are not paused or disabled.
- Run `waitly doctor codex` to see whether `codex` resolves to the Waitly shim, which real Codex path the shim stores, whether `WAITLY_DETECTION_MODE=auto` is active, whether app-server detection is eligible, and whether screen fallback will be used.
- If no ad appears during silent command output, lower `WAITLY_IDLE_MS` for testing and confirm the wrapped command is quiet long enough to trigger a wait.
- If no ad appears even after enough idle time, check for `WAITLY_DISABLED=1`, a future `WAITLY_PAUSE_UNTIL`, or matching `disabled`/`adsDisabled`/`pauseUntil`/`adsPausedUntil` values in the config file.
- If ads appear near prompts, increase `WAITLY_INPUT_PROMPT_GRACE_MS`; prompt detection is heuristic.
- If an interactive CLI says stdin/stdout is not a terminal, run from a real terminal and set `WAITLY_COMMAND_MODE=pty`.
- If a non-interactive command behaves differently under PTY, set `WAITLY_COMMAND_MODE=pipe`.
- If browser placement is wrong on Linux, install or expose `wmctrl` and `xrandr`, or set `WAITLY_AD_WINDOW_X` and `WAITLY_AD_WINDOW_Y`.
- If Windows/WSL opening fails, confirm `powershell.exe` and `msedge.exe` are available from the environment running Node.
- If event logging fails, check that the directory for `WAITLY_EVENT_LOG` is writable.
- Run `npm run waitly:test` to execute the Waitly test suite.

Manual Codex verification on Windows PowerShell:

```powershell
$env:Path = "$HOME\.waitly\shims;$env:Path"
Get-Command codex
waitly doctor codex
codex
```

Expected result: `Get-Command codex` points at `~/.waitly/shims/codex.cmd`, doctor reports the real Codex path from the shim, detection mode is `auto`, interactive Codex tries app-server observer first, reasoning opens an ad after about two seconds, visible answer output closes it, and process exit force-closes any remaining ad.
