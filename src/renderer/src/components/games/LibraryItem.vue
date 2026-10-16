<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuth, useAchievements } from '@/stores'
import type { Game, GameAchievement, LocalizedString } from '@/types'
import PlayIcon from '@/components/icons/PlayIcon.vue'
import DownloadIcon from '@/components/icons/DownloadIcon.vue'

const props = defineProps<{
  loading?: boolean
  item: Game
}>()

const i18n = useI18n()
const router = useRouter()
const auth = useAuth()
const achievementsStore = useAchievements()
const isLoading = ref(false)
const gameAchievements = ref<GameAchievement[]>([])

const localized = (value: LocalizedString | null | undefined) =>
  value?.[i18n.locale.value] || value?.es || value?.en || ''
const achievementsLoading = ref(true)

console.log('LibraryItem received game:', props.item)

const displayedAchievements = computed(() => {
  return gameAchievements.value.slice(0, 4)
})

const hasAchievements = computed(() => {
  return gameAchievements.value.length > 0
})

const gameCompletionPercentage = computed(() => {
  if (!gameAchievements.value.length) return 0

  const totalAchievements = gameAchievements.value.length
  const completedAchievements = gameAchievements.value.filter((a) => a.unlocked).length

  return Math.floor((completedAchievements / totalAchievements) * 100)
})

async function fetchGameAchievements() {
  if (!props.item.game_id || !auth.token) return

  achievementsLoading.value = true
  try {
    const result = await achievementsStore.fetchGameAchievements(props.item.game_id)
    // Unlocked ones first: they're the player's trophies on this row.
    gameAchievements.value = [...result.achievements].sort((a, b) => Number(b.unlocked) - Number(a.unlocked))
  } catch (error) {
    console.error('Error fetching achievements:', error)
  } finally {
    achievementsLoading.value = false
  }
}

onMounted(() => {
  fetchGameAchievements()
})

async function Play() {
  if (props.item.game_id) {
    router.push(`/games/${props.item.game_id}/play`)
  }
}

async function Download() {
  if (isLoading.value) return
  isLoading.value = true
  try {
    if (props.item.game_id && auth.token) {
      //await games.downloadGame(props.item.game_id, { token: auth.token })
    }
  } catch (error) {
    console.error('Error downloading game:', error)
  } finally {
    isLoading.value = false
  }
}

function navigateToGameDetails() {
  if (props.item.game_id) {
    router.push(`/games/${props.item.game_id}`)
  }
}
</script>

<template>
  <div v-if="props.loading" class="library-item">
    <div class="sk sk-banner"></div>
    <div class="game-info sk-body">
      <div class="sk-padded">
        <div class="sk sk-title"></div>
      </div>
      <div class="sk-section">
        <div class="sk sk-label"></div>
        <div class="sk sk-block"></div>
      </div>
      <div class="sk-actions">
        <div class="sk sk-action-btn"></div>
      </div>
    </div>
  </div>
  <div v-else class="library-item" @click="navigateToGameDetails">
    <img :src="props.item.banner_url" class="game-banner" />
    <div class="game-info">
      <div class="title-section">
        <h3>{{ props.item.name[i18n.locale.value] }}</h3>
        <div v-if="!achievementsLoading && hasAchievements" class="completion-indicator">
          <div class="completion-bar">
            <div
              class="completion-progress"
              :style="{ width: `${gameCompletionPercentage}%` }"
            ></div>
          </div>
          <span class="completion-text">{{ gameCompletionPercentage }}%</span>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Achievements Section -->
      <div class="achievements-section">
        <h4 class="section-label">{{ $t('achievements') }}</h4>
        <div class="achievements-container">
          <div v-if="achievementsLoading" class="achievements-loading">
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
          </div>
          <div v-else-if="hasAchievements" class="achievements-icons">
            <div
              v-for="achievement in displayedAchievements"
              :key="achievement.achievement_id"
              class="achievement-icon-wrapper"
            >
              <div class="achievement-tooltip">
                <strong>{{ localized(achievement.name) || $t('ach_hidden_name') }}</strong>
                <p>{{ localized(achievement.description) || (achievement.name ? '' : $t('ach_hidden_description')) }}</p>
              </div>
              <div class="achievement-frame">
                <img
                  v-if="achievement.icon_url"
                  :src="achievement.icon_url"
                  :class="{ 'achievement-icon': true, locked: !achievement.unlocked }"
                  alt="Achievement Icon"
                />
                <span v-else :class="{ 'achievement-icon': true, locked: !achievement.unlocked }" aria-hidden="true">★</span>
              </div>
              <div
                v-if="!achievement.unlocked && (achievement.target ?? 1) > 1 && achievement.current !== null"
                class="achievement-progress"
              >
                <div class="progress-bar" :style="{ width: `${Math.round(((achievement.current ?? 0) / (achievement.target ?? 1)) * 100)}%` }"></div>
              </div>
            </div>
          </div>
          <div v-else class="no-achievements">
            {{ $t('no_achievements') }}
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="game-actions">
        <button
          v-if="props.item.game_type_id === 2"
          class="action-button play-button"
          @click.stop="Play"
        >
          <span class="button-text">{{ $t('play') }}</span>
          <PlayIcon class="icon" />
        </button>
        <button
          v-else
          class="action-button download-button"
          :disabled="isLoading"
          @click.stop="Download"
        >
          <span class="button-text">{{ isLoading ? $t('downloading') : $t('download') }}</span>
          <DownloadIcon class="icon" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes skeleton-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.sk {
  background: linear-gradient(90deg, rgba(255,255,255,0.12) 25%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.12) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.6s infinite;
  border-radius: 6px;
}

.sk-banner { width: 100%; height: 160px; border-radius: 0; }
.sk-body { display: flex; flex-direction: column; }
.sk-padded { padding: 1rem 1.2rem 0.5rem; }
.sk-title { width: 55%; height: 20px; }
.sk-section { padding: 0.4rem 1rem 0.8rem; display: flex; flex-direction: column; gap: 0.4rem; }
.sk-label { width: 35%; height: 12px; }
.sk-block { width: 100%; height: 50px; border-radius: 8px; }
.sk-actions { padding: 0.8rem 1rem 1.2rem; display: flex; justify-content: center; }
.sk-action-btn { width: 150px; height: 42px; border-radius: 8px; }

.library-item {
  width: 290px;
  border-radius: 20px;
  overflow: hidden;
  background: var(--color-background-soft);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  cursor: pointer;
  position: relative;
}

.library-item:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

.game-banner {
  width: 100%;
  height: 160px;
  object-fit: cover;
  border-bottom: 3px solid var(--boly-button-blue);
}

.game-info {
  background: linear-gradient(
    to bottom,
    var(--color-background-soft) 0%,
    rgba(30, 30, 40, 0.95) 100%
  );
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* Title section with completion indicator */
.title-section {
  padding: 1rem 1.2rem 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.title-section h3 {
  margin: 0;
  font-family: 'Anton', Impact, sans-serif;
  font-style: italic;
  font-size: 1.3rem;
  color: white;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3);
  flex: 1;
}

.completion-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
}

.completion-bar {
  width: 40px;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  overflow: hidden;
}

.completion-progress {
  height: 100%;
  background: var(--boly-button-blue);
  border-radius: 3px;
}

.completion-text {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.8);
  font-weight: bold;
}

/* Dividers between sections */
.divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.1), transparent);
  margin: 0 1rem;
}

/* Achievements section */
.achievements-section {
  padding: 0.5rem 1rem;
}

.section-label {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 1px;
  font-weight: 600;
}

.achievements-container {
  min-height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: 8px;
}

.achievements-icons {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.achievement-icon-wrapper {
  position: relative;
}

.achievement-frame {
  width: 34px;
  height: 34px;
  border-radius: 5px;
  padding: 2px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(3px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  display: flex;
  justify-content: center;
  align-items: center;
}

.achievement-icon-wrapper:hover .achievement-frame {
  background: rgba(var(--boly-button-blue-rgb, 30, 144, 255), 0.3);
  transform: translateY(-2px);
}

.achievement-icon {
  width: 30px;
  height: 30px;
  border-radius: 4px;
}

.achievement-icon.locked {
  filter: grayscale(100%);
  opacity: 0.6;
}

.achievement-icon-wrapper:hover .achievement-tooltip {
  display: block;
  transform: translateY(-5px);
  opacity: 1;
}

.achievement-tooltip {
  display: block;
  position: absolute;
  bottom: 110%;
  left: 50%;
  transform: translateX(-50%) translateY(0);
  background: linear-gradient(to bottom, rgba(40, 44, 52, 0.95), rgba(25, 28, 36, 0.95));
  color: white;
  padding: 10px;
  border-radius: 6px;
  width: 200px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  z-index: 100;
  font-size: 0.8rem;
  opacity: 0;
  pointer-events: none;
  transition: all 0.3s ease;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.achievement-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 6px;
  border-style: solid;
  border-color: rgba(25, 28, 36, 0.95) transparent transparent transparent;
}

.achievement-tooltip strong {
  display: block;
  margin-bottom: 6px;
  color: var(--boly-button-blue);
}

.achievement-tooltip p {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.4;
  opacity: 0.8;
}

.achievement-progress {
  height: 3px;
  width: 30px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
  margin-left: 2px;
}

.progress-bar {
  height: 100%;
  background-color: var(--boly-button-blue);
}

.no-achievements {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

.achievements-loading {
  display: flex;
  justify-content: center;
  gap: 4px;
  align-items: center;
}

.loading-dot {
  width: 6px;
  height: 6px;
  background-color: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  animation: dot-pulse 1.4s infinite ease-in-out;
}

.loading-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-pulse {
  0%,
  100% {
    transform: scale(0.6);
    opacity: 0.6;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Game Actions Section */
.game-actions {
  display: flex;
  justify-content: center;
  padding: 0.8rem 1rem 1.2rem;
}

.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.7rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-family: 'Anton', Impact, sans-serif;
  font-style: italic;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  position: relative;
  overflow: hidden;
  min-width: 150px;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.action-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0));
  pointer-events: none;
}

.play-button {
  background: linear-gradient(to bottom right, #2e7fd1, #1e5ea8);
  color: white;
}

.play-button:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 6px 12px rgba(30, 100, 200, 0.4);
  background: linear-gradient(to bottom right, #3b8ae0, #2568b9);
}

.download-button {
  background: linear-gradient(to bottom right, #464850, #2c2e35);
  color: white;
}

.download-button:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
  background: linear-gradient(to bottom right, #525460, #383a43);
}

.button-text {
  position: relative;
  z-index: 1;
}

.icon {
  width: 1.2em;
  height: 1.2em;
  position: relative;
  z-index: 1;
}

.download-button:disabled {
  opacity: 0.7;
  transform: none;
  cursor: not-allowed;
  box-shadow: none;
}

@media (max-width: 768px) {
  .library-item {
    width: 100%;
    max-width: 320px;
  }
}
</style>
