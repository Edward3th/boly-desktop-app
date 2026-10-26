'use strict'

// The five verification scenarios. Each launches a fresh game instance against
// the local mock, drives a specific response sequence, and returns a list of
// PASS/FAIL checks mapping back to the heartbeat contract.

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { MockServer, VALIDATE_PATH } = require('./mock-server')
const { makeKey, launchGame, waitForExit, killGame } = require('./runner')
const saveScan = require('./save-scan')

const ok200 = { status: 200, body: { state: true, subscriptionAccess: false } }
const deny403 = { status: 403, body: { state: false, message: 'Invalid or superseded session' } }
const err500 = { status: 500, body: { state: false, message: 'boom' } }

function check(name, status, detail) {
  return { name, status, detail: detail || '' }
}

// Wraps scenario output and computes pass/fail.
function result(title, checks, sampleBeat) {
  return {
    title,
    checks,
    sampleBeat,
    failed: checks.some((ch) => ch.status === 'fail'),
  }
}

// A fatal launch failure (e.g. wrong exe path) short-circuits a scenario.
function fatalIfSpawnError(state, title) {
  if (state.spawnError) {
    return result(title, [
      check(
        'Game process launched',
        'fail',
        `could not start the game: ${state.spawnError.message} (check the --game path)`,
      ),
    ])
  }
  return null
}

function intervalsMs(beats) {
  const out = []
  for (let i = 1; i < beats.length; i++) out.push(beats[i].time - beats[i - 1].time)
  return out
}

// ── Scenario 1 ────────────────────────────────────────────────────────────
// Valid session: mock always returns 200. Inspect heartbeat shape, headers,
// cadence, and that beats keep coming after the first success (persistence).
async function scenarioValid(ctx) {
  const title = 'Valid session — heartbeat shape, headers & cadence'
  const server = new MockServer()
  server.setResponder(() => ok200)
  const port = await server.start(ctx.port)
  const key = makeKey()
  const { child, state } = launchGame({
    gamePath: ctx.gamePath,
    launcher: ctx.launcher,
    gameId: ctx.gameId,
    key,
    port,
    heartbeat: ctx.heartbeat,
  })

  const wantBeats = 3
  await server.waitForBeats(wantBeats, (ctx.intervalSec * (wantBeats + 1) + 6) * 1000)
  killGame(child)
  await server.stop()

  const fatal = fatalIfSpawnError(state, title)
  if (fatal) return fatal

  const beats = server.beats
  const checks = []

  if (beats.length === 0) {
    checks.push(
      check(
        'Game sent a heartbeat (parses -key / -game_id / -api_base)',
        'fail',
        'no request reached the mock — confirm ParamsCatcher runs in the FIRST scene, parses -key, and uses -api_base for the URL',
      ),
    )
    const r = result(title, checks)
    r.noHeartbeat = true // signals verify.js to skip the heartbeat-dependent scenarios
    return r
  }
  checks.push(check('Game sent a heartbeat (parses -key / -game_id / -api_base)', 'pass'))

  const badPath = beats.find((b) => b.path !== VALIDATE_PATH)
  checks.push(
    badPath
      ? check('POSTs to /v1/validate/validate', 'fail', `saw path "${badPath.path}"`)
      : check('POSTs to /v1/validate/validate', 'pass'),
  )

  const badMethod = beats.find((b) => b.method !== 'POST')
  checks.push(
    badMethod
      ? check('Uses HTTP POST', 'fail', `saw method "${badMethod.method}"`)
      : check('Uses HTTP POST', 'pass'),
  )

  const badCt = beats.find((b) => !/application\/json/i.test(b.contentType))
  checks.push(
    badCt
      ? check('Content-Type: application/json', 'fail', `saw "${badCt.contentType || '(none)'}"`)
      : check('Content-Type: application/json', 'pass'),
  )

  const b0 = beats[0]
  const bodyOk =
    b0.parsed &&
    !b0.parseError &&
    typeof b0.parsed.game_id === 'number' &&
    b0.parsed.game_id === ctx.gameId &&
    b0.parsed.key === key
  let bodyDetail = ''
  if (!bodyOk) {
    if (b0.parseError) bodyDetail = `body is not valid JSON: ${b0.parseError}`
    else if (!b0.parsed) bodyDetail = 'empty body'
    else if (b0.parsed.game_id !== ctx.gameId)
      bodyDetail = `game_id was ${JSON.stringify(b0.parsed.game_id)}, expected ${ctx.gameId}`
    else if (b0.parsed.key !== key) bodyDetail = 'key did not match the issued -key value'
  }
  checks.push(
    check('Body is { game_id:<int>, key:"<the -key>" }', bodyOk ? 'pass' : 'fail', bodyDetail),
  )

  const authBeat = beats.find((b) => b.hasAuth)
  checks.push(
    authBeat
      ? check('No Authorization header (key is the credential)', 'fail', 'an Authorization header was present')
      : check('No Authorization header (key is the credential)', 'pass'),
  )

  // The Boly SDK names itself on every request; the older ParamsCatcher
  // scripts don't, which is still a valid integration — hence warn, not fail.
  const sdkName = 'Identifies the SDK (X-Boly-SDK header)'
  const withSdk = beats.filter((b) => b.sdk)
  if (withSdk.length === 0) {
    checks.push(
      check(sdkName, 'warn', 'no X-Boly-SDK header — fine for a ParamsCatcher script; the Boly SDK always sends it'),
    )
  } else if (withSdk.length < beats.length) {
    checks.push(check(sdkName, 'warn', `only ${withSdk.length} of ${beats.length} requests sent it`))
  } else if (!/^[a-z]+\/\d+\.\d+\.\d+/.test(withSdk[0].sdk)) {
    checks.push(check(sdkName, 'warn', `unexpected format "${withSdk[0].sdk}" (expected e.g. "unity/0.1.0")`))
  } else {
    checks.push(check(sdkName, 'pass', withSdk[0].sdk))
  }

  // ≥3 beats arriving proves the validator survived the scene load and keeps a
  // steady cadence. Also guard against a runaway loop hammering the endpoint.
  if (beats.length < 3) {
    checks.push(
      check(
        'Heartbeats continue & cadence is steady (persists across scenes)',
        'fail',
        `only ${beats.length} beat(s) in ~${ctx.intervalSec * (wantBeats + 1)}s — validator may not survive the scene load, or interval is too long`,
      ),
    )
  } else {
    const ivs = intervalsMs(beats)
    const expected = ctx.intervalSec * 1000
    const tooFast = ivs.find((v) => v < expected * 0.3)
    if (tooFast != null) {
      checks.push(
        check(
          'Heartbeats continue & cadence is steady (persists across scenes)',
          'fail',
          `interval as short as ${tooFast}ms vs expected ~${expected}ms — heartbeat is firing too often`,
        ),
      )
    } else {
      const avg = Math.round(ivs.reduce((a, v) => a + v, 0) / ivs.length)
      checks.push(
        check(
          'Heartbeats continue & cadence is steady (persists across scenes)',
          'pass',
          `${beats.length} beats, ~${avg}ms apart (expected ~${expected}ms)`,
        ),
      )
    }
  }

  return result(title, checks, b0)
}

// ── Scenario 2 ────────────────────────────────────────────────────────────
// 200 then 403: the game must quit when the session is superseded/expired.
async function scenario403(ctx) {
  const title = '403 → quit (single-session / access lost)'
  const server = new MockServer()
  server.setResponder((i) => (i === 0 ? ok200 : deny403))
  const port = await server.start(ctx.port)
  const key = makeKey()
  const { child, state } = launchGame({
    gamePath: ctx.gamePath,
    launcher: ctx.launcher,
    gameId: ctx.gameId,
    key,
    port,
    heartbeat: ctx.heartbeat,
  })

  const exited = await waitForExit(state, (ctx.intervalSec * 3 + 6) * 1000)
  killGame(child)
  await server.stop()

  const fatal = fatalIfSpawnError(state, title)
  if (fatal) return fatal

  const checks = []
  checks.push(
    server.beats.length >= 2
      ? check('Sent initial heartbeat, then received a 403', 'pass')
      : check(
          'Sent initial heartbeat, then received a 403',
          'warn',
          `only ${server.beats.length} beat(s) before exit`,
        ),
  )
  checks.push(
    exited
      ? check('Game quit on 403', 'pass', `exited ~${state.exitTime - state.startTime}ms after launch`)
      : check(
          'Game quit on 403',
          'fail',
          'process was still running — it MUST exit when the server returns 403',
        ),
  )
  return result(title, checks)
}

// ── Scenario 3 ────────────────────────────────────────────────────────────
// 200, one 500, then 200s: a single transient failure must NOT kill the game.
async function scenarioTolerate(ctx) {
  const title = 'Transient failure tolerated (one 5xx, then recovers)'
  const server = new MockServer()
  server.setResponder((i) => (i === 1 ? err500 : ok200))
  const port = await server.start(ctx.port)
  const key = makeKey()
  const { child, state } = launchGame({
    gamePath: ctx.gamePath,
    launcher: ctx.launcher,
    gameId: ctx.gameId,
    key,
    port,
    heartbeat: ctx.heartbeat,
  })

  const wantBeats = 4
  await server.waitForBeats(wantBeats, (ctx.intervalSec * (wantBeats + 1) + 6) * 1000)
  const exited = state.exited
  killGame(child)
  await server.stop()

  const fatal = fatalIfSpawnError(state, title)
  if (fatal) return fatal

  const checks = []
  const recovered = !exited && server.beats.length >= 3
  checks.push(
    recovered
      ? check(
          'Survived a single transient failure & kept heartbeating',
          'pass',
          `${server.beats.length} beats, still running`,
        )
      : check(
          'Survived a single transient failure & kept heartbeating',
          'fail',
          exited
            ? 'game quit after ONE transient failure — it should tolerate ~2 before quitting'
            : `only ${server.beats.length} beat(s); could not confirm recovery`,
        ),
  )
  return result(title, checks)
}

// ── Scenario 4 ────────────────────────────────────────────────────────────
// 200 then 500 forever: the game must quit after ~2 consecutive failures.
async function scenarioEscalate(ctx) {
  const title = 'Repeated failures → quit (after ~2 consecutive)'
  const server = new MockServer()
  server.setResponder((i) => (i === 0 ? ok200 : err500))
  const port = await server.start(ctx.port)
  const key = makeKey()
  const { child, state } = launchGame({
    gamePath: ctx.gamePath,
    launcher: ctx.launcher,
    gameId: ctx.gameId,
    key,
    port,
    heartbeat: ctx.heartbeat,
  })

  const exited = await waitForExit(state, (ctx.intervalSec * 4 + 6) * 1000)
  const beatsAtExit = server.beats.length
  killGame(child)
  await server.stop()

  const fatal = fatalIfSpawnError(state, title)
  if (fatal) return fatal

  const checks = []
  if (!exited) {
    checks.push(
      check(
        'Game quit after repeated transient failures',
        'fail',
        'process never exited despite continuous 5xx responses',
      ),
    )
  } else if (beatsAtExit < 3) {
    checks.push(
      check(
        'Game quit after repeated transient failures',
        'warn',
        `quit after ${beatsAtExit} beat(s) — sooner than the ~2-failure tolerance`,
      ),
    )
  } else {
    checks.push(
      check(
        'Game quit after repeated transient failures',
        'pass',
        `quit after ${beatsAtExit} beats (1 ok + repeated 5xx)`,
      ),
    )
  }
  return result(title, checks)
}

// ── Scenario 5 ────────────────────────────────────────────────────────────
// No -key passed: the game must refuse to start (and send no heartbeat).
async function scenarioMissingKey(ctx) {
  const title = 'Missing -key → quit immediately, no heartbeat'
  const server = new MockServer()
  server.setResponder(() => ok200)
  const port = await server.start(ctx.port)
  const { child, state } = launchGame({
    gamePath: ctx.gamePath,
    launcher: ctx.launcher,
    gameId: ctx.gameId,
    key: '',
    port,
    heartbeat: ctx.heartbeat,
    includeKey: false,
  })

  const exited = await waitForExit(state, 10000)
  killGame(child)
  await server.stop()

  const fatal = fatalIfSpawnError(state, title)
  if (fatal) return fatal

  const checks = []
  checks.push(
    exited
      ? check('Quit when -key is missing', 'pass')
      : check('Quit when -key is missing', 'fail', 'game kept running without a session key'),
  )
  checks.push(
    server.beats.length === 0
      ? check('Sent no heartbeat without a key', 'pass')
      : check(
          'Sent no heartbeat without a key',
          'fail',
          `sent ${server.beats.length} request(s) despite having no key`,
        ),
  )
  return result(title, checks)
}

// ── Scenario 6 ────────────────────────────────────────────────────────────
// Achievements (Boly SDK 0.2+). The game is launched with the test-only
// -boly_test_achievement flag, which the SDK honors only when -api_base is
// a local server, and unlocks that achievement as soon as the session is
// ready. The first report gets a 500: the SDK must keep it and retry with the
// same client_event_id, without quitting the game.
const TEST_ACHIEVEMENT = 'BOLY_VERIFIER_TEST'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function scenarioAchievements(ctx) {
  const title = 'Achievements — reported, retried, never counted twice'
  const server = new MockServer()
  server.setResponder(() => ok200)
  let posts = 0
  server.setLumenResponder((i, call) => {
    if (call.method === 'POST' && call.path === '/v1/lumen/achievements' && ++posts === 1) {
      return { status: 500, body: { message: 'boom' } }
    }
    return null
  })
  const port = await server.start(ctx.port)
  const key = makeKey()
  // Where the desktop app would read unlock notices (spec §5.1)
  const eventsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boly-events-'))
  const { child, state } = launchGame({
    gamePath: ctx.gamePath,
    launcher: ctx.launcher,
    gameId: ctx.gameId,
    key,
    port,
    heartbeat: ctx.heartbeat,
    extraArgs: ['-boly_test_achievement', TEST_ACHIEVEMENT, '-boly_events_dir', eventsDir],
  })

  const isPost = (c) => c.method === 'POST' && c.path === '/v1/lumen/achievements'
  await server.waitForLumen((calls) => calls.filter(isPost).length >= 2, (ctx.intervalSec * 4 + 8) * 1000)
  // The notice is written right after the confirmed unlock: give it a moment
  const notices = await waitForNotices(eventsDir, 3000)
  const exitedEarly = state.exited
  killGame(child)
  await server.stop()
  fs.rmSync(eventsDir, { recursive: true, force: true })

  const fatal = fatalIfSpawnError(state, title)
  if (fatal) return fatal

  const calls = server.lumen
  const postCalls = calls.filter(isPost)
  if (calls.length === 0) {
    const usesSdk = server.beats.some((b) => b.sdk)
    const r = result(title, [
      check(
        'Reports achievements through /v1/lumen/achievements',
        'warn',
        usesSdk
          ? 'no achievement traffic — this SDK version has no achievements (update to Boly SDK 0.2+)'
          : 'not applicable: the build uses a ParamsCatcher script, not the Boly SDK',
      ),
    ])
    r.skipped = true
    r.failed = false
    return r
  }

  const checks = []
  checks.push(
    calls.some((c) => c.method === 'GET' && c.path === '/v1/lumen/achievements')
      ? check('Syncs achievement state at startup (GET /v1/lumen/achievements)', 'pass')
      : check('Syncs achievement state at startup (GET /v1/lumen/achievements)', 'warn', 'no GET seen'),
  )

  const badHeaders = calls.find((c) => c.key !== key || String(c.gameId) !== String(ctx.gameId) || c.hasAuth)
  checks.push(
    badHeaders
      ? check(
          'Sends X-Boly-Game-Id + X-Boly-Key, no Authorization',
          'fail',
          badHeaders.hasAuth ? 'an Authorization header was present' : 'X-Boly-Game-Id / X-Boly-Key did not match -game_id / -key',
        )
      : check('Sends X-Boly-Game-Id + X-Boly-Key, no Authorization', 'pass'),
  )

  const first = postCalls[0]
  const firstUpdate = first?.parsed?.updates?.find((u) => u.api_name === TEST_ACHIEVEMENT)
  const shapeOk = firstUpdate && firstUpdate.op === 'unlock' && UUID_RE.test(String(firstUpdate.client_event_id ?? ''))
  checks.push(
    shapeOk
      ? check('Reports { updates: [{ api_name, op, client_event_id }] }', 'pass', `${TEST_ACHIEVEMENT} → unlock`)
      : check(
          'Reports { updates: [{ api_name, op, client_event_id }] }',
          'fail',
          first ? `unexpected body: ${first.rawBody.slice(0, 200)}` : 'the test achievement was never reported',
        ),
  )

  const retried = postCalls[1]?.parsed?.updates?.some((u) => u.client_event_id === firstUpdate?.client_event_id)
  checks.push(
    retried
      ? check('Retries a failed report with the same client_event_id', 'pass')
      : check(
          'Retries a failed report with the same client_event_id',
          'fail',
          postCalls.length < 2 ? 'no retry after the 500 — the report was lost' : 'the retry used a different client_event_id (would count twice)',
        ),
  )

  checks.push(
    exitedEarly
      ? check('Kept playing when an achievement report failed', 'fail', 'the game quit — only the heartbeat may end the session')
      : check('Kept playing when an achievement report failed', 'pass'),
  )

  // SDK 0.3+: tells the Boly app about the unlock so it can show its notice
  const sdk = server.beats.find((b) => b.sdk)?.sdk ?? ''
  const notice = notices.files.map((f) => f.parsed).find((n) => n?.api_name === TEST_ACHIEVEMENT)
  const name = 'Notifies the Boly app of the unlock (-boly_events_dir)'
  if (notice && notice.type === 'achievement_unlocked' && notices.tmp === 0) {
    checks.push(check(name, 'pass', `${notices.files.length} notice(s)`))
  } else if (notice) {
    checks.push(check(name, 'fail', notices.tmp ? 'a .tmp file was left behind — write it whole, then rename' : `unexpected notice: ${JSON.stringify(notice)}`))
  } else if (sdkOlderThan(sdk, '0.3.0')) {
    checks.push(check(name, 'warn', `${sdk || 'this SDK'} predates the notice — the Boly app won't show its popup (update to Boly SDK 0.3+)`))
  } else {
    checks.push(check(name, 'fail', 'no notice file appeared in the -boly_events_dir folder after the unlock'))
  }

  // Names the game reported on its own that its manifest doesn't declare
  if (ctx.manifest?.status === 'ok') {
    const declared = new Set(ctx.manifest.achievements.map((a) => a.api_name))
    const unknown = [
      ...new Set(
        postCalls.flatMap((c) => (c.parsed?.updates ?? []).map((u) => u.api_name)).filter((n) => n !== TEST_ACHIEVEMENT && !declared.has(n)),
      ),
    ]
    if (unknown.length) {
      checks.push(
        check('Reports only achievements declared in boly/achievements.json', 'warn', `not declared: ${unknown.join(', ')} — Boly will ignore them`),
      )
    }
  }

  return result(title, checks, null)
}

// boly/achievements.json (+ icons) next to the executable, checked the way
// Boly checks it when the build is uploaded. No game launch.
async function scenarioManifest(ctx) {
  const title = 'Achievement manifest — boly/achievements.json'
  const m = ctx.manifest
  if (!m || m.status === 'absent') {
    const r = result(title, [
      check('Declares achievements in the build', 'warn', 'no boly/achievements.json next to the executable — achievements are managed on boly.cl'),
    ])
    r.skipped = true
    r.failed = false
    return r
  }

  const checks = m.issues.map((issue) =>
    check(`${issue.code}${issue.path ? ` (${issue.path})` : ''}`, issue.level === 'error' ? 'fail' : 'warn', issue.message),
  )
  if (m.status === 'ok') {
    checks.unshift(check(`Valid manifest: ${m.achievements.length} achievements (${m.manifestPath})`, 'pass'))
  } else if (!checks.some((c) => c.status === 'fail')) {
    checks.push(check('Valid manifest', 'fail', 'Boly will not apply these achievements'))
  }
  return result(title, checks, null)
}

// ── Scenario 8 ────────────────────────────────────────────────────────────
// Watch writes for two distinct learners. A 403 ends each session gracefully
// so games that save from OnSessionEnded get a chance to write their files.
async function scenarioSaves(ctx) {
  const title = 'Saved games — separate local data for two learners'
  const roots = ctx.saveRoots || saveScan.rootsFor(ctx.gamePath)
  const regKey = saveScan.unityRegistryKey(ctx.gamePath)
  const learners = [crypto.randomUUID(), crypto.randomUUID()]
  // Tests use bounded snapshots; a real user's AppData can be enormous, so
  // capture changes recursively during each launch instead.
  const useSnapshots = !!ctx.saveRoots
  const first = useSnapshots ? saveScan.snapshot(roots) : null
  const regFirst = saveScan.registrySnapshot(regKey)
  const runs = []

  for (const learnerId of learners) {
    const watcher = useSnapshots ? null : saveScan.watchChanges(roots)
    const server = new MockServer()
    server.learnerId = learnerId
    server.setResponder((i) => i === 0 ? ok200 : deny403)
    const port = await server.start(ctx.port)
    const { child, state } = launchGame({
      gamePath: ctx.gamePath,
      launcher: ctx.launcher,
      gameId: ctx.gameId,
      key: makeKey(),
      port,
      heartbeat: ctx.heartbeat,
    })
    await waitForExit(state, (ctx.intervalSec * 3 + 6) * 1000)
    killGame(child)
    await server.stop()
    if (state.spawnError) {
      if (watcher) watcher.close()
      return fatalIfSpawnError(state, title)
    }
    if (watcher) await new Promise((resolve) => setTimeout(resolve, 150))
    runs.push({ learnerId, beats: server.beats.length, sdk: server.beats[0]?.sdk || '', state,
      files: useSnapshots ? saveScan.snapshot(roots) : watcher.close(),
      registry: saveScan.registrySnapshot(regKey) })
  }

  const checks = []
  const a = useSnapshots ? saveScan.changed(first, runs[0].files) : runs[0].files.files
  const b = useSnapshots ? saveScan.changed(runs[0].files, runs[1].files) : runs[1].files.files
  const aOutside = a.filter((p) => !saveScan.isSdkStorage(p))
  const bOutside = b.filter((p) => !saveScan.isSdkStorage(p))
  const inSaves = (p) => /[/\\](?:saves|boly_saves)[/\\]/i.test(p)
  const wrongA = a.filter((p) => inSaves(p) && !saveScan.isLearnerSave(p, learners[0]))
  const wrongB = b.filter((p) => inSaves(p) && !saveScan.isLearnerSave(p, learners[1]))
  const regA = saveScan.registryChanged(regFirst, runs[0].registry)
  const regB = saveScan.registryChanged(runs[0].registry, runs[1].registry)
  // Unity itself persists display settings and its own session counters in
  // PlayerPrefs. Those are engine state, not a game's per-player progress.
  const unityOwned = /^(?:Screenmanager |UnitySelectMonitor_|unity\.player_|unity_connect\.)/i
  // Read the final branch, not only values whose bytes changed: writing the
  // same PlayerPrefs value again leaves reg query output unchanged.
  const badReg = runs[1].registry.filter((s) => !/boly\./i.test(s) && !unityOwned.test(s))
  const limits = (items) => items.slice(0, 20).join('\n        ') + (items.length > 20 ? `\n        ... and ${items.length - 20} more` : '')

  if (runs.some((run) => run.beats < 2)) {
    checks.push(check('Both sessions validated and ended on 403', 'warn',
      `A: ${runs[0].beats} heartbeat(s); B: ${runs[1].beats} heartbeat(s). Save-on-exit may not have run.`))
  } else {
    checks.push(check('Both sessions validated and ended on 403', 'pass'))
  }
  if (a.length + b.length + regA.length + regB.length === 0) {
    checks.push(check('Observed player data writes', 'warn',
      'No files or PlayerPrefs changed. Play far enough to trigger a save, then run --only 8 again.'))
  } else {
    checks.push(check('Observed player data writes', 'pass', `${a.length} file(s) for A, ${b.length} for B`))
  }
  const outside = [...new Set([...aOutside, ...bOutside])]
  checks.push(check('Files outside the Boly save area', outside.length ? 'warn' : 'pass',
    outside.length ? limits(outside) : 'none observed'))
  const wrong = [...new Set([...wrongA, ...wrongB])]
  if (wrong.length) checks.push(check('Boly files outside the active learner folder', 'warn', limits(wrong)))
  if (regKey) checks.push(check('Unity PlayerPrefs without boly.<learner_id>. prefix', badReg.length ? 'warn' : 'pass',
    badReg.length ? limits(badReg) : 'none observed'))
  if ((first && first.errors.length) || runs.some((run) => run.files.errors.length))
    checks.push(check('Snapshot access', 'warn', 'Some directories could not be read; the scan may be incomplete.'))
  // Storage findings are advisory: games also write graphics settings and logs.
  return result(title, checks)
}

// Notice files (*.json) the game wrote, and how many .tmp files it left
async function waitForNotices(dir, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  const read = () => {
    let names = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      // folder gone
    }
    const files = names
      .filter((n) => n.endsWith('.json'))
      .map((n) => {
        try {
          return { name: n, parsed: JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')) }
        } catch {
          return { name: n, parsed: null }
        }
      })
    return { files, tmp: names.filter((n) => n.endsWith('.tmp')).length }
  }
  let found = read()
  while (found.files.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200))
    found = read()
  }
  return found
}

// "unity/0.2.0" older than "0.3.0"?
function sdkOlderThan(sdkHeader, version) {
  const m = /\/(\d+)\.(\d+)\.(\d+)/.exec(sdkHeader)
  if (!m) return true
  const want = version.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (Number(m[i + 1]) !== want[i]) return Number(m[i + 1]) < want[i]
  }
  return false
}

const SCENARIOS = [
  { id: 1, title: 'Valid session — heartbeat shape, headers & cadence', run: scenarioValid },
  { id: 2, title: '403 → quit (single-session / access lost)', run: scenario403 },
  { id: 3, title: 'Transient failure tolerated (one 5xx, then recovers)', run: scenarioTolerate },
  { id: 4, title: 'Repeated failures → quit (after ~2 consecutive)', run: scenarioEscalate },
  { id: 5, title: 'Missing -key → quit immediately, no heartbeat', run: scenarioMissingKey },
  { id: 6, title: 'Achievements — reported, retried, never counted twice', run: scenarioAchievements },
  { id: 7, title: 'Achievement manifest — boly/achievements.json', run: scenarioManifest },
  { id: 8, title: 'Saved games — separate local data for two learners', run: scenarioSaves },
]

module.exports = { SCENARIOS }
