'use strict'

// Local stand-in for the real Boly validate endpoint
// (POST /v1/validate/validate). It records every heartbeat a launched game
// sends and lets each scenario drive the response (200 / 403 / 500 / dropped
// connection). Zero dependencies — Node's built-in http only.
//
// Like the real API, every 200 state:true reply also carries the session
// fields the Boly SDK reads (session_id, learner_id, server_time); legacy
// ParamsCatcher scripts ignore them.

const http = require('http')
const crypto = require('crypto')

const VALIDATE_PATH = '/v1/validate/validate'

class MockServer {
  constructor() {
    // Every request the game makes, in order. Each entry:
    // { index, time, method, path, contentType, hasAuth, sdk, rawBody, parsed, parseError }
    this.beats = []
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
