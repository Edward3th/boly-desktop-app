'use strict'

// Random-access zip reading over byte ranges — the same reader the Boly API
// uses on uploaded builds (ffstudios-shop-api src/services/zipReader.service.ts),
// here over a local file. Lists the archive from its index and extracts single
// entries without unpacking the rest.

const fs = require('fs')
const zlib = require('zlib')

const EOCD_SIG = 0x06054b50
const EOCD64_SIG = 0x06064b50
const EOCD64_LOCATOR_SIG = 0x07064b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50
const U32_MAX = 0xffffffff
const EOCD_SEARCH_SPAN = 22 + 65535
const CENTRAL_DIRECTORY_READ_CAP = 8 * 1024 * 1024
const LOCAL_HEADER_SLACK = 1024

class ZipEntryError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// read(start, end) -> Buffer of bytes [start, end] inclusive
function fileReader(path) {
  const fd = fs.openSync(path, 'r')
  const size = fs.fstatSync(fd).size
  const read = async (start, end) => {
    const last = Math.min(end, size - 1)
    const length = Math.max(0, last - start + 1)
    const buf = Buffer.alloc(length)
    if (length > 0) fs.readSync(fd, buf, 0, length, start)
    return buf
  }
  return { read, size, close: () => fs.closeSync(fd) }
}

async function listEntries(read, objectSize) {
  if (objectSize < 22) return { ok: false, reason: 'invalid' }
  const tail = await read(Math.max(0, objectSize - EOCD_SEARCH_SPAN), objectSize - 1)
  let eocdPos = -1
  for (let pos = tail.length - 22; pos >= 0; pos--) {
    if (tail.readUInt32LE(pos) === EOCD_SIG) {
      eocdPos = pos
      break
    }
  }
  if (eocdPos < 0) return { ok: false, reason: 'invalid' }

  let cdSize = tail.readUInt32LE(eocdPos + 12)
  let cdOffset = tail.readUInt32LE(eocdPos + 16)
  if (cdSize === U32_MAX || cdOffset === U32_MAX) {
    const locatorPos = eocdPos - 20
    if (locatorPos < 0 || tail.readUInt32LE(locatorPos) !== EOCD64_LOCATOR_SIG) return { ok: false, reason: 'invalid' }
    const eocd64Offset = Number(tail.readBigUInt64LE(locatorPos + 8))
    if (eocd64Offset + 56 > objectSize) return { ok: false, reason: 'invalid' }
    const eocd64 = await read(eocd64Offset, eocd64Offset + 55)
    if (eocd64.length < 56 || eocd64.readUInt32LE(0) !== EOCD64_SIG) return { ok: false, reason: 'invalid' }
    cdSize = Number(eocd64.readBigUInt64LE(40))
    cdOffset = Number(eocd64.readBigUInt64LE(48))
  }
  if (cdSize <= 0 || cdOffset + cdSize > objectSize) return { ok: false, reason: 'invalid' }
  if (cdSize > CENTRAL_DIRECTORY_READ_CAP) return { ok: false, reason: 'index_too_large', centralDirectorySize: cdSize }

  const cd = await read(cdOffset, cdOffset + cdSize - 1)
  const entries = []
  let pos = 0
  while (pos + 46 <= cd.length) {
    if (cd.readUInt32LE(pos) !== CEN_SIG) return { ok: false, reason: 'invalid' }
    const nameLength = cd.readUInt16LE(pos + 28)
    const extraLength = cd.readUInt16LE(pos + 30)
    const commentLength = cd.readUInt16LE(pos + 32)
    const nameEnd = pos + 46 + nameLength
    if (nameEnd + extraLength > cd.length) return { ok: false, reason: 'invalid' }
    const entry = {
      name: cd.toString('utf8', pos + 46, nameEnd),
      flags: cd.readUInt16LE(pos + 8),
      method: cd.readUInt16LE(pos + 10),
      crc32: cd.readUInt32LE(pos + 16),
      compressedSize: cd.readUInt32LE(pos + 20),
      uncompressedSize: cd.readUInt32LE(pos + 24),
      localHeaderOffset: cd.readUInt32LE(pos + 42),
    }
    if (!applyZip64Extra(entry, cd.subarray(nameEnd, nameEnd + extraLength))) return { ok: false, reason: 'invalid' }
    entries.push(entry)
    pos = nameEnd + extraLength + commentLength
  }
  return { ok: true, entries }
}

function applyZip64Extra(entry, extra) {
  const needs = [entry.uncompressedSize === U32_MAX, entry.compressedSize === U32_MAX, entry.localHeaderOffset === U32_MAX]
  if (!needs.some(Boolean)) return true
  let pos = 0
  while (pos + 4 <= extra.length) {
    const id = extra.readUInt16LE(pos)
    const size = extra.readUInt16LE(pos + 2)
    if (id === 0x0001) {
      let field = pos + 4
      const end = field + size
      const next = () => {
        if (field + 8 > end || field + 8 > extra.length) return null
        const value = Number(extra.readBigUInt64LE(field))
        field += 8
        return value
      }
      const keys = ['uncompressedSize', 'compressedSize', 'localHeaderOffset']
      for (let i = 0; i < 3; i++) {
        if (!needs[i]) continue
        const value = next()
        if (value === null) return false
        entry[keys[i]] = value
      }
      return true
    }
    pos += 4 + size
  }
  return false
}

async function readEntry(read, entry, maxBytes) {
  if (entry.flags & 0x0001) throw new ZipEntryError('encrypted', `${entry.name} is encrypted`)
  if (entry.method !== 0 && entry.method !== 8) {
    throw new ZipEntryError('unsupported_method', `${entry.name} uses compression method ${entry.method}`)
  }
  if (entry.uncompressedSize > maxBytes || entry.compressedSize > maxBytes) {
    throw new ZipEntryError('too_large', `${entry.name} is ${entry.uncompressedSize} bytes (max ${maxBytes})`)
  }
  const start = entry.localHeaderOffset
  let chunk = await read(start, start + 30 + Buffer.byteLength(entry.name) + LOCAL_HEADER_SLACK + entry.compressedSize - 1)
  if (chunk.length < 30 || chunk.readUInt32LE(0) !== LOC_SIG) throw new ZipEntryError('corrupt', `${entry.name}: local header not found`)
  const dataStart = 30 + chunk.readUInt16LE(26) + chunk.readUInt16LE(28)
  if (chunk.length < dataStart + entry.compressedSize) {
    chunk = await read(start, start + dataStart + entry.compressedSize - 1)
    if (chunk.length < dataStart + entry.compressedSize) throw new ZipEntryError('corrupt', `${entry.name}: data is truncated`)
  }
  const compressed = chunk.subarray(dataStart, dataStart + entry.compressedSize)
  let data
  if (entry.method === 0) {
    data = Buffer.from(compressed)
  } else {
    try {
      data = zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.uncompressedSize) })
    } catch {
      throw new ZipEntryError('corrupt', `${entry.name}: data does not inflate`)
    }
  }
  if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc32) {
    throw new ZipEntryError('corrupt', `${entry.name}: size or checksum does not match the zip index`)
  }
  return data
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data) {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

module.exports = { fileReader, listEntries, readEntry, ZipEntryError }
