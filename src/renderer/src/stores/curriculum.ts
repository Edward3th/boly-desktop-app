import { defineStore } from 'pinia'
import axios from 'axios'
import type {
  CurriculumCatalog,
  CurriculumGrade,
  CurriculumSubject,
  CurriculumSubjectGroup,
  GameEducation
} from '@/types'

// The Mineduc catalog is static reference data: fetched once per session for
// the store filters and the game page's subject/grade labels. Read-only here —
// studios edit educational content from the web dev dashboard.
export default defineStore('curriculum', {
  state: () => ({
    catalog: null as CurriculumCatalog | null,
    _catalogRequest: null as Promise<CurriculumCatalog> | null
  }),

  getters: {
    gradeById: (state) =>
      new Map<number, CurriculumGrade>((state.catalog?.grades ?? []).map((g) => [g.grade_id, g])),
    subjectById: (state) =>
      new Map<number, CurriculumSubject>((state.catalog?.subjects ?? []).map((s) => [s.subject_id, s])),
    groupById: (state) =>
      new Map<number, CurriculumSubjectGroup>(
        (state.catalog?.subject_groups ?? []).map((g) => [g.subject_group_id, g])
      )
  },

  actions: {
    async fetchCatalog(): Promise<CurriculumCatalog> {
      if (this.catalog) return this.catalog
      // Several components mount at once on the store page; share one request.
      if (!this._catalogRequest) {
        this._catalogRequest = axios
          .get('/v1/curriculum')
          .then((response) => {
            this.catalog = response.data
            return response.data
          })
          .finally(() => {
            this._catalogRequest = null
          })
      }
      return this._catalogRequest
    },

    async fetchGameEducation(gameId: number): Promise<GameEducation> {
      const response = await axios.get(`/v1/games/${gameId}/education`)
      return response.data
    }
  }
})
