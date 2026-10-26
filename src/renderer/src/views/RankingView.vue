<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRanking, useUser } from '@/stores'
import type { RankingMetric, RankingPeriod, RankingResponse, RankingScope } from '@/types'
import SkeletonList from '@/components/skeletons/SkeletonList.vue'
import { formatPlayTime } from '@/utils/playTime'

// Players compared by play time or unlocked achievements, inside their course,
// their school or across Boly. The API decides who is in each list; the
// global one only holds players who opted in, which is switched on here.
const ROLE_ADMIN = 1
const ROLE_USER = 2
const ROLE_EDUCATOR = 4

const SCOPES: RankingScope[] = ['course', 'institution', 'global']
const METRICS: RankingMetric[] = ['playtime', 'achievements']
const PERIODS: RankingPeriod[] = ['week', 'month', 'all']

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const user = useUser()
const rankingStore = useRanking()

const isPlayer = computed(() => Number(user.roleId) === ROLE_USER)

// Educators have no course of their own and admins no school, so those tabs
// would only ever be empty for them.
const scopes = computed(() => {
  const role = Number(user.roleId)
  if (role === ROLE_ADMIN) return SCOPES.filter((s) => s === 'global')
  if (role === ROLE_EDUCATOR) return SCOPES.filter((s) => s !== 'course')
  return SCOPES
})

// The selection lives in the query string, so coming back from a player's
// profile lands on the same list.
function fromQuery<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? (value as T) : fallback
}
const scope = ref<RankingScope>(fromQuery(route.query.scope, scopes.value, scopes.value[0]))
const metric = ref<RankingMetric>(fromQuery(route.query.metric, METRICS, 'playtime'))
const period = ref<RankingPeriod>(fromQuery(route.query.period, PERIODS, 'week'))

const data = ref<RankingResponse | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)
const isSaving = ref(false)
let requestId = 0

const board = computed(() => (data.value?.available ? data.value : null))

const showInGlobal = computed(() => board.value?.scope === 'global' && board.value.me?.in_ranking === true)

const periodCaption = computed(() => {
  const start = board.value?.period_start
  if (!start) return t('ranking_since_all')
  const [year, month, day] = start.split('-').map(Number)
  const date = new Date(year, month - 1, day).toLocaleDateString(locale.value, { day: 'numeric', month: 'long' })
  return t(period.value === 'week' ? 'ranking_since_week' : 'ranking_since_month', { date })
})

// The player's own line under the list: only when their row isn't already
// on screen (outside the top) or they have no position yet.
const meNote = computed(() => {
  const me = board.value?.me
  if (!me || !me.in_ranking) return null
  if (me.rank == null) return t('ranking_me_unranked')
  if (board.value!.entries.some((e) => e.is_me)) return null
  return t('ranking_me_rank', { rank: me.rank, value: valueText(me.playtime_minutes, me.achievements) })
})

function valueText(playtimeMinutes: number, achievements: number, which: RankingMetric = metric.value) {
  return which === 'playtime' ? formatPlayTime(playtimeMinutes) : t('ranking_achievements_count', achievements)
}

async function load() {
  const current = ++requestId
  isLoading.value = true
  error.value = null
  try {
    const result = await rankingStore.fetchRanking(scope.value, metric.value, period.value)
    if (current === requestId) data.value = result
  } catch (e) {
    console.error('Error loading ranking:', e)
    if (current === requestId) error.value = t('ranking_load_error')
  } finally {
    if (current === requestId) isLoading.value = false
  }
}

async function toggleGlobal() {
  if (isSaving.value) return
  isSaving.value = true
  try {
    await rankingStore.setShowInGlobalRanking(!showInGlobal.value)
    await load()
  } catch (e) {
    console.error('Error saving the global ranking setting:', e)
    error.value = t('ranking_toggle_error')
  } finally {
    isSaving.value = false
  }
}

// Navigating to /ranking while already on it reuses this component: follow
// the query, keeping the current choice for anything it leaves out.
watch(
  () => route.query,
  (query) => {
    scope.value = fromQuery(query.scope, scopes.value, scope.value)
    metric.value = fromQuery(query.metric, METRICS, metric.value)
    period.value = fromQuery(query.period, PERIODS, period.value)
  }
)

// The role arrives with the user record; if it hides the open tab, move on.
watch(scopes, (list) => {
  if (!list.includes(scope.value)) scope.value = list[0]
})

watch([scope, metric, period], () => {
  router.replace({ query: { scope: scope.value, metric: metric.value, period: period.value } })
  load()
})

onMounted(load)
</script>

<template>
  <div class="ranking-page">
    <header class="ranking-head">
      <h1 class="ranking-title">{{ t('ranking_title') }}</h1>
      <p class="ranking-sub">{{ t('ranking_subtitle') }}</p>
    </header>

    <nav class="scope-tabs" role="tablist" :aria-label="t('ranking_title')">
      <button
        v-for="s in scopes"
        :key="s"
        type="button"
        role="tab"
        class="scope-tab"
        :class="{ active: scope === s }"
        :aria-selected="scope === s"
        @click="scope = s"
      >
        {{ t(`ranking_scope_${s}`) }}
      </button>
    </nav>

    <div class="controls">
      <div class="segmented" role="group" :aria-label="t('ranking_metric_label')">
        <button
          v-for="m in METRICS"
          :key="m"
          type="button"
          :class="{ active: metric === m }"
          :aria-pressed="metric === m"
          @click="metric = m"
        >
          {{ t(`ranking_metric_${m}`) }}
        </button>
      </div>
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
    </div>

    <!-- The global ranking is opt-in: nobody is listed until they say so. -->
    <section v-if="scope === 'global' && isPlayer && board" class="optin">
      <div class="optin-text">
        <h2>{{ t('ranking_optin_title') }}</h2>
        <p>{{ t('ranking_optin_desc') }}</p>
      </div>
      <button
        type="button"
        role="switch"
        class="switch"
        :class="{ on: showInGlobal }"
        :aria-checked="showInGlobal"
        :aria-label="t('ranking_optin_title')"
        :disabled="isSaving"
        @click="toggleGlobal"
      >
        <span class="switch-knob"></span>
        <span class="switch-label">{{ showInGlobal ? t('ranking_optin_on') : t('ranking_optin_off') }}</span>
      </button>
    </section>

    <SkeletonList v-if="isLoading && !data" :rows="6" row-height="64px" />

    <div v-else-if="error" class="message" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="retry-button" @click="load">{{ t('retry') }}</button>
    </div>

    <p v-else-if="data && !data.available" class="notice">
      {{ t(data.reason === 'no_course' ? 'ranking_no_course' : 'ranking_no_institution') }}
    </p>

    <template v-else-if="board">
      <p class="caption">
        <span v-if="board.scope_name" class="caption-name">{{ board.scope_name }}</span>
        <span>{{ periodCaption }}</span>
        <span>{{ t('ranking_players', board.players) }}</span>
      </p>

      <ol v-if="board.entries.length" class="board" :class="{ 'is-refreshing': isLoading }">
        <li
          v-for="entry in board.entries"
          :key="entry.username"
          class="row"
          :class="[{ 'is-me': entry.is_me }, entry.rank <= 3 ? `top-${entry.rank}` : '']"
        >
          <span class="rank">{{ entry.rank }}</span>
          <img
            v-if="entry.profile_picture_url"
            :src="entry.profile_picture_url"
            alt=""
            class="avatar"
          />
          <span v-else class="avatar initials" aria-hidden="true">
            {{ entry.username.slice(0, 1).toUpperCase() }}
          </span>
          <span class="who">
            <RouterLink :to="`/u/${entry.username}`" class="username">{{ entry.username }}</RouterLink>
            <span v-if="entry.is_me" class="you">{{ t('ranking_you') }}</span>
            <span v-if="entry.course_name" class="course">{{ entry.course_name }}</span>
          </span>
          <span class="value">{{ valueText(entry.playtime_minutes, entry.achievements) }}</span>
          <span class="value-secondary">
            {{
              valueText(
                entry.playtime_minutes,
                entry.achievements,
                metric === 'playtime' ? 'achievements' : 'playtime'
              )
            }}
          </span>
        </li>
      </ol>

      <p v-else class="message">{{ t('ranking_empty') }}</p>

      <p v-if="meNote" class="me-note">{{ meNote }}</p>
    </template>
  </div>
</template>

<style scoped>
.ranking-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  min-width: 0;
  color: var(--light);
  font-family: 'Poppins', sans-serif;
}

.ranking-head {
  text-align: center;
}

.ranking-title {
  margin: 0;
  color: var(--light);
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: clamp(2.2rem, 6vw, 3rem);
}

.ranking-sub {
  margin: 0.25rem 0 0;
  color: var(--light-gray);
}

/* Scope tabs: the three lists a player belongs to */
.scope-tabs {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.scope-tab {
  min-width: 140px;
  padding: 0.55rem 1.5rem;
  border: none;
  border-radius: 5px;
  background-color: var(--boly-button-pink);
  color: white;
  font-family: 'Anton', Impact, sans-serif;
  font-style: italic;
  font-size: 1.15rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.scope-tab:hover {
  background-color: var(--boly-button-pink-hover);
}

.scope-tab.active {
  background-color: var(--boly-button-light-blue);
}

/* Metric and period pickers */
.controls {
  display: flex;
  justify-content: center;
  gap: 0.75rem 1.25rem;
  flex-wrap: wrap;
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

/* Global opt-in */
.optin {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  flex-wrap: wrap;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  background: var(--boly-bg-dark-transparent);
  border: 1px solid rgba(251, 251, 251, 0.08);
}

.optin-text {
  flex: 1 1 22rem;
  min-width: 0;
}

.optin-text h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.optin-text p {
  margin: 0.2rem 0 0;
  color: var(--light-gray);
  font-size: 0.88rem;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--light);
  font-family: 'Poppins', sans-serif;
  font-size: 0.88rem;
  cursor: pointer;
}

.switch:disabled {
  opacity: 0.6;
  cursor: wait;
}

.switch-knob {
  position: relative;
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: rgba(251, 251, 251, 0.2);
  transition: background-color 0.2s ease;
}

.switch-knob::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s ease;
}

.switch.on .switch-knob {
  background: var(--boly-featured-green);
}

.switch.on .switch-knob::after {
  transform: translateX(20px);
}

.switch:focus-visible .switch-knob {
  outline: 2px solid var(--boly-button-purple);
  outline-offset: 3px;
}

/* The list */
.caption {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  margin: 0;
  color: var(--light-gray);
  font-size: 0.88rem;
}

.caption-name {
  color: var(--light);
  font-weight: 600;
}

.board {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: opacity 0.2s ease;
}

.board.is-refreshing {
  opacity: 0.55;
}

.row {
  display: grid;
  grid-template-columns: 2.6rem 44px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.9rem;
  padding: 0.65rem 1rem;
  border-radius: 14px;
  background: rgba(251, 251, 251, 0.03);
  border: 1px solid rgba(251, 251, 251, 0.08);
}

.row.is-me {
  background: rgba(188, 61, 228, 0.18);
  border-color: var(--boly-button-purple);
}

.rank {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  background: rgba(251, 251, 251, 0.08);
  font-family: 'Anton', Impact, sans-serif;
  font-size: 1.15rem;
}

.top-1 .rank {
  background: #f5c542;
  color: var(--boly-bg-darker);
}

.top-2 .rank {
  background: #c9d2e3;
  color: var(--boly-bg-darker);
}

.top-3 .rank {
  background: #d98c4a;
  color: var(--boly-bg-darker);
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar.initials {
  display: grid;
  place-items: center;
  background: var(--boly-button-purple);
  font-family: 'Anton', Impact, sans-serif;
  font-size: 1.3rem;
}

.who {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem 0.6rem;
  min-width: 0;
}

.username {
  color: var(--light);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.username:hover {
  color: var(--boly-button-light-blue);
}

.you,
.course {
  padding: 0.05rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
}

.you {
  background: var(--boly-button-purple);
}

.course {
  background: rgba(72, 172, 228, 0.18);
  color: var(--boly-button-light-blue);
}

.value {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 1.25rem;
  text-align: right;
  white-space: nowrap;
}

.value-secondary {
  min-width: 6.5rem;
  color: var(--light-gray);
  font-size: 0.82rem;
  text-align: right;
  white-space: nowrap;
}

.me-note,
.notice {
  margin: 0;
  padding: 0.85rem 1.25rem;
  border-left: 4px solid var(--boly-button-purple);
  border-radius: 5px;
  background: var(--boly-bg-dark-transparent);
}

.notice {
  border-left-color: var(--boly-button-pink);
}

.message {
  margin: 0;
  padding: 2rem 0;
  text-align: center;
  color: var(--light-gray);
}

.retry-button {
  margin-top: 0.75rem;
  padding: 0.5rem 1.5rem;
  border: none;
  border-radius: 5px;
  background: var(--boly-button-blue);
  color: white;
  cursor: pointer;
}

@media (max-width: 600px) {
  .row {
    grid-template-columns: 2.2rem 36px minmax(0, 1fr) auto;
    gap: 0.6rem;
  }

  .avatar {
    width: 36px;
    height: 36px;
  }

  .value-secondary {
    display: none;
  }
}
</style>
