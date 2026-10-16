<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import axios from 'axios'
import { useAuth, useAchievements, useUser } from '@/stores'
import type { GameAchievementsResponse, LocalizedString } from '@/types'
import AchievementItem from '@/components/achievements/AchievementItem.vue'
import SkeletonList from '@/components/skeletons/SkeletonList.vue'

// A game's achievements. Anyone can look; a logged-in player also sees their
// own progress and the hidden achievements they've unlocked.
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const auth = useAuth()
const user = useUser()
const achievementsStore = useAchievements()

const gameId = computed(() => Number(route.params.id))
const gameName = ref('')
const data = ref<GameAchievementsResponse | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)

const localized = (value: LocalizedString | null | undefined) =>
  value ? value[locale.value] || value.es || value.en || '' : ''

async function load() {
  isLoading.value = true
  error.value = null
  try {
    const [game, achievements] = await Promise.all([
      axios.get(`/v1/games/${gameId.value}`),
      achievementsStore.fetchGameAchievements(gameId.value)
    ])
    gameName.value = localized(game.data.name)
    data.value = achievements
  } catch (e: any) {
    console.error('Error loading achievements:', e)
    error.value = e.response?.status === 404 ? t('ach_game_not_found') : t('ach_load_error')
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
watch(gameId, load)
</script>

<template>
  <div class="ach-page">
    <button type="button" class="back-link" @click="router.back()">← {{ t('back') }}</button>

    <header class="ach-header">
      <h1 class="ach-title">{{ t('ach_game_title', { game: gameName }) }}</h1>
      <p v-if="data && auth.isLoggedIn" class="summary">
        {{ t('ach_summary', { unlocked: data.unlocked, total: data.total }) }}
        <RouterLink v-if="user.username" :to="`/u/${user.username}`" class="profile-link">
          {{ t('ach_see_my_profile') }} →
        </RouterLink>
      </p>
      <p v-else-if="data" class="summary">{{ t('ach_login_hint', { total: data.total }) }}</p>
    </header>

    <SkeletonList v-if="isLoading" :rows="5" row-height="80px" />

    <div v-else-if="error" class="error" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="button btn-blue" @click="load">{{ t('retry') }}</button>
    </div>

    <p v-else-if="data && data.achievements.length === 0" class="empty">{{ t('ach_none_yet') }}</p>

    <div v-else-if="data" class="list">
      <AchievementItem v-for="a in data.achievements" :key="a.achievement_id" :achievement="a" />
    </div>
  </div>
</template>

<style scoped>
.ach-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-width: 0;
  color: var(--light);
}

.back-link {
  align-self: flex-start;
  border: none;
  background: transparent;
  color: var(--boly-button-light-blue);
  font-family: 'Poppins', sans-serif;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0.25rem 0;
}

.back-link:hover {
  text-decoration: underline;
}

.ach-title {
  color: var(--light);
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: clamp(1.5rem, 4vw, 2rem);
  margin: 0;
}

.summary {
  margin: 0.35rem 0 0;
  font-family: 'Poppins', sans-serif;
  color: var(--light-gray);
  font-size: 0.9rem;
}

.profile-link {
  margin-left: 0.75rem;
  color: var(--boly-button-light-blue);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.empty,
.error {
  font-family: 'Poppins', sans-serif;
  color: var(--light-gray);
  text-align: center;
  padding: 2rem 0;
}
</style>
