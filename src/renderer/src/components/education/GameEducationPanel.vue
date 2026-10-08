<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GameEducation } from '@/types'
import OaText from './OaText.vue'

// The "Contenido educativo" tab of a game page: for each subject × grade the
// studio picked, the units it covers with their OAs, then any OAs that sit
// outside those units.
const props = defineProps<{ education: GameEducation }>()

const { t } = useI18n()

const sections = computed(() =>
  props.education.targets.map((target) => {
    const sameTarget = (item: { grade_id: number; subject_id: number }) =>
      item.grade_id === target.grade_id && item.subject_id === target.subject_id
    const oas = props.education.oas.filter(sameTarget)
    const units = props.education.units.filter(sameTarget).map((unit) => ({
      unit,
      oas: oas.filter((oa) => oa.unit_ids.includes(unit.unit_id))
    }))
    const inUnits = new Set(units.flatMap((entry) => entry.oas.map((oa) => oa.oa_id)))
    return {
      key: `${target.grade_id}:${target.subject_id}`,
      title: `${target.subject_name} · ${target.grade_name}`,
      units,
      otherOas: oas.filter((oa) => !inUnits.has(oa.oa_id))
    }
  })
)

// Básica units are titled just "Unidad 1" with the substance in `focus`; from
// 7° básico on the title already repeats it.
const showFocus = (unit: { title: string; focus: string | null }) => !!unit.focus && !unit.title.includes(unit.focus)
</script>

<template>
  <div class="edu-panel">
    <section v-for="section in sections" :key="section.key" class="edu-section">
      <h3 class="section-title">{{ section.title }}</h3>

      <p v-if="section.units.length === 0 && section.otherOas.length === 0" class="muted">
        {{ t('game_edu_no_detail') }}
      </p>

      <article v-for="entry in section.units" :key="entry.unit.unit_id" class="unit">
        <h4 class="unit-title">{{ entry.unit.title }}</h4>
        <p v-if="showFocus(entry.unit)" class="unit-focus">{{ entry.unit.focus }}</p>
        <ul v-if="entry.oas.length > 0" class="oa-list">
          <li v-for="oa in entry.oas" :key="oa.oa_id"><OaText :code="oa.code" :text="oa.text" /></li>
        </ul>
      </article>

      <div v-if="section.otherOas.length > 0" class="unit">
        <h4 class="unit-title">
          {{ section.units.length > 0 ? t('game_edu_other_oas') : t('game_edu_objectives') }}
        </h4>
        <ul class="oa-list">
          <li v-for="oa in section.otherOas" :key="oa.oa_id"><OaText :code="oa.code" :text="oa.text" /></li>
        </ul>
      </div>
    </section>

    <p class="source-note">{{ t('game_edu_source_note') }}</p>
  </div>
</template>

<style scoped>
.edu-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  font-family: 'Poppins', sans-serif;
  color: var(--light);
  text-align: left;
}

.edu-section {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.section-title {
  margin: 0;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-weight: normal;
  font-size: 1.3rem;
  color: var(--light);
}

.unit {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: var(--boly-bg-dark-transparent);
}

.unit-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.unit-focus {
  margin: 0;
  color: var(--light-gray);
  font-size: 0.85rem;
  line-height: 1.45;
  max-width: 75ch;
}

.oa-list {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.oa-list li {
  padding-left: 0.75rem;
  border-left: 2px solid rgba(188, 61, 228, 0.6);
  max-width: 80ch;
}

.muted {
  margin: 0;
  color: var(--light-gray);
  font-size: 0.9rem;
}

.source-note {
  margin: 0;
  color: var(--light-gray);
  font-size: 0.78rem;
}

@media (max-width: 768px) {
  .unit {
    padding: 0.85rem 1rem;
  }

  .section-title {
    font-size: 1.15rem;
  }
}
</style>
