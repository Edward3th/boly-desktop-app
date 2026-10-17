import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import axios from 'axios'
import { AchievementToastWindow, type AchievementToast } from './AchievementToastWindow'

// Unlock notices from a running game (boly-sdk spec/PROTOCOL.md §5.1).
//
// Before launching a game the app creates an empty folder and passes it as
// -boly_events_dir. When the server confirms a new unlock, the SDK drops a
// small JSON file there; this service picks it up and shows the Steam-style
// notice over the game. A folder instead of a local port: listening on a
// port trips the Windows Firewall prompt (see LocalGameServer.ts).

const API_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/
const SCAN_INTERVAL_MS = 1000
// A notice the SDK wrote but we can't parse is dropped, never retried forever
const MAX_EVENT_BYTES = 16 * 1024

type LocalizedText = Record<string, string> | null

interface AchievementInfo {
  api_name: string
  name: LocalizedText
  description: LocalizedText
  icon_url: string | null
  hidden: boolean
  target: number
}

interface Session {
  gameId: number
  key: string
  dir: string
  watcher: fs.FSWatcher | null
  timer: ReturnType<typeof setInterval>
  achievements: Map<string, AchievementInfo>
  // one notice per achievement and session, even if the SDK repeats itself
  shown: Set<string>
}

export class AchievementNotifier {
  private static instance: AchievementNotifier
  private session: Session | null = null
  private scanning = false

  public static getInstance(): AchievementNotifier {
    if (!AchievementNotifier.instance) {
      AchievementNotifier.instance = new AchievementNotifier()
    }
    return AchievementNotifier.instance
  }

  private get root(): string {
    return path.join(app.getPath('userData'), 'game-events')
  }

  // A fresh, empty folder for the next game session. One game runs at a
  // time, so leftovers from a crash or a previous session go first.
  public createSessionFolder(gameId: number): string {
    fs.rmSync(this.root, { recursive: true, force: true })
    const dir = path.join(this.root, `${gameId}-${randomUUID()}`)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  // Starts watching the folder of a game that was just launched. `key` is the
  // session key the game itself got: it authenticates the achievement list.
  public start(gameId: number, key: string, dir: string): void {
    this.stop()
    let watcher: fs.FSWatcher | null = null
    try {
      watcher = fs.watch(dir, () => void this.scan())
    } catch (error) {
      // The periodic scan below still catches every notice
      console.error('[AchievementNotifier] fs.watch failed:', error)
    }
    this.session = {
      gameId,
      key,
      dir,
      watcher,
      timer: setInterval(() => void this.scan(), SCAN_INTERVAL_MS),
      achievements: new Map(),
      shown: new Set()
    }
    void this.loadAchievements()
    AchievementToastWindow.getInstance().prepare()
  }

  public stop(): void {
    const session = this.session
    if (!session) return
    this.session = null
    session.watcher?.close()
    clearInterval(session.timer)
    fs.rmSync(session.dir, { recursive: true, force: true })
  }

  private async scan(): Promise<void> {
    const session = this.session
    if (!session || this.scanning) return
    this.scanning = true
    try {
      let files: string[]
      try {
        files = fs.readdirSync(session.dir).filter((f) => f.endsWith('.json'))
      } catch {
        return
      }
      for (const file of files.sort()) {
        const full = path.join(session.dir, file)
        let raw: string | null = null
        try {
          if (fs.statSync(full).size <= MAX_EVENT_BYTES) raw = fs.readFileSync(full, 'utf8')
        } catch {
          continue
        }
        fs.rmSync(full, { force: true })
        if (raw !== null) await this.handle(session, raw)
      }
    } finally {
      this.scanning = false
    }
  }

  private async handle(session: Session, raw: string): Promise<void> {
    let event: { type?: unknown; api_name?: unknown; current?: unknown; target?: unknown }
    try {
      event = JSON.parse(raw)
    } catch {
      return
    }
    if (event.type !== 'achievement_unlocked' || typeof event.api_name !== 'string' || !API_NAME_RE.test(event.api_name)) {
      return
    }
    const apiName = event.api_name
    if (session.shown.has(apiName)) return
    session.shown.add(apiName)

    // Unknown, or hidden: the server only reveals a hidden achievement's name
    // once this player has it, so ask again now that they do.
    let info = session.achievements.get(apiName)
    if (!info || info.hidden || !info.name) {
      await this.loadAchievements()
      if (this.session !== session) return
      info = session.achievements.get(apiName)
    }

    const toast: AchievementToast = {
      apiName,
      name: info?.name ?? null,
      description: info?.description ?? null,
      iconUrl: info?.icon_url ?? null,
      target: typeof event.target === 'number' ? event.target : info?.target ?? 1
    }
    AchievementToastWindow.getInstance().show(toast)
  }

  private async loadAchievements(): Promise<void> {
    const session = this.session
    if (!session) return
    try {
      // @ts-ignore
      const apiBaseUrl = import.meta.env.VITE_APP_API_URL
      const { data } = await axios.get(`${apiBaseUrl}/v1/lumen/achievements`, {
        headers: { 'X-Boly-Game-Id': String(session.gameId), 'X-Boly-Key': session.key },
        timeout: 10000
      })
      for (const a of (data?.achievements ?? []) as AchievementInfo[]) {
        if (a && typeof a.api_name === 'string') session.achievements.set(a.api_name, a)
      }
    } catch (error) {
      // The notice still shows, with the api_name and a trophy
      console.error('[AchievementNotifier] could not load achievements:', (error as Error).message)
    }
  }
}
