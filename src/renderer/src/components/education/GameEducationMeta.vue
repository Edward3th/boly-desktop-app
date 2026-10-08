<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCurriculum } from '@/stores'
import type { GameEducationSummary, LocalizedString } from '@/types'
import { describeTargets } from '@/utils/curriculum'

// The subject chips, grade range and topic line of a game row — shared by the
// store search and the library.
const props = defineProps<{ education?: GameEducationSummary | null }>()

const { t, locale } = useI18n()
const curriculum = useCurriculum()

const MAX_SUBJECT_CHIPS = 2

const localized = (value: LocalizedString | null | undefined) =>
  value?.[locale.value] || value?.es || value?.en || ''

const summary = computed(() =>
  describeTargets(props.education?.targets ?? [], curriculum.gradeById, curriculum.subjectById)
)
const visibleSubjects = computed(() => summary.value.subjects.slice(0, MAX_SUBJECT_CHIPS))
const hiddenSubjectCount = computed(() => summary.value.subjects.length - visibleSubjects.value.length)
const topic = computed(() => localized(props.education?.topic))
</script>

<template>
  <ul v-if="summary.subjects.length > 0 || topic" class="row-meta">
    <li v-for="subject in visibleSubjects" :key="subject.subject_id" class="subject-chip">{{ subject.name }}</li>
    <li v-if="hiddenSubjectCount > 0" class="subject-chip more">+{{ hiddenSubjectCount }}</li>
    <li v-if="summary.grades" class="meta-text">{{ summary.grades }}</li>
    <li v-if="topic" class="meta-text">
      <span class="meta-label">{{ t('store_topic') }}:</span> {{ topic }}
    </li>
  </ul>
</template>

<style scoped>
.row-meta {
  list-style: none;
  margin: 0.15rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-family: 'Poppins', sans-serif;
}

.subject-chip {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: rgba(188, 61, 228, 0.2);
  color: #ec85fc;
  font-weight: 600;
}

.subject-chip.more {
  background: rgba(251, 251, 251, 0.08);
  color: var(--light-gray);
}

.meta-text {
  color: var(--light);
}

.meta-label {
  color: var(--light-gray);
}
</style>
