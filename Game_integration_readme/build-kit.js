#!/usr/bin/env node
'use strict'

// Assembles the developer kit that gets sent to game studios:
//
//   releases/boly-dev-kit-es/      guide, AI instructions, verifier and the Boly SDK
//   releases/boly-dev-kit-es.zip   the same folder, zipped
//
// The SDK is copied from a checkout of the boly-sdk repo (source of truth),
// never edited here. Usage:
//
//   node build-kit.js [--sdk <path to boly-sdk>]
//
// Needs verifier/dist/boly-verify-win.exe — build it first with
// `npx -y pkg@5.8.1 verify.js --targets node18-win-x64 --out-path dist`
// inside verifier/, then rename dist/verify.exe to boly-verify-win.exe.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ENGINES = ['unity', 'godot', 'unreal', 'gamemaker']
const KIT_NAME = 'boly-dev-kit-es'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}

const here = __dirname
const sdkRoot = path.resolve(arg('--sdk', path.join(here, '..', '..', 'boly-sdk')))
const verifierExe = path.join(here, 'verifier', 'dist', 'boly-verify-win.exe')
const releases = path.join(here, 'releases')
const out = path.join(releases, KIT_NAME)
const zip = path.join(releases, `${KIT_NAME}.zip`)

for (const engine of ENGINES) {
  if (!fs.existsSync(path.join(sdkRoot, engine))) {
    fail(`no ${engine}/ in ${sdkRoot} — pass --sdk <path to a boly-sdk checkout>`)
  }
}
if (!fs.existsSync(verifierExe)) {
  fail(`${verifierExe} not found — build the verifier binary first (see the top of this file)`)
}

// Ship only committed SDK code, and record which commit it was.
const git = (...args) => execFileSync('git', ['-C', sdkRoot, ...args], { encoding: 'utf8' }).trim()
if (git('status', '--porcelain')) {
  fail(`${sdkRoot} has uncommitted changes — commit them so the kit matches a known SDK version`)
}
const sdkCommit = git('rev-parse', '--short', 'HEAD')

// Retries: right after a build, antivirus scanners briefly lock the fresh .exe.
fs.rmSync(out, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
fs.rmSync(zip, { force: true })
fs.mkdirSync(out, { recursive: true })

for (const file of ['index.html', 'boly-logo.png', 'READ_ME_FIRST.txt', 'INSTRUCCIONES_IA.md', 'LOGROS.md', 'GUARDADO.md']) {
  fs.copyFileSync(path.join(here, file), path.join(out, file))
}
fs.copyFileSync(verifierExe, path.join(out, 'boly-verify-win.exe'))

for (const engine of ENGINES) {
  fs.cpSync(path.join(sdkRoot, engine), path.join(out, 'sdk', engine), { recursive: true })
}
fs.copyFileSync(path.join(sdkRoot, 'BOLY_SDK.md'), path.join(out, 'sdk', 'BOLY_SDK.md'))
// The engine READMEs link ../spec/ for the boly/achievements.json format
fs.mkdirSync(path.join(out, 'sdk', 'spec'), { recursive: true })
for (const file of ['ACHIEVEMENTS_MANIFEST.md', 'achievements-1.schema.json']) {
  fs.copyFileSync(path.join(sdkRoot, 'spec', file), path.join(out, 'sdk', 'spec', file))
}
fs.writeFileSync(path.join(out, 'sdk', 'VERSION.txt'), `boly-sdk ${sdkCommit}\r\n`)

// Windows' bundled tar (bsdtar) writes a proper zip (forward-slash paths,
// unlike Compress-Archive), with every entry under boly-dev-kit-es/. Call it
// by full path: from Git Bash, plain `tar` is GNU tar, which ignores the .zip
// suffix and writes a tar archive.
const tar = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe')
  : 'bsdtar'
execFileSync(tar, ['-a', '-c', '-f', `${KIT_NAME}.zip`, KIT_NAME], { cwd: releases, stdio: 'inherit' })

console.log(`Built ${path.relative(here, out)} and ${path.relative(here, zip)} (boly-sdk ${sdkCommit})`)
