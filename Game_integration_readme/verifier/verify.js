#!/usr/bin/env node
'use strict'

// Boly game integration verifier.
//
// Launches a game build the way the Boly desktop launcher does, but against a
// local mock of the validate endpoint, and checks that the ParamsCatcher
// heartbeat is implemented per the contract (shape, headers, cadence,
// quit-on-403, transient tolerance). Run BEFORE uploading a build to Boly.
//
//   node verify.js --game <path-to-exe> --game-id <int>
//   node verify.js manifest <build folder or .zip> [--constants <engine>]
//
// Zero dependencies. See README.md for full usage.

const fs = require('fs')
const path = require('path')
const { SCENARIOS } = require('./scenarios')
const report = require('./report')
const { checkBuildAchievements } = require('./manifest')
const { ENGINES, achievementConstantsFile } = require('./constants')

function parseArgs(argv) {
  const opts = {
    game: null,
    gameId: null,
    port: 0,
    heartbeat: 3, // fast cadence for quick runs; production default is 60
    only: null,
    realCadence: false,
    json: false,
    launcher: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '--game':
      case '-g':
        opts.game = next()
        break
      case '--game-id':
        opts.gameId = parseInt(next(), 10)
        break
      case '--port':
        opts.port = parseInt(next(), 10)
        break
      case '--heartbeat':
        opts.heartbeat = parseFloat(next())
        break
      case '--only':
        opts.only = next()
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n))
        break
      case '--real-cadence':
        opts.realCadence = true
        break
      case '--launcher':
        opts.launcher = next()
        break
      case '--json':
        opts.json = true
        break
      case '--help':
      case '-h':
        opts.help = true
        break
      default:
        console.error(`Unknown argument: ${a}`)
        opts.invalid = true
    }
  }
  return opts
}

function printHelp() {
  console.log(`
Boly game integration verifier

Usage:
  node verify.js --game <path-to-exe> --game-id <int> [options]

Required:
  --game, -g <path>     Path to the built game executable to test
  --game-id <int>       Any non-negative integer (the mock ignores it; use 0)

Options:
  --heartbeat <sec>     Test heartbeat interval (default 3). The verifier passes
                        this as -heartbeat_seconds so runs finish in seconds.
  --real-cadence        Use the real 60s heartbeat instead (slow; validates true
                        production timing). Omits -heartbeat_seconds.
  --only <list>         Run only these scenarios, e.g. --only 1,2,5
  --launcher <cmd>      Prefix command to launch the game (e.g. "wine" to run a
                        Windows .exe on Linux/macOS)
  --port <int>          Mock server port (default: auto-pick a free port)
  --json                Emit machine-readable JSON instead of the pretty report
  --help, -h            Show this help

Scenarios:
  1  Valid session — heartbeat shape, headers & cadence
  2  403 → quit
  3  Transient failure tolerated (one 5xx, recovers)
  4  Repeated failures → quit
  5  Missing -key → quit immediately, no heartbeat
  6  Achievements — reported, retried, never counted twice
  7  boly/achievements.json next to the executable (if the build declares achievements)
  8  Saved games — inspect writes after running as two learners (WARN only)

Exit code is 0 only if every selected scenario passes.

Achievement manifest only (no game launch):
  node verify.js manifest <build folder or .zip> [--constants <engine>] [--out <path>] [--json]

  Checks boly/achievements.json and its icons exactly as Boly will when the
  build is uploaded. --constants unity|godot|unreal|gamemaker also writes the
  constants file for that engine (to --out, a folder or file; default: here).
`)
}

// verify.js manifest <path> — validate boly/achievements.json without
// launching the game, and optionally write the engine's constants file.
async function manifestCommand(argv) {
  const opts = { target: null, constants: null, out: null, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--constants') opts.constants = argv[++i]
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--json') opts.json = true
    else if (!opts.target && !a.startsWith('--')) opts.target = a
    else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  if (!opts.target || !fs.existsSync(opts.target)) {
    console.error('Error: pass the build folder (where the executable is) or the build .zip.')
    process.exit(2)
  }
  if (opts.constants && !ENGINES.includes(opts.constants)) {
    console.error(`Error: --constants must be one of ${ENGINES.join(', ')}`)
    process.exit(2)
  }

  const result = await checkBuildAchievements(opts.target)
  let written = null
  if (opts.constants && result.status === 'ok') {
    const file = achievementConstantsFile(opts.constants, result.achievements)
    const out = opts.out || '.'
    const dest = fs.existsSync(out) && fs.statSync(out).isDirectory() ? path.join(out, file.fileName) : out
    fs.writeFileSync(dest, file.content)
    written = dest
  }

  if (opts.json) {
    const { icons, ...rest } = result
    console.log(JSON.stringify({ ...rest, icons: icons ? Object.keys(icons) : undefined, constants: written }, null, 2))
  } else {
    printManifestResult(result, opts.target)
    if (written) console.log(report.green(`Constants written to ${written}`))
    if (opts.constants && !written) console.log(report.yellow('Constants not written: fix the manifest first.'))
  }
  process.exit(result.status === 'ok' ? 0 : 1)
}

function printManifestResult(result, target) {
  console.log(report.bold('\nBoly achievement manifest check'))
  console.log(report.dim(`build: ${target}`))
  if (result.status === 'absent') {
    console.log(report.yellow('\nNo boly/achievements.json found (looked at the root and one folder down).'))
    return
  }
  if (result.manifestPath) console.log(report.dim(`file:  ${result.manifestPath}`))
  for (const issue of result.issues) {
    const mark = issue.level === 'error' ? report.red('  ERROR') : report.yellow('  WARN ')
    console.log(`${mark}  ${issue.code}${issue.path ? `  ${issue.path}` : ''}`)
    console.log(`         ${report.dim(issue.message)}`)
  }
  if (result.status === 'ok') {
    console.log('')
    for (const a of result.achievements) {
      const extra = [a.target > 1 ? `meta ${a.target}` : null, a.hidden ? 'oculto' : null, a.icon ? a.icon : 'sin ícono']
        .filter(Boolean)
        .join(' · ')
      console.log(`  ${a.api_name}  ${report.dim(`${a.name.es} — ${extra}`)}`)
    }
    console.log(report.green(report.bold(`\n✓ ${result.achievements.length} achievements ready for Boly.`)))
  } else {
    console.log(report.red(report.bold('\n✗ Boly will not apply these achievements until the errors are fixed.')))
  }
}

async function main() {
  if (process.argv[2] === 'manifest') return manifestCommand(process.argv.slice(3))
  const opts = parseArgs(process.argv.slice(2))

  if (opts.help) {
    printHelp()
    process.exit(0)
  }
  if (opts.invalid || !opts.game || opts.gameId == null || Number.isNaN(opts.gameId)) {
    if (!opts.json) printHelp()
    console.error('Error: --game and --game-id are required.')
    process.exit(2)
  }
  if (!fs.existsSync(opts.game)) {
    console.error(`Error: game executable not found: ${opts.game}`)
    process.exit(2)
  }

  const heartbeat = opts.realCadence ? null : opts.heartbeat
  const intervalSec = heartbeat == null ? 60 : heartbeat
  const ctx = {
    gamePath: opts.game,
    gameId: opts.gameId,
    port: opts.port,
    heartbeat,
    intervalSec,
    launcher: opts.launcher,
    // boly/achievements.json next to the executable, if the build has one
    manifest: await checkBuildAchievements(path.dirname(path.resolve(opts.game))),
  }

  const selected = opts.only
    ? SCENARIOS.filter((s) => opts.only.includes(s.id))
    : SCENARIOS

  if (selected.length === 0) {
    console.error('No scenarios selected.')
    process.exit(2)
  }

  if (!opts.json) {
    console.log(report.bold('\nBoly game integration verifier'))
    console.log(report.dim(`game:    ${opts.game}`))
    console.log(report.dim(`game-id: ${opts.gameId}`))
    console.log(
      report.dim(
        `cadence: ${opts.realCadence ? '60s (real)' : `${intervalSec}s (test)`} — this run takes ~${estimateSeconds(selected, intervalSec)}s`,
      ),
    )
  }

  const results = []
  for (let i = 0; i < selected.length; i++) {
    const s = selected[i]
    const res = await s.run(ctx)
    res.id = s.id
    results.push(res)
    if (!opts.json) {
      report.printScenarioHeader(i + 1, selected.length, res.title)
      report.printChecks(res.checks)
      if (res.sampleBeat) report.printSampleBeat(res.sampleBeat)
    }

    // If scenario 1 saw NO heartbeat at all, the game doesn't implement the
    // heartbeat — scenarios 2–5 only make sense once it does (otherwise the
    // game just exits on its own and produces misleading results). Skip them.
    if (res.id === 1 && res.noHeartbeat && i < selected.length - 1) {
      for (let j = i + 1; j < selected.length; j++) {
        results.push({ id: selected[j].id, title: selected[j].title, skipped: true, failed: false, checks: [] })
      }
      if (!opts.json) {
        console.log('')
        console.log(report.yellow('No heartbeat detected — this build does not implement the Boly heartbeat'))
        console.log(report.dim('(or the validator is not in the first scene). Skipping the remaining scenarios;'))
        console.log(report.dim('they only apply once the game heartbeats. Fix scenario 1 first, then re-run.'))
      }
      break
    }
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          game: opts.game,
          gameId: opts.gameId,
          scenarios: results.map((r) => ({
            id: r.id,
            title: r.title,
            failed: r.failed,
            skipped: !!r.skipped,
            checks: r.checks,
          })),
          passed: results.every((r) => !r.failed),
        },
        null,
        2,
      ),
    )
  } else {
    report.printSummary(results)
  }

  process.exit(results.every((r) => !r.failed) ? 0 : 1)
}

function estimateSeconds(selected, intervalSec) {
  // Rough upper bound: most scenarios wait ~3-4 intervals.
  return Math.round(selected.length * (intervalSec * 4 + 5))
}

main().catch((err) => {
  console.error('Verifier crashed:', err)
  process.exit(3)
})
