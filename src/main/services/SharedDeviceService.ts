import fs from 'fs'
import path from 'path'
import { app, ipcMain, powerMonitor } from 'electron'
import { WindowManager } from './WindowManager'

// Shared-computer mode, for a school lab where students take turns:
//   - profiles: who has signed in on this computer, so the next time they
//     pick their card and type only their password. Only the user id, name
//     and avatar are kept on disk — never an email or a token;
//   - inactivity sign-out: after `idleMinutes` without keyboard or mouse
//     anywhere on the computer (Windows' own idle time, so playing a game
//     counts as activity) the app warns for 60 seconds and then signs out.
//     Locking Windows or suspending the computer signs out right away.
// The renderer does the actual sign-out (auth store), told through
// 'shared-device:sign-out'. The API also ends a shared session after 15
// minutes without the app checking in, for a computer switched off mid-session.

export interface SharedProfile {
  user_id: number
  username: string
  avatar_url: string | null
  last_used_at: string
}

export interface SharedDeviceConfig {
  /** null until someone answers "Is this computer used by several people?" */
  enabled: boolean | null
  idleMinutes: number
  profiles: SharedProfile[]
}

export const IDLE_MINUTES_OPTIONS = [5, 10, 15, 30]
const DEFAULT_IDLE_MINUTES = 10
const WARNING_SECONDS = 60
const CHECK_EVERY_MS = 5000
const MAX_PROFILES = 60

const DEFAULT_CONFIG: SharedDeviceConfig = {
  enabled: null,
  idleMinutes: DEFAULT_IDLE_MINUTES,
  profiles: []
}

export class SharedDeviceService {
  private static instance: SharedDeviceService
  private config: SharedDeviceConfig = { ...DEFAULT_CONFIG }
  private signedIn = false
  private warning = false
  private timer: NodeJS.Timeout | null = null

  public static getInstance(): SharedDeviceService {
    if (!SharedDeviceService.instance) SharedDeviceService.instance = new SharedDeviceService()
    return SharedDeviceService.instance
  }

  private get file(): string {
    return path.join(app.getPath('userData'), 'shared-device.json')
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'))
      this.config = {
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : null,
        idleMinutes: IDLE_MINUTES_OPTIONS.includes(raw.idleMinutes)
          ? raw.idleMinutes
          : DEFAULT_IDLE_MINUTES,
        profiles: Array.isArray(raw.profiles)
          ? raw.profiles.filter((p: any) => Number.isInteger(p?.user_id) && typeof p?.username === 'string')
          : []
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG, profiles: [] }
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (error) {
      console.error('[SharedDevice] could not save the configuration:', error)
    }
  }

  public getConfig(): SharedDeviceConfig {
    return { ...this.config, profiles: [...this.config.profiles] }
  }

  public setMode(enabled: boolean, idleMinutes?: number): SharedDeviceConfig {
    this.config.enabled = enabled
    if (idleMinutes !== undefined && IDLE_MINUTES_OPTIONS.includes(idleMinutes)) {
      this.config.idleMinutes = idleMinutes
    }
    this.save()
    this.resetWarning()
    return this.getConfig()
  }

  public upsertProfile(profile: Omit<SharedProfile, 'last_used_at'>): SharedDeviceConfig {
    if (!Number.isInteger(profile.user_id) || !profile.username) return this.getConfig()
    const rest = this.config.profiles.filter((p) => p.user_id !== profile.user_id)
    this.config.profiles = [
      {
        user_id: profile.user_id,
        username: String(profile.username).slice(0, 60),
        avatar_url: profile.avatar_url ? String(profile.avatar_url).slice(0, 500) : null,
        last_used_at: new Date().toISOString()
      },
      ...rest
    ].slice(0, MAX_PROFILES)
    this.save()
    return this.getConfig()
  }

  public removeProfile(userId: number): SharedDeviceConfig {
    this.config.profiles = this.config.profiles.filter((p) => p.user_id !== userId)
    this.save()
    return this.getConfig()
  }

  public setSignedIn(signedIn: boolean): void {
    this.signedIn = signedIn
    this.resetWarning()
  }

  private resetWarning(): void {
    if (this.warning) WindowManager.getInstance().send('shared-device:idle-cancel')
    this.warning = false
  }

  private signOut(reason: 'idle' | 'lock'): void {
    if (!this.config.enabled || !this.signedIn) return
    console.log(`[SharedDevice] signing out (${reason})`)
    this.signedIn = false
    this.warning = false
    WindowManager.getInstance().send('shared-device:sign-out', { reason })
  }

  private check(): void {
    if (!this.config.enabled || !this.signedIn) return
    const idle = powerMonitor.getSystemIdleTime()
    const limit = this.config.idleMinutes * 60
    if (idle >= limit) {
      this.signOut('idle')
    } else if (idle >= limit - WARNING_SECONDS) {
      if (!this.warning) {
        this.warning = true
        WindowManager.getInstance().send('shared-device:idle-warning', { secondsLeft: limit - idle })
      }
    } else {
      this.resetWarning()
    }
  }

  public init(): void {
    this.load()

    ipcMain.handle('shared-device:get', () => ({
      ...this.getConfig(),
      idleOptions: IDLE_MINUTES_OPTIONS
    }))
    ipcMain.handle('shared-device:set-mode', (_e, data: { enabled: boolean; idleMinutes?: number }) =>
      this.setMode(Boolean(data?.enabled), data?.idleMinutes)
    )
    ipcMain.handle('shared-device:upsert-profile', (_e, profile) => this.upsertProfile(profile))
    ipcMain.handle('shared-device:remove-profile', (_e, userId: number) => this.removeProfile(Number(userId)))
    ipcMain.handle('shared-device:signed-in', (_e, signedIn: boolean) => this.setSignedIn(Boolean(signedIn)))

    powerMonitor.on('lock-screen', () => this.signOut('lock'))
    powerMonitor.on('suspend', () => this.signOut('lock'))

    if (!this.timer) this.timer = setInterval(() => this.check(), CHECK_EVERY_MS)
  }
}
