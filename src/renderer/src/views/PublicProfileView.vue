<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAchievements, useUser } from '@/stores'
import type { LocalizedString, PublicProfile, PublicProfileGame } from '@/types'
import AchievementItem from '@/components/achievements/AchievementItem.vue'
import SkeletonList from '@/components/skeletons/SkeletonList.vue'

// A player's public profile: who they are on Boly and the achievements of
// every game they play, with progress. Public by design (no login needed);
// the API never sends email, birthday, institution or course.
const route = useRoute()
const { t, locale } = useI18n()
const user = useUser()
const achievementsStore = useAchievements()

const username = computed(() => String(route.params.username ?? ''))
const profile = ref<PublicProfile | null>(null)
const isLoading = ref(true)
const notFound = ref(false)
const error = ref<string | null>(null)
// Banners that failed to load (dead legacy paths) are dropped, not shown broken.
const brokenBanners = ref(new Set<number>())
// Game cards start collapsed past the first few so long profiles stay scannable.
const expanded = ref(new Set<number>())

const isMe = computed(() => !!user.username && user.username.toLowerCase() === username.value.toLowerCase())

const localized = (value: LocalizedString | null | undefined) =>
  value ? value[locale.value] || value.es || value.en || '' : ''

const memberSince = computed(() =>
  profile.value
    ? new Date(profile.value.member_since).toLocaleDateString(locale.value, { month: 'long', year: 'numeric' })
    : ''
)

const bannerOf = (game: PublicProfileGame) => {
  const raw = game.banner_url
  if (!raw || brokenBanners.value.has(game.game_id)) return null
  // A few legacy games store a JSON array of banner images — show the first.
  const path = raw.trim().startsWith('[') ? (JSON.parse(raw)[0] ?? null) : raw
  return path && (path.startsWith('http') || path.startsWith('/') ? path : '/' + path)
}

async function load() {
  isLoading.value = true
  notFound.value = false
  error.value = null
  try {
    profile.value = await achievementsStore.fetchProfile(username.value)
    expanded.value = new Set(profile.value.games.slice(0, 3).map((g) => g.game_id))
  } catch (e: any) {
    profile.value = null
    if (e.response?.status === 404) notFound.value = true
    else error.value = t('profile_load_error')
  } finally {
    isLoading.value = false
  }
}

function toggle(gameId: number) {
  const next = new Set(expanded.value)
  if (next.has(gameId)) next.delete(gameId)
  else next.add(gameId)
  expanded.value = next
}

onMounted(load)
watch(username, load)
</script>

<template>
  <div class="profile-page">
    <SkeletonList v-if="isLoading" :rows="4" row-height="80px" />

    <div v-else-if="notFound" class="message">
      <h1 class="profile-title">{{ t('profile_not_found_title') }}</h1>
      <p>{{ t('profile_not_found', { username }) }}</p>
    </div>

    <div v-else-if="error" class="message" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="button btn-blue" @click="load">{{ t('retry') }}</button>
    </div>

    <template v-else-if="profile">
      <header class="profile-header">
        <img
          v-if="profile.profile_picture_url"
          :src="profile.profile_picture_url"
          :alt="profile.username"
          class="avatar"
        />
        <div v-else class="avatar initials" aria-hidden="true">{{ profile.username.slice(0, 1).toUpperCase() }}</div>
        <div class="identity">
          <h1 class="profile-title">{{ profile.username }}</h1>
          <p class="meta">
            {{ t('profile_member_since', { date: memberSince }) }} ·
            {{ t('profile_achievements_count', { count: profile.achievements_unlocked }) }}
          </p>
          <p v-if="profile.bio" class="bio">{{ profile.bio }}</p>
          <RouterLink v-if="isMe" to="/edit" class="edit-link">{{ t('edit_profile') }} →</RouterLink>
        </div>
      </header>

      <p v-if="profile.games.length === 0" class="message">
        {{ isMe ? t('profile_no_games_me') : t('profile_no_games') }}
      </p>

      <section v-for="game in profile.games" :key="game.game_id" class="game">
        <button
          type="button"
          class="game-head"
          :aria-expanded="expanded.has(game.game_id)"
          @click="toggle(game.game_id)"
        >
          <img
            v-if="bannerOf(game)"
            :src="bannerOf(game)!"
            alt=""
            class="game-banner"
            @error="brokenBanners = new Set([...brokenBanners, game.game_id])"
          />
          <span class="game-name">{{ localized(game.name) }}</span>
          <span class="game-count">{{ game.unlocked }}/{{ game.total }}</span>
          <span class="chevron" aria-hidden="true">{{ expanded.has(game.game_id) ? '▾' : '▸' }}</span>
        </button>
        <div class="game-progress" aria-hidden="true">
          <div class="fill" :style="{ width: `${game.total ? Math.round((game.unlocked / game.total) * 100) : 0}%` }" />
        </div>

        <div v-if="expanded.has(game.game_id)" class="list">
          <AchievementItem v-for="a in game.achievements" :key="a.achievement_id" :achievement="a" />
          <RouterLink :to="`/games/${game.game_id}`" class="game-link">{{ t('profile_view_game') }} →</RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-width: 0;
  color: var(--light);
  font-family: 'Poppins', sans-serif;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.avatar.initials {
  display: grid;
  place-items: center;
  background: var(--boly-button-purple);
  font-family: 'Anton', Impact, sans-serif;
  font-size: 2.4rem;
}

.identity {
  min-width: 0;
}

.profile-title {
  color: var(--light);
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: clamp(1.6rem, 5vw, 2.2rem);
  margin: 0;
  overflow-wrap: anywhere;
}

.meta {
  margin: 0.25rem 0 0;
  color: var(--light-gray);
  font-size: 0.88rem;
}

.bio {
  margin: 0.5rem 0 0;
  font-size: 0.92rem;
  max-width: 60ch;
}

.edit-link,
.game-link {
  display: inline-block;
  margin-top: 0.5rem;
  color: var(--boly-button-light-blue);
  font-size: 0.88rem;
}

.game {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  background: rgba(251, 251, 251, 0.03);
  border: 1px solid rgba(251, 251, 251, 0.08);
}

.game-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  min-height: 44px;
  border: none;
  background: transparent;
  color: var(--light);
  font-family: 'Poppins', sans-serif;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.game-head:focus-visible {
  outline: 2px solid var(--boly-button-purple);
  outline-offset: 4px;
  border-radius: 8px;
}

.game-banner {
  width: 72px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.game-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 1rem;
}

.game-count {
  font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85rem;
  color: var(--light-gray);
}

.chevron {
  color: var(--light-gray);
}

.game-progress {
  height: 4px;
  border-radius: 999px;
  background: rgba(251, 251, 251, 0.1);
  overflow: hidden;
}

.game-progress .fill {
  height: 100%;
  background: var(--boly-featured-green);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.message {
  text-align: center;
  color: var(--light-gray);
  padding: 2rem 0;
}

@media (max-width: 560px) {
  .avatar {
    width: 72px;
    height: 72px;
  }
}
</style>
