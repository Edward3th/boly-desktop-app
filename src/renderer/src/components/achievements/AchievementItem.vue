<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TrophyIcon from '@/components/icons/TrophyIcon.vue'
import type { GameAchievement, LocalizedString } from '@/types'

// One achievement as players see it, on a game's page or a public profile.
// A hidden achievement the player hasn't unlocked arrives with every detail
// nulled by the API and renders as a placeholder.
const props = defineProps<{ achievement: GameAchievement }>()

const { t, locale } = useI18n()

const localized = (value: LocalizedString | null) =>
  value ? value[locale.value] || value.es || value.en || '' : ''

const isPlaceholder = computed(() => props.achievement.hidden && props.achievement.name === null)
const name = computed(() => (isPlaceholder.value ? t('ach_hidden_name') : localized(props.achievement.name)))
const description = computed(() =>
  isPlaceholder.value ? t('ach_hidden_description') : localized(props.achievement.description)
)

// A progress bar only makes sense for "reach N" achievements still in progress.
const showProgress = computed(
  () => !props.achievement.unlocked && (props.achievement.target ?? 1) > 1 && props.achievement.current !== null
)
const percent = computed(() =>
  Math.min(100, Math.round(((props.achievement.current ?? 0) / (props.achievement.target ?? 1)) * 100))
)

const unlockedDate = computed(() =>
  props.achievement.unlocked_at
    ? new Date(props.achievement.unlocked_at).toLocaleDateString(locale.value, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    : ''
)
</script>

<template>
  <article class="achievement" :class="{ unlocked: achievement.unlocked, placeholder: isPlaceholder }">
    <div class="icon" aria-hidden="true">
      <img v-if="achievement.icon_url" :src="achievement.icon_url" alt="" />
      <span v-else-if="isPlaceholder" class="glyph">?</span>
      <TrophyIcon v-else class="trophy" />
    </div>

    <div class="body">
      <h3 class="name">{{ name }}</h3>
      <p v-if="description" class="description">{{ description }}</p>

      <div v-if="showProgress" class="progress" :aria-label="t('ach_progress_label', { current: achievement.current, target: achievement.target })">
        <div class="bar"><div class="fill" :style="{ width: `${percent}%` }" /></div>
        <span class="count">{{ achievement.current }}/{{ achievement.target }}</span>
      </div>
    </div>

    <div class="state">
      <span v-if="achievement.unlocked" class="badge done">
        {{ t('ach_unlocked') }}<template v-if="unlockedDate"> · {{ unlockedDate }}</template>
      </span>
      <span v-else class="badge locked">{{ t('ach_locked') }}</span>
    </div>
  </article>
</template>

<style scoped>
.achievement {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: center;
  gap: 0.9rem;
  padding: 0.8rem 1rem;
  border-radius: 12px;
  background: rgba(251, 251, 251, 0.04);
  border: 1px solid rgba(251, 251, 251, 0.08);
  font-family: 'Poppins', sans-serif;
  min-width: 0;
}

.achievement.unlocked {
  border-color: rgba(125, 203, 39, 0.45);
  background: rgba(125, 203, 39, 0.07);
}

.icon {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  background: rgba(251, 251, 251, 0.08);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.achievement:not(.unlocked) .icon img,
.achievement:not(.unlocked) .trophy {
  filter: grayscale(1);
  opacity: 0.55;
}

.trophy {
  width: 28px;
  height: 28px;
  fill: var(--boly-highlight);
}

.glyph {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 1.6rem;
  color: var(--light-gray);
}

.body {
  min-width: 0;
}

.name {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 600;
  color: var(--light);
}

.placeholder .name {
  font-style: italic;
  color: var(--light-gray);
}

.description {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: var(--light-gray);
}

.progress {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.45rem;
}

.bar {
  flex: 1;
  max-width: 260px;
  height: 6px;
  border-radius: 999px;
  background: rgba(251, 251, 251, 0.12);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: inherit;
  background: var(--boly-button-light-blue);
}

.count {
  font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  color: var(--light-gray);
}

.badge {
  white-space: nowrap;
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}

.badge.done {
  color: #c9f29a;
  background: rgba(125, 203, 39, 0.16);
}

.badge.locked {
  color: var(--light-gray);
  background: rgba(251, 251, 251, 0.08);
}

@media (max-width: 560px) {
  .achievement {
    grid-template-columns: 48px 1fr;
  }

  .icon {
    width: 48px;
    height: 48px;
  }

  .state {
    grid-column: 2;
  }
}
</style>
