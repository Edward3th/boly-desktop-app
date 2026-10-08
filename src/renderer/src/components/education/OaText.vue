<script setup lang="ts">
import { computed, ref } from 'vue'
import { splitOaText } from '@/utils/curriculum'

// An OA's official text. Long ones (some run past 2,000 characters) start
// clamped to a few lines; expanding shows the ">>" sub-items as a list.
const props = defineProps<{ code: string; text: string }>()

const COLLAPSE_OVER = 220

const expanded = ref(false)
const parts = computed(() => splitOaText(props.text))
const collapsible = computed(() => props.text.length > COLLAPSE_OVER || parts.value.bullets.length > 0)
const flat = computed(() => [parts.value.lead, ...parts.value.bullets].join(' · '))
</script>

<template>
  <div class="oa-text">
    <template v-if="expanded || !collapsible">
      <p class="oa-lead"><span class="oa-code">{{ code }}</span>{{ parts.lead }}</p>
      <ul v-if="parts.bullets.length > 0" class="oa-bullets">
        <li v-for="(bullet, index) in parts.bullets" :key="index">{{ bullet }}</li>
      </ul>
    </template>
    <p v-else class="oa-lead oa-clamped"><span class="oa-code">{{ code }}</span>{{ flat }}</p>
    <button v-if="collapsible" type="button" class="oa-toggle" @click.prevent.stop="expanded = !expanded">
      {{ expanded ? $t('edu_show_less') : $t('edu_show_more') }}
    </button>
  </div>
</template>

<style scoped>
.oa-text {
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--light);
}

.oa-code {
  font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
  margin-right: 0.4rem;
  white-space: nowrap;
}

.oa-lead {
  margin: 0;
}

.oa-clamped {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.oa-bullets {
  margin: 0.3rem 0 0;
  padding-left: 1.2rem;
}

.oa-bullets li {
  margin: 0.15rem 0;
}

.oa-toggle {
  border: none;
  background: transparent;
  color: var(--boly-button-light-blue);
  font-family: inherit;
  font-size: 0.8rem;
  padding: 0.15rem 0;
  cursor: pointer;
}

.oa-toggle:hover {
  text-decoration: underline;
}
</style>
