<script setup lang="ts">
/**
 * Home-page hero: a cinematic, full-bleed carousel of the most recently
 * released games. Replaces the static Boly logo that used to fill this space.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import 'vue3-carousel/dist/carousel.css'
import { Carousel, Slide, Navigation } from 'vue3-carousel'
import { useAuth, useGames, useUser } from '@/stores'
import SkeletonBase from '@/components/skeletons/SkeletonBase.vue'
import { resolveImageUrl, PLACEHOLDER_IMAGE } from '@/utils/imageUrl'
import type { Game } from '@/types'

/** How many of the newest games get a slide. */
const MAX_SLIDES = 5

const router = useRouter()
const i18n = useI18n()
const auth = useAuth()
const user = useUser()
const gamesStore = useGames()
const { loading } = storeToRefs(gamesStore)

const featuredGames = ref<Game[]>([])
const carouselRef = ref<any>()
const currentSlide = ref(0)
const isMobile = ref(window.innerWidth <= 768)

/** game_id -> access flags, so the CTA can offer Play instead of See more. */
const access = ref<Record<number, { owned: boolean; subscriptionAccess: boolean }>>({})

const settings = computed(() => ({
  itemsToShow: 1,
  snapAlign: 'center',
  wrapAround: featuredGames.value.length > 1,
  autoplay: featuredGames.value.length > 1 ? 7000 : undefined,
  pauseAutoplayOnHover: true,
  transition: 400,
  mouseDrag: true,
  touchDrag: true
}))

/** banner_url is a string on most games and an array of media on newer ones. */
function bannerFor(item: Game): string {
  const raw = item.banner_url as unknown
  const first = Array.isArray(raw)
    ? raw.find((url: string) => typeof url === 'string' && !url.endsWith('.mp4'))
    : raw
  return resolveImageUrl(first as string | undefined) || PLACEHOLDER_IMAGE
}

function localized(field: unknown): string {
  const value = field as Record<string, string> | undefined
  return value?.[i18n.locale.value] || value?.en || ''
}

function hasAccess(item: Game): boolean {
  const flags = access.value[item.game_id]
  return !!flags && (flags.owned || flags.subscriptionAccess)
}

/** 'Already owned' for a purchase, 'Subscription access' when it comes from a plan. */
function accessLabel(item: Game): string {
  const flags = access.value[item.game_id]
  return flags?.owned ? i18n.t('already_owned') : i18n.t('subscription_access')
}

function goToGame(id: number) {
  router.push('/games/' + id)
}

function goToLibrary() {
  router.push('/library')
}

function moveToSlide(index: number) {
  carouselRef.value?.slideTo(index)
}

const handleResize = () => {
  isMobile.value = window.innerWidth <= 768
}

async function loadAccessFlags() {
  if (!auth.isLoggedIn || !user.userId) return
  const userId = Number(user.userId)
  if (Number.isNaN(userId)) return

  const results = await Promise.all(
    featuredGames.value.map((game) => gamesStore.ownsGame(game.game_id, userId))
  )
  const flags: Record<number, { owned: boolean; subscriptionAccess: boolean }> = {}
  featuredGames.value.forEach((game, index) => {
    flags[game.game_id] = results[index]
  })
  access.value = flags
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)

  await gamesStore.getAll()
  featuredGames.value = [...gamesStore.games]
    .sort(
      (a, b) => new Date(b.release_date ?? 0).getTime() - new Date(a.release_date ?? 0).getTime()
    )
    .slice(0, MAX_SLIDES)

  await loadAccessFlags()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="hero-carousel">
    <div v-if="loading && !featuredGames.length" class="hero-skeleton">
      <SkeletonBase height="100%" radius="26px" />
    </div>

    <div v-else-if="featuredGames.length" class="hero-frame">
      <carousel ref="carouselRef" v-bind="settings" v-model="currentSlide">
        <slide v-for="item in featuredGames" :key="item.game_id">
          <article class="hero-slide" @click="goToGame(item.game_id)">
            <img class="hero-art" :src="bannerFor(item)" :alt="localized(item.name)" />
            <div class="hero-scrim"></div>

            <div class="hero-copy" @click.stop>
              <span class="hero-tag">{{ $t('featured').toUpperCase() }}</span>
              <h2 class="hero-title">{{ localized(item.name).toUpperCase() }}</h2>
              <p v-if="localized(item.description)" class="hero-desc">
                {{ localized(item.description) }}
              </p>

              <!-- Every game comes with the subscription: no price or cart. -->
              <p class="hero-price">{{ accessLabel(item) }}</p>

              <div class="hero-actions">
                <template v-if="hasAccess(item)">
                  <button class="hero-btn hero-btn-primary" @click="goToLibrary">
                    {{ $t('play').toUpperCase() }}
                  </button>
                  <button class="hero-btn hero-btn-ghost" @click="goToGame(item.game_id)">
                    {{ $t('see_more').toUpperCase() }}
                  </button>
                </template>
                <button
                  v-else
                  class="hero-btn hero-btn-primary"
                  @click="goToGame(item.game_id)"
                >
                  {{ $t('see_more').toUpperCase() }}
                </button>
              </div>
            </div>
          </article>
        </slide>

        <template #addons>
          <navigation v-if="!isMobile && featuredGames.length > 1" />
        </template>
      </carousel>

      <div v-if="featuredGames.length > 1" class="hero-dots">
        <button
          v-for="(item, index) in featuredGames"
          :key="item.game_id"
          class="hero-dot"
          :class="{ active: currentSlide === index }"
          :aria-label="localized(item.name)"
          @click="moveToSlide(index)"
        ></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-carousel {
  width: 100%;
  max-width: 1250px;
  margin: 0 auto;
  padding: 0 2rem;
}

.hero-skeleton {
  height: clamp(320px, 34vw, 520px);
  border-radius: 26px;
  overflow: hidden;
}

.hero-frame {
  position: relative;
  border-radius: 26px;
  border: 3px solid rgba(255, 255, 255, 0.55);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  /* Shows through wherever the art does not fill the frame. */
  background: var(--lightGreen);
}

.hero-slide {
  position: relative;
  width: 100%;
  height: clamp(320px, 34vw, 520px);
  cursor: pointer;
  overflow: hidden;
}

.hero-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 6s ease-out;
}

.hero-slide:hover .hero-art {
  transform: scale(1.04);
}

.hero-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top, rgba(19, 10, 37, 0.8) 0%, rgba(19, 10, 37, 0.2) 45%, transparent 65%),
    linear-gradient(to right, rgba(19, 10, 37, 0.5) 0%, transparent 55%);
}

.hero-copy {
  position: absolute;
  left: clamp(1.5rem, 3.5vw, 3.5rem);
  right: clamp(1.5rem, 3.5vw, 3.5rem);
  bottom: clamp(1.5rem, 3vw, 2.75rem);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  max-width: 640px;
  cursor: default;
}

.hero-tag {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: 1rem;
  letter-spacing: 3px;
  color: var(--boly-featured-green);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}

.hero-title {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: clamp(2.2rem, 4.2vw, 4rem);
  line-height: 1;
  color: white;
  margin: 0.3rem 0 0.6rem;
  text-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
  width: auto;
  text-align: left;
}

.hero-desc {
  font-family: 'Poppins', sans-serif;
  font-size: clamp(0.95rem, 1.1vw, 1.1rem);
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.88);
  margin: 0;
  text-align: left;
  width: auto;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.hero-price {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1.1rem;
  letter-spacing: 1px;
  color: white;
  margin: 0.9rem 0 0;
  text-align: left;
  width: auto;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.hero-btn {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1.05rem;
  letter-spacing: 1px;
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0.65rem 1.6rem;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    background-color 0.2s ease,
    filter 0.2s ease;
}

.hero-btn:hover {
  transform: translateY(-2px);
}

.hero-btn-primary {
  background-color: var(--boly-button-pink);
  box-shadow: 0 8px 20px rgba(255, 0, 153, 0.35);
}

.hero-btn-primary:hover {
  background-color: var(--boly-button-pink-hover);
}

.hero-btn-ghost {
  background-color: rgba(255, 255, 255, 0.16);
  border: 2px solid rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(4px);
}

.hero-btn-ghost:hover {
  background-color: rgba(255, 255, 255, 0.28);
}

.hero-dots {
  position: absolute;
  right: clamp(1.5rem, 3.5vw, 3.5rem);
  bottom: clamp(1.6rem, 3vw, 2.9rem);
  display: flex;
  gap: 0.5rem;
  z-index: 3;
}

.hero-dot {
  width: 11px;
  height: 11px;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition:
    width 0.25s ease,
    background-color 0.25s ease;
}

.hero-dot.active {
  width: 28px;
  border-radius: 6px;
  background: white;
}

@media (max-width: 768px) {
  .hero-carousel {
    padding: 0 1rem;
  }

  .hero-copy {
    max-width: 100%;
  }

  .hero-dots {
    display: none;
  }
}
</style>

<style>
/* vue3-carousel puts the arrows outside the slide by default; pull them in over
   the artwork so the hero stays edge-to-edge. */
.hero-frame .carousel__prev {
  left: 14px;
}

.hero-frame .carousel__next {
  right: 14px;
}
</style>
