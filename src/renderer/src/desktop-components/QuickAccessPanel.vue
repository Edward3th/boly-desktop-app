<script setup lang="ts">
/**
 * Home quick-access band.
 *
 * One edge-to-edge band split by hairline rules into three regions of
 * deliberately unequal weight: the library is the one thing a desktop user
 * opens the app for, so it gets the wide side and real state (owned/installed
 * counts, an in-flight download, a one-click resume of the last game
 * launched). Subscription and code redemption stack beside it, the
 * subscription one flipping to a status readout once the user actually has a
 * plan instead of selling them a plan they already bought.
 *
 * Everything here reads from caches the app already holds — the installed-game
 * list comes from localStorage, not a fresh filesystem scan — so the panel
 * never delays the home view.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import axios from 'axios'
import { useAuth, useUser, useCodes, useGames, useSubscription, useDownloadStore } from '@/stores'
import useGameRoutes, { buildNeedsUpdate } from '@/desktop-stores/gameRoutes'
import GamepadIcon from '@/components/icons/GamepadIcon.vue'
import KingIcon from '@/components/icons/KingIcon.vue'
import PercentageIcon from '@/components/icons/PercentageIcon.vue'
import RightArrowIcon from '@/components/icons/RightArrowIcon.vue'
import PlayIcon from '@/components/icons/PlayIcon.vue'
import { resolveImageUrl, PLACEHOLDER_IMAGE } from '@/utils/imageUrl'
import { getRecentlyPlayed } from '@/utils/recentlyPlayed'
import type { Game, Subscription } from '@/types'

/**
 * Few but large covers. The banners are 16:9 key art whose lettering gets
 * cropped away at thumbnail size, so the full-bleed region shows a handful at
 * generous width. Anything that does not fit is reported as a count.
 */
const MAX_COVERS = 3

const emit = defineEmits<{ (e: 'notify', message: string): void }>()

const router = useRouter()
const i18n = useI18n()
const auth = useAuth()
const userStore = useUser()
const codesStore = useCodes()
const gamesStore = useGames()
const subscriptionStore = useSubscription()
const gameRoutesStore = useGameRoutes()
const downloadStore = useDownloadStore()
const { isDownloading, downloadProgress, downloadingGameName } = storeToRefs(downloadStore)

const ownedGames = ref<Game[]>([])
const activeSubscription = ref<Subscription | null>(null)
const isLoadingLibrary = ref(true)

const activationCode = ref('')
const isActivating = ref(false)
const isLaunching = ref(false)

const isLoggedIn = computed(() => auth.isLoggedIn && !!userStore.userId)

/** Installed titles, matched against the exe routes already cached on disk. */
const installedGames = computed(() => {
  const routes = gameRoutesStore.getRouteItems
  if (!routes.length) return []
  return ownedGames.value.filter((game) => routes.some((route) => route.gameId === game.game_id))
})

/**
 * The most recently launched game that is still installed. Falls back to
 * nothing rather than guessing, so the resume button never points at a title
 * the user would have to download first.
 */
const resumeGame = computed<Game | null>(() => {
  for (const entry of getRecentlyPlayed()) {
    const match = installedGames.value.find((game) => game.game_id === entry.gameId)
    if (match) return match
  }
  return null
})

/**
 * Covers for the filmstrip: installed first, they are the actionable ones. The
 * resume candidate is left out — it already has the row above to itself.
 */
const coverGames = computed(() => {
  const ordered = [
    ...installedGames.value,
    ...ownedGames.value.filter((game) => !installedGames.value.includes(game))
  ]
  return ordered.filter((game) => game.game_id !== resumeGame.value?.game_id).slice(0, MAX_COVERS)
})

/** Owned titles the strip had no room for. */
const hiddenCoverCount = computed(() => {
  const shown = coverGames.value.length + (resumeGame.value ? 1 : 0)
  return Math.max(0, ownedGames.value.length - shown)
})

const hasSubscription = computed(() => !!activeSubscription.value)

/** Signed in, finished loading, and the account owns nothing. */
const isLibraryEmpty = computed(
  () => isLoggedIn.value && !isLoadingLibrary.value && ownedGames.value.length === 0
)

/**
 * With no games to list — whether because the account owns none or because
 * nobody is signed in — the library region has no use for the wide column, so
 * the band flips and hands it to subscription and code redemption, the two
 * things that would actually get games into the account.
 */
const isLibraryCompact = computed(() => !isLoggedIn.value || isLibraryEmpty.value)

const renewalDate = computed(() => {
  const until = activeSubscription.value?.active_until
  if (!until) return ''
  const date = new Date(until)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(i18n.locale.value === 'en' ? 'en-US' : 'es-CL', {
    day: 'numeric',
    month: 'short'
  }).format(date)
})

function coverFor(game: Game): string {
  const raw = game.banner_url as unknown
  const first = Array.isArray(raw)
    ? raw.find((url: string) => typeof url === 'string' && !url.endsWith('.mp4'))
    : raw
  return resolveImageUrl(first as string | undefined) || PLACEHOLDER_IMAGE
}

function titleOf(game: Game): string {
  const name = game.name as unknown as Record<string, string> | undefined
  return name?.[i18n.locale.value] || name?.en || ''
}

function goToLibrary() {
  router.push('/library')
}

// Subscribing and renewing happen on boly.cl: the app has no purchase pages
// for signed-in users.
function openSubscriptionSite() {
  window.open('https://boly.cl/subscription', '_blank')
}

function goToSubscription() {
  if (hasSubscription.value) {
    router.push('/subscription-management')
  } else {
    openSubscriptionSite()
  }
}

function goToLogin() {
  router.push('/login')
}

/** Mirrors DesktopLibraryItem's launch path so resume behaves identically. */
async function playResumeGame() {
  const game = resumeGame.value
  if (!game || isLaunching.value) return

  // Browser-playable games have no executable to spawn — they run in the
  // in-app player, same as clicking Play in the library. (game_type 2 = Web.)
  const legacyRoute = typeof game.file_name?.desktop === 'string' && game.file_name.desktop.startsWith('/')
    ? game.file_name.desktop
    : null
  if (legacyRoute) {
    router.push(legacyRoute)
    return
  }
  if (game.game_type_id === 2) {
    router.push(`/webgame/${game.game_id}`)
    return
  }

  // A newer build is out (or the one on disk is unknown): updating happens in
  // the library, which replaces the old build — never launch the stale one.
  const route = gameRoutesStore.getRouteItems.find((item) => item.gameId === game.game_id)
  if (buildNeedsUpdate(route?.buildKey, game.file_name?.desktop)) {
    emit('notify', i18n.t('home_quick_update_required'))
    router.push('/library')
    return
  }

  isLaunching.value = true
  try {
    const result = await window.electronAPI.playGame({
      game_id: game.game_id,
      appPath: route?.route ?? game.game_Path,
      token: auth.token
    })
    if (result && result.error) {
      console.error('Failed to start game:', result.error)
      emit('notify', i18n.t('home_quick_launch_error'))
    }
  } catch (error) {
    console.error('Error starting game:', error)
    emit('notify', i18n.t('home_quick_launch_error'))
  } finally {
    isLaunching.value = false
  }
}

async function activateCode() {
  const code = activationCode.value.trim()
  if (!code) {
    emit('notify', i18n.t('home_quick_code_empty'))
    return
  }

  if (!isLoggedIn.value) {
    emit('notify', i18n.t('home_quick_code_login'))
    return
  }

  isActivating.value = true
  try {
    const result = await codesStore.assignDiscountCodeToUserByLink(code, Number(userStore.userId))
    emit('notify', result.message)
    if (result.success) {
      activationCode.value = ''
      await loadLibrary()
    }
  } catch (error) {
    console.error('Error activating code:', error)
    emit('notify', i18n.t('unexpected_error_redeem'))
  } finally {
    isActivating.value = false
  }
}

/**
 * Subscribers get access to the whole catalogue, so their "owned" count is the
 * catalogue itself — same rule the library view applies.
 */
async function loadLibrary() {
  if (!isLoggedIn.value) {
    isLoadingLibrary.value = false
    return
  }

  try {
    if (activeSubscription.value && activeSubscription.value.plan_id !== 1) {
      await gamesStore.getAll()
      ownedGames.value = [...gamesStore.games]
      return
    }

    const response = await axios.get(`/v1/games/user/${userStore.userId}`)
    if (response.status === 200 && response.data) {
      ownedGames.value = response.data[0]?.game || []
    }
  } catch (error) {
    console.error('Error loading quick-access library:', error)
  } finally {
    isLoadingLibrary.value = false
  }
}

onMounted(async () => {
  if (!isLoggedIn.value) {
    isLoadingLibrary.value = false
    return
  }

  try {
    const success = await subscriptionStore.getUserSubscriptions(Number(userStore.userId), {
      token: auth.token
    })
    if (success) {
      activeSubscription.value =
        subscriptionStore.subscriptions.find((sub) => sub.is_active === 1) ?? null
    }
  } catch (error) {
    console.error('Error loading quick-access subscription:', error)
  }

  await loadLibrary()
})
</script>

<template>
  <section class="quick">
    <div class="quick-bento" :class="{ 'is-flipped': isLibraryCompact }">
      <!-- Library: the wide region, because it is why the desktop app exists -->
      <article class="panel panel-library">
        <div class="panel-glow"></div>

        <div class="panel-head">
          <span class="panel-icon"><GamepadIcon /></span>
          <div class="panel-heading">
            <h3 class="panel-title">{{ $t('home_quick_library_title') }}</h3>
            <p class="panel-desc">{{ $t('home_quick_library_desc') }}</p>
          </div>
          <button v-if="!isLibraryCompact" class="panel-link" type="button" @click="goToLibrary">
            <span>{{ $t('home_quick_go') }}</span>
            <RightArrowIcon />
          </button>
        </div>

        <!-- Nothing owned: a zeroed stat row is noise, point at the subscription -->
        <template v-if="isLibraryEmpty">
          <p class="panel-note">{{ $t('home_quick_library_none') }}</p>
          <button class="library-browse" type="button" @click="openSubscriptionSite">
            {{ $t('library_renew_on_boly') }}
            <RightArrowIcon />
          </button>
        </template>

        <template v-else-if="isLoggedIn">
          <div class="stats">
            <div class="stat">
              <span class="stat-value">{{ isLoadingLibrary ? '—' : ownedGames.length }}</span>
              <span class="stat-label">{{ $t('home_quick_stat_games') }}</span>
            </div>
            <span class="stat-divider"></span>
            <div class="stat">
              <span class="stat-value">{{ isLoadingLibrary ? '—' : installedGames.length }}</span>
              <span class="stat-label">{{ $t('home_quick_stat_installed') }}</span>
            </div>
          </div>

          <!-- A live download outranks everything else in this region -->
          <div v-if="isDownloading" class="resume resume-download">
            <div class="resume-info">
              <span class="resume-eyebrow">{{ $t('home_quick_downloading') }}</span>
              <span class="resume-name">{{ downloadingGameName }}</span>
            </div>
            <div class="download-meter">
              <div class="download-fill" :style="{ width: downloadProgress + '%' }"></div>
            </div>
            <span class="download-percent">{{ Math.round(downloadProgress) }}%</span>
          </div>

          <div v-else-if="resumeGame" class="resume resume-game">
            <img class="resume-cover" :src="coverFor(resumeGame)" :alt="titleOf(resumeGame)" />
            <div class="resume-info">
              <span class="resume-eyebrow">{{ $t('home_quick_resume') }}</span>
              <span class="resume-name">{{ titleOf(resumeGame) }}</span>
            </div>
            <button
              class="resume-play"
              type="button"
              :disabled="isLaunching"
              @click="playResumeGame"
            >
              <PlayIcon />
              <span>{{ isLaunching ? $t('home_quick_launching') : $t('home_quick_play') }}</span>
            </button>
          </div>

          <div v-if="coverGames.length" class="covers">
            <button
              v-for="game in coverGames"
              :key="game.game_id"
              class="cover"
              type="button"
              :title="titleOf(game)"
              @click="goToLibrary"
            >
              <img :src="coverFor(game)" :alt="titleOf(game)" />
            </button>
            <button v-if="hiddenCoverCount" class="cover-more" type="button" @click="goToLibrary">
              +{{ hiddenCoverCount }}
            </button>
          </div>
        </template>

        <div v-else class="signed-out">
          <p class="panel-note">{{ $t('home_quick_login_prompt') }}</p>
          <button class="signed-out-button" type="button" @click="goToLogin">
            {{ $t('login') }}
          </button>
        </div>
      </article>

      <!-- Subscription: status readout when active, pitch when not -->
      <article
        class="panel panel-subscription"
        :class="{ 'is-active': hasSubscription }"
        role="button"
        tabindex="0"
        @click="goToSubscription"
        @keydown.enter="goToSubscription"
        @keydown.space.prevent="goToSubscription"
      >
        <div class="panel-glow"></div>

        <div class="panel-head">
          <span class="panel-icon"><KingIcon /></span>
          <div class="panel-heading">
            <h3 class="panel-title">{{ $t('home_quick_subscription_title') }}</h3>
            <p v-if="hasSubscription && renewalDate" class="panel-desc">
              {{ $t('home_quick_sub_renews', { date: renewalDate }) }}
            </p>
            <p v-else class="panel-desc">{{ $t('home_quick_subscription_desc') }}</p>
          </div>
          <span v-if="hasSubscription" class="badge">
            <span class="badge-dot"></span>{{ $t('home_quick_sub_badge') }}
          </span>
        </div>

        <span class="panel-cta">
          {{ hasSubscription ? $t('home_quick_sub_manage') : $t('home_quick_sub_join') }}
          <RightArrowIcon />
        </span>
      </article>

      <!-- Code redemption: inline, the input is the whole point of the region -->
      <article class="panel panel-code">
        <div class="panel-glow"></div>

        <div class="panel-head">
          <span class="panel-icon"><PercentageIcon /></span>
          <div class="panel-heading">
            <h3 class="panel-title">{{ $t('home_quick_code_title') }}</h3>
            <p class="panel-desc">{{ $t('home_quick_code_desc') }}</p>
          </div>
        </div>

        <form class="code-form" @submit.prevent="activateCode">
          <input
            v-model="activationCode"
            class="code-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="$t('home_quick_code_placeholder')"
            :disabled="isActivating"
          />
          <button class="code-button" type="submit" :disabled="isActivating">
            {{ isActivating ? '…' : $t('home_quick_code_button') }}
          </button>
        </form>
      </article>
    </div>
  </section>
</template>

<style scoped>
/* One brand-blue band across the full width of the window, divided into three
   regions by hairline rules rather than broken into floating cards. Each
   region keys to one accent so the three roles stay distinguishable. */
.quick {
  --divider: rgba(255, 255, 255, 0.38);
  --accent: var(--boly-bg-orange);

  position: relative;
  z-index: 2;
  background: var(--lightGreen);
}

.quick-bento {
  display: grid;
  grid-template-columns: 1.65fr 1fr;
  grid-template-rows: auto auto;
}

/* Empty library: the same three regions, the column weights swapped. Nothing
   has to move between cells — the library already owns column one and the
   other two already stack in column two. */
.quick-bento.is-flipped {
  grid-template-columns: 1fr 1.65fr;
}

.panel {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  padding: clamp(2rem, 3.2vw, 3rem) clamp(1.75rem, 3vw, 2.75rem);
  color: white;
  font-family: 'Poppins', sans-serif;
  transition: background 0.28s ease;
}

/* Content lines up with the page gutters; the rules themselves run edge to
   edge, which is what makes the band read as expanded rather than inset. */
.panel-library {
  --accent: var(--boly-bg-orange);
  grid-row: span 2;
  justify-content: space-between;
  min-height: 380px;
  padding-left: clamp(1.5rem, 5vw, 4rem);
  border-right: 1px solid var(--divider);
}

.panel-subscription,
.panel-code {
  padding-right: clamp(1.5rem, 5vw, 4rem);
}

.panel-subscription {
  --accent: var(--boly-button-orange);
  cursor: pointer;
  justify-content: space-between;
}

.panel-subscription.is-active {
  --accent: var(--boly-button-green);
}

.panel-code {
  --accent: var(--boly-button-pink);
  border-top: 1px solid var(--divider);
}

/* Ambient accent wash instead of a card edge — enough to tint the region as
   its own space without drawing a box around it. */
.panel-glow {
  position: absolute;
  top: -60%;
  right: -15%;
  width: 55%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent) 0%, transparent 68%);
  opacity: 0.12;
  pointer-events: none;
  transition: opacity 0.28s ease;
}

.panel:hover .panel-glow {
  opacity: 0.2;
}

.panel-subscription:hover {
  background: rgba(255, 255, 255, 0.08);
}

.panel-head {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

/* Black glyph on a white chip — the one high-contrast mark in each region. */
.panel-icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 8px;
  background: white;
  color: black;
}

/* These glyphs ship without a fill attribute, so they need to be told to
   follow the chip's colour. */
.panel-icon :deep(svg) {
  width: 26px;
  height: 26px;
  fill: currentColor;
}

.panel-heading {
  flex: 1;
  min-width: 0;
}

.panel-title {
  margin: 0;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: clamp(1.5rem, 2.1vw, 2rem);
  letter-spacing: 1px;
  text-transform: uppercase;
  line-height: 1.1;
}

.panel-desc {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.82);
}

.panel-note {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.82);
}

/* White-outlined link. Accent-coloured text does not hold up on the blue, so
   the outline is what gives these the weight of a button. */
.panel-link {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 1rem;
  border: 1px solid white;
  border-radius: 6px;
  background: none;
  color: white;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.panel-link :deep(svg) {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}

.panel-link:hover {
  background: white;
  color: #1c103e;
}

.panel-link:hover :deep(svg) {
  transform: translateX(4px);
}

/* Counts — the region's headline number, deliberately oversized */
.stats {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.stat {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.stat-value {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 3rem;
  line-height: 1;
  font-style: italic;
  color: white;
}

.stat-label {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.78);
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: rgba(255, 255, 255, 0.38);
}

/* The one inset surface left, because the resume row is a distinct object
   sitting inside the region rather than another slab of it. */
.resume {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(0, 0, 0, 0.24);
}

.resume-cover {
  width: 82px;
  height: 47px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: 4px;
}

.resume-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.resume-eyebrow {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--accent);
  font-weight: 700;
}

.resume-name {
  font-size: 1.05rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resume-play {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1.3rem;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #1c103e;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    filter 0.18s ease,
    transform 0.18s ease;
}

.resume-play :deep(svg) {
  width: 15px;
  height: 15px;
}

.resume-play:hover:not(:disabled) {
  filter: brightness(1.12);
  transform: translateY(-2px);
}

.resume-play:disabled {
  opacity: 0.6;
}

.resume-download {
  gap: 0.85rem;
}

.download-meter {
  flex: 1;
  height: 6px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}

.download-fill {
  height: 100%;
  border-radius: 99px;
  background: var(--accent);
  transition: width 0.3s ease;
}

.download-percent {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent);
}

/* Cover filmstrip, anchored to the bottom of the region so the height the
   narrow column forces on this one lands as breathing room around the stats
   rather than as a hole underneath the artwork. */
.covers {
  display: flex;
  gap: 0.7rem;
  margin-top: auto;
}

.cover,
.cover-more {
  flex: 1;
  min-width: 0;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;
}

/* Deliberately narrower than a cover — it is a counter, not a thumbnail. */
.cover-more {
  flex: 0 0 74px;
  aspect-ratio: auto;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.75);
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1.2rem;
  letter-spacing: 1px;
}

.cover-more:hover {
  color: white;
  border-color: var(--accent);
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover:hover {
  transform: translateY(-3px);
  border-color: var(--accent);
}

/* Empty-library affordances: the region trades its stats and filmstrip for a
   single push toward the store, and the two regions that grew get the extra
   presence to match their extra width. */
.library-browse {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1.4rem;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #1c103e;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    filter 0.18s ease,
    transform 0.18s ease;
}

.library-browse :deep(svg) {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}

.library-browse:hover {
  filter: brightness(1.12);
  transform: translateY(-2px);
}

.library-browse:hover :deep(svg) {
  transform: translateX(3px);
}

/* Short content in a region still spanning both rows: centre it as a group so
   the leftover height reads as margin rather than a hole in the middle. */
.is-flipped .panel-library {
  justify-content: center;
  gap: 1.6rem;
}

.is-flipped .panel-subscription,
.is-flipped .panel-code {
  gap: 1.8rem;
  padding-top: clamp(2.4rem, 3.6vw, 3.4rem);
  padding-bottom: clamp(2.4rem, 3.6vw, 3.4rem);
}

.is-flipped .panel-subscription .panel-title,
.is-flipped .panel-code .panel-title {
  font-size: clamp(1.8rem, 2.6vw, 2.4rem);
}

.is-flipped .panel-subscription .panel-desc,
.is-flipped .panel-code .panel-desc {
  font-size: 1rem;
}

.is-flipped .panel-subscription .panel-icon,
.is-flipped .panel-code .panel-icon {
  width: 58px;
  height: 58px;
  border-radius: 10px;
}

.is-flipped .panel-subscription .panel-icon :deep(svg),
.is-flipped .panel-code .panel-icon :deep(svg) {
  width: 33px;
  height: 33px;
}

.is-flipped .code-input,
.is-flipped .code-button {
  padding-top: 0.95rem;
  padding-bottom: 0.95rem;
  font-size: 1rem;
}

.signed-out {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.signed-out-button {
  padding: 0.7rem 1.5rem;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #1c103e;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
}

.signed-out-button:hover {
  filter: brightness(1.12);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  padding: 0.3rem 0.7rem;
  border-radius: 4px;
  background: var(--accent);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #1c103e;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1c103e;
  box-shadow: 0 0 0 0 rgba(28, 16, 62, 0.7);
  animation: pulse 2.2s ease-out infinite;
}

@keyframes pulse {
  70% {
    box-shadow: 0 0 0 7px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* Matches .panel-link — the region itself is the click target, but the outline
   is what tells you so. */
.panel-cta {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 1rem;
  border: 1px solid white;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: white;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.panel-cta :deep(svg) {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}

.panel-subscription:hover .panel-cta {
  background: white;
  color: #1c103e;
}

.panel-subscription:hover .panel-cta :deep(svg) {
  transform: translateX(4px);
}

.code-form {
  display: flex;
  gap: 0.6rem;
}

.code-input {
  flex: 1;
  min-width: 0;
  padding: 0.8rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.28);
  color: white;
  font-family: inherit;
  font-size: 0.95rem;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}

.code-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: normal;
  text-transform: none;
}

.code-input:focus {
  outline: none;
  border-color: var(--accent);
  background: rgba(0, 0, 0, 0.42);
}

.code-button {
  flex-shrink: 0;
  padding: 0.8rem 1.4rem;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: white;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    filter 0.18s ease,
    transform 0.18s ease;
}

.code-button:hover:not(:disabled) {
  filter: brightness(1.12);
  transform: translateY(-2px);
}

.code-button:disabled {
  opacity: 0.6;
}

/* Desktop only — the one breakpoint that matters is a narrowed app window,
   below which the wide region no longer earns its extra column and the
   dividing rules have to turn horizontal. */
@media (max-width: 1000px) {
  .quick-bento,
  .quick-bento.is-flipped {
    grid-template-columns: 1fr;
  }

  .panel-library {
    grid-row: auto;
    min-height: 0;
    border-right: none;
    border-bottom: 1px solid var(--divider);
  }

  .panel-subscription {
    border-bottom: 1px solid var(--divider);
  }

  .panel-code {
    border-top: none;
  }

  .panel-subscription,
  .panel-code {
    padding-left: clamp(1.5rem, 5vw, 4rem);
    padding-right: clamp(1.5rem, 5vw, 4rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel,
  .panel-link :deep(svg),
  .cover,
  .resume-play,
  .code-button,
  .panel-cta :deep(svg) {
    transition: none;
  }

  .cover:hover,
  .resume-play:hover:not(:disabled),
  .code-button:hover:not(:disabled) {
    transform: none;
  }

  .badge-dot {
    animation: none;
  }
}
</style>
