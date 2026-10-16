import { defineStore } from 'pinia'
import axios from 'axios'
import type { GameAchievementsResponse, PublicProfile } from '@/types'

// LumenAI achievements, read-only in the app: a game's list and public
// profiles. Developers edit achievements on boly.cl; games report progress
// through the SDK. The IPC request interceptor (main.ts) already attaches
// the session token, so a logged-in player gets their own progress.
const useAchievements = defineStore('achievements', {
  actions: {
    async fetchGameAchievements(gameId: number): Promise<GameAchievementsResponse> {
      const { data } = await axios.get(`/v1/games/${gameId}/achievements`)
      return data
    },

    async fetchProfile(username: string): Promise<PublicProfile> {
      const { data } = await axios.get(`/v1/profiles/${encodeURIComponent(username)}`)
      return data
    }
  }
})

export default useAchievements
