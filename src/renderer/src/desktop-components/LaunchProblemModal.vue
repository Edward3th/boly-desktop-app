<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AlertModal from '@/components/AlertModal.vue'

// Tells the player why a game didn't open. The main process sends one
// 'game-launch-problem' per failure (main/services/LaunchProblemReporter.ts)
// and has already reported it to Boly, so the support team can see it too.

interface LaunchProblem {
  gameId: number
  code: string
  stage: string
  message: string
  httpStatus: number | null
  exitCode: number | null
}

const { t, te } = useI18n()
const problem = ref<LaunchProblem | null>(null)
const copied = ref(false)

const reason = computed(() => {
  if (!problem.value) return ''
  const key = `launch_problem_${problem.value.code}`
  return te(key) ? t(key) : t('launch_problem_unknown')
})

// What support asks for: kept short enough to read out over the phone.
const technical = computed(() => {
  const p = problem.value
  if (!p) return ''
  const parts = [`${p.stage}/${p.code}`, `game ${p.gameId}`]
  if (p.httpStatus !== null) parts.push(`HTTP ${p.httpStatus}`)
  if (p.exitCode !== null) parts.push(`exit ${p.exitCode}`)
  return `${parts.join(' · ')} — ${p.message}`
})

async function copyDetails(): Promise<void> {
  try {
    await navigator.clipboard.writeText(technical.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Clipboard unavailable: the text stays selectable on screen.
  }
}

onMounted(() => {
  window.electronAPI.onGameLaunchProblem((data) => {
    copied.value = false
    problem.value = data
  })
})

onUnmounted(() => {
  window.electronAPI.removeAllListeners('game-launch-problem')
})
</script>

<template>
  <AlertModal :show="problem !== null" @close="problem = null">
    <template #header>
      <h3 class="launch-problem-title">{{ t('launch_problem_title') }}</h3>
    </template>
    <template #body>
      <p class="launch-problem-reason">{{ reason }}</p>
      <p class="launch-problem-reported">{{ t('launch_problem_reported') }}</p>
      <div class="launch-problem-technical">
        <span class="launch-problem-label">{{ t('launch_problem_details') }}</span>
        <code>{{ technical }}</code>
      </div>
    </template>
    <template #footer>
      <button type="button" class="alert-modal-close-button launch-problem-copy" @click="copyDetails">
        {{ copied ? t('launch_problem_copied') : t('launch_problem_copy') }}
      </button>
    </template>
  </AlertModal>
</template>

<style scoped>
.launch-problem-title {
  margin: 0;
}

.launch-problem-reason {
  margin: 0 0 0.75rem;
  line-height: 1.4;
}

.launch-problem-reported {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  opacity: 0.75;
}

.launch-problem-technical {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.launch-problem-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.6;
}

.launch-problem-technical code {
  font-size: 0.75rem;
  word-break: break-word;
  user-select: text;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
}

.launch-problem-copy {
  margin-right: 0.5rem;
  cursor: pointer;
}
</style>
