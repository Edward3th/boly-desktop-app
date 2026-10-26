'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { SCENARIOS } = require('../scenarios')

const fakeGame = `
const fs = require('fs')
const path = require('path')
const http = require('http')
const args = process.argv.slice(2)
const arg = (name) => args[args.indexOf(name) + 1]
const url = new URL(arg('-api_base') + '/v1/validate/validate')
let running = false
function beat() {
  if (running) return
  running = true
  const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Boly-SDK': 'unity/0.4.0' } }, (res) => {
    let body = ''
    res.on('data', (s) => body += s)
    res.on('end', () => {
      running = false
      if (res.statusCode === 403) process.exit(0)
      if (res.statusCode !== 200) return
      const learner = JSON.parse(body).learner_id
      const root = process.env.BOLY_TEST_SAVE_ROOT
      const dir = process.env.BOLY_TEST_BAD_SAVE ? path.join(root, 'shared') : path.join(root, 'boly', 'saves', learner)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'partida.json'), learner)
    })
  })
  req.on('error', () => process.exit(1))
  req.end(JSON.stringify({ game_id: Number(arg('-game_id')), key: arg('-key') }))
}
beat()
setInterval(beat, 250)
`

async function run(bad) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boly-saves-test-'))
  const gamePath = path.join(root, 'fake-game.js')
  fs.writeFileSync(gamePath, fakeGame)
  process.env.BOLY_TEST_SAVE_ROOT = root
  if (bad) process.env.BOLY_TEST_BAD_SAVE = '1'
  else delete process.env.BOLY_TEST_BAD_SAVE
  try {
    return await SCENARIOS.find((s) => s.id === 8).run({
      gamePath, gameId: 0, launcher: process.execPath,
      port: 0, heartbeat: 0.25, intervalSec: 0.25, saveRoots: [root],
    })
  } finally {
    delete process.env.BOLY_TEST_SAVE_ROOT
    delete process.env.BOLY_TEST_BAD_SAVE
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test('scenario 8 accepts per-learner saves', async () => {
  const result = await run(false)
  assert.equal(result.failed, false)
  assert.equal(result.checks.find((c) => c.name === 'Files outside the Boly save area').status, 'pass')
})

test('scenario 8 warns about a shared save', async () => {
  const result = await run(true)
  assert.equal(result.failed, false)
  assert.equal(result.checks.find((c) => c.name === 'Files outside the Boly save area').status, 'warn')
})
