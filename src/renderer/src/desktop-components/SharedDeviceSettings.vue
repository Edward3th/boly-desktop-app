<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { useI18n } from 'vue-i18n'
import useSharedDevice from '@/desktop-stores/sharedDevice'

// Shared-computer mode on this computer. Anyone may turn it on (it only adds
// safety); turning it off or changing the inactivity time takes a teacher or
// an admin re-entering their password, so a student can't undo it.

const props = defineProps<{ titleClass?: string }>()

const { t } = useI18n()
const shared = useSharedDevice()

const idleMinutes = ref(shared.idleMinutes)
// A change waiting for a teacher's password: turn off, or a new idle time.
const pending = ref<{ enabled: boolean; idleMinutes: number } | null>(null)
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const saved = ref(false)

onMounted(async () => {
  await shared.load()
  idleMinutes.value = shared.idleMinutes
})

const statusText = computed(() =>
  shared.isShared ? t('shared_settings_on', { minutes: shared.idleMinutes }) : t('shared_settings_off')
)

function flashSaved(): void {
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}

async function turnOn(): Promise<void> {
  await shared.setMode(true, idleMinutes.value)
  flashSaved()
}

function ask(enabled: boolean): void {
  error.value = null
  password.value = ''
  pending.value = { enabled, idleMinutes: idleMinutes.value }
}

function cancel(): void {
  pending.value = null
  idleMinutes.value = shared.idleMinutes
}

async function confirm(): Promise<void> {
  if (!pending.value || !password.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    const { data } = await axios.post('/v1/auth/confirm-password', { password: password.value })
    if (data.role_id !== 1 && data.role_id !== 4) {
      error.value = t('shared_settings_teacher_only')
      return
    }
    await shared.setMode(pending.value.enabled, pending.value.idleMinutes)
    pending.value = null
    flashSaved()
  } catch (e: any) {
    const status = e.response?.status
    error.value =
      status === 429
        ? t('profiles_locked', {
            minutes: Math.max(1, Math.ceil((e.response?.data?.retry_after_seconds ?? 300) / 60))
          })
        : status === 401
          ? t('profiles_wrong_password')
          : t('profiles_error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="shared-settings">
    <h2 :class="props.titleClass">{{ t('shared_settings_title') }}</h2>
    <p class="shared-help">{{ t('shared_settings_help') }}</p>
    <p class="shared-status">
      <strong>{{ statusText }}</strong>
      <span v-if="saved" class="shared-saved">✓ {{ t('shared_settings_saved') }}</span>
    </p>

    <label class="shared-field">
      <span>{{ t('shared_settings_idle') }}</span>
      <select v-model.number="idleMinutes" :disabled="busy">
        <option v-for="m in shared.idleOptions" :key="m" :value="m">
          {{ t('shared_settings_minutes', { minutes: m }) }}
        </option>
      </select>
    </label>

    <div class="shared-buttons">
      <button v-if="!shared.isShared" type="button" class="shared-primary" @click="turnOn">
        {{ t('shared_settings_turn_on') }}
      </button>
      <template v-else>
        <button
          type="button"
          class="shared-primary"
          :disabled="idleMinutes === shared.idleMinutes"
          @click="ask(true)"
        >
          {{ t('shared_settings_save_time') }}
        </button>
        <button type="button" class="shared-secondary" @click="ask(false)">
          {{ t('shared_settings_turn_off') }}
        </button>
      </template>
    </div>

    <form v-if="pending" class="shared-confirm" @submit.prevent="confirm">
      <p>{{ t('shared_settings_confirm') }}</p>
      <input v-model="password" type="password" :placeholder="t('password')" autocomplete="off" />
      <p v-if="error" class="shared-error">{{ error }}</p>
      <div class="shared-buttons">
        <button type="button" class="shared-secondary" @click="cancel">{{ t('profiles_cancel') }}</button>
        <button type="submit" class="shared-primary" :disabled="!password || busy">
          {{ t('shared_settings_confirm_button') }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.shared-settings {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-family: 'Poppins', sans-serif;
  color: white;
}

.shared-help {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.85;
}

.shared-status {
  margin: 0;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.shared-saved {
  color: var(--lightGreen, #8ee5a1);
  font-size: 0.85rem;
}

.shared-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  max-width: 260px;
}

.shared-field select,
.shared-confirm input {
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.25);
  color: white;
  padding: 0 0.6rem;
  font-family: 'Poppins', sans-serif;
}

.shared-field select option {
  background: #2b2350;
}

.shared-buttons {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.shared-buttons button {
  height: 38px;
  padding: 0 1.1rem;
  border-radius: 20px;
  border: none;
  font-weight: 700;
  cursor: pointer;
  font-family: 'Poppins', sans-serif;
}

.shared-buttons button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.shared-primary {
  background: var(--lightGreen, #8ee5a1);
  color: var(--bgGreen, #1d4d2b);
}

.shared-secondary {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.shared-confirm {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 0.8rem 1rem;
  max-width: 360px;
}

.shared-confirm p {
  margin: 0;
  font-size: 0.85rem;
}

.shared-error {
  color: #ffd2d2;
}
</style>
