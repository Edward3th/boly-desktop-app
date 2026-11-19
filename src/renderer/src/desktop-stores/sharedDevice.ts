import { defineStore } from 'pinia'

// Shared-computer mode as the renderer sees it. The main process owns the
// configuration and the inactivity monitor (main/services/SharedDeviceService.ts).

export interface SharedProfile {
  user_id: number
  username: string
  avatar_url: string | null
  last_used_at: string
}

interface SharedDeviceConfig {
  enabled: boolean | null
  idleMinutes: number
  profiles: SharedProfile[]
  idleOptions?: number[]
}

const ipc = () => window.electron?.ipcRenderer

// Set by init(): loads the configuration once per app run. The router waits
// on it before deciding where a signed-out user goes.
let initPromise: Promise<void> | null = null

export const useSharedDevice = defineStore('sharedDevice', {
  state: () => ({
    loaded: false,
    /** null until someone answers whether several people use this computer. */
    enabled: null as boolean | null,
    idleMinutes: 10,
    idleOptions: [5, 10, 15, 30] as number[],
    profiles: [] as SharedProfile[]
  }),

  getters: {
    isShared: (state) => state.enabled === true,
    hasProfiles: (state) => state.enabled === true && state.profiles.length > 0
  },

  actions: {
    apply(config: SharedDeviceConfig) {
      this.enabled = config.enabled
      this.idleMinutes = config.idleMinutes
      this.profiles = config.profiles ?? []
      if (config.idleOptions) this.idleOptions = config.idleOptions
      this.loaded = true
    },

    // Once per app run: load the configuration and, on a shared computer,
    // drop a sign-in left over from the last run (the app was closed or the
    // computer switched off without signing out). sessionStorage lives as
    // long as the window, so reloads inside one run keep the sign-in.
    init(signOutLeftover: () => Promise<void>): Promise<void> {
      if (!initPromise) {
        initPromise = (async () => {
          await this.load()
          const RUN_KEY = 'boly-app-run'
          if (this.isShared && localStorage.getItem('token') && !sessionStorage.getItem(RUN_KEY)) {
            await signOutLeftover()
          }
          sessionStorage.setItem(RUN_KEY, '1')
        })()
      }
      return initPromise
    },

    async load() {
      try {
        const config = await ipc()?.invoke('shared-device:get')
        if (config) this.apply(config)
      } catch (error) {
        console.error('[SharedDevice] could not load the configuration:', error)
      }
      this.loaded = true
    },

    async setMode(enabled: boolean, idleMinutes?: number) {
      this.apply(await ipc()?.invoke('shared-device:set-mode', { enabled, idleMinutes }))
    },

    async upsertProfile(profile: { user_id: number; username: string; avatar_url: string | null }) {
      if (!this.isShared) return
      this.apply(await ipc()?.invoke('shared-device:upsert-profile', profile))
    },

    async removeProfile(userId: number) {
      this.apply(await ipc()?.invoke('shared-device:remove-profile', userId))
    },

    // Tells the inactivity monitor whether someone is signed in.
    notifySignedIn(signedIn: boolean) {
      ipc()
        ?.invoke('shared-device:signed-in', signedIn)
        .catch(() => {})
    }
  }
})

export default useSharedDevice
