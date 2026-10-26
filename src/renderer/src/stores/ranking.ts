import { defineStore } from 'pinia'
import axios from 'axios'
import type { MyStats, RankingMetric, RankingPeriod, RankingResponse, RankingScope } from '@/types'

// Player rankings and the player's own stats. Who may see which ranking is
// decided by the API; the app only asks for its own course, school or the
// global list. Query strings go in the URL: the IPC request bridge
// (main.ts) drops axios `params`.
const useRanking = defineStore('ranking', {
  actions: {
    async fetchRanking(
      scope: RankingScope,
      metric: RankingMetric,
      period: RankingPeriod
    ): Promise<RankingResponse> {
      const { data } = await axios.get(`/v1/rankings?scope=${scope}&metric=${metric}&period=${period}`)
      return data
    },

    async fetchMyStats(period: RankingPeriod): Promise<MyStats> {
      const { data } = await axios.get(`/v1/rankings/me?period=${period}`)
      return data
    },

    // The global ranking is opt-in; course and school rankings are not.
    async setShowInGlobalRanking(show: boolean): Promise<boolean> {
      const { data } = await axios.patch('/v1/rankings/settings', { show_in_global_ranking: show })
      return data.show_in_global_ranking
    }
  }
})

export default useRanking
