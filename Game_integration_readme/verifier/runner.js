'use strict'

// Launches the game executable the same way the Boly desktop launcher does
// (-game_id <id> -key <hex>), plus the test-only overrides (-api_base pointing
// at our mock, and -heartbeat_seconds to keep runs fast). Tracks whether/when
// the process exits so scenarios can assert quit behavior.

const { spawn } = require('child_process')
const crypto = require('crypto')

// 256-bit hex, same shape as the real tempKey issued by /v1/validate.
function makeKey() {
  return crypto.randomBytes(32).toString('hex')
}

// Spawns the game and returns a handle. `state` is mutated as the process runs.
// `launcher` is an optional prefix command (e.g. "wine") used to run a Windows
// .exe on Linux/macOS — when set, we spawn `launcher gamePath ...args`.
// `extraArgs` carries test-only flags such as -boly_test_achievement.
function launchGame({ gamePath, gameId, key, port, heartbeat, includeKey = true, launcher = null, extraArgs = [] }) {
  const args = ['-game_id', String(gameId)]
  if (includeKey) args.push('-key', key)
  args.push('-api_base', `http://127.0.0.1:${port}`)
  if (heartbeat != null) args.push('-heartbeat_seconds', String(heartbeat))
  args.push(...extraArgs)

  // No shell: spawn handles a gamePath with spaces correctly on its own.
  const cmd = launcher || gamePath
  const cmdArgs = launcher ? [gamePath, ...args] : args
  const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: false })

  const state = {
    exited: false,
    exitCode: null,
    exitTime: null,
    spawnError: null,
    startTime: Date.now(),
  }
  child.on('exit', (code) => {
    state.exited = true
    state.exitCode = code
    state.exitTime = Date.now()
  })
  child.on('error', (err) => {
    state.spawnError = err
  })

  return { child, state, args }
}

// Resolves true if the process exits within `timeoutMs`, else false.
function waitForExit(state, timeoutMs) {
  return new Promise((resolve) => {
    if (state.exited) return resolve(true)
    const start = Date.now()
    const iv = setInterval(() => {
      if (state.exited) {
        clearInterval(iv)
        resolve(true)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(iv)
        resolve(false)
      }
    }, 100)
  })
}

function killGame(child) {
  try {
    if (child && !child.killed) child.kill()
  } catch {
    // already gone
  }
}

module.exports = { makeKey, launchGame, waitForExit, killGame }
