const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function openUrl(
  url,
  { openAds, width = 320, height = 430, margin = 0, animationMs = 450, x = null, y = null }
) {
  if (!openAds) {
    return {
      attempted: false,
      mode: "printed",
      close: () => {}
    };
  }

  const windowOptions = { width, height, margin: Math.max(0, margin), animationMs, x, y };
  const opener = selectOpener(url, windowOptions);
  const launched = opener.launch();

  return {
    attempted: true,
    mode: opener.mode,
    close: launched.close,
    pid: launched.pid,
    position: launched.position,
    placement: launched.placement
  };
}

function selectOpener(url, windowOptions) {
  const platform = process.platform;

  if (isWsl() || platform === "win32") {
    return {
      mode: "edge-bottom-popup",
      launch: () => launchWindowsEdge(url, windowOptions)
    };
  }

  if (platform === "darwin") {
    return {
      mode: "mac-chromium-bottom-popup",
      launch: () => launchMacChromium(url, windowOptions)
    };
  }

  return {
    mode: "linux-chromium-bottom-popup",
    launch: () => launchLinuxChromium(url, windowOptions)
  };
}

function launchWindowsEdge(url, { width, height, margin, animationMs, x, y }) {
  const profileId = `waitly-ad-${crypto.randomUUID()}`;
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -Namespace Waitly -Name Win32 -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"user32.dll\")] public static extern bool SetWindowPos(System.IntPtr hWnd, System.IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, System.UInt32 uFlags);'",
    `$width = ${width}`,
    `$height = ${height}`,
    `$margin = ${margin}`,
    `$animationMs = ${animationMs}`,
    "$cursor = [System.Windows.Forms.Cursor]::Position",
    "$area = [System.Windows.Forms.Screen]::FromPoint($cursor).WorkingArea",
    x === null ? "$x = [Math]::Max($area.Left, $area.Right - $width - $margin)" : `$x = ${x}`,
    y === null ? "$y = [Math]::Max($area.Top, $area.Bottom - $height - $margin)" : `$y = ${y}`,
    "$startY = [Math]::Max($area.Top, $area.Bottom - 36)",
    `$profile = Join-Path $env:TEMP ${psQuote(`WaitlyAdProfiles\\${profileId}`)}`,
    "New-Item -ItemType Directory -Force -Path $profile | Out-Null",
    `$edgeArgs = @(${[
      psQuote(`--app=${url}`),
      "'--no-first-run'",
      "'--no-default-browser-check'",
      '"--user-data-dir=$profile"',
      '"--window-size=$width,$height"',
      '"--window-position=$x,$startY"'
    ].join(", ")})`,
    "$p = Start-Process -FilePath 'msedge.exe' -ArgumentList $edgeArgs -PassThru",
    "$handle = [IntPtr]::Zero",
    "for ($i = 0; $i -lt 60; $i++) { $p.Refresh(); if ($p.MainWindowHandle -ne 0) { $handle = $p.MainWindowHandle; break }; Start-Sleep -Milliseconds 50 }",
    "if ($handle -ne [IntPtr]::Zero) {",
    "  $steps = 16",
    "  $delay = [Math]::Max(8, [int]($animationMs / $steps))",
    "  for ($i = 0; $i -le $steps; $i++) {",
    "    $t = $i / $steps",
    "    $ease = 1 - [Math]::Pow(1 - $t, 3)",
    "    $currentY = [int]($startY + (($y - $startY) * $ease))",
    "    [Waitly.Win32]::SetWindowPos($handle, [IntPtr]::Zero, $x, $currentY, $width, $height, 0x0040) | Out-Null",
    "    Start-Sleep -Milliseconds $delay",
    "  }",
    "}",
    "$rightGap = [int]($area.Right - ($x + $width))",
    "$bottomGap = [int]($area.Bottom - ($y + $height))",
    "Write-Output \"$($p.Id),$x,$y,$rightGap,$bottomGap,$profile\""
  ].join("; ");

  const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    timeout: 8000
  });

  if (result.status !== 0) {
    console.error(`[waitly] Could not open compact Edge popup. Visit: ${url}`);
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
    return emptyLaunch();
  }

  const [pidRaw, xRaw, yRaw, rightGapRaw, bottomGapRaw, ...profileParts] = result.stdout.trim().split(",");
  const pid = Number.parseInt(pidRaw, 10);
  const profile = profileParts.join(",");
  const position = {
    x: Number.parseInt(xRaw, 10),
    y: Number.parseInt(yRaw, 10),
    rightGap: Number.parseInt(rightGapRaw, 10),
    bottomGap: Number.parseInt(bottomGapRaw, 10)
  };

  return {
    pid,
    position,
    placement: "verified",
    close: () => {
      if (Number.isFinite(pid)) {
        childProcess.spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
          detached: true,
          stdio: "ignore"
        }).unref();
      }

      if (profile) {
        cleanupWindowsProfile(profile);
      }
    }
  };
}

function launchMacChromium(url, { width, height, margin, x, y }) {
  const browser = firstExistingMacBrowser();
  if (!browser) {
    return launchDetached("open", [url], null, "fallback");
  }

  const screen = readMacDesktopBounds();
  const target = computeBottomRight(screen, { width, height, margin, x, y });
  const profile = path.join(os.tmpdir(), `waitly-ad-${crypto.randomUUID()}`);
  fs.mkdirSync(profile, { recursive: true });

  const child = childProcess.spawn(browser.binary, [
    `--app=${url}`,
    `--window-size=${width},${height}`,
    `--window-position=${target.x},${target.y}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check"
  ], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();
  setMacWindowBounds(browser.processName, target.x, target.y, width, height);

  return {
    pid: child.pid,
    position: target,
    placement: "requested",
    close: () => {
      killProcessGroup(child.pid);
      cleanupPath(profile);
    }
  };
}

function launchLinuxChromium(url, { width, height, margin, x, y }) {
  const browser = firstAvailableCommand([
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "msedge"
  ]);

  if (!browser) {
    return launchDetached("xdg-open", [url], null, "fallback");
  }

  const workArea = readLinuxWorkArea();
  const target = computeBottomRight(workArea, { width, height, margin, x, y });
  const profile = path.join(os.tmpdir(), `waitly-ad-${crypto.randomUUID()}`);
  fs.mkdirSync(profile, { recursive: true });

  const child = childProcess.spawn(browser, [
    `--app=${url}`,
    `--window-size=${width},${height}`,
    `--window-position=${target.x},${target.y}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check"
  ], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();

  const moved = moveLinuxWindow(child.pid, target.x, target.y, width, height);
  return {
    pid: child.pid,
    position: target,
    placement: moved ? "verified" : "requested",
    close: () => {
      killProcessGroup(child.pid);
      cleanupPath(profile);
    }
  };
}

function computeBottomRight(area, { width, height, margin, x, y }) {
  const targetX = x === null ? Math.max(area.x, area.x + area.width - width - margin) : x;
  const targetY = y === null ? Math.max(area.y, area.y + area.height - height - margin) : y;

  return {
    x: targetX,
    y: targetY,
    rightGap: area.x + area.width - (targetX + width),
    bottomGap: area.y + area.height - (targetY + height)
  };
}

function readMacDesktopBounds() {
  const result = childProcess.spawnSync("osascript", [
    "-e",
    'tell application "Finder" to get bounds of window of desktop'
  ], {
    encoding: "utf8",
    timeout: 2000
  });

  if (result.status === 0) {
    const [left, top, right, bottom] = result.stdout
      .trim()
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10));

    if ([left, top, right, bottom].every(Number.isFinite)) {
      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
      };
    }
  }

  return { x: 0, y: 0, width: 1440, height: 900 };
}

function readLinuxWorkArea() {
  const wmctrl = childProcess.spawnSync("wmctrl", ["-d"], {
    encoding: "utf8",
    timeout: 1000
  });

  if (wmctrl.status === 0) {
    const current = wmctrl.stdout.split(/\r?\n/).find((line) => line.includes("*"));
    const match = current && current.match(/WA:\s*(-?\d+),(-?\d+)\s+(\d+)x(\d+)/);
    if (match) {
      return {
        x: Number.parseInt(match[1], 10),
        y: Number.parseInt(match[2], 10),
        width: Number.parseInt(match[3], 10),
        height: Number.parseInt(match[4], 10)
      };
    }
  }

  const xrandr = childProcess.spawnSync("xrandr", ["--current"], {
    encoding: "utf8",
    timeout: 1000
  });

  if (xrandr.status === 0) {
    const primary = xrandr.stdout
      .split(/\r?\n/)
      .find((line) => line.includes(" connected primary ")) ||
      xrandr.stdout.split(/\r?\n/).find((line) => line.includes(" connected "));
    const match = primary && primary.match(/(\d+)x(\d+)\+(-?\d+)\+(-?\d+)/);
    if (match) {
      return {
        x: Number.parseInt(match[3], 10),
        y: Number.parseInt(match[4], 10),
        width: Number.parseInt(match[1], 10),
        height: Number.parseInt(match[2], 10)
      };
    }
  }

  return { x: 0, y: 0, width: 1920, height: 1080 };
}

function setMacWindowBounds(processName, x, y, width, height) {
  childProcess.spawn("osascript", [
    "-e",
    `tell application "System Events" to tell process ${JSON.stringify(processName)} to if exists window 1 then set position of window 1 to {${x}, ${y}}`,
    "-e",
    `tell application "System Events" to tell process ${JSON.stringify(processName)} to if exists window 1 then set size of window 1 to {${width}, ${height}}`
  ], {
    detached: true,
    stdio: "ignore"
  }).unref();
}

function moveLinuxWindow(pid, x, y, width, height) {
  const windowId = findLinuxWindowByPid(pid);
  if (!windowId) {
    return false;
  }

  const result = childProcess.spawnSync("wmctrl", [
    "-ir",
    windowId,
    "-e",
    `0,${x},${y},${width},${height}`
  ], {
    stdio: "ignore",
    timeout: 1000
  });

  return result.status === 0;
}

function findLinuxWindowByPid(pid) {
  if (!pid || !firstAvailableCommand(["wmctrl"])) {
    return "";
  }

  for (let i = 0; i < 20; i += 1) {
    const result = childProcess.spawnSync("wmctrl", ["-lp"], {
      encoding: "utf8",
      timeout: 1000
    });

    if (result.status === 0) {
      const line = result.stdout
        .split(/\r?\n/)
        .find((entry) => entry.split(/\s+/)[2] === String(pid));
      if (line) {
        return line.split(/\s+/)[0];
      }
    }

    childProcess.spawnSync("sleep", ["0.1"], { stdio: "ignore" });
  }

  return "";
}

function firstExistingMacBrowser() {
  const candidates = [
    {
      binary: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      processName: "Google Chrome"
    },
    {
      binary: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      processName: "Microsoft Edge"
    },
    {
      binary: "/Applications/Chromium.app/Contents/MacOS/Chromium",
      processName: "Chromium"
    }
  ];

  return candidates.find((candidate) => fs.existsSync(candidate.binary)) || null;
}

function launchDetached(command, args, position = null, placement = "requested") {
  const child = childProcess.spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });

  child.on("error", () => {
    console.error("[waitly] Could not open a browser.");
  });

  child.unref();

  return {
    pid: child.pid,
    position,
    placement,
    close: () => {
      killProcessGroup(child.pid);
    }
  };
}

function cleanupWindowsProfile(profile) {
  const command = `Start-Sleep -Milliseconds 700; Remove-Item -LiteralPath ${psQuote(profile)} -Recurse -Force -ErrorAction SilentlyContinue`;
  childProcess.spawn("powershell.exe", ["-NoProfile", "-Command", command], {
    detached: true,
    stdio: "ignore"
  }).unref();
}

function cleanupPath(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (_) {
    // Profile cleanup is best-effort.
  }
}

function killProcessGroup(pid) {
  if (!pid) {
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch (_) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (_) {
      // Process may have already exited.
    }
  }
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function firstAvailableCommand(commands) {
  for (const command of commands) {
    const result = childProcess.spawnSync("which", [command], {
      stdio: "ignore"
    });

    if (result.status === 0) {
      return command;
    }
  }

  return "";
}

function emptyLaunch() {
  return {
    pid: null,
    position: null,
    placement: "failed",
    close: () => {}
  };
}

function isWsl() {
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

module.exports = {
  openUrl
};
