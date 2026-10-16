'use strict'

// Local stand-in for the real Boly validate endpoint
// (POST /v1/validate/validate). It records every heartbeat a launched game
// sends and lets each scenario drive the response (200 / 403 / 500 / dropped
// connection). Zero dependencies — Node's built-in http only.
//
// Like the real API, every 200 state:true reply also carries the session
// fields the Boly SDK reads (session_id, learner_id, server_time); legacy
// ParamsCatcher scripts ignore them.
//
// Requests under /v1/lumen/ (the SDK's achievements) are kept apart from the
// heartbeats in `lumen` and answered like the real API: GET lists the
// achievements reported so far, POST applies { updates: [...] } — any
// api_name exists, the target is 1, and a repeated client_event_id comes back
// as "duplicate".

const http = require('http')
const crypto = require('crypto')

const VALIDATE_PATH = '/v1/validate/validate'

class MockServer {
  constructor() {
    // Every request the game makes, in order. Each entry:
    // { index, time, method, path, contentType, hasAuth, sdk, rawBody, parsed, parseError }
    this.beats = []
    // Every /v1/lumen/ request, in order:
    // { index, time, method, path, gameId, key, sdk, hasAuth, rawBody, parsed, parseError }
    this.lumen = []
    // Lets a scenario override a LumenAI reply: return { status, body } or null
    // for the default behavior.
    this.lumenResponder = () => null
    this.achievements = new Map() // api_name -> { current, target, unlocked }
    this.appliedEventIds = new Set()
    // One fake session per launch, as the real API issues per -key.
    this.sessionId = crypto.randomUUID()
    this.learnerId = crypto.randomUUID()
    // Decides the response for a given beat. Return one of:
    //   { status, body }        -> normal HTTP reply
    //   { action: 'drop' }      -> destroy the socket (simulate a network error)
    //   { action: 'timeout' }   -> never reply (simulate a hung request)
    this.responder = () => ({ status: 200, body: { state: true, subscriptionAccess: false } })
    this.server = null
    this._waiters = []
  }

  setResponder(fn) {
    this.responder = fn
  }

  setLumenResponder(fn) {
    this.lumenResponder = fn
  }

  // Resolves with the actual port (pass 0 to auto-pick a free one).
  start(port = 0) {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handle(req, res))
      this.server.once('error', reject)
      this.server.listen(port, '127.0.0.1', () => {
        resolve(this.server.address().port)
      })
    })
  }

  _handle(req, res) {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let parsed = null
      let parseError = null
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        parseError = e.message
      }

      if (req.url.startsWith('/v1/lumen/')) {
        this._handleLumen(req, res, raw, parsed, parseError)
        return
      }

      const beat = {
        index: this.beats.length,
        time: Date.now(),
        method: req.method,
        path: req.url,
        contentType: req.headers['content-type'] || '',
        hasAuth: req.headers['authorization'] != null,
        // X-Boly-SDK, e.g. "unity/0.1.0". Absent from legacy ParamsCatcher scripts.
        sdk: req.headers['x-boly-sdk'] || null,
        rawBody: raw,
        parsed,
        parseError,
      }
      this.beats.push(beat)
      this._notify()

      let decision
      try {
        decision = this.responder(beat.index, beat)
      } catch (e) {
        decision = { status: 500, body: { state: false, message: 'responder error' } }
      }
      decision = decision || { status: 200, body: { state: true, subscriptionAccess: false } }

      if (decision.action === 'drop') {
        // Simulate a network error: kill the connection without a response.
        req.socket.destroy()
        return
      }
      if (decision.action === 'timeout') {
        // Simulate a hung request: never reply, leave the socket open.
        return
      }

      const status = decision.status || 200
      let body =
        decision.body != null
          ? decision.body
          : status === 200
            ? { state: true, subscriptionAccess: false }
            : { state: false }
      if (status === 200 && body.state === true) {
        body = {
          session_id: this.sessionId,
          learner_id: this.learnerId,
          server_time: new Date().toISOString(),
          ...body,
        }
      }
      try {
        if (!res.writableEnded) {
          res.writeHead(status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(body))
        }
      } catch {
        // Game may have already quit and torn down the socket — ignore.
      }
    })
  }

  _handleLumen(req, res, raw, parsed, parseError) {
    const call = {
      index: this.lumen.length,
      time: Date.now(),
      method: req.method,
      path: req.url,
      gameId: req.headers['x-boly-game-id'] ?? null,
      key: req.headers['x-boly-key'] ?? null,
      sdk: req.headers['x-boly-sdk'] || null,
      hasAuth: req.headers['authorization'] != null,
      rawBody: raw,
      parsed,
      parseError,
    }
    this.lumen.push(call)
    this._notify()

    let decision = null
    try {
      decision = this.lumenResponder(call.index, call)
    } catch {
      decision = { status: 500, body: { message: 'responder error' } }
    }
    if (!decision) decision = this._defaultLumen(call)

    try {
      if (!res.writableEnded) {
        res.writeHead(decision.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(decision.body))
      }
    } catch {
      // Game may have already quit — ignore.
    }
  }

  _defaultLumen(call) {
    if (call.path !== '/v1/lumen/achievements') return { status: 404, body: { error: 'Not Found' } }
    if (call.method === 'GET') {
      const achievements = [...this.achievements].map(([api_name, a]) => ({ api_name, ...a, unlocked_at: null }))
      return { status: 200, body: { achievements } }
    }
    const updates = call.parsed?.updates
    if (!Array.isArray(updates) || updates.length === 0 || updates.length > 50) {
      return { status: 400, body: { message: '"updates" must be an array of 1 to 50 updates' } }
    }
    const results = updates.map((u) => {
      const apiName = String(u?.api_name ?? '')
      const prev = this.achievements.get(apiName) ?? { current: 0, target: 1, unlocked: false }
      if (u?.client_event_id && this.appliedEventIds.has(u.client_event_id)) {
        return { api_name: apiName, status: 'duplicate', ...prev, newly_unlocked: false }
      }
      if (u?.client_event_id) this.appliedEventIds.add(u.client_event_id)
      const current = u?.op === 'unlock' ? prev.target : Math.min(prev.target, u?.op === 'set' ? Math.max(prev.current, Number(u.value) || 0) : prev.current + (Number(u?.value) || 1))
      const next = { current, target: prev.target, unlocked: prev.unlocked || current >= prev.target }
      this.achievements.set(apiName, next)
      return { api_name: apiName, status: 'ok', ...next, newly_unlocked: next.unlocked && !prev.unlocked }
    })
    return { status: 200, body: { results } }
  }

  // Resolves true once `predicate(lumenCalls)` holds, or false on timeout.
  waitForLumen(predicate, timeoutMs) {
    return new Promise((resolve) => {
      if (predicate(this.lumen)) return resolve(true)
      const cleanup = () => {
        clearTimeout(timer)
        this._waiters = this._waiters.filter((w) => w !== check)
      }
      const check = () => {
        if (predicate(this.lumen)) {
          cleanup()
          resolve(true)
        }
      }
      const timer = setTimeout(() => {
        cleanup()
        resolve(predicate(this.lumen))
      }, timeoutMs)
      this._waiters.push(check)
    })
  }

  // Resolves true once at least `n` beats have arrived, or false on timeout.
  waitForBeats(n, timeoutMs) {
    return new Promise((resolve) => {
      if (this.beats.length >= n) return resolve(true)
      const cleanup = () => {
        clearTimeout(timer)
        this._waiters = this._waiters.filter((w) => w !== check)
      }
      const check = () => {
        if (this.beats.length >= n) {
          cleanup()
          resolve(true)
        }
      }
      const timer = setTimeout(() => {
        cleanup()
        resolve(this.beats.length >= n)
      }, timeoutMs)
      this._waiters.push(check)
    })
  }

  _notify() {
    for (const w of [...this._waiters]) w()
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      // Force-close any lingering keep-alive/hung sockets.
      this.server.closeAllConnections?.()
    })
  }
}

module.exports = { MockServer, VALIDATE_PATH }
