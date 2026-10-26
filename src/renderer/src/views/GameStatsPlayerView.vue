<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRanking } from '@/stores'
import type { LocalizedString, MyGameStats, MyStats, RankingPeriod, RankingPosition, RankingScope } from '@/types'
import SkeletonList from '@/components/skeletons/SkeletonList.vue'
import ClockhistoryIcon from '@/components/icons/ClockhistoryIcon.vue'
import TrophyIcon from '@/components/icons/TrophyIcon.vue'
import { resolveImageUrl, PLACEHOLDER_IMAGE } from '@/utils/imageUrl'
import { formatPlayTime } from '@/utils/playTime'

// The player's own numbers: play time and achievements for the period, their
// place in each ranking, and every game they've played. One request — this
// used to ask for each game's play time one after another.
const PERIODS: RankingPeriod[] = ['week', 'month', 'all']
const SCOPES: RankingScope[] = ['course', 'institution', 'global']

const router = useRouter()
const { t, locale } = useI18n()
const rankingStore = useRanking()

// All time by default: a player's own totals mean most in full. The ranking
// itself opens on this week, where everyone starts level.
const period = ref<RankingPeriod>('all')
const stats = ref<MyStats | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)
let requestId = 0

const totals = computed(() => stats.value?.totals[period.value] ?? null)

const localized = (value: LocalizedString | null | undefined) =>
  value ? value[locale.value] || value.es || value.en || '' : ''

// A few legacy games store a JSON array of banner images — show the first.
function bannerOf(game: MyGameStats): string {
  const raw = game.banner_url?.trim()
  const path = raw?.startsWith('[') ? (JSON.parse(raw)[0] ?? null) : raw
  return resolveImageUrl(path) || PLACEHOLDER_IMAGE
}

function placeText(position: RankingPosition, which: 'playtime' | 'achievements'): string {
  const place = position[which]
  if (!place || place.rank == null) return t('stats_no_rank')
  return t('stats_rank_of', { rank: place.rank, players: place.players })
}

function positionNote(position: RankingPosition): string | null {
  switch (position.reason) {
    case 'no_course':
      return t('stats_no_course')
    case 'no_institution':
      return t('stats_no_institution')
    case 'not_opted_in':
      return t('stats_not_opted_in')
    default:
      return null
  }
}

function openRanking(scope: RankingScope) {
  router.push({ path: '/ranking', query: { scope, period: period.value } })
}

async function load() {
  const current = ++requestId
  isLoading.value = true
  error.value = null
  try {
    const result = await rankingStore.fetchMyStats(period.value)
    if (current === requestId) stats.value = result
  } catch (e) {
    console.error('Error loading player stats:', e)
    if (current === requestId) error.value = t('stats_load_error')
  } finally {
    if (current === requestId) isLoading.value = false
  }
}

watch(period, load)
onMounted(load)
</script>

<template>
  <div class="stats-page">
    <header class="stats-head">
      <h1 class="stats-title">{{ t('player_stats').toUpperCase() }}</h1>
      <div class="segmented" role="group" :aria-label="t('ranking_period_label')">
        <button
          v-for="p in PERIODS"
          :key="p"
          type="button"
          :class="{ active: period === p }"
          :aria-pressed="period === p"
          @click="period = p"
        >
          {{ t(`ranking_period_${p}`) }}
        </button>
      </div>
    </header>

    <SkeletonList v-if="isLoading && !stats" :rows="4" row-height="80px" />

    <div v-else-if="error" class="message" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="action-button" @click="load">{{ t('retry') }}</button>
    </div>

    <template v-else-if="stats && totals">
      <section class="totals" :class="{ 'is-refreshing': isLoading }">
        <div class="tile">
          <ClockhistoryIcon class="tile-icon" />
          <span class="tile-label">{{ t('stats_playtime') }}</span>
          <span class="tile-value">{{ formatPlayTime(totals.playtime_minutes) }}</span>
        </div>
        <div class="tile">
          <TrophyIcon class="tile-icon" />
          <span class="tile-label">{{ t('stats_achievements') }}</span>
          <span class="tile-value">{{ totals.achievements }}</span>
        </div>
      </section>

      <section v-if="stats.positions" class="block" :class="{ 'is-refreshing': isLoading }">
        <h2 class="block-title">{{ t('stats_positions_title') }}</h2>
        <div class="positions">
          <button
            v-for="scope in SCOPES"
            :key="scope"
            type="button"
            class="position"
            @click="openRanking(scope)"
          >
            <span class="position-scope">{{ t(`ranking_scope_${scope}`) }}</span>
            <span v-if="stats.positions[scope].name" class="position-name">
              {{ stats.positions[scope].name }}
            </span>
            <template v-if="positionNote(stats.positions[scope])">
              <span class="position-note">{{ positionNote(stats.positions[scope]) }}</span>
            </template>
            <template v-else>
              <span class="position-line">
                <ClockhistoryIcon class="line-icon" />
                {{ placeText(stats.positions[scope], 'playtime') }}
              </span>
              <span class="position-line">
                <TrophyIcon class="line-icon" />
                {{ placeText(stats.positions[scope], 'achievements') }}
              </span>
            </template>
            <span class="position-cta">{{ t('stats_view_ranking') }} →</span>
          </button>
        </div>
      </section>

      <section class="block">
        <h2 class="block-title">{{ t('stats_by_game') }}</h2>
        <p class="block-hint">{{ t('stats_by_game_hint') }}</p>

        <div v-if="stats.games.length === 0" class="message">
          <p>{{ t('stats_no_games') }}</p>
          <button type="button" class="action-button" @click="router.push('/library')">
            {{ t('go_to_games') }}
          </button>
        </div>

        <ul v-else class="games">
          <li v-for="game in stats.games" :key="game.game_id" class="game">
            <img :src="bannerOf(game)" :alt="localized(game.name)" class="game-banner" />
            <div class="game-info">
              <RouterLink :to="`/games/${game.game_id}`" class="game-name">
                {{ localized(game.name) }}
              </RouterLink>
              <span class="game-line">
                <ClockhistoryIcon class="line-icon" />
                {{ formatPlayTime(game.playtime_minutes) }}
              </span>
              <span v-if="game.achievements_total > 0" class="game-line">
                <TrophyIcon class="line-icon" />
                {{ game.achievements_unlocked }} / {{ game.achievements_total }}
                <span class="progress" aria-hidden="true">
                  <span
                    class="progress-fill"
                    :style="{ width: (100 * game.achievements_unlocked) / game.achievements_total + '%' }"
                  ></span>
                </span>
              </span>
            </div>
            <button
              v-if="game.achievements_total > 0"
              type="button"
              class="action-button"
              @click="router.push(`/games/${game.game_id}/achievements`)"
            >
              {{ t('see_achievements') }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.stats-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-width: 0;
  color: var(--light);
  font-family: 'Poppins', sans-serif;
}

.stats-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.stats-title {
  margin: 0;
  color: var(--light);
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: clamp(2rem, 5.5vw, 3rem);
  text-align: center;
}

.segmented {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: var(--boly-bg-dark-transparent);
  border: 1px solid rgba(251, 251, 251, 0.08);
}

.segmented button {
  padding: 0.4rem 1rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--light-gray);
  font-family: 'Poppins', sans-serif;
  font-size: 0.88rem;
  cursor: pointer;
}

.segmented button:hover {
  color: var(--light);
}

.segmented button.active {
  background: var(--boly-button-purple);
  color: white;
  font-weight: 600;
}

.is-refreshing {
  opacity: 0.55;
  transition: opacity 0.2s ease;
}

/* Totals for the period */
.totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.tile {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 0.9rem;
  align-items: center;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  background: var(--boly-button-blue);
}

.tile + .tile {
  background: var(--boly-button-pink);
}

.tile-icon {
  grid-row: span 2;
  width: 34px;
  height: 34px;
  fill: white;
}

.tile-label {
  font-size: 0.85rem;
  opacity: 0.9;
}

.tile-value {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 2rem;
  line-height: 1.1;
}

/* Sections */
.block {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.block-title {
  margin: 0;
  font-family: 'Anton', Impact, sans-serif;
  font-style: italic;
  font-size: 1.5rem;
  font-weight: normal;
}

.block-hint {
  margin: -0.4rem 0 0;
  color: var(--light-gray);
  font-size: 0.85rem;
}

/* Ranking positions */
.positions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.position {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.3rem;
  padding: 0.9rem 1.1rem;
  border-radius: 14px;
  border: 1px solid rgba(251, 251, 251, 0.08);
  background: rgba(251, 251, 251, 0.03);
  color: var(--light);
  font-family: 'Poppins', sans-serif;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.position:hover,
.position:focus-visible {
  border-color: var(--boly-button-purple);
}

.position-scope {
  font-family: 'Anton', Impact, sans-serif;
  font-style: italic;
  font-size: 1.2rem;
}

.position-name {
  color: var(--light-gray);
  font-size: 0.82rem;
}

.position-line,
.game-line {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.92rem;
}

.position-note {
  color: var(--light-gray);
  font-size: 0.88rem;
}

.position-cta {
  margin-top: auto;
  padding-top: 0.3rem;
  color: var(--boly-button-light-blue);
  font-size: 0.82rem;
}

.line-icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
  flex-shrink: 0;
}

/* Per game */
.games {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.game {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 14px;
  background: rgba(251, 251, 251, 0.03);
  border: 1px solid rgba(251, 251, 251, 0.08);
}

.game-banner {
  width: 120px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
}

.game-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.game-name {
  color: var(--light);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.game-name:hover {
  color: var(--boly-button-light-blue);
}

.progress {
  display: inline-block;
  width: 90px;
  height: 4px;
  border-radius: 999px;
  background: rgba(251, 251, 251, 0.12);
  overflow: hidden;
}

.progress-fill {
  display: block;
  height: 100%;
  background: var(--boly-featured-green);
}

.action-button {
  padding: 0.5rem 1.1rem;
  border: none;
  border-radius: 5px;
  background: var(--boly-button-blue);
  color: white;
  font-family: 'Poppins', sans-serif;
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
}

.action-button:hover {
  background: var(--boly-button-blue-hover);
}

.message {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--light-gray);
}

@media (max-width: 600px) {
  .game {
    flex-wrap: wrap;
  }

  .game-banner {
    width: 96px;
  }
}
</style>
