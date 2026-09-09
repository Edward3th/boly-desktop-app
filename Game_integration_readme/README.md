# Boly — game integration kit

> **Game developers: open [`index.html`](./index.html) in a browser instead.** It's
> the same content as an interactive, step-by-step checklist in Spanish/English,
> with the code to paste and commands ready to copy, and it picks the right track
> for you. This README is the reference version, aimed at Boly maintainers.

Two tracks, depending on what you built:

- **Downloadable (.exe)** — a native Windows build. Needs the license heartbeat
  below (Part 1–3), because the game is a standalone process the platform has
  to keep talking to.
- **Browser-style (Unity WebGL / Godot HTML5 / a plain web build)** — anything
  whose export is an `index.html`. See **[Part 0](#part-0--publishing-a-browser-style-game)**
  just below: no heartbeat, no script to integrate, three steps total.

---

## Part 0 — Publishing a browser-style game

Applies to a Unity WebGL export, a Godot HTML5 export, or any other build whose
output is an `index.html` plus its assets. Nothing from this kit gets added to
the game's own source — no ParamsCatcher script, no license heartbeat, no
verifier. The build runs inside Boly's own player, which controls access on
its own.

1. **Export to HTML5/WebGL.** Unity: `File ▸ Build Settings ▸ WebGL ▸ Switch
   Platform`, then `Build` to an empty folder — Unity writes its own
   `index.html`. Godot: `Project ▸ Export ▸ Add... ▸ Web`, export path ending in
   `index.html`. Any other tool: the only requirement is an `index.html`
   somewhere in the output folder, at the root or nested a few levels in.
   Absolute asset paths (Vite's default, e.g. `/assets/app.js`) work as-is —
   nothing to configure for that.
2. **Zip the export folder.** Don't use PowerShell's `Compress-Archive` — it
   writes Windows backslashes as the path separator, which the ZIP format
   forbids, and the archive unpacks flat. The server auto-rejects these on
   upload. Use 7-Zip, or from inside the export folder:
   ```
   tar -a -c -f build.zip *
   ```
   > Note the `*`, **not a dot**. `tar -a -c -f build.zip .` looks nearly
   > identical but archives "the current directory" itself rather than its
   > contents, prefixing every entry with `./` — a zip that still passes
   > upload validation (an `index.html` is still found) but that the
   > desktop app's installer refuses to extract. Also make sure you're
   > zipping the **export/build output** and not the whole project folder —
   > `node_modules` and source files don't belong in the zip, and a project
   > root often has its own `index.html` (the one Vite/webpack serves in
   > dev mode) that would get picked up instead of the real build's.
3. **Upload it — same dashboard as a desktop build.** Log in at boly.cl,
   **Developer Dashboard → Publish a new game**, fill in name/description/price,
   attach the zip, **Create game & upload build**. The server accepts a zip
   containing either a Windows executable or an `index.html` — nothing to
   choose on your end. An admin reviews and approves it; once approved the game
   publishes and is playable from the desktop app.

> Playing a browser-style build directly on boly.cl in a regular browser isn't
> supported yet — it always runs through the desktop app.

---

## Downloadable games: the license heartbeat

### The script for your engine

| Engine | File | Save as |
|---|---|---|
| Unity | [`ParamsCatcherUNITY.md`](./scripts/ParamsCatcherUNITY.md) | `ParamsCatcher.cs` |
| Godot | [`ParamsCatcherGODOT.md`](./scripts/ParamsCatcherGODOT.md) | `ParamsCatcher.gd` |
| Unreal | [`ParamsCatcherUNREAL.h.md`](./scripts/ParamsCatcherUNREAL.h.md) + [`ParamsCatcherUNREAL.cpp.md`](./scripts/ParamsCatcherUNREAL.cpp.md) | `ValidationSubsystem.h` / `.cpp` |
| GameMaker | [`ParamsCatcherGAMEMAKER.md`](./scripts/ParamsCatcherGAMEMAKER.md) | two event blocks in a `Persistent` `obj_params_catcher` |

Scene/room setup for each engine is in
[`GUIA_PARAMS_CATCHER.md`](./scripts/GUIA_PARAMS_CATCHER.md).

---

## How licensing works

When a user launches a game from the Boly desktop app:

1. The desktop app asks the API for a **session key** (`POST /v1/validate`,
   authenticated with the user's JWT) and receives a short-lived `tempKey`.
2. The desktop app spawns the game executable with command-line arguments:

   ```
   -game_id <int>   the game id on the platform
   -key <hex>       the session key (the credential)
   -token <jwt>     LEGACY ONLY — still sent today for backwards compatibility;
                    new games must ignore it (see "Completing the migration")
   ```

3. The game **heartbeats** the API to keep the session alive.

> **Where does the game id come from?** You never hardcode it. Leave `gameId` at
> `0` in the script — the launcher overwrites it via `-game_id` at runtime, so a
> hardcoded value would be ignored anyway. The real id is the game's primary key,
> assigned by the platform the moment the game record is created (that is, when
> the first build is submitted under *Publish a new game*). From then on it's
> visible in the dashboard URL: `boly.cl/developer/games/<game_id>/builds`.

### The heartbeat endpoint

```
POST https://ffstudios-shop-api.vercel.app/v1/validate/validate
Content-Type: application/json
(NO Authorization header — the key is the credential)

{ "game_id": <int>, "key": "<the -key value>" }
```

| Response | Meaning | Game must |
|---|---|---|
| `200 { "state": true, "subscriptionAccess": bool }` | Session valid, TTL renewed | Keep playing |
| `400 { "state": false, "message": "Missing key or game_id" }` | Malformed request — the body is missing a field | Treat as a bug in the integration, not a revocation |
| `403 { "state": false, ... }` | Key invalid, **superseded by another machine**, expired, or access lost | **Quit** |
| `429 { "state": false, ... }` | Rate limited | Back off, retry next interval; quit only after repeated failures |
| network error | Offline / unreachable | Tolerate ~4 misses, then quit |

The server key TTL is **5 minutes**. The game must heartbeat well inside that —
**every ~60 seconds** — starting at launch and repeating for the whole session.

A `403 / state:false` is the normal signal that the user started the game on
**another computer** (only one active session is allowed) or that their access
lapsed. The game **must exit** in that case.

---

## Part 1 — Migrate an OLD (legacy) game to the heartbeat

Old games still run today (the desktop app keeps sending `-token`), but they
don't heartbeat. To give a shipped game single-session + offline-expiry, rebuild
it with the script in this folder.

1. **Open the game project** in its engine.
2. **Replace** the old `ParamsCatcher` script/actor with the matching file from
   this folder (see the table at the top).
3. **Leave `gameId` at `0`.** The launcher sends the real id as `-game_id` at
   runtime.
4. **Remove any remaining dependency on `-token`.** The new script does not read
   it, send it, or set an `Authorization` header — confirm nothing else does.
5. **Confirm the heartbeat object runs first and persists.** It must exist in the
   first loaded scene/level and survive scene loads (Unity: `DontDestroyOnLoad`;
   Godot: autoload / persistent node; Unreal: an actor not destroyed on level
   change; GameMaker: a `Persistent` object + a global time source). See
   [`GUIA_PARAMS_CATCHER.md`](./scripts/GUIA_PARAMS_CATCHER.md).
6. **Build the executable** for the target platform(s).
7. **Test** (see [Testing](#testing-a-build)) — verify it launches, loads the
   game, heartbeats every ~60 s, and **quits** when a second machine launches the
   same account.
8. **Upload the new build yourself on the dev dashboard** — log in at
   [boly.cl](https://boly.cl) with your developer account, open your **Developer
   Dashboard**, pick the game, and hit **Manage builds** (*Gestionar builds*).
   Upload a `.zip` of the Windows build **containing the game executable** — the
   server rejects the upload automatically if the zip has no `.exe` in it. An admin
   reviews and approves it; once approved it becomes the game's live version
   automatically. Users get it on their next install/update.

   > **Don't build the zip with PowerShell's `Compress-Archive`.** It writes
   > Windows backslashes as the path separator, which the ZIP format forbids;
   > the archive then unpacks flat and the game cannot find its own files. The
   > server rejects these on upload. Use 7-Zip, or run this from inside the
   > build folder (`tar` ships with Windows 10 and 11):
   >
   > ```
   > tar -a -c -f build.zip *
   > ```
9. **Mark the game as migrated** in your tracking list (needed for Part 2).

When **every** game on the platform has completed steps 1–9, do Part 2.

---

## Part 2 — Completing the migration (drop `-token`, close the JWT leak)

Today the desktop app still passes `-token <jwt>` on the command line so legacy
games keep working. A command line is world-readable to any local process
(`ps`, Task Manager), so the JWT leaks. Once **all** games heartbeat with `-key`
alone, remove the token:

1. Confirm **all** games are migrated (Part 1 done for each).
2. In **`src/main/services/GameService.ts`**, find the `args` line:

   ```ts
   const args = `-game_id ${reqValidate.game_id} -key ${validationResponse.data.tempKey} -token ${token}`
   ```

   and drop the token:

   ```ts
   const args = `-game_id ${reqValidate.game_id} -key ${validationResponse.data.tempKey}`
   ```

3. Build and publish the desktop app (`npm run build` → the
   `.github/workflows/release.yml` GitHub Release, or `npm run build:win` /
   `:mac` / `:linux`).
4. Verify a game still launches and that `ps aux | grep <game>` shows **no JWT**
   in the command line.
5. Done — the argv JWT leak is closed and single-session is enforced everywhere.

> If a not-yet-migrated game remains, dropping `-token` makes it quit on launch
> (its old ParamsCatcher requires the token). That's why Part 2 happens only
> after every game is confirmed migrated. For a long mixed transition, gate
> `-token` per game instead (e.g. a `legacy_validation` flag on the game record).

---

## Part 3 — Integrate the heartbeat in a NEW game

0. **Register your Boly developer account.** Sign up at
   [boly.cl](https://boly.cl) using the **email Boly pre-approved for you** — this
   automatically creates you as a Developer account linked to your studio (no
   separate "developer request" step needed).
1. Copy the script for your engine from the `scripts/` folder into the game project:
   - Unity → [`ParamsCatcherUNITY.md`](./scripts/ParamsCatcherUNITY.md) (save as `ParamsCatcher.cs`)
   - Godot → [`ParamsCatcherGODOT.md`](./scripts/ParamsCatcherGODOT.md) (save as `ParamsCatcher.gd`)
   - Unreal → [`ParamsCatcherUNREAL.h.md`](./scripts/ParamsCatcherUNREAL.h.md) + [`ParamsCatcherUNREAL.cpp.md`](./scripts/ParamsCatcherUNREAL.cpp.md) (save as `ValidationSubsystem.h` / `.cpp`)
   - GameMaker → [`ParamsCatcherGAMEMAKER.md`](./scripts/ParamsCatcherGAMEMAKER.md) (paste the Create + Async&nbsp;HTTP event blocks into a `Persistent` `obj_params_catcher`)
2. Leave `gameId` at `0` — the launcher sends it as `-game_id` at runtime.
3. Wire up the scene/build setup per [`GUIA_PARAMS_CATCHER.md`](./scripts/GUIA_PARAMS_CATCHER.md)
   so the validator runs in the first scene and persists across scene loads.
4. Build and test (see below).
5. **Publish the game and upload your build on the dev dashboard.** Log in at
   boly.cl, go to your **Developer Dashboard → Publish a new game**
   (*Publicar un nuevo juego*), fill in the game's name/description/price,
   optionally attach a banner image, and attach your zipped Windows build — the
   desktop app extracts the zip itself, so **no installer is needed**; just make
   sure the `.zip` contains the game's `.exe` (the server auto-rejects it
   otherwise). Press **Create game & upload build** (*Crear juego y subir build*).
   This creates the game as a **private draft** and starts the upload; nothing is
   visible on the store yet. An admin reviews and approves the build — once
   approved, the game publishes automatically and is playable from the platform.
   For later updates, use **Manage builds** on the game's dashboard page instead
   (same review flow).
6. **Add the store art.** A freshly created game has no screenshots. From the
   game's dashboard page open **Game Media** (*Archivos multimedia del juego*) and
   upload the banner, screenshots and videos there. Do this before approval so the
   store page looks finished the moment it goes live.

### Contract the script must follow (already implemented in the provided files)
- Read `-game_id` and `-key`; **do not** read or require `-token`.
- POST `{ game_id, key }` to the heartbeat URL with **no** `Authorization` header.
- Heartbeat every ~60 s; on first success enter gameplay; on `403` / repeated
  failure, **quit**.
- The heartbeat object must persist across scene/level changes.

---

## Testing a build

**Fastest — the local verifier (no upload, no platform account needed):** use the
CLI in [`verifier/`](./verifier/). It runs a local fake of the validate endpoint,
launches your build pointed at it, and checks the whole heartbeat contract
(request shape, no `Authorization` header, steady cadence, quit-on-`403`,
transient tolerance) in seconds — so you can confirm the integration **before**
uploading the build on the dev dashboard.

Game developers run the prebuilt binary — no Node, no setup. `boly-verify-win.exe`
sits at the **root of the kit** you shipped them, so from a PowerShell opened in
that folder:

```powershell
.\boly-verify-win.exe --game "C:\path\to\YourGame.exe" --game-id 0
```

Boly maintainers working from this repo run it from source instead (Node ≥18):

```bash
cd verifier
node verify.js --game "C:\path\to\YourGame.exe" --game-id 0
```

`--game-id` can be any non-negative integer — the local mock ignores its value.

It relies on two **test-only** command-line overrides the scripts in this folder
now accept (the production launcher never sends them, so production behavior is
unchanged):

| Override | Default | Purpose |
|---|---|---|
| `-api_base <origin>` | `https://ffstudios-shop-api.vercel.app` | Point the heartbeat at a different host (the verifier's local mock). The script still appends `/v1/validate/validate`. |
| `-heartbeat_seconds <n>` | `60` | Shorten the heartbeat interval so the verifier finishes in seconds. |

See [`verifier/README.md`](./verifier/README.md) for all options and how to read
the report. Test an actual **build** (not the editor — see the note below).

**Easiest — through the Boly desktop app:** install the game on an account that
owns it (or has an active subscription) and launch it. Watch the game's log:

- It should load gameplay and log a successful heartbeat about every 60 s.
- Launch the **same account's** copy on a **second machine**; the first instance
  should quit within one heartbeat (single-session).
- Sign out / let the subscription lapse; the game should quit within a heartbeat.

**Advanced — manual key:** get a key by calling `POST /v1/validate` with
`Authorization: Bearer <a logged-in account's JWT>` and `{ "game_id": <id> }`; it
returns `{ "tempKey": "..." }`. Then run the build with
`-game_id <id> -key <tempKey>` and watch it heartbeat.

> Note: in the Unity **editor**, `Application.Quit()` does nothing — test quit
> behavior in an actual build.
