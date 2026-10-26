'use strict'

// Snapshots for scenario 8. Do not follow symlinks/junctions: a game can
// point outside its own tree, and the verifier must not walk the whole drive.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

function rootsFor(gamePath) {
  const home = os.homedir()
  const candidates = [
    process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
    process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
    path.join(home, 'AppData', 'LocalLow'),
    path.dirname(path.resolve(gamePath)),
  ]
  return [...new Set(candidates.map((p) => path.resolve(p)))].filter((p) => fs.existsSync(p))
}

function snapshot(roots) {
  const files = new Map()
  const errors = []
  for (const root of roots) {
    const stack = [root]
    while (stack.length) {
      const dir = stack.pop()
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
      catch (e) { errors.push(`${dir}: ${e.code || e.message}`); continue }
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        // Avoid junctions, reparse points and symbolic links.
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) { stack.push(full); continue }
        if (!entry.isFile()) continue
        try {
          const s = fs.statSync(full)
          files.set(full.toLowerCase(), { path: full, size: s.size, mtime: s.mtimeMs })
        } catch (e) { errors.push(`${full}: ${e.code || e.message}`) }
      }
    }
  }
  return { files, errors }
}

function changed(before, after) {
  const out = []
  for (const [key, value] of after.files) {
    const prev = before.files.get(key)
    if (!prev || prev.size !== value.size || prev.mtime !== value.mtime) out.push(value.path)
  }
  return out
}

// On Windows recursive fs.watch covers the same roots while each learner is
// playing. It is much cheaper than stat-ing every file in a large AppData tree
// three times; the final existence check discards temporary rename events.
function watchChanges(roots) {
  const seen = new Set()
  const errors = []
  const watchers = []
  for (const root of roots) {
    try {
      const watcher = fs.watch(root, { recursive: true }, (_event, name) => {
        if (!name) return
        const full = path.resolve(root, String(name))
        if (full.toLowerCase().startsWith(root.toLowerCase() + path.sep)) seen.add(full)
      })
      watcher.on('error', (e) => errors.push(`${root}: ${e.code || e.message}`))
      watchers.push(watcher)
    } catch (e) { errors.push(`${root}: ${e.code || e.message}`) }
  }
  return {
    close() {
      for (const watcher of watchers) watcher.close()
      const files = []
      for (const file of seen) {
        try { if (fs.statSync(file).isFile()) files.push(file) }
        catch { /* rename or delete */ }
      }
      return { files, errors }
    },
  }
}

function isSdkStorage(file) {
  const p = file.replaceAll('\\', '/').toLowerCase()
  return /\/boly\//.test(p) || /\/boly_saves\//.test(p) || /\/boly_achievements_[^/]+\.json$/.test(p)
}

function isLearnerSave(file, learnerId) {
  const p = file.replaceAll('\\', '/').toLowerCase()
  const id = learnerId.toLowerCase()
  return p.includes(`/boly/saves/${id}/`) || p.includes(`/boly_saves/${id}/`)
}

function unityRegistryKey(gamePath) {
  if (process.platform !== 'win32') return null
  const base = path.basename(gamePath, path.extname(gamePath))
  const info = path.join(path.dirname(gamePath), `${base}_Data`, 'app.info')
  try {
    const lines = fs.readFileSync(info, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map((s) => s.trim())
    if (lines.length < 2 || !lines[0] || !lines[1]) return null
    if (lines[0].includes('\\') || lines[1].includes('\\')) return null
    return `HKCU\\Software\\${lines[0]}\\${lines[1]}`
  } catch { return null }
}

function registrySnapshot(key) {
  if (!key) return []
  try {
    const query = spawnSync('reg.exe', ['query', key, '/s'], {
      encoding: 'utf8', windowsHide: true, timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (query.status !== 0) return []
    const raw = query.stdout
    return raw.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('HKEY_'))
  } catch { return [] }
}

function registryChanged(before, after) {
  const prior = new Set(before)
  return after.filter((s) => !prior.has(s))
}

module.exports = { rootsFor, snapshot, changed, watchChanges, isSdkStorage, isLearnerSave, unityRegistryKey, registrySnapshot, registryChanged }
