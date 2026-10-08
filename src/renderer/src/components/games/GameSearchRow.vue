<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Game, LocalizedString } from '@/types'
import { PLACEHOLDER_IMAGE, resolveImageUrl } from '@/utils/imageUrl'
import GameEducationMeta from '@/components/education/GameEducationMeta.vue'

// One game in the store search list (Steam-style): key art on the left; name,
// short description, subject, grades and topic on the right.
const props = defineProps<{ game: Game; index?: number }>()

const { t, locale } = useI18n()

const GAME_TYPE_WEB = 2
const GAME_TYPE_DOWNLOADABLE = 3

const localized = (value: LocalizedString | null | undefined) =>
  value?.[locale.value] || value?.es || value?.en || ''

const name = computed(() => localized(props.game.name))
// Games without educational content yet fall back to their long description,
// clamped to the same two lines.
const description = computed(
  () => localized(props.game.education?.short_description) || localized(props.game.description)
)

const typeLabel = computed(() => {
  if (props.game.game_type_id === GAME_TYPE_WEB) return t('store_type_web')
  if (props.game.game_type_id === GAME_TYPE_DOWNLOADABLE) return t('store_type_download')
  return ''
})

// Full URLs (S3) pass through; legacy rows store a relative path (served from
// VITE_IMAGES_BASE_URL) or a JSON array of images (the first is the key art).
const bannerSrc = computed(() => {
  const raw = props.game.banner_url?.trim()
  if (!raw) return null
  let path = raw
  if (raw.startsWith('[')) {
    try {
      path = JSON.parse(raw)[0] ?? ''
    } catch {
      return null
    }
  }
  if (!path) return null
  return resolveImageUrl(path)
})
const imageFailed = ref(false)
</script>

<template>
  <RouterLink :to="`/games/${game.game_id}`" class="row" :style="{ '--i': index ?? 0 }">
    <div class="capsule">
      <img v-if="bannerSrc && !imageFailed" :src="bannerSrc" alt="" loading="lazy" @error="imageFailed = true" />
      <img v-else :src="PLACEHOLDER_IMAGE" alt="" class="capsule-placeholder" />
    </div>

    <div class="row-body">
      <h3 class="row-name">{{ name }}</h3>
      <p v-if="description" class="row-desc">{{ description }}</p>
      <GameEducationMeta :education="game.education" />
    </div>

    <div class="row-side">
      <span v-if="game.free_to_play" class="free-badge">{{ t('store_free') }}</span>
      <span v-if="typeLabel" class="type-tag">{{ typeLabel }}</span>
    </div>
  </RouterLink>
</template>

<style scoped>
.row {
  position: relative;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) auto;
  gap: 1.25rem;
  align-items: center;
  padding: 0.75rem;
  border-radius: 12px;
  color: var(--light);
  text-decoration: none;
  font-family: 'Poppins', sans-serif;
  transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  animation: row-in 0.35s ease both;
  /* Cascade the first rows in; later ones arrive together. */
  animation-delay: calc(min(var(--i), 12) * 35ms);
}

/* Hairline between consecutive rows, inset so it doesn't follow the rounded
   corners of the hover background. */
.row + .row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0.75rem;
  right: 0.75rem;
  border-top: 1px solid rgba(84, 84, 84, 0.48);
}

.row:hover::before,
.row:hover + .row::before {
  opacity: 0;
}

.row:hover,
.row:focus-visible {
  background-color: rgba(251, 251, 251, 0.06);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

.row:focus-visible {
  outline: 2px solid var(--boly-button-purple);
  outline-offset: 2px;
}

.row:active {
  transform: translateY(0);
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

.row-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.3;
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

.row-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem;
  font-size: 0.78rem;
  white-space: nowrap;
}

.type-tag {
  color: var(--light-gray);
}

.free-badge {
  padding: 0.15rem 0.6rem;
  border-radius: 6px;
  background: rgba(112, 188, 100, 0.18);
  color: #70bc64;
  font-weight: 600;
}

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
  .row {
    animation: none;
    transition: none;
  }
}

@media (max-width: 768px) {
  .row {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 0.85rem;
    align-items: start;
    padding: 0.6rem;
  }

  .row-name {
    font-size: 1rem;
  }

  .row-side {
    grid-column: 2;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
  }
}
</style>
