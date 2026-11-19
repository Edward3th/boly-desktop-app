<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/stores'

// Shared computers: the main process watches Windows' idle time
// (SharedDeviceService) and asks here to warn, cancel the warning, or sign
// out. Any keyboard or mouse use cancels it on its own — the button is
// just the obvious thing to click.

const { t } = useI18n()
const auth = useAuth()
const router = useRouter()

const secondsLeft = ref(0)
const visible = ref(false)
let countdown: ReturnType<typeof setInterval> | null = null

function stopCountdown(): void {
  if (countdown) clearInterval(countdown)
  countdown = null
}

function hide(): void {
  visible.value = false
  stopCountdown()
}

async function signOut(reason: string): Promise<void> {
  hide()
  await auth.logout()
  router.push({ path: '/profiles', query: { reason } })
}

const ipc = () => window.electron?.ipcRenderer

onMounted(() => {
  ipc()?.on('shared-device:idle-warning', (_event, data: { secondsLeft: number }) => {
    secondsLeft.value = Math.max(1, Math.round(data?.secondsLeft ?? 60))
    visible.value = true
    stopCountdown()
    countdown = setInterval(() => {
      if (secondsLeft.value > 0) secondsLeft.value -= 1
    }, 1000)
  })
  ipc()?.on('shared-device:idle-cancel', () => hide())
  ipc()?.on('shared-device:sign-out', (_event, data: { reason: string }) => {
    signOut(data?.reason === 'lock' ? 'lock' : 'idle')
  })
})

onUnmounted(() => {
  stopCountdown()
  ipc()?.removeAllListeners('shared-device:idle-warning')
  ipc()?.removeAllListeners('shared-device:idle-cancel')
  ipc()?.removeAllListeners('shared-device:sign-out')
})
</script>

<template>
  <Transition name="idle-fade">
    <div v-if="visible" class="idle-backdrop">
      <div class="idle-dialog" role="alertdialog" aria-live="assertive">
        <h2 class="idle-title">{{ t('idle_title') }}</h2>
        <p class="idle-text">{{ t('idle_text', { seconds: secondsLeft }) }}</p>
        <div class="idle-seconds">{{ secondsLeft }}</div>
        <div class="idle-actions">
          <button type="button" class="idle-stay" @click="hide">{{ t('idle_stay') }}</button>
          <button type="button" class="idle-leave" @click="signOut('idle')">{{ t('idle_sign_out') }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.idle-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
}

.idle-dialog {
  background: #2b2350;
  color: white;
  border-radius: 20px;
  padding: 1.5rem 2rem;
  width: min(420px, 90vw);
  text-align: center;
  font-family: 'Poppins', sans-serif;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}

.idle-title {
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.05rem;
  margin: 0 0 0.5rem;
}

.idle-text {
  margin: 0;
}

.idle-seconds {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 3.5rem;
  margin: 0.5rem 0;
}

.idle-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.idle-actions button {
  height: 40px;
  padding: 0 1.2rem;
  border-radius: 20px;
  border: none;
  font-weight: 700;
  cursor: pointer;
  font-family: 'Poppins', sans-serif;
}

.idle-stay {
  background: var(--lightGreen, #8ee5a1);
  color: var(--bgGreen, #1d4d2b);
}

.idle-leave {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.idle-fade-enter-active,
.idle-fade-leave-active {
  transition: opacity 0.2s;
}

.idle-fade-enter-from,
.idle-fade-leave-to {
  opacity: 0;
}
</style>
