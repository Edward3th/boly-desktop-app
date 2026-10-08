<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useCurriculum, useGames } from '@/stores'
import type { Game, GameEducationSummary } from '@/types'
import { useGameFilters } from '@/composables/useGameFilters'
import GameFilters from '@/components/games/GameFilters.vue'
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
const gamesStore = useGames()
const curriculum = useCurriculum()
const { loading, games } = storeToRefs(gamesStore)

onMounted(() => {
  if (!games.value.length) gamesStore.getAll()
})

const listedGames = computed(() => games.value.filter((game) => game.game_id !== props.excludeGameId))
const { query, gradeCode, groupSlug, gameType, hasActiveFilters, clearFilters, filteredGames } = useGameFilters(
  listedGames,
  { syncUrl: props.showFilters }
)

const subjectGroupIds = (summary: GameEducationSummary | null | undefined) =>
  new Set(
    (summary?.targets ?? [])
      .map((target) => curriculum.subjectById.get(target.subject_id)?.subject_group_id)
      .filter((id): id is number => id !== undefined)
  )

const shownGames = computed<Game[]>(() => {
  if (!props.relatedTo) return filteredGames.value
  const related = subjectGroupIds(props.relatedTo)
  const sharesSubject = (game: Game) => [...subjectGroupIds(game.education)].some((id) => related.has(id))
  return [...filteredGames.value].sort((a, b) => Number(sharesSubject(b)) - Number(sharesSubject(a)))
})

// Remounting the rows replays the cascade-in when a select changes, but not on
// every keystroke in the search box.
const rowsKey = computed(() => `${gradeCode.value}|${groupSlug.value}|${gameType.value}|${locale.value}`)
</script>

<template>
  <section class="store-list">
    <h2 v-if="title" class="list-title">{{ title }}</h2>

    <GameFilters
      v-if="showFilters"
      v-model:query="query"
      v-model:grade-code="gradeCode"
      v-model:group-slug="groupSlug"
      v-model:game-type="gameType"
    />

    <div v-if="showFilters && !(loading && !games.length)" class="results-bar">
      <span aria-live="polite">{{ t('store_results', shownGames.length) }}</span>
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

    <div v-else-if="shownGames.length > 0" :key="rowsKey" class="rows">
      <GameSearchRow v-for="(game, index) in shownGames" :key="game.game_id" :game="game" :index="index" />
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

@media (max-width: 768px) {
  .store-list {
    padding: 1.25rem 0.75rem 2.5rem;
  }

  .skeleton-row {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 0.85rem;
  }
}
</style>
