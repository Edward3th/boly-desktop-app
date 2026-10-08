<script lang="ts" setup>
//import { useI18n } from 'vue-i18n'
import DesktopLibraryItem from '@/desktop-components/DesktopLibraryItem.vue'
import GameFilters from '@/components/games/GameFilters.vue'
import { computed, onMounted, ref, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth, useUser, useSubscription, useGames } from '../stores'
import useGameRoutes from '../desktop-stores/gameRoutes'
import axios from 'axios'
import type { Game, Subscription } from '@/types'
import { storeToRefs } from 'pinia'
import { useGameFilters } from '@/composables/useGameFilters'

const auth = useAuth()
const user = useUser()
const subscriptionStore = useSubscription()
const games = useGames()
//const achievementsStore = useAchievements()
const gameRoutesStore = useGameRoutes()
const router = useRouter()
const isLoading = ref(true)
const ownedGames = ref<Game[]>([])
const allOwnedGames = ref<Game[]>([])
const isSearchingGames = ref(false)
const showInstalledOnly = ref(false)
const showSubscriptionGames = ref(false)
const currentSubscription = ref<Subscription | null>(null)
const { subscriptions } = storeToRefs(subscriptionStore)

// /v1/games/user doesn't carry the educational summary; the public store list
// (games.getAll, which this view already loads) does, so each library game
// borrows it from there by id. Assigned onto the same objects rather than
// copies: DesktopLibraryItem mutates its item (installed, uninstalled...) and
// the install handlers above update these same objects by index.
const educationById = computed(() => new Map(games.games.map((game) => [game.game_id, game.education])))
watch(
  [ownedGames, educationById],
  () => {
    for (const game of ownedGames.value) {
      if (!game.education) game.education = educationById.value.get(game.game_id) ?? null
    }
  },
  { immediate: true }
)

const { query, gradeCode, groupSlug, gameType, hasActiveFilters, clearFilters, filteredGames } = useGameFilters(
  ownedGames,
  { syncUrl: true }
)

if (!auth.isLoggedIn) {
  router.back()
}

function setupLibraryDownloadHandlers() {
  window.electronAPI.onInstallStarted((data) => {
    console.log('Library detected install started:', data)

    const gameIndex = allOwnedGames.value.findIndex((g) => g.game_id === data.gameId)
    if (gameIndex !== -1) {
      allOwnedGames.value[gameIndex].isInstalling = true
      updateDisplayedGames()
    }
  })
  window.electronAPI.onInstallComplete((data) => {
    console.log('Library detected install complete:', data)

    const gameIndex = allOwnedGames.value.findIndex((g) => g.game_id === data.gameId)
    const installedBuildKey = gameIndex !== -1
      ? allOwnedGames.value[gameIndex].file_name?.desktop
      : undefined

    if (gameIndex !== -1) {
      allOwnedGames.value[gameIndex].isInstalled = true
      allOwnedGames.value[gameIndex].isInstalling = false
      allOwnedGames.value[gameIndex].game_Path = data.installPath
      allOwnedGames.value[gameIndex].game_Kind = data.kind ?? 'exe'
      allOwnedGames.value[gameIndex].game_Root = data.installRoot
      // Remember which build this is, so a later approved build shows as an
      // update rather than looking identical to what's already installed.
      allOwnedGames.value[gameIndex].installedBuildKey = installedBuildKey
      console.log('Setting game path to:', allOwnedGames.value[gameIndex].game_Path)

      updateDisplayedGames()
    }

    // Recorded with the game id in hand, because the rescan below only finds
    // .exe files — an html build has nothing for it to match on.
    gameRoutesStore.recordInstalledGame({
      gameId: data.gameId,
      route: data.installPath,
      kind: data.kind ?? 'exe',
      root: data.installRoot,
      buildKey: installedBuildKey
    })

    loadGames()
  })

  window.electronAPI.onInstallError((data) => {
    console.error('Library detected install error:', data)

    const gameIndex = allOwnedGames.value.findIndex((g) => g.game_id === data.gameId)
    if (gameIndex !== -1) {
      allOwnedGames.value[gameIndex].isInstalling = false
      allOwnedGames.value[gameIndex].installError = data.error || 'Unknown installation error'
      updateDisplayedGames()
    }
  })
}

function cleanupLibraryDownloadHandlers() {
  try {
    window.electronAPI.removeAllListeners('install-complete')
    window.electronAPI.removeAllListeners('install-started')
    window.electronAPI.removeAllListeners('install-error')
  } catch (error) {
    console.error('Error cleaning up library download handlers:', error)
  }
}

async function loadGames() {
  isSearchingGames.value = true
  try {
    console.log('Clearing previous game routes...')
    await gameRoutesStore.clearRoute()
    console.log('Searching for games in My Games folder...')
    await gameRoutesStore.searchForExes()
    console.log('Found games:', gameRoutesStore.getRouteItems)
  } catch (err) {
    console.error('Error searching for games:', err)
  } finally {
    isSearchingGames.value = false
  }
}

async function fetchOwnedGames() {
  if (!user.userId) return

  try {
    if (currentSubscription.value?.plan_id != 1 && currentSubscription.value?.is_active) {
      console.log('User has active subscription. Loading all games.')
      await games.getAll()
      await loadGames()
      const localGames = gameRoutesStore.getRouteItems

      allOwnedGames.value = games.games.map((game: Game) => {
        if (!game.banner_url) {
          game.banner_url = 'banner.jpg'
        }

        const found = localGames.find((localGame) => localGame.gameId === game.game_id)

        if (found !== undefined) {
          game.game_Path = found.route
          // Entries written before html builds existed carry no kind; those
          // were all executables.
          game.game_Kind = found.kind ?? 'exe'
          game.game_Root = found.root
          game.installedBuildKey = found.buildKey
          game.isInstalled = true
        } else {
          game.isInstalled = false
        }

        game.isInstalling = false
        game.installError = undefined

        return game
      })

      // getAll() only returns published games, so a subscribed admin
      // (unlike an unsubscribed one, which already goes through the
      // pending-review-aware branch below) would otherwise never see a
      // build awaiting review. Merge those in from the same endpoint the
      // other branch uses.
      if (user.roleId === 1) {
        try {
          const pendingResponse = await axios.get(`/v1/games/user/${user.userId}`)
          const pendingList: Game[] = pendingResponse.data?.[0]?.game || []
          for (const pendingGame of pendingList) {
            if (!pendingGame.pending_review) continue
            const existing = allOwnedGames.value.find((g) => g.game_id === pendingGame.game_id)
            if (existing) {
              existing.pending_review = true
              existing.pending_build_id = pendingGame.pending_build_id
            } else {
              if (!pendingGame.banner_url) pendingGame.banner_url = 'banner.jpg'
              const found = localGames.find((localGame) => localGame.gameId === pendingGame.game_id)
              if (found !== undefined) {
                pendingGame.game_Path = found.route
                pendingGame.game_Kind = found.kind ?? 'exe'
                pendingGame.game_Root = found.root
                pendingGame.installedBuildKey = found.buildKey
                pendingGame.isInstalled = true
              } else {
                pendingGame.isInstalled = false
              }
              pendingGame.isInstalling = false
              pendingGame.installError = undefined
              allOwnedGames.value.push(pendingGame)
            }
          }
        } catch (err) {
          console.error('Error merging pending-review games for admin:', err)
        }
      }
    } else {
      // Code path for users without active subscription
      const response = await axios.get(`/v1/games/user/${user.userId}`)
      if (response.status === 200 && response.data) {
        const gamesList = response.data[0]?.game || []
        console.log('Extracted games list:', gamesList)

        await loadGames()
        const localGames = gameRoutesStore.getRouteItems
        const localUninstallers = gameRoutesStore.getUninstallerItems
        console.log('Local uninstallers:', JSON.stringify(localUninstallers))
        console.log('Local games:', JSON.stringify(localGames))

        allOwnedGames.value = gamesList.map((game: Game) => {
          if (!game.banner_url) {
            game.banner_url = 'banner.jpg'
          }

          // Check if game is installed locally (if has a matching gameId)
          const found = localGames.find((localGame) => localGame.gameId === game.game_id)

          if (found !== undefined) {
            game.game_Path = found.route
            // Entries written before html builds existed carry no kind; those
            // were all executables.
            game.game_Kind = found.kind ?? 'exe'
            game.game_Root = found.root
            game.installedBuildKey = found.buildKey
            game.isInstalled = true
          } else {
            game.isInstalled = false
          }

          game.isInstalling = false
          game.installError = undefined

          return game
        })
      }
    }

    updateDisplayedGames()
  } catch (error) {
    console.error('Error fetching owned games:', error)
  }
}

function updateDisplayedGames() {
  if (showSubscriptionGames.value) {
    games.getAll().then(() => {
      ownedGames.value = games.games
    })
  } else if (showInstalledOnly.value) {
    ownedGames.value = allOwnedGames.value.filter((game) => game.isInstalled)
  } else {
    ownedGames.value = [...allOwnedGames.value]
  }
}

function setFilter(filterType: 'installed' | 'owned' | 'subscription') {
  showInstalledOnly.value = false
  showSubscriptionGames.value = false

  if (filterType === 'installed') {
    showInstalledOnly.value = true
    loadGames()
  } else if (filterType === 'subscription') {
    showSubscriptionGames.value = true
  }

  updateDisplayedGames()
}

onMounted(async () => {
  if (auth.isLoggedIn && user.userId) {
    try {
      setupLibraryDownloadHandlers()
      const success = await subscriptionStore.getUserSubscriptions(user.userId, {
        token: auth.token
      })

      if (success && subscriptions.value.length > 0) {
        const activeSubscription = subscriptions.value.find((sub) => sub.is_active === 1)
        if (activeSubscription) {
          currentSubscription.value = activeSubscription
        }
      }
    } catch (error) {
      console.error('Error fetching subscription data:', error)
    }

    try {
      const response = await axios.get(`/v1/users/${user.userId}`)
      if (response.status === 200) {
        user.setUser(response.data)
        await fetchOwnedGames()
        games.getAll().catch((err) => {
          console.error('Error pre-fetching all games:', err)
        })
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      isLoading.value = false
    }
  } else {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  cleanupLibraryDownloadHandlers()
})
</script>

<template>
  <div v-if="isLoading" class="section">
    <div class="main-container">
      <div class="list">
        <DesktopLibraryItem v-for="n in 4" :key="n" :loading="true" :item="{} as any" />
      </div>
    </div>
  </div>
  <div v-else class="section">
    <div class="main-container">
      <div>
        <div class="title-container">
          <h1>{{ $t('user_games', { user: user.username }) }}</h1>
        </div>
      </div>
      <div class="title-container filter-controls">
        <div class="filter-buttons">
          <button
            class="filter-button"
            :class="{ active: showInstalledOnly }"
            @click="setFilter('installed')"
          >
            {{ $t('show_installed_only') }}
          </button>
          <button
            class="filter-button"
            :class="{ active: !showInstalledOnly && !showSubscriptionGames }"
            @click="setFilter('owned')"
          >
            {{ $t('show_all_owned_games') }}
          </button>
          <button
            v-if="currentSubscription?.plan_id != 1 && currentSubscription?.is_active && false"
            class="filter-button"
            :class="{ active: showSubscriptionGames }"
            @click="setFilter('subscription')"
          >
            {{ $t('subscription_games') }}
          </button>
        </div>
      </div>
      <template v-if="ownedGames.length > 0">
        <GameFilters
          v-model:query="query"
          v-model:grade-code="gradeCode"
          v-model:group-slug="groupSlug"
          v-model:game-type="gameType"
        />

        <div class="results-bar">
          <span aria-live="polite">{{ $t('store_results', filteredGames.length) }}</span>
          <button v-if="hasActiveFilters" type="button" class="link-button" @click="clearFilters">
            {{ $t('store_clear_filters') }}
          </button>
        </div>

        <!-- Items are keyed by game id (not remounted on filter changes): each
             one listens for its own download/install/run events. -->
        <div v-if="filteredGames.length > 0" class="list">
          <DesktopLibraryItem
            v-for="(item, index) in filteredGames"
            :key="item.game_id"
            :item="item"
            :index="index"
          />
        </div>
        <div v-else class="empty-library">
          <p>{{ $t('store_empty_title') }}</p>
          <button class="browse-button" @click="clearFilters">{{ $t('store_clear_filters') }}</button>
        </div>
      </template>
      <div v-else class="empty-library">
        <p>{{ showSubscriptionGames ? $t('no_subscription_games') : $t('no_owned_games') }}</p>
        <button class="browse-button" @click="router.push('/games')">
          {{ $t('browse_games') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
h2 {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  text-align: left;
  width: 100%;
}

.title-container {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
}

.title-container.filter-controls {
  justify-content: space-around;
  width: 100%;
  padding: 0 40px;
  box-sizing: border-box;
}

.title-container h1 {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  text-align: center;
  width: 100%;
  margin-bottom: 10px;
}

.game-count {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  padding: 5px 15px;
  border-radius: 5px;
  background-color: var(--boly-button-pink);
  color: white;
  white-space: nowrap;
}

.filter-buttons {
  display: flex;
  gap: 10px;
}

.section {
  min-width: 0;
}

.main-container {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.list {
  display: flex;
  flex-direction: column;
}

.results-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--light-gray);
  font-family: 'Poppins', sans-serif;
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

.loading_container {
  height: 800px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.empty-library {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: 4rem;
  text-align: center;
}

.empty-library p {
  font-size: 1.2rem;
  color: var(--color-text);
  opacity: 0.8;
}

.browse-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 2rem;
  border: none;
  border-radius: 5px;
  background-color: var(--boly-button-pink);
  color: white;
  font-family: 'Anton', Impact, sans-serif;
  font-style: italic;
  font-size: 1.1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.browse-button:hover {
  opacity: 0.9;
}

.filter-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1.5rem;
  border: none;
  border-radius: 5px;
  background-color: var(--boly-button-pink);
  color: white;
  font-family: 'Anton', Impact, sans-serif;
  font-style: italic;
  font-size: 1rem;
  cursor: pointer;
  transition:
    background-color 0.2s,
    opacity 0.2s;
  margin-left: 0;
}

.filter-button:hover {
  opacity: 0.9;
}

.filter-button.active {
  background-color: #48ace4;
  opacity: 1;
}
</style>
