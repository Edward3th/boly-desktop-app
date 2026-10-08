<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCurriculum } from '@/stores'
import type { GameTypeFilter } from '@/composables/useGameFilters'

// The search + grade + subject + type bar shared by the store and the
// library. State lives in useGameFilters; this only renders it.
const query = defineModel<string>('query', { required: true })
const gradeCode = defineModel<string>('gradeCode', { required: true })
const groupSlug = defineModel<string>('groupSlug', { required: true })
const gameType = defineModel<GameTypeFilter>('gameType', { required: true })

const { t } = useI18n()
const curriculum = useCurriculum()

const STAGES = ['parvularia', 'basica', 'media'] as const

const gradesByStage = computed(() =>
  STAGES.map((stage) => ({
    stage,
    grades: (curriculum.catalog?.grades ?? []).filter((grade) => grade.stage === stage)
  })).filter((group) => group.grades.length > 0)
)
</script>

<template>
  <div class="filters" role="search">
    <input
      v-model="query"
      type="search"
      class="filter-control filter-search"
      :placeholder="t('store_search_placeholder')"
      :aria-label="t('store_search_placeholder')"
    />
    <label class="filter">
      <span class="sr-only">{{ t('store_filter_grade') }}</span>
      <select v-model="gradeCode" class="filter-control" :class="{ active: gradeCode }">
        <option value="">{{ t('store_all_grades') }}</option>
        <optgroup v-for="group in gradesByStage" :key="group.stage" :label="t(`store_stage_${group.stage}`)">
          <option v-for="grade in group.grades" :key="grade.grade_id" :value="grade.code">{{ grade.name }}</option>
        </optgroup>
      </select>
    </label>
    <label class="filter">
      <span class="sr-only">{{ t('store_filter_subject') }}</span>
      <select v-model="groupSlug" class="filter-control" :class="{ active: groupSlug }">
        <option value="">{{ t('store_all_subjects') }}</option>
        <option v-for="group in curriculum.catalog?.subject_groups ?? []" :key="group.subject_group_id" :value="group.slug">
          {{ group.name }}
        </option>
      </select>
    </label>
    <label class="filter">
      <span class="sr-only">{{ t('store_filter_type') }}</span>
      <select v-model="gameType" class="filter-control" :class="{ active: gameType }">
        <option value="">{{ t('store_all_types') }}</option>
        <option value="web">{{ t('store_type_web') }}</option>
        <option value="descargable">{{ t('store_type_download') }}</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  padding: 0.75rem;
  border-radius: 12px;
  background: var(--boly-bg-dark-blue);
  border: 1px solid rgba(251, 251, 251, 0.08);
  font-family: 'Poppins', sans-serif;
}

.filter {
  display: flex;
  min-width: 0;
}

.filter-control {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  box-sizing: border-box;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  border: 1px solid rgba(251, 251, 251, 0.15);
  background: rgba(19, 10, 37, 0.45);
  color: var(--light);
  font-family: 'Poppins', sans-serif;
  font-size: 0.9rem;
  text-overflow: ellipsis;
}

.filter-control:focus {
  outline: 2px solid var(--boly-button-purple);
  outline-offset: 1px;
}

.filter-control.active {
  border-color: var(--boly-button-purple);
  background: rgba(188, 61, 228, 0.18);
}

/* The native dropdown panel is rendered white by the OS — don't let the
   options inherit the light on-dark text color of the select itself */
.filter-control option,
.filter-control optgroup {
  color: #1c1c24;
  background: #ffffff;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 900px) {
  .filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .filter-search {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .filters {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
