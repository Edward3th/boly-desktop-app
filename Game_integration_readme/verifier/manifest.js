'use strict'

// Checks a build's boly/achievements.json (+ icons) the way Boly does when the
// build is uploaded — same rules, same issue codes and messages as the API
// (ffstudios-shop-api src/services/achievementManifest.service.ts). Format:
// boly-sdk spec/ACHIEVEMENTS_MANIFEST.md.
//
// The build can be the folder next to the executable or the .zip to upload.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { fileReader, listEntries, readEntry, ZipEntryError } = require('./zip')

const MANIFEST_MAX_BYTES = 256 * 1024
const ICON_MAX_BYTES = 256 * 1024
const ICON_MIN_SIZE = 64
const ICON_MAX_SIZE = 512
const ICON_PATH_MAX_LENGTH = 255
const NAME_MAX_LENGTH = 80
const DESCRIPTION_MAX_LENGTH = 300
const MAX_TARGET = 1000000
const MAX_ACHIEVEMENTS = 200
const API_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/
const MANIFEST_PATH_RE = /^(?:[^/]+\/)?boly\/achievements\.json$/i
const ROOT_KEYS = new Set(['$schema', 'version', 'achievements'])
const ACHIEVEMENT_KEYS = new Set(['api_name', 'name', 'description', 'target', 'hidden', 'icon'])
const LOCALES = ['es', 'en']

const error = (code, p, message) => ({ level: 'error', code, path: p, message })
const warning = (code, p, message) => ({ level: 'warning', code, path: p, message })
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

// ── Build sources ───────────────────────────────────────────────────────────
// { manifests(): string[], find(name): { name, size } | { nearMiss } | null,
//   read(name, maxBytes): Buffer, close() } — names use "/" like zip entries.

async function zipSource(zipPath) {
  const file = fileReader(zipPath)
  const listing = await listEntries(file.read, file.size)
  if (!listing.ok) {
    file.close()
    return { failure: listing }
  }
  const entries = listing.entries.filter((e) => !e.name.startsWith('__MACOSX/'))
  const byName = new Map(entries.map((e) => [e.name, e]))
  return {
    manifests: () => entries.filter((e) => MANIFEST_PATH_RE.test(e.name)).map((e) => e.name),
    find: (name) => {
      const entry = byName.get(name)
      if (entry) return { name, size: entry.uncompressedSize }
      const lower = name.toLowerCase()
      const near = entries.find((e) => e.name.toLowerCase() === lower)
      return near ? { nearMiss: near.name } : null
    },
    read: (name, maxBytes) => readEntry(file.read, byName.get(name), maxBytes),
    close: file.close,
  }
}

function folderSource(root) {
  // Exact-case lookup: Windows would happily open "Icons/A.png" for
  // "icons/a.png", but the uploaded zip — and Boly — compare names exactly.
  const exact = (rel) => {
    let dir = root
    const found = []
    for (const segment of rel.split('/')) {
      let names
      try {
        names = fs.readdirSync(dir)
      } catch {
        return null
      }
      const hit = names.find((n) => n === segment) ?? names.find((n) => n.toLowerCase() === segment.toLowerCase())
      if (!hit) return null
      found.push(hit)
      dir = path.join(dir, hit)
    }
    return { actual: found.join('/'), full: dir }
  }
  return {
    manifests: () => {
      const candidates = ['boly/achievements.json']
      for (const d of fs.readdirSync(root, { withFileTypes: true })) {
        if (d.isDirectory() && d.name !== '__MACOSX') candidates.push(`${d.name}/boly/achievements.json`)
      }
      return candidates
        .map((c) => exact(c))
        .filter((hit) => hit && fs.statSync(hit.full).isFile())
        .map((hit) => hit.actual)
    },
    find: (name) => {
      const hit = exact(name)
      if (!hit || !fs.statSync(hit.full).isFile()) return null
      return hit.actual === name ? { name, size: fs.statSync(hit.full).size } : { nearMiss: hit.actual }
    },
    read: async (name, maxBytes) => {
      const full = path.join(root, ...name.split('/'))
      const size = fs.statSync(full).size
      if (size > maxBytes) throw new ZipEntryError('too_large', `${name} is ${size} bytes (max ${maxBytes})`)
      return fs.readFileSync(full)
    },
    close: () => {},
  }
}

// ── Check ───────────────────────────────────────────────────────────────────

async function checkBuildAchievements(buildPath) {
  const isZip = fs.statSync(buildPath).isFile()
  const source = isZip ? await zipSource(buildPath) : folderSource(buildPath)
  if (source.failure) {
    const issue =
      source.failure.reason === 'index_too_large'
        ? error('zip_index_too_large', '', `The zip index is ${source.failure.centralDirectorySize} bytes, too large to look for boly/achievements.json`)
        : error('manifest_unreadable', '', 'The file is not a valid zip archive')
    return { status: 'invalid', manifestPath: null, issues: [issue] }
  }

  try {
    const manifests = source.manifests()
    if (manifests.length === 0) return { status: 'absent', manifestPath: null, issues: [] }
    if (manifests.length > 1) {
      return {
        status: 'invalid',
        manifestPath: null,
        issues: [error('manifest_multiple', '', `The build has ${manifests.length} manifests (${manifests.join(', ')}); keep only one`)],
      }
    }

    const manifestPath = manifests[0]
    let raw
    try {
      raw = await source.read(manifestPath, MANIFEST_MAX_BYTES)
    } catch (e) {
      return { status: 'invalid', manifestPath, issues: [error('manifest_unreadable', manifestPath, entryErrorMessage(e, MANIFEST_MAX_BYTES))] }
    }

    const parsed = parseAchievementManifest(raw)
    if (parsed.issues.some((i) => i.level === 'error')) return { status: 'invalid', manifestPath, issues: parsed.issues }

    const issues = [...parsed.issues]
    const base = manifestPath.slice(0, manifestPath.length - 'achievements.json'.length)
    const icons = {}
    const users = new Map()
    parsed.achievements.forEach((a, i) => a.icon && users.set(a.icon, [...(users.get(a.icon) || []), i]))
    const warn = (iconPath, code, message) => {
      for (const i of users.get(iconPath) || []) issues.push(warning(code, `achievements[${i}].icon`, message))
    }
    for (const iconPath of users.keys()) {
      const zipPath = base + iconPath
      const hit = source.find(zipPath)
      if (!hit || hit.nearMiss) {
        warn(
          iconPath,
          'icon_missing',
          hit ? `${zipPath} is not in the zip; did you mean ${hit.nearMiss}? (paths are case-sensitive)` : `${zipPath} is not in the zip`,
        )
        continue
      }
      let data
      try {
        data = await source.read(zipPath, ICON_MAX_BYTES)
      } catch (e) {
        if (e instanceof ZipEntryError && e.code === 'too_large') {
          warn(iconPath, 'icon_too_large', `${hit.size} bytes; icons can be at most ${ICON_MAX_BYTES}`)
        } else {
          warn(iconPath, 'icon_unreadable', entryErrorMessage(e, ICON_MAX_BYTES))
        }
        continue
      }
      const inspection = inspectIcon(data)
      if (!inspection.ok) {
        warn(iconPath, inspection.code, inspection.message)
        continue
      }
      icons[iconPath] = { ...inspection, sha256: crypto.createHash('sha256').update(data).digest('hex') }
    }
    const order = (issue) => {
      const m = /^achievements\[(\d+)\]/.exec(issue.path)
      return m ? Number(m[1]) : -1
    }
    issues.sort((a, b) => order(a) - order(b))
    const achievements = parsed.achievements.map((a) => ({ ...a, icon: a.icon && icons[a.icon] ? a.icon : null }))
    return { status: 'ok', manifestPath, achievements, icons, issues }
  } finally {
    source.close()
  }
}

function parseAchievementManifest(raw) {
  const issues = []
  const achievements = []
  let text
  try {
    text = typeof raw === 'string' ? raw : new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch {
    issues.push(error('manifest_json', '', 'The file is not valid UTF-8 text'))
    return { achievements, issues }
  }
  let root
  try {
    root = JSON.parse(text.replace(/^﻿/, ''))
  } catch (e) {
    issues.push(error('manifest_json', '', `Invalid JSON: ${e.message}`))
    return { achievements, issues }
  }
  if (!isPlainObject(root)) {
    issues.push(error('manifest_shape', '', 'The manifest must be a JSON object'))
    return { achievements, issues }
  }
  for (const key of Object.keys(root)) if (!ROOT_KEYS.has(key)) issues.push(error('manifest_shape', key, `Unknown field "${key}"`))
  if (root.version !== 1) issues.push(error('manifest_version', 'version', '"version" must be 1'))
  if (!Array.isArray(root.achievements)) {
    issues.push(error('manifest_shape', 'achievements', '"achievements" must be an array'))
    return { achievements, issues }
  }
  if (root.achievements.length > MAX_ACHIEVEMENTS) {
    issues.push(error('too_many_achievements', 'achievements', `${root.achievements.length} achievements; a game can have at most ${MAX_ACHIEVEMENTS}`))
    return { achievements, issues }
  }

  const seen = new Map()
  root.achievements.forEach((item, index) => {
    const at = `achievements[${index}]`
    if (!isPlainObject(item)) {
      issues.push(error('achievement_shape', at, 'Each achievement must be a JSON object'))
      return
    }
    const before = issues.length
    for (const key of Object.keys(item)) if (!ACHIEVEMENT_KEYS.has(key)) issues.push(error('achievement_shape', `${at}.${key}`, `Unknown field "${key}"`))

    const apiName = item.api_name
    if (typeof apiName !== 'string' || !API_NAME_RE.test(apiName)) {
      issues.push(error('api_name_invalid', `${at}.api_name`, '"api_name" must look like NIVEL_5_COMPLETO (A-Z, 0-9 and _, up to 64)'))
    } else if (seen.has(apiName)) {
      issues.push(error('api_name_duplicate', `${at}.api_name`, `"${apiName}" is also used by achievements[${seen.get(apiName)}]`))
    } else {
      seen.set(apiName, index)
    }

    const name = localized(item.name, `${at}.name`, NAME_MAX_LENGTH, 'name_invalid', issues)
    if (item.name === undefined || name === null) issues.push(error('name_invalid', `${at}.name`, '"name" is required'))
    const description = localized(item.description, `${at}.description`, DESCRIPTION_MAX_LENGTH, 'description_invalid', issues)

    let target = 1
    if (item.target !== undefined) {
      if (!Number.isInteger(item.target) || item.target < 1 || item.target > MAX_TARGET) {
        issues.push(error('target_invalid', `${at}.target`, `"target" must be an integer from 1 to ${MAX_TARGET} (1 = unlocked in one go)`))
      } else target = item.target
    }
    let hidden = false
    if (item.hidden !== undefined) {
      if (typeof item.hidden !== 'boolean') issues.push(error('hidden_invalid', `${at}.hidden`, '"hidden" must be true or false'))
      else hidden = item.hidden
    }
    let icon = null
    if (item.icon !== undefined && item.icon !== null) {
      if (!isSafeIconPath(item.icon)) {
        issues.push(error('icon_path_invalid', `${at}.icon`, '"icon" must be a path inside boly/ such as "icons/level_5.png" (no "..", no "\\", no leading "/")'))
      } else icon = item.icon
    }

    if (issues.length === before && name) {
      achievements.push({ api_name: apiName, name, description: description ?? null, target, hidden, icon, sort_order: index })
    }
  })
  return { achievements, issues }
}

// Same trimming and fill-in of a missing language as the boly.cl editor.
function localized(value, p, maxLength, code, issues) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (!isPlainObject(value)) {
    issues.push(error(code, p, `"${p}" must be an object like {"es": "...", "en": "..."} or null`))
    return undefined
  }
  const unknown = Object.keys(value).filter((k) => !LOCALES.includes(k))
  if (unknown.length) {
    issues.push(error(code, p, `Unknown language ${unknown.map((k) => `"${k}"`).join(', ')}; use "es" and/or "en"`))
    return undefined
  }
  const texts = {}
  for (const locale of LOCALES) {
    const text = value[locale]
    if (text === undefined || text === null) continue
    if (typeof text !== 'string') {
      issues.push(error(code, p, `"${p}.${locale}" must be a string`))
      return undefined
    }
    const trimmed = text.trim()
    if (trimmed.length > maxLength) {
      issues.push(error(code, p, `"${p}.${locale}" must be at most ${maxLength} characters`))
      return undefined
    }
    if (trimmed) texts[locale] = trimmed
  }
  if (!texts.es && !texts.en) return null
  return { es: texts.es ?? texts.en, en: texts.en ?? texts.es }
}

function isSafeIconPath(v) {
  if (typeof v !== 'string' || v.length === 0 || v.length > ICON_PATH_MAX_LENGTH) return false
  if (v.includes('\\') || v.startsWith('/')) return false
  return v.split('/').every((s) => s !== '' && s !== '.' && s !== '..')
}

function inspectIcon(data) {
  if (data.length > ICON_MAX_BYTES) return { ok: false, code: 'icon_too_large', message: `${data.length} bytes; icons can be at most ${ICON_MAX_BYTES}` }
  const image = pngSize(data) ? { ext: 'png', ...pngSize(data) } : jpegSize(data) ? { ext: 'jpg', ...jpegSize(data) } : null
  if (!image) return { ok: false, code: 'icon_format', message: 'Icons must be PNG or JPEG images' }
  const { width, height } = image
  if (width !== height || width < ICON_MIN_SIZE || width > ICON_MAX_SIZE) {
    return { ok: false, code: 'icon_dimensions', message: `${width}×${height} px; icons must be square, from ${ICON_MIN_SIZE} to ${ICON_MAX_SIZE} px` }
  }
  return { ok: true, ext: image.ext, width, height }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function pngSize(data) {
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (data.toString('latin1', 12, 16) !== 'IHDR') return null
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

function jpegSize(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null
  let pos = 2
  while (pos + 4 <= data.length) {
    if (data[pos] !== 0xff) return null
    const marker = data[pos + 1]
    if (marker === 0xff) {
      pos += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      pos += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    const length = data.readUInt16BE(pos + 2)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (pos + 9 > data.length) return null
      return { height: data.readUInt16BE(pos + 5), width: data.readUInt16BE(pos + 7) }
    }
    pos += 2 + length
  }
  return null
}

function entryErrorMessage(e, maxBytes) {
  if (e instanceof ZipEntryError) {
    switch (e.code) {
      case 'encrypted':
        return 'The file is password-protected inside the zip'
      case 'unsupported_method':
        return 'The file uses a compression method other than Deflate or Store; repackage the zip'
      case 'too_large':
        return `The file is larger than ${maxBytes} bytes`
      case 'corrupt':
        return 'The file is damaged inside the zip'
    }
  }
  return 'The file could not be read from the zip'
}

module.exports = { checkBuildAchievements, parseAchievementManifest, inspectIcon }
