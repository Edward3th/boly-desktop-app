import { computed, onMounted, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { useCurriculum } from '@/stores'
import type { Game, LocalizedString } from '@/types'
import { normalizeForSearch } from '@/utils/curriculum'

const GAME_TYPES = { web: 2, descargable: 3 } as const
export type GameTypeFilter = '' | keyof typeof GAME_TYPES

// Search, grade, subject and type filters over a list of games, shared by the
// store (/games) and the library. With `syncUrl` the filters live in the query
// string (?q=&curso=3B&asignatura=matematica&tipo=web) so a filtered list can
// be shared and survives going back.
export function useGameFilters(games: Ref<Game[]>, options: { syncUrl?: boolean } = {}) {
  const route = useRoute()
  const router = useRouter()
  const curriculum = useCurriculum()

  const query = ref('')
  const gradeCode = ref('')
  const groupSlug = ref('')
  const gameType = ref<GameTypeFilter>('')

  onMounted(() => {
    // Without the catalog the filters still work on name and type; only the
    // grade/subject options and labels stay empty.
    curriculum.fetchCatalog().catch((error) => console.error('Error loading curriculum catalog:', error))
  })

  if (options.syncUrl) {
    const queryParam = (value: LocationQuery[string]) => (typeof value === 'string' ? value : '')

    watch(
      () => route.query,
      (urlQuery) => {
        query.value = queryParam(urlQuery.q)
        gradeCode.value = queryParam(urlQuery.curso)
        groupSlug.value = queryParam(urlQuery.asignatura)
        const tipo = queryParam(urlQuery.tipo)
        gameType.value = tipo in GAME_TYPES ? (tipo as GameTypeFilter) : ''
      },
      { immediate: true }
    )

    watch([query, gradeCode, groupSlug, gameType], () => {
      const next = {
        ...route.query,
        q: query.value.trim() || undefined,
        curso: gradeCode.value || undefined,
        asignatura: groupSlug.value || undefined,
        tipo: gameType.value || undefined
      }
      const unchanged = (['q', 'curso', 'asignatura', 'tipo'] as const).every(
        (key) => queryParam(route.query[key]) === (next[key] ?? '')
      )
      if (!unchanged) router.replace({ query: next })
    })
  }

  const hasActiveFilters = computed(
    () => !!(query.value.trim() || gradeCode.value || groupSlug.value || gameType.value)
  )

  function clearFilters() {
    query.value = ''
    gradeCode.value = ''
    groupSlug.value = ''
    gameType.value = ''
  }

  const selectedGrade = computed(() => curriculum.catalog?.grades.find((grade) => grade.code === gradeCode.value))
  const selectedGroup = computed(() =>
    curriculum.catalog?.subject_groups.find((group) => group.slug === groupSlug.value)
  )

  const localizedTexts = (...values: (LocalizedString | null | undefined)[]) =>
    values.flatMap((value) => (value ? Object.values(value) : [])).join(' ')

  const filteredGames = computed<Game[]>(() => {
    let list = games.value

    if (gameType.value) {
      const typeId = GAME_TYPES[gameType.value as keyof typeof GAME_TYPES]
      list = list.filter((game) => game.game_type_id === typeId)
    }

    // Grade and subject must hold for the same target: a game for Matemática 3°
    // and Ciencias 5° is not a "Ciencias 3°" game.
    const grade = selectedGrade.value
    const group = selectedGroup.value
    if (grade || group) {
      list = list.filter((game) =>
        (game.education?.targets ?? []).some(
          (target) =>
            (!grade || target.grade_id === grade.grade_id) &&
            (!group || curriculum.subjectById.get(target.subject_id)?.subject_group_id === group.subject_group_id)
        )
      )
    }

    const text = normalizeForSearch(query.value.trim())
    if (text) {
      list = list.filter((game) =>
        normalizeForSearch(
          localizedTexts(game.name, game.education?.topic, game.education?.short_description)
        ).includes(text)
      )
    }

    return list
  })

  return { query, gradeCode, groupSlug, gameType, hasActiveFilters, clearFilters, filteredGames }
}
