<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth, useAchievements, useGames } from '@/stores'
import useGameRoutes from '@/desktop-stores/gameRoutes'
import type { Game, Achievement, LocalizedString } from '@/types'
import PlayIcon from '@/components/icons/PlayIcon.vue'
import LoadingSpinnerIcon from '@/components/icons/LoadingSpinnerIcon.vue'
import DownloadIcon from '@/components/icons/DownloadIcon.vue'
import ClockhistoryIcon from '@/components/icons/ClockhistoryIcon.vue'
import VerticalDotsIcon from '@/components/icons/VerticalDotsIcon.vue'
import router from '@/router'
import { PLACEHOLDER_IMAGE, resolveImageUrl } from '@/utils/imageUrl'
import GameEducationMeta from '@/components/education/GameEducationMeta.vue'
import { recordPlayed } from '@/utils/recentlyPlayed'

const props = defineProps<{
  loading?: boolean
  item: Game
  /** Position in the list, for the staggered entrance. */
  index?: number
}>()

const i18n = useI18n()
const auth = useAuth()
const achievementsStore = useAchievements()
const gamesStore = useGames()
const gameRoutesStore = useGameRoutes()
const isLoading = ref(false)
const isDownloading = ref(false)
const isInstalling = ref(false)
const isRunning = ref(false)
const gameAchievements = ref<Achievement[]>([])
const achievementsLoading = ref(true)
const playTime = ref<number | null>(null)
const playTimeLoading = ref(true)
const showOptionsMenu = ref(false)

const localized = (value: LocalizedString | null | undefined) =>
  value?.[i18n.locale.value] || value?.es || value?.en || ''

const name = computed(() => localized(props.item.name))
// Games without educational content fall back to their long description,
// clamped to the same two lines as the store.
const description = computed(
  () => localized(props.item.education?.short_description) || localized(props.item.description)
)

// Full URLs (S3) pass through; legacy rows store a relative path (served from
// VITE_IMAGES_BASE_URL) or a JSON array of images (the first is the key art).
const bannerSrc = computed(() => {
  const raw = props.item.banner_url?.trim()
  if (!raw) return null
  let path = raw
  if (raw.startsWith('[')) {
    try {
      path = JSON.parse(raw)[0] ?? ''
    } catch {
      return null
    }
  }
  return path ? resolveImageUrl(path) : null
})
const imageFailed = ref(false)

// game_type rows are seeded as 1 = DLC, 2 = Web, 3 = Downloadable
const WEB_GAME_TYPE_ID = 2

// Legacy heuristic: the first embedded games stored a Vue ROUTE (e.g.
// "/sudoku-game") in file_name.desktop instead of a storage key, and predate
// the game_type column being reliable. Only a leading slash identifies one —
// S3 keys never start with "/", so uploaded builds are never mistaken for it.
const legacyEmbeddedRoute = computed(() => {
  const key = props.item.file_name?.desktop
  return typeof key === 'string' && key.startsWith('/') ? key : null
})

// Browser-playable: either the game's declared type, or a legacy embedded one.
const isWebGame = computed(
  () => props.item.game_type_id === WEB_GAME_TYPE_ID || legacyEmbeddedRoute.value !== null
)

// A build that was downloaded and extracted and turned out to be a web bundle
// (Unity WebGL, Godot HTML5, a plain Vite/Three.js export) rather than an
// executable. Distinct from isWebGame above: those play without installing and
// are served remotely, this one is an ordinary Downloadable that happens to run
// in the player instead of as a process.
const isLocalHtmlBuild = computed(() => props.item.game_Kind === 'html')

// An approved build newer than the one on disk. Both keys must be known: an
// install predating update tracking (or one the disk rescan rediscovered)
// has no recorded build, and claiming an update there would be a guess.
const needsUpdate = computed(() => {
  const installed = props.item.installedBuildKey
  const current = props.item.file_name?.desktop
  return Boolean(props.item.isInstalled && installed && current && installed !== current)
})

// One place deciding what the main button is, instead of the same nested
// ternary repeated across class, label and icon — adding the update state to
// three parallel chains is how they drift apart.
type ActionState = 'running' | 'downloading' | 'installing' | 'update' | 'play' | 'download'

const actionState = computed<ActionState>(() => {
  if (isRunning.value) return 'running'
  if (isDownloading.value) return 'downloading'
  if (isInstalling.value) return 'installing'
  if (needsUpdate.value) return 'update'
  if (props.item.isInstalled || isWebGame.value) return 'play'
  return 'download'
})

const actionClass = computed(
  () =>
    ({
      running: 'running-button',
      downloading: 'downloading-button',
      installing: 'installing-button',
      update: 'update-button',
      play: 'play-button',
      download: 'download-button'
    })[actionState.value]
)

const actionLabel = computed(
  () =>
    ({
      running: i18n.t('running'),
      downloading: i18n.t('downloading'),
      installing: i18n.t('installing'),
      update: i18n.t('update_game'),
      play: i18n.t('play'),
      download: i18n.t('download')
    })[actionState.value]
)

function onActionClick() {
  // Updating reinstalls: Download() re-fetches the game's current build and
  // the installer replaces the folder wholesale.
  if (actionState.value === 'play') {
    Play()
  } else if (actionState.value === 'update' || actionState.value === 'download') {
    Download()
  }
}

const displayedAchievements = computed(() => {
  return gameAchievements.value.slice(0, 4)
})

const hasAchievements = computed(() => {
  return gameAchievements.value.length > 0
})

async function fetchGameAchievements() {
  if (!props.item.game_id || !auth.token) return

  achievementsLoading.value = true
  try {
    await achievementsStore.fetchAchievements(props.item.game_id, { token: auth.token })
    gameAchievements.value = [...achievementsStore.achievements]
  } catch (error) {
    console.error('Error fetching achievements:', error)
  } finally {
    achievementsLoading.value = false
  }
}

async function fetchPlayTime() {
  if (!props.item.game_id || !auth.token) return

  playTimeLoading.value = true
  try {
    const time = await gamesStore.getPlayTime(props.item.game_id, { token: auth.token })
    playTime.value = time
    console.log('Fetched play time:', playTime.value)
  } catch (error) {
    console.error('Error fetching play time:', error)
    playTime.value = null
  } finally {
    playTimeLoading.value = false
  }
}

function toggleOptionsMenu(event: Event) {
  event.stopPropagation()
  showOptionsMenu.value = !showOptionsMenu.value
}

async function uninstallGame(event: Event) {
  event.stopPropagation()
  showOptionsMenu.value = false

  if (!props.item.game_id) return

  try {
    const uninstaller = gameRoutesStore.localUninstallers.find(
      (u) => u.gameId === props.item.game_id
    )

    // Inno Setup builds have a real uninstaller; zip builds (exe or html) do
    // not, and for those the main process deletes the folder the path sits in.
    // Passing the recorded install root matters for a nested index.html, where
    // the file's own directory is not the folder that was extracted.
    const localEntry = gameRoutesStore.localGames.find((g) => g.gameId === props.item.game_id)
    const target =
      uninstaller?.route || props.item.game_Root || localEntry?.root || props.item.game_Path

    if (!target) {
      console.warn('Nothing to uninstall for game:', props.item.game_id)
      return
    }

    console.log('Uninstalling game:', props.item.game_id, 'using:', target)

    const result = await window.electronAPI.uninstallGame({
      game_id: props.item.game_id,
      uninstallerPath: target
    })

    if (result.success) {
      console.log('Game uninstalled successfully:', result.message)

      gameRoutesStore.removeGameFromRoute({
        gameId: props.item.game_id,
        route: props.item.game_Path || ''
      })
      if (uninstaller?.route) {
        gameRoutesStore.removeUninstallerFromRoute({
          gameId: props.item.game_id,
          route: uninstaller.route
        })
      }

      props.item.isInstalled = false
      props.item.game_Path = ''
      props.item.game_Kind = undefined
      props.item.game_Root = undefined
    } else {
      console.error('Uninstall failed:', result.error)
    }
  } catch (error) {
    console.error('Error uninstalling game:', error)
  }
}

onMounted(() => {
  if (props.loading) return
  fetchGameAchievements()
  fetchPlayTime()

  // Check if this game is currently running
  if (props.item.game_id) {
    window.electronAPI.isGameRunning(props.item.game_id).then((running: boolean) => {
      isRunning.value = running
    })
  }

  const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as Element
    if (!target.closest('.options-container')) {
      showOptionsMenu.value = false
    }
  }
  document.addEventListener('click', handleClickOutside)

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })

  //todo: use the download store
  window.electronAPI.onDownloadComplete((data) => {
    if (data.gameId === props.item.game_id) {
      isLoading.value = false
      isDownloading.value = false
      props.item.isInstalled = false
      props.item.game_Path = data.installPath
      isInstalling.value = true
    }
  })

  window.electronAPI.onDownloadError((data) => {
    if (data.gameId === props.item.game_id) {
      // The only place this error is ever surfaced — main process console
      // output isn't visible in a packaged app, so without this the failure
      // is completely silent to both the player and whoever is debugging it.
      console.error(`Download failed for game ${data.gameId}:`, data.error)
      isLoading.value = false
      isDownloading.value = false
      isInstalling.value = false
    }
  })

  window.electronAPI.onInstallStarted((data) => {
    if (data.gameId === props.item.game_id) {
      isLoading.value = true
      isInstalling.value = true
    }
  })

  window.electronAPI.onInstallComplete((data) => {
    if (data.gameId === props.item.game_id) {
      isLoading.value = false
      isInstalling.value = false
      isDownloading.value = false
      props.item.isInstalled = true
      props.item.game_Path = data.installPath
      props.item.game_Kind = data.kind ?? 'exe'
      props.item.game_Root = data.installRoot
      console.log('Setting game path to:', props.item.game_Path)

      // Persist here rather than leaving it to the disk rescan: that only
      // finds .exe files, so an html build would be forgotten on refresh.
      // Remember which build this is, so a later approved build shows as an
      // update rather than looking identical to what's already installed.
      props.item.installedBuildKey = props.item.file_name?.desktop
      gameRoutesStore.recordInstalledGame({
        gameId: data.gameId,
        route: data.installPath,
        kind: data.kind ?? 'exe',
        root: data.installRoot,
        buildKey: props.item.file_name?.desktop
      })
    }
  })

  window.electronAPI.onInstallError((data) => {
    if (data.gameId === props.item.game_id) {
      console.error(`Install failed for game ${data.gameId}:`, data.error)
      isLoading.value = false
      isInstalling.value = false
    }
  })

  window.electronAPI.onGameStarted((data) => {
    if (data.gameId === props.item.game_id) {
      isRunning.value = true
      isLoading.value = false
    }
  })

  window.electronAPI.onGameStopped((data) => {
    if (data.gameId === props.item.game_id) {
      isRunning.value = false
    }
  })
})

async function Play() {
  if (legacyEmbeddedRoute.value) {
    // Embedded in the app itself — just navigate to its route
    recordPlayed(props.item.game_id)
    router.push(legacyEmbeddedRoute.value)
  } else if (isWebGame.value && props.item.game_id) {
    // Browser-playable build: runs in the in-app player, no install needed
    recordPlayed(props.item.game_id)
    router.push(`/webgame/${props.item.game_id}`)
  } else if (isLocalHtmlBuild.value && props.item.game_id) {
    // Installed web bundle: opens in its own window, served off boly-game://
    // from the folder it was extracted into — same shape as a native game
    // launch below, just no .exe to spawn.
    isLoading.value = true

    try {
      const gameName = props.item.name?.[i18n.locale.value] || props.item.name?.es || 'Boly'
      const result = await window.electronAPI.playLocalGame({
        game_id: props.item.game_id,
        root: props.item.game_Root || props.item.game_Path,
        entryPath: props.item.game_Path,
        token: auth.token,
        gameName
      })

      if (result && result.error) {
        console.error('Failed to start local game:', result.error)
        isLoading.value = false
      } else {
        recordPlayed(props.item.game_id)
      }
      // On success, loading is cleared by the game-started event, same as a
      // native launch.
    } catch (error) {
      console.error('Error starting local game:', error)
      isLoading.value = false
    }
  } else if (props.item.game_id) {
    console.log('clicked')
    isLoading.value = true // Set loading while game is starting

    try {
      const result = await window.electronAPI.playGame({
        game_id: props.item.game_id,
        appPath: props.item.game_Path,
        token: auth.token
      })

      // If there was an error starting the game, reset loading state
      if (result && result.error) {
        console.error('Failed to start game:', result.error)
        isLoading.value = false
      } else {
        recordPlayed(props.item.game_id)
      }
      // If successful, loading state will be cleared when game-started event is received
    } catch (error) {
      console.error('Error starting game:', error)
      isLoading.value = false
    }
  }
}

async function Download() {
  if (isLoading.value || isDownloading.value) return
  isLoading.value = true
  isDownloading.value = true

  try {
    if (props.item.game_id) {
      const gameName = props.item.name[i18n.locale.value] || props.item.name.es || 'Game'

      window.electronAPI.downloadGame({
        game_id: props.item.game_id,
        token: auth.token,
        gameName: gameName,
        // Not yet approved — install the specific build under review
        // rather than whatever (if anything) is the game's live version.
        build_id: props.item.pending_review ? props.item.pending_build_id : undefined
      })
    }
  } catch (error) {
    console.error('Error initiating download:', error)
    isLoading.value = false
    isDownloading.value = false
  }
}

</script>

<template>
  <div v-if="props.loading" class="lib-row sk-row" aria-hidden="true">
    <div class="sk sk-capsule"></div>
    <div class="sk-text">
      <div class="sk sk-title"></div>
      <div class="sk sk-line"></div>
      <div class="sk sk-line short"></div>
    </div>
    <div class="sk sk-action-btn"></div>
  </div>
  <div v-else class="lib-row" :style="{ '--i': props.index ?? 0 }" @click="Play">
    <div class="capsule">
      <img
        :src="bannerSrc && !imageFailed ? bannerSrc : PLACEHOLDER_IMAGE"
        alt=""
        loading="lazy"
        :class="{ 'capsule-placeholder': !bannerSrc || imageFailed }"
        @error="imageFailed = true"
      />
    </div>

    <div class="row-body">
      <div class="title-line">
        <h3 class="row-name">{{ name }}</h3>
        <span v-if="props.item.pending_review" class="pending-review-badge">{{ $t('pending_review_badge') }}</span>
      </div>
      <p v-if="description" class="row-desc">{{ description }}</p>
      <GameEducationMeta :education="props.item.education" />

      <div class="row-stats">
        <span class="stat">
          <ClockhistoryIcon class="stat-icon" aria-hidden="true" />
          <span v-if="playTimeLoading" class="stat-muted">…</span>
          <span v-else-if="playTime !== null">{{ Math.floor(playTime / 60) }}h {{ playTime % 60 }}m</span>
          <span v-else class="stat-muted">{{ $t('no_play_time_recorded') }}</span>
        </span>

        <span class="stat" :aria-label="$t('achievements')">
          <span v-if="achievementsLoading" class="stat-muted">…</span>
          <template v-else-if="hasAchievements">
            <span v-for="achievement in displayedAchievements" :key="achievement.id" class="achievement">
              <img
                :src="achievement.icon_url"
                :alt="localized(achievement.name)"
                :class="{ locked: achievement.progress !== undefined && achievement.progress < 100 }"
              />
              <span class="achievement-tooltip" role="tooltip">
                <strong>{{ localized(achievement.name) }}</strong>
                <span>{{ localized(achievement.description) }}</span>
              </span>
            </span>
            <span v-if="gameAchievements.length > displayedAchievements.length" class="stat-muted">
              +{{ gameAchievements.length - displayedAchievements.length }}
            </span>
          </template>
          <span v-else class="stat-muted">{{ $t('no_achievements') }}</span>
        </span>
      </div>
    </div>

    <div class="row-actions">
      <button
        :class="['action-button', actionClass]"
        :disabled="isLoading || isDownloading || isInstalling || isRunning"
        @click.stop="onActionClick"
      >
        <span class="button-text">{{ actionLabel }}</span>
        <PlayIcon v-if="actionState === 'play' || actionState === 'running'" class="icon" />
        <LoadingSpinnerIcon
          v-else-if="actionState === 'downloading' || actionState === 'installing'"
          class="icon"
        />
        <DownloadIcon v-else class="icon" />
      </button>

      <!-- Options Button -->
      <div v-if="props.item.isInstalled" class="options-container">
        <button
          class="options-button"
          :class="{ active: showOptionsMenu }"
          :aria-label="$t('uninstall')"
          @click.stop="toggleOptionsMenu"
        >
          <VerticalDotsIcon class="options-icon" />
        </button>

        <!-- Options Dropdown -->
        <div v-if="showOptionsMenu" class="options-dropdown">
          <button class="dropdown-item uninstall-item" @click="uninstallGame">
            <span>{{ $t('uninstall') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Same row format as the store search (GameSearchRow): key art on the left;
   name, description, subject/grades/topic, play time and achievements in the
   middle; the play/install action on the right. */
.lib-row {
  position: relative;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) auto;
  gap: 1.25rem;
  align-items: center;
  padding: 0.75rem;
  border-radius: 12px;
  color: var(--light);
  font-family: 'Poppins', sans-serif;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  animation: row-in 0.35s ease both;
  animation-delay: calc(min(var(--i, 0), 12) * 35ms);
}

/* Hairline between consecutive rows, inset so it doesn't follow the rounded
   corners of the hover background. */
.lib-row + .lib-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0.75rem;
  right: 0.75rem;
  border-top: 1px solid rgba(84, 84, 84, 0.48);
}

.lib-row:hover::before,
.lib-row:hover + .lib-row::before {
  opacity: 0;
}

.lib-row:not(.sk-row):hover {
  background-color: rgba(251, 251, 251, 0.06);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

.capsule {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: var(--boly-bg-darker);
}

.capsule img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* The app's local Boly mark, for games without (or with a broken) banner. */
.capsule img.capsule-placeholder {
  object-fit: contain;
  padding: 18%;
  box-sizing: border-box;
  opacity: 0.35;
}

.row-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.row-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.3;
}

.pending-review-badge {
  padding: 0.1rem 0.55rem;
  border-radius: 6px;
  background: rgba(252, 153, 4, 0.18);
  color: var(--boly-highlight);
  font-size: 0.72rem;
  font-weight: 600;
}

.row-desc {
  margin: 0;
  color: var(--light-gray);
  font-size: 0.88rem;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.row-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1.25rem;
  margin-top: 0.2rem;
  font-size: 0.8rem;
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.stat-icon {
  width: 14px;
  height: 14px;
  fill: var(--light-gray);
}

.stat-muted {
  color: var(--light-gray);
}

.achievement {
  position: relative;
  display: inline-flex;
}

.achievement img {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: block;
}

.achievement img.locked {
  filter: grayscale(100%);
  opacity: 0.55;
}

.achievement-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  padding: 0.6rem 0.7rem;
  border-radius: 8px;
  background: var(--boly-bg-darker);
  border: 1px solid rgba(251, 251, 251, 0.12);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--light-gray);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 10;
}

.achievement-tooltip strong {
  display: block;
  color: var(--light);
  margin-bottom: 0.2rem;
}

.achievement:hover .achievement-tooltip {
  opacity: 1;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 150px;
  min-height: 44px;
  padding: 0.55rem 1.2rem;
  border: none;
  border-radius: 8px;
  color: var(--light);
  font-family: 'Poppins', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease, filter 0.15s ease, background-color 0.15s ease;
}

.action-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.action-button:active:not(:disabled) {
  transform: translateY(0);
  filter: brightness(0.92);
}

.action-button:focus-visible,
.options-button:focus-visible {
  outline: 2px solid var(--boly-button-purple);
  outline-offset: 2px;
}

.play-button {
  background: var(--boly-button-purple);
}

.play-button:hover:not(:disabled) {
  background: var(--boly-button-purple-hover);
}

.download-button {
  background: var(--boly-button-blue);
}

.download-button:hover:not(:disabled) {
  background: var(--boly-button-blue-hover);
}

/* Amber rather than the play color: an update is available and worth
   noticing, but the game is still playable, so it shouldn't read as an error. */
.update-button {
  background: #e0912f;
}

.update-button:hover:not(:disabled) {
  background: #f0a344;
}

.downloading-button,
.installing-button {
  background: var(--boly-button-green);
  cursor: progress;
}

.running-button {
  background: var(--boly-button-blue);
  cursor: not-allowed;
}

.action-button:disabled {
  opacity: 0.85;
}

.downloading-button .icon,
.installing-button .icon {
  animation: pulse-glow 2s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}

.downloading-button::after,
.installing-button::after,
.running-button::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  animation: shine 1.5s infinite;
}

@keyframes shine {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

.button-text {
  position: relative;
  z-index: 1;
}

.icon {
  width: 1.1em;
  height: 1.1em;
  fill: currentColor;
  position: relative;
  z-index: 1;
}

/* Options Button and Dropdown */
.options-container {
  position: relative;
}

.options-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(251, 251, 251, 0.15);
  border-radius: 8px;
  background: rgba(251, 251, 251, 0.06);
  color: var(--light);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.options-button:hover,
.options-button.active {
  background: rgba(251, 251, 251, 0.14);
}

.options-icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.options-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 140px;
  background: var(--boly-bg-darker);
  border: 1px solid rgba(251, 251, 251, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
  z-index: 1000;
  overflow: hidden;
}

.dropdown-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: none;
  font-family: 'Poppins', sans-serif;
  font-size: 0.9rem;
  color: var(--light);
  cursor: pointer;
  text-align: left;
}

.dropdown-item:hover {
  background: rgba(251, 251, 251, 0.08);
}

.uninstall-item:hover {
  background: rgba(229, 72, 77, 0.15);
  color: #ff8589;
}

/* Skeleton */
@keyframes skeleton-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.sk {
  background: linear-gradient(90deg, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.08) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.6s infinite;
  border-radius: 6px;
}

.sk-row {
  cursor: default;
  animation: none;
}

.sk-capsule { width: 100%; aspect-ratio: 16 / 9; border-radius: 10px; }
.sk-text { display: flex; flex-direction: column; gap: 0.6rem; }
.sk-title { width: 40%; height: 1.1rem; }
.sk-line { width: 85%; height: 0.85rem; }
.sk-line.short { width: 30%; }
.sk-action-btn { width: 150px; height: 44px; border-radius: 8px; }

@keyframes row-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lib-row {
    animation: none;
    transition: none;
  }
}

@media (max-width: 768px) {
  .lib-row {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 0.85rem;
    align-items: start;
    padding: 0.6rem;
  }

  .row-actions {
    grid-column: 1 / -1;
  }

  .action-button {
    flex: 1;
  }
}
</style>
