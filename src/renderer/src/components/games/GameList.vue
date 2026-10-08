<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useCurriculum, useGames } from '@/stores'
import type { Game, GameEducationSummary, LocalizedString } from '@/types'
import { normalizeForSearch } from '@/utils/curriculum'
import GameSearchRow from '@/components/games/GameSearchRow.vue'
import SkeletonBase from '@/components/skeletons/SkeletonBase.vue'
import GamepadIcon from '@/components/icons/GamepadIcon.vue'

// The store's game search: one row per game, filterable by name, grade,
// subject and type. On /games the filters live in the URL
// (?q=&curso=3B&asignatura=matematica&tipo=web) so a teacher can share a
// filtered list. Under a game's page it is a plain "more games" list, with
// games sharing a subject with that game first.
const props = withDefaults(
  defineProps<{
    showFilters?: boolean
    excludeGameId?: number | null
    relatedTo?: GameEducationSummary | null
    title?: string
  }>(),
  {
    showFilters: true,
    excludeGameId: null,
    relatedTo: null,
    title: ''
  }
)

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const gamesStore = useGames()
const curriculum = useCurriculum()
const { loading, games } = storeToRefs(gamesStore)

const GAME_TYPES = { web: 2, descargable: 3 } as const
type GameTypeFilter = '' | keyof typeof GAME_TYPES
const STAGES = ['parvularia', 'basica', 'media'] as const

const query = ref('')
const gradeCode = ref('')
const groupSlug = ref('')
const gameType = ref<GameTypeFilter>('')

const catalog = computed(() => curriculum.catalog)

onMounted(() => {
  if (!games.value.length) gamesStore.getAll()
  // Without the catalog the list still works; only the curriculum filters
  // and the subject/grade labels stay empty.
  curriculum.fetchCatalog().catch((error) => console.error('Error loading curriculum catalog:', error))
})

// ─── URL <-> filters ─────────────────────────────────────────────────────────

const queryParam = (value: LocationQuery[string]) => (typeof value === 'string' ? value : '')

function readFiltersFromUrl(urlQuery: LocationQuery) {
  query.value = queryParam(urlQuery.q)
  gradeCode.value = queryParam(urlQuery.curso)
  groupSlug.value = queryParam(urlQuery.asignatura)
  const tipo = queryParam(urlQuery.tipo)
  gameType.value = tipo in GAME_TYPES ? (tipo as GameTypeFilter) : ''
}

if (props.showFilters) {
  watch(() => route.query, readFiltersFromUrl, { immediate: true })

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

// ─── Filtering ───────────────────────────────────────────────────────────────

const gradesByStage = computed(() =>
  STAGES.map((stage) => ({
    stage,
    grades: (catalog.value?.grades ?? []).filter((grade) => grade.stage === stage)
  })).filter((group) => group.grades.length > 0)
)

const selectedGrade = computed(() => catalog.value?.grades.find((grade) => grade.code === gradeCode.value))
const selectedGroup = computed(() =>
  catalog.value?.subject_groups.find((group) => group.slug === groupSlug.value)
)

const localizedTexts = (...values: (LocalizedString | null | undefined)[]) =>
  values.flatMap((value) => (value ? Object.values(value) : [])).join(' ')

const subjectGroupIds = (summary: GameEducationSummary | null | undefined) =>
  new Set(
    (summary?.targets ?? [])
      .map((target) => curriculum.subjectById.get(target.subject_id)?.subject_group_id)
      .filter((id): id is number => id !== undefined)
  )

const filteredGames = computed<Game[]>(() => {
  let list = games.value.filter((game) => game.game_id !== props.excludeGameId)

  if (gameType.value) {
    list = list.filter((game) => game.game_type_id === GAME_TYPES[gameType.value as keyof typeof GAME_TYPES])
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

  if (props.relatedTo) {
    const related = subjectGroupIds(props.relatedTo)
    const sharesSubject = (game: Game) => [...subjectGroupIds(game.education)].some((id) => related.has(id))
    list = [...list].sort((a, b) => Number(sharesSubject(b)) - Number(sharesSubject(a)))
  }

  return list
})

// Remounting the rows replays the cascade-in when a select changes, but not on
// every keystroke in the search box.
const rowsKey = computed(() => `${gradeCode.value}|${groupSlug.value}|${gameType.value}|${locale.value}`)
</script>

<template>
  <section class="store-list">
    <h2 v-if="title" class="list-title">{{ title }}</h2>

    <div v-if="showFilters" class="filters" role="search">
      <input
        v-model="query"
        type="search"
        class="filter-control filter-search"
        :placeholder="t('store_search_placeholder')"
        :aria-label="t('store_search_placeholder')"
      />
      <label class="filter">
        <span class="sr-only">{{ t('store_filter_grade') }}</span>
        <select v-model="gradeCode" class="filter-control" :class="{ active: gradeCode }">
          <option value="">{{ t('store_all_grades') }}</option>
          <optgroup v-for="group in gradesByStage" :key="group.stage" :label="t(`store_stage_${group.stage}`)">
            <option v-for="grade in group.grades" :key="grade.grade_id" :value="grade.code">{{ grade.name }}</option>
          </optgroup>
        </select>
      </label>
      <label class="filter">
        <span class="sr-only">{{ t('store_filter_subject') }}</span>
        <select v-model="groupSlug" class="filter-control" :class="{ active: groupSlug }">
          <option value="">{{ t('store_all_subjects') }}</option>
          <option v-for="group in catalog?.subject_groups ?? []" :key="group.subject_group_id" :value="group.slug">
            {{ group.name }}
          </option>
        </select>
      </label>
      <label class="filter">
        <span class="sr-only">{{ t('store_filter_type') }}</span>
        <select v-model="gameType" class="filter-control" :class="{ active: gameType }">
          <option value="">{{ t('store_all_types') }}</option>
          <option value="web">{{ t('store_type_web') }}</option>
          <option value="descargable">{{ t('store_type_download') }}</option>
        </select>
      </label>
    </div>

    <div v-if="showFilters && !(loading && !games.length)" class="results-bar">
      <span aria-live="polite">{{ t('store_results', filteredGames.length) }}</span>
      <button v-if="hasActiveFilters" type="button" class="link-button" @click="clearFilters">
        {{ t('store_clear_filters') }}
      </button>
    </div>

    <div v-if="loading && !games.length" class="rows" aria-hidden="true">
      <div v-for="n in 4" :key="n" class="skeleton-row">
        <SkeletonBase class="skeleton-capsule" height="auto" radius="10px" />
        <div class="skeleton-text">
          <SkeletonBase width="40%" height="1.1rem" />
          <SkeletonBase width="85%" height="0.85rem" />
          <SkeletonBase width="30%" height="0.85rem" />
        </div>
      </div>
    </div>

    <div v-else-if="filteredGames.length > 0" :key="rowsKey" class="rows">
      <GameSearchRow v-for="(game, index) in filteredGames" :key="game.game_id" :game="game" :index="index" />
    </div>

    <div v-else-if="showFilters" class="empty-state">
      <GamepadIcon class="empty-icon" aria-hidden="true" />
      <p class="empty-title">{{ t('store_empty_title') }}</p>
      <p class="empty-hint">{{ t('store_empty_hint') }}</p>
      <button v-if="hasActiveFilters" type="button" class="clear-button" @click="clearFilters">
        {{ t('store_clear_filters') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.store-list {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
  font-family: 'Poppins', sans-serif;
  color: var(--light);
}

.list-title {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: clamp(1.4rem, 3vw, 1.9rem);
  margin: 0;
}

.filters {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  padding: 0.75rem;
  border-radius: 12px;
  background: var(--boly-bg-dark-blue);
  border: 1px solid rgba(251, 251, 251, 0.08);
}

.filter {
  display: flex;
  min-width: 0;
}

.filter-control {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  box-sizing: border-box;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  border: 1px solid rgba(251, 251, 251, 0.15);
  background: rgba(19, 10, 37, 0.45);
  color: var(--light);
  font-family: 'Poppins', sans-serif;
  font-size: 0.9rem;
  text-overflow: ellipsis;
}

.filter-control:focus {
  outline: 2px solid var(--boly-button-purple);
  outline-offset: 1px;
}

.filter-control.active {
  border-color: var(--boly-button-purple);
  background: rgba(188, 61, 228, 0.18);
}

/* The native dropdown panel is rendered white by the OS — don't let the
   options inherit the light on-dark text color of the select itself */
.filter-control option,
.filter-control optgroup {
  color: #1c1c24;
  background: #ffffff;
}

.results-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--light-gray);
  font-size: 0.85rem;
  padding: 0 0.25rem;
}

.link-button {
  border: none;
  background: transparent;
  color: var(--boly-button-light-blue);
  font-family: inherit;
  font-size: inherit;
  padding: 0.25rem 0;
  cursor: pointer;
}

.link-button:hover {
  text-decoration: underline;
}

.rows {
  display: flex;
  flex-direction: column;
}

/* Hairline separators instead of boxing every row (GameSearchRow draws its own). */
.skeleton-row + .skeleton-row {
  border-top: 1px solid rgba(84, 84, 84, 0.48);
}

.skeleton-row {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1.25rem;
  align-items: center;
  padding: 0.75rem;
}

.skeleton-capsule {
  aspect-ratio: 16 / 9;
}

.skeleton-text {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  text-align: center;
}

.empty-icon {
  width: 56px;
  height: 56px;
  fill: rgba(251, 251, 251, 0.3);
  margin-bottom: 0.5rem;
}

.empty-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.empty-hint {
  margin: 0;
  color: var(--light-gray);
  font-size: 0.9rem;
  max-width: 45ch;
}

.clear-button {
  margin-top: 0.75rem;
  min-height: 44px;
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: 8px;
  background: var(--boly-button-purple);
  color: var(--light);
  font-family: 'Poppins', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.clear-button:hover {
  background: var(--boly-button-purple-hover);
  transform: translateY(-1px);
}

.clear-button:active {
  transform: translateY(0);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 900px) {
  .filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .filter-search {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .store-list {
    padding: 1.25rem 0.75rem 2.5rem;
  }

  .filters {
    grid-template-columns: minmax(0, 1fr);
  }

  .skeleton-row {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 0.85rem;
  }
}
</style>
