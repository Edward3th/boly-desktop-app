import { spawn, execFile } from 'child_process'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import axios from 'axios'
import { WindowManager } from './WindowManager'
import { AchievementNotifier } from './AchievementNotifier'
import { AuthService } from './AuthService'
import { LocalGameServer } from './LocalGameServer'

interface ActiveGameSession {
  pid: number
  game_id: number
  token: string
  sessionStartTime: number
  lastRecordedPlayTimeMinutes: number
  intervalId?: NodeJS.Timeout
}

// A browser-style build (Unity WebGL, Godot HTML5, a plain web bundle),
// running in its own real OS window instead of a spawned process — the
// window itself IS the "process" for accounting purposes here.
interface ActiveLocalGameSession {
  window: BrowserWindow
  game_id: number
  token: string
  sessionStartTime: number
  lastRecordedPlayTimeMinutes: number
  intervalId?: NodeJS.Timeout
}

export default class GameService {
  private static instance: GameService
  private activeGameSession: ActiveGameSession | null = null
  private activeLocalGameSession: ActiveLocalGameSession | null = null
  private endingGameSession: Promise<void> | null = null
  private gameSessionLaunching = false
  private PLAYTIME_UPDATE_INTERVAL_MS = 60 * 1000 // every 1 minute

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): GameService {
    if (!GameService.instance) {
      GameService.instance = new GameService()
    }
    return GameService.instance
  }

  public isActive(gameId: number): boolean {
    return (
      (this.activeGameSession !== null && this.activeGameSession.game_id === gameId) ||
      (this.activeLocalGameSession !== null && this.activeLocalGameSession.game_id === gameId)
    )
  }

  public hasActiveSession(): boolean {
    return this.activeGameSession !== null || this.activeLocalGameSession !== null ||
      this.endingGameSession !== null
  }

  public async fetchInitialPlayTime(token: string, game_id: number): Promise<number> {
    try {
      // @ts-ignore
      const apiBaseUrl = import.meta.env.VITE_APP_API_URL
      const response = await axios.get(`${apiBaseUrl}/v1/games/${game_id}/playtime`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data && typeof response.data.play_time === 'number') {
        return response.data.play_time
      }
      return 0
    } catch (error) {
      console.error('Failed to fetch initial playtime:', error)
      return 0
    }
  }

  public async sendPlayTimeUpdate(
    token: string,
    game_id: number,
    totalPlayTimeMinutes: number
  ): Promise<boolean> {
    try {
      // @ts-ignore
      const apiBaseUrl = import.meta.env.VITE_APP_API_URL
      await axios.post(
        `${apiBaseUrl}/v1/games/updatePlayTime`,
        {
          game_id: game_id,
          play_time: Math.round(totalPlayTimeMinutes)
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      console.log(`Playtime updated for game ${game_id}: ${totalPlayTimeMinutes} minutes`)
      return true
    } catch (error: any) {
      console.error('Failed to send playtime update:', error)
      if (error.response && error.response.status === 403) {
        console.error('Authentication failed - user may not be signed in')
        return false
      }
      return true
    }
  }

  public stopPlaytimeTracking(): void {
    if (this.activeGameSession && this.activeGameSession.intervalId) {
      clearInterval(this.activeGameSession.intervalId)
    }

    const stoppedGameId = this.activeGameSession?.game_id
    this.activeGameSession = null
    this.gameSessionLaunching = false
    AchievementNotifier.getInstance().stop()

    if (stoppedGameId) {
      WindowManager.getInstance().send('game-stopped', {
        gameId: stoppedGameId
      })
    }

    console.log('Playtime tracking stopped.')
  }

  private isGameProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  private async waitForGameExit(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (this.isGameProcessRunning(pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return !this.isGameProcessRunning(pid)
  }

  private runTaskkill(pid: number, force: boolean): Promise<void> {
    return new Promise((resolve) => {
      const args = ['/pid', String(pid)]
      // /t without /f fails for Unity's crash-handler child process, so the
      // graceful request targets the game window alone.
      if (force) args.push('/f', '/t')
      execFile('taskkill', args, { windowsHide: true }, (error) => {
        if (error && this.isGameProcessRunning(pid)) {
          console.error(`Error closing game process (force=${force}):`, error)
        }
        resolve()
      })
    })
  }

  public cleanupActiveGameSession(): Promise<void> {
    if (this.endingGameSession) return this.endingGameSession
    const session = this.activeGameSession
    if (!session) return Promise.resolve()

    this.endingGameSession = (async () => {
      console.log(`Terminating active game session with PID: ${session.pid}`)
      try {
        const sessionDurationMinutes = (Date.now() - session.sessionStartTime) / (1000 * 60)
        await this.sendPlayTimeUpdate(
          session.token,
          session.game_id,
          session.lastRecordedPlayTimeMinutes + sessionDurationMinutes
        )

        if (this.isGameProcessRunning(session.pid)) {
          if (process.platform === 'win32') {
            // Let the game run its normal quit handlers and write its save.
            // A stuck game is still closed before another account can play.
            await this.runTaskkill(session.pid, false)
            if (!(await this.waitForGameExit(session.pid, 3000))) {
              await this.runTaskkill(session.pid, true)
              await this.waitForGameExit(session.pid, 1000)
            }
          } else {
            process.kill(session.pid, 'SIGTERM')
            if (!(await this.waitForGameExit(session.pid, 3000))) {
              process.kill(session.pid, 'SIGKILL')
              await this.waitForGameExit(session.pid, 1000)
            }
          }
        }
      } catch (error) {
        console.error('Error during game session cleanup:', error)
      } finally {
        if (!this.isGameProcessRunning(session.pid) && this.activeGameSession?.pid === session.pid) {
          this.stopPlaytimeTracking()
        }
      }
      if (this.isGameProcessRunning(session.pid)) {
        throw new Error(`Game process ${session.pid} is still running after the close request`)
      }
    })().finally(() => {
      this.endingGameSession = null
    })
    return this.endingGameSession
  }

  public async playGame(appData: any): Promise<any> {
    const { appPath, game_id, token } = appData

    if (this.activeGameSession || this.endingGameSession) {
      console.warn('[GameService] Another game session is already active. Please stop it first.')
      return { error: 'Another game session is active.' }
    }

    if (this.gameSessionLaunching) {
      console.warn('[GameService] A game is already being launched. Please wait.')
      return { error: 'A game is already being launched. Please wait.' }
    }

    this.gameSessionLaunching = true

    try {
      console.log(`[GameService] ── Launching game ──────────────────────────────`)
      console.log(`[GameService]   game_id  : ${game_id}`)
      console.log(`[GameService]   appPath  : ${appPath}`)

      const reqValidate = { game_id, token }

      // @ts-ignore
      const apiBaseUrl = import.meta.env.VITE_APP_API_URL
      console.log(`[GameService] Requesting access token from ${apiBaseUrl}/v1/validate/`)

      let validationResponse: any
      try {
        validationResponse = await axios.post(`${apiBaseUrl}/v1/validate/`, reqValidate, {
          headers: { Authorization: `Bearer ${token}` }
        })
      } catch (axiosError: any) {
        const status = axiosError.response?.status ?? 'no response'
        const data = axiosError.response?.data ?? axiosError.message
        console.error(`[GameService] ✗ Validation request failed`)
        console.error(`[GameService]   HTTP status : ${status}`)
        console.error(`[GameService]   Server says : ${JSON.stringify(data)}`)
        this.gameSessionLaunching = false
        return { error: `Access denied: ${data?.message ?? axiosError.message}` }
      }

      if (validationResponse.data && validationResponse.data.tempKey) {
        console.log(`[GameService] ✓ Access granted for game ${game_id}`)
        console.log(`[GameService]   tempKey received — launching process`)

        const lastRecordedPlayTimeMinutes = await this.fetchInitialPlayTime(token, game_id)

        // NOTE (legacy compatibility — Option A): we still pass -token so that
        // games built with the OLD ParamsCatcher (which require -token or quit)
        // keep working. New games ignore it and authenticate the heartbeat with
        // -key alone. Once every game is rebuilt with the new ParamsCatcher,
        // drop -token here to close the argv JWT-leak (see
        // Game_integration_readme.md → "Completing the migration").
        // Folder where the SDK drops unlock notices for the Steam-style popup
        // (boly-sdk spec/PROTOCOL.md §5.1). Quoted: with shell: true the
        // arguments go through cmd.exe, and the user's profile path can
        // contain spaces.
        const notifier = AchievementNotifier.getInstance()
        const eventsDir = notifier.createSessionFolder(game_id)
        const args = [
          '-game_id', String(reqValidate.game_id),
          '-key', validationResponse.data.tempKey,
          '-token', token,
          '-boly_events_dir', `"${eventsDir}"`
        ]
        // A dev build of the app talks to a local API: point the game at it
        // too. The SDK accepts -api_base; the released app never sends it.
        if (is.dev) args.push('-api_base', apiBaseUrl)
        const appProcess = spawn('"' + appPath + '"', args, {
          shell: true,
          detached: false
        })

        if (!appProcess.pid) {
          console.error('[GameService] ✗ Failed to launch application or get PID.')
          this.gameSessionLaunching = false
          return { error: 'Failed to launch game process.' }
        }

        console.log(`[GameService] ✓ Game process started — PID: ${appProcess.pid}`)

        appProcess.stdout?.on('data', (data: Buffer) => {
          console.log(`[Game stdout] ${data.toString().trim()}`)
        })
        appProcess.stderr?.on('data', (data: Buffer) => {
          console.error(`[Game stderr] ${data.toString().trim()}`)
        })

        this.activeGameSession = {
          pid: appProcess.pid,
          game_id: game_id,
          token: token,
          sessionStartTime: Date.now(),
          lastRecordedPlayTimeMinutes: lastRecordedPlayTimeMinutes
        }

        this.gameSessionLaunching = false
        notifier.start(game_id, validationResponse.data.tempKey, eventsDir)

        WindowManager.getInstance().send('game-started', {
          gameId: game_id,
          pid: appProcess.pid
        })

        this.activeGameSession.intervalId = setInterval(async () => {
          if (this.activeGameSession) {
            try {
              process.kill(this.activeGameSession.pid, 0)

              // Check if user is still authenticated using AuthService singleton
              const isAuthenticated = await AuthService.getInstance().checkUserAuthentication()
              if (!isAuthenticated) {
                console.warn(`[GameService] ✗ User is no longer authenticated — terminating game (PID: ${this.activeGameSession.pid})`)
                await this.cleanupActiveGameSession()
                return
              }

              const currentTime = Date.now()
              const sessionDurationMinutes =
                (currentTime - this.activeGameSession.sessionStartTime) / (1000 * 60)
              const newTotalPlayTimeMinutes =
                this.activeGameSession.lastRecordedPlayTimeMinutes + sessionDurationMinutes

              const updateSuccess = await this.sendPlayTimeUpdate(
                this.activeGameSession.token,
                this.activeGameSession.game_id,
                newTotalPlayTimeMinutes
              )

              if (!updateSuccess) {
                console.warn(`[GameService] ✗ Playtime update failed (auth rejected) — terminating game (PID: ${this.activeGameSession.pid})`)
                await this.cleanupActiveGameSession()
                return
              }
            } catch {
              // Process died on its own
              console.log(`[GameService] Game process (PID: ${this.activeGameSession?.pid}) is no longer running — cleaning up session`)
              this.cleanupActiveGameSession()
            }
          }
        }, this.PLAYTIME_UPDATE_INTERVAL_MS)

        appProcess.on('exit', async (code) => {
          const sessionSecs = (Date.now() - (this.activeGameSession?.sessionStartTime ?? Date.now())) / 1000
          console.log(`[GameService] Game process exited (PID: ${appProcess.pid}, exit code: ${code}, ran for ~${sessionSecs.toFixed(1)}s)`)
          if (sessionSecs < 15) {
            console.warn(`[GameService] ⚠ Game exited within 15 seconds — this usually means the game rejected its license key.`)
            console.warn(`[GameService]   Check the backend logs for validateToken errors for game_id=${game_id}`)
          }
          this.cleanupActiveGameSession()
        })

        appProcess.on('error', async (err) => {
          console.error(`[GameService] ✗ Game process error (PID: ${appProcess.pid}): ${err.message}`)
          this.cleanupActiveGameSession()
        })

        return { success: true, pid: appProcess.pid }
      } else {
        console.error(`[GameService] ✗ Validation response did not contain a tempKey`)
        console.error(`[GameService]   Response data: ${JSON.stringify(validationResponse.data)}`)
        this.gameSessionLaunching = false
        return { error: 'Game validation failed.' }
      }
    } catch (error: any) {
      console.error(`[GameService] ✗ Unexpected error in playGame:`, error.message)
      this.gameSessionLaunching = false
      await this.cleanupActiveGameSession()
      return { error: 'Failed to play game: ' + error.message }
    }
  }

  public async cleanupActiveLocalGameSession(): Promise<void> {
    const session = this.activeLocalGameSession
    if (!session) return

    console.log(`[GameService] Ending local game session for game ${session.game_id}`)

    if (session.intervalId) {
      clearInterval(session.intervalId)
    }

    try {
      const sessionDurationMinutes = (Date.now() - session.sessionStartTime) / (1000 * 60)
      await this.sendPlayTimeUpdate(
        session.token,
        session.game_id,
        session.lastRecordedPlayTimeMinutes + sessionDurationMinutes
      )
    } catch (error) {
      console.error('[GameService] Error sending final playtime for local game session:', error)
    }

    this.activeLocalGameSession = null
    this.gameSessionLaunching = false

    // Ended from outside (sign-out, session invalidated, app quitting): the
    // window is still open. Its 'closed' handler lands back here and finds
    // no session.
    if (!session.window.isDestroyed()) {
      session.window.close()
    }

    WindowManager.getInstance().send('game-stopped', { gameId: session.game_id })
  }

  // Browser-style build: opens its own real window (not spawned as a process,
  // not embedded in the app's own window), matching how a native .exe game
  // already gets its own window. Playtime accounting mirrors playGame's,
  // keyed off the window's lifetime instead of a PID.
  public async playLocalGame(appData: {
    game_id: number
    root: string
    entryPath: string
    token: string
    gameName?: string
  }): Promise<{ success?: boolean; error?: string }> {
    const { game_id, root, entryPath, token, gameName } = appData

    if (this.hasActiveSession()) {
      console.warn('[GameService] Another game session is already active. Please stop it first.')
      return { error: 'Another game session is active.' }
    }
    if (this.gameSessionLaunching) {
      console.warn('[GameService] A game is already being launched. Please wait.')
      return { error: 'A game is already being launched. Please wait.' }
    }

    this.gameSessionLaunching = true

    try {
      const registration = LocalGameServer.getInstance().register(game_id, root, entryPath)
      if (!registration.ok) {
        console.error(`[GameService] ✗ Could not register local game: ${registration.error}`)
        this.gameSessionLaunching = false
        return { error: registration.error }
      }

      const lastRecordedPlayTimeMinutes = await this.fetchInitialPlayTime(token, game_id)

      const gameWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        title: gameName || 'Boly',
        webPreferences: {
          // Third-party content: no Node, no preload, fully sandboxed —
          // the same posture the embedded iframe used before this.
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      })
      gameWindow.removeMenu()
      gameWindow.once('ready-to-show', () => gameWindow.show())
      await gameWindow.loadURL(registration.url)

      this.activeLocalGameSession = {
        window: gameWindow,
        game_id,
        token,
        sessionStartTime: Date.now(),
        lastRecordedPlayTimeMinutes
      }
      this.gameSessionLaunching = false

      WindowManager.getInstance().send('game-started', { gameId: game_id })

      this.activeLocalGameSession.intervalId = setInterval(async () => {
        const session = this.activeLocalGameSession
        if (!session) return

        const isAuthenticated = await AuthService.getInstance().checkUserAuthentication()
        if (!isAuthenticated) {
          console.warn(`[GameService] ✗ User is no longer authenticated — closing local game window`)
          session.window.close()
          return
        }

        const sessionDurationMinutes = (Date.now() - session.sessionStartTime) / (1000 * 60)
        const updateSuccess = await this.sendPlayTimeUpdate(
          session.token,
          session.game_id,
          session.lastRecordedPlayTimeMinutes + sessionDurationMinutes
        )
        if (!updateSuccess) {
          console.warn(`[GameService] ✗ Playtime update failed (auth rejected) — closing local game window`)
          session.window.close()
        }
      }, this.PLAYTIME_UPDATE_INTERVAL_MS)

      // The only way this session ends: the player closes the window. There
      // is no child process to exit on its own.
      gameWindow.on('closed', () => {
        this.cleanupActiveLocalGameSession()
      })

      return { success: true }
    } catch (error: any) {
      console.error(`[GameService] ✗ Unexpected error in playLocalGame:`, error.message)
      this.gameSessionLaunching = false
      this.activeLocalGameSession = null
      return { error: 'Failed to play game: ' + error.message }
    }
  }
}
