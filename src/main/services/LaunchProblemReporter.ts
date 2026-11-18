import os from 'os'
import axios from 'axios'
import { app } from 'electron'
import { WindowManager } from './WindowManager'

// Why a game didn't open. Each problem is shown to the player (the
// 'game-launch-problem' event, see LaunchProblemModal.vue) and sent to the API
// (POST /v1/validate/report), where admins read it per account to diagnose a
// player remotely. Reporting never throws: it must not add a second failure.

export type LaunchProblemStage =
  | 'validate'
  | 'no_key'
  | 'spawn'
  | 'process_error'
  | 'early_exit'
  | 'local_register'
  | 'local_load'
  | 'game_missing'
  | 'unexpected'

// What the player is told; the renderer turns it into a translated message.
export type LaunchProblemCode =
  | 'no_access'
  | 'session_expired'
  | 'offline'
  | 'server'
  | 'game_missing'
  | 'blocked'
  | 'quit_on_start'
  | 'unknown'

export interface LaunchProblem {
  gameId: number
  stage: LaunchProblemStage
  code: LaunchProblemCode
  message: string
  httpStatus?: number | null
  exitCode?: number | null
  runSeconds?: number | null
  details?: Record<string, unknown>
}

const appVersion = (): string => {
  try {
    return app.getVersion()
  } catch {
    return 'unknown'
  }
}

const osLabel = (): string => `${process.platform} ${os.release()} ${os.arch()}`

// The player-facing reason for a failed /v1/validate call.
export function codeForValidationFailure(httpStatus: number | null): LaunchProblemCode {
  if (httpStatus === null) return 'offline'
  if (httpStatus === 401) return 'session_expired'
  if (httpStatus === 403 || httpStatus === 404) return 'no_access'
  if (httpStatus >= 500) return 'server'
  return 'unknown'
}

export function reportLaunchProblem(problem: LaunchProblem, token?: string | null): void {
  console.error(
    `[LaunchProblem] ${problem.stage} (${problem.code}) game=${problem.gameId}: ${problem.message}`
  )

  WindowManager.getInstance().send('game-launch-problem', {
    gameId: problem.gameId,
    code: problem.code,
    stage: problem.stage,
    message: problem.message,
    httpStatus: problem.httpStatus ?? null,
    exitCode: problem.exitCode ?? null
  })

  // @ts-ignore
  const apiBaseUrl = import.meta.env.VITE_APP_API_URL
  axios
    .post(
      `${apiBaseUrl}/v1/validate/report`,
      {
        game_id: problem.gameId,
        stage: problem.stage,
        message: `[${problem.code}] ${problem.message}`.slice(0, 1000),
        http_status: problem.httpStatus ?? null,
        exit_code: problem.exitCode ?? null,
        run_seconds: problem.runSeconds ?? null,
        app_version: appVersion(),
        os: osLabel(),
        details: problem.details ?? null
      },
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 10000
      }
    )
    .catch((error) => {
      console.error('[LaunchProblem] could not send the report:', error?.message ?? error)
    })
}

// Keeps the last lines a game wrote, to send along if it quits on start.
export class OutputTail {
  private lines: string[] = []

  constructor(private readonly max = 30) {}

  push(stream: 'stdout' | 'stderr', chunk: Buffer | string): void {
    for (const line of chunk.toString().split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed) this.lines.push(`[${stream}] ${trimmed.slice(0, 300)}`)
    }
    if (this.lines.length > this.max) this.lines = this.lines.slice(-this.max)
  }

  text(): string {
    return this.lines.join('\n')
  }
}
