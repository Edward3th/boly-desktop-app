# Boly game integration verifier

A small command-line tool that checks a game build correctly implements the Boly
license **heartbeat** (the `ParamsCatcher` script) **before** you hand the build to
Boly to upload. It runs a local fake of the validate endpoint, launches your game
pointed at it, and verifies the game heartbeats and quits exactly as the contract
requires — all offline, in seconds.

It catches the mistakes that otherwise only surface after a build is on the
platform: never heartbeating, wrong request shape, leaking an `Authorization`
header, not quitting on `403`, or quitting on the first network hiccup.

## What it checks

| # | Scenario | Confirms |
|---|----------|----------|
| 1 | Valid session | Reads `-game_id`/`-key`, POSTs `{game_id, key}` JSON to `/v1/validate/validate`, `Content-Type: application/json`, **no** `Authorization` header, and keeps heartbeating at a steady cadence (survives the scene load). Also reports whether the build sends `X-Boly-SDK` — a `WARN` (not a failure) for ParamsCatcher scripts, which don't |
| 2 | 403 → quit | The game exits when the server returns `403` (session superseded / access lost) |
| 3 | Transient tolerated | One `5xx`/network failure does **not** kill the game; it recovers |
| 4 | Repeated failures → quit | The game exits after ~2 consecutive failures |
| 5 | Missing `-key` | The game refuses to start and sends no heartbeat |

## Requirements on the build

This tool relies on the optional `-api_base` (and `-heartbeat_seconds`) override
added to the ParamsCatcher scripts in this folder. Make sure your build uses the
current `ParamsCatcher` so it can be pointed at the local mock. These overrides are
**test-only** — the production Boly launcher never sends them, so your game keeps
talking to the real API in production.

## Quick start (game developers — you were given `boly-verify-win.exe`)

You don't need Node or any setup. Build your game to a `.exe` first, then open
**PowerShell** (or Command Prompt) in the folder containing `boly-verify-win.exe`
and run **one command**, pointing at your build (`--game-id` can be any integer,
e.g. `0`):

```powershell
.\boly-verify-win.exe --game "C:\path\to\YourGame.exe" --game-id 0
```

Your game will open and close a few times — that's the tool running its checks.
After ~30 seconds you get a `PASS` / `FAIL` report. **All green → your build is
ready to send to Boly.** Any red line tells you exactly what to fix. Re-run as many
times as you like; nothing is uploaded and no account is needed.

> Windows SmartScreen may warn about an unrecognized app (the exe isn't
> code-signed). Click **More info → Run anyway**.

## Usage (full reference)

Same flags whether you run the binary or, with Node ≥18 installed, `node verify.js`:

```bash
node verify.js --game "/path/to/YourGame.exe" --game-id 0
```

### Options

| Flag | Meaning |
|------|---------|
| `--game, -g <path>` | Path to the built game executable (required) |
| `--game-id <int>` | Any non-negative integer (required by the flag; the mock ignores its value) |
| `--heartbeat <sec>` | Test heartbeat interval (default `3`). Passed as `-heartbeat_seconds` so runs finish fast |
| `--real-cadence` | Use the real 60s heartbeat (slow; validates true production timing) |
| `--only <list>` | Run only some scenarios, e.g. `--only 1,2,5` |
| `--launcher <cmd>` | Prefix command used to launch the game (e.g. `wine` to run a Windows `.exe` on Linux/macOS) |
| `--port <int>` | Mock server port (default: auto-pick) |
| `--json` | Machine-readable output (for CI) |
| `--help, -h` | Show help |

### Verifying a Windows build on Linux / macOS (Boly maintainers)

A Windows `.exe` can't launch natively on Linux/macOS, so install
[Wine](https://www.winehq.org/) and run the verifier from source with Node,
pointing it at the game through Wine:

```bash
cd verifier
node verify.js --game "/path/to/DevGame.exe" --game-id 0 --launcher wine
```

Everything else works the same — the game runs under Wine, its heartbeats reach
the local mock, and the report prints as usual. (Quit detection relies on Wine
exiting when the game closes; if a scenario looks flaky, re-run, or verify on a
real Windows machine.)

Exit code is `0` only if every selected scenario passes.

## Reading the output

Each scenario prints `PASS` / `FAIL` / `WARN` per contract item, and scenario 1
prints a captured sample heartbeat so you can eyeball the exact request your game
sent:

```
[1/5] Valid session — heartbeat shape, headers & cadence
  PASS  Game sent a heartbeat (parses -key / -game_id / -api_base)
  PASS  POSTs to /v1/validate/validate
  PASS  Content-Type: application/json
  PASS  Body is { game_id:<int>, key:"<the -key>" }
  PASS  No Authorization header (key is the credential)
  PASS  Identifies the SDK (X-Boly-SDK header)
        unity/0.1.0
  PASS  Heartbeats continue & cadence is steady (persists across scenes)
        sample heartbeat:
          POST /v1/validate/validate
          Content-Type: application/json
          Authorization: (none)
          X-Boly-SDK: unity/0.1.0
          body: {"game_id":5,"key":"<hex>"}
```

A `FAIL` on scenario 1 "Game sent a heartbeat" almost always means the
`ParamsCatcher` isn't running in the **first** scene/level, or isn't reading
`-api_base`.

> Note: scenarios open and close your game window several times — that's expected.
> The tool kills each instance when the scenario is done. Test against a real
> **build**, not the editor (in the Unity editor `Application.Quit()` does nothing,
> so the quit checks won't pass).

## Building the binaries (Boly maintainers only)

The standalone Windows executable in `dist/` is built with
[`pkg`](https://github.com/vercel/pkg) (downloaded on demand via `npx`, nothing to
install), and can be built from any OS including Linux/macOS:

```bash
npm run build:bin     # → dist/boly-verify-win.exe
```

Hand `boly-verify-win.exe` to each game developer. They never build anything — they
just run it. (To target macOS/Linux too, add `node18-macos-x64,node18-linux-x64`
to the `--targets` list in `package.json`.)
