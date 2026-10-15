'use strict'

// Pretty PASS/FAIL reporting for the verifier. A "check" is:
//   { name, status: 'pass' | 'fail' | 'warn', detail }

const useColor = process.stdout.isTTY && !process.env.NO_COLOR

const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
const green = (s) => c('32', s)
const red = (s) => c('31', s)
const yellow = (s) => c('33', s)
const dim = (s) => c('2', s)
const bold = (s) => c('1', s)

const MARK = {
  pass: () => green('  PASS'),
  fail: () => red('  FAIL'),
  warn: () => yellow('  WARN'),
}

function printScenarioHeader(num, total, title) {
  console.log('')
  console.log(bold(`[${num}/${total}] ${title}`))
}

function printChecks(checks) {
  for (const ch of checks) {
    const mark = (MARK[ch.status] || MARK.warn)()
    console.log(`${mark}  ${ch.name}`)
    if (ch.detail) console.log(`        ${dim(ch.detail)}`)
  }
}

function printSampleBeat(beat) {
  if (!beat) return
  console.log(dim('        sample heartbeat:'))
  console.log(dim(`          POST ${beat.path}`))
  console.log(dim(`          Content-Type: ${beat.contentType || '(none)'}`))
  console.log(dim(`          Authorization: ${beat.hasAuth ? 'PRESENT' : '(none)'}`))
  console.log(dim(`          X-Boly-SDK: ${beat.sdk || '(none)'}`))
  console.log(dim(`          body: ${beat.rawBody}`))
}

function printSummary(scenarios) {
  const failed = scenarios.filter((s) => s.failed)
  console.log('')
  console.log(bold('────────────────────────────────────────'))
  for (const s of scenarios) {
    const tag = s.skipped ? yellow('SKIP') : s.failed ? red('FAIL') : green('PASS')
    console.log(`  ${tag}  ${s.title}`)
  }
  console.log(bold('────────────────────────────────────────'))
  if (failed.length === 0) {
    console.log(green(bold('✓ All checks passed — integration looks correct.')))
  } else {
    console.log(
      red(bold(`✗ ${failed.length} scenario(s) failed — see details above.`)),
    )
  }
  console.log('')
}

module.exports = {
  printScenarioHeader,
  printChecks,
  printSampleBeat,
  printSummary,
  green,
  red,
  yellow,
  dim,
  bold,
}
