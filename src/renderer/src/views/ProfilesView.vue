<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/stores'
import useSharedDevice, { type SharedProfile } from '@/desktop-stores/sharedDevice'
import EyeIcon from '@/components/icons/EyeIcon.vue'
import EyeSlashIcon from '@/components/icons/EyeSlashIcon.vue'

// Shared computers: who has signed in here, as cards. Pick yours and type
// only your password. Adding a profile is the normal sign-in form.

const { t } = useI18n()
const auth = useAuth()
const shared = useSharedDevice()
const router = useRouter()
const route = useRoute()

const selected = ref<SharedProfile | null>(null)
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const removing = ref<SharedProfile | null>(null)
const passwordInput = ref<HTMLInputElement | null>(null)

// Why the previous user was signed out, shown once on arrival.
const notice = computed(() => {
  const reason = route.query.reason
  if (reason === 'idle') return t('profiles_signed_out_idle')
  if (reason === 'lock') return t('profiles_signed_out_lock')
  if (reason === 'expired') return t('profiles_signed_out_expired')
  return null
})

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?'

async function pick(profile: SharedProfile): Promise<void> {
  selected.value = profile
  password.value = ''
  error.value = null
  await nextTick()
  passwordInput.value?.focus()
}

function back(): void {
  selected.value = null
  password.value = ''
  error.value = null
}

async function submit(): Promise<void> {
  if (!selected.value || !password.value || busy.value) return
  busy.value = true
  error.value = null
  const result = await auth.profileLogin(selected.value.user_id, password.value, router)
  busy.value = false
  if (result.ok) return
  password.value = ''
  if (result.reason === 'locked') {
    const minutes = Math.max(1, Math.ceil((result.retryAfterSeconds ?? 300) / 60))
    error.value = t('profiles_locked', { minutes })
  } else if (result.reason === 'invalid') {
    error.value = t('profiles_wrong_password')
  } else {
    error.value = t('profiles_error')
  }
  await nextTick()
  passwordInput.value?.focus()
}

async function confirmRemove(): Promise<void> {
  if (!removing.value) return
  await shared.removeProfile(removing.value.user_id)
  removing.value = null
  if (!shared.hasProfiles) router.push('/login')
}
</script>

<template>
  <div class="profiles-page">
    <h1 class="profiles-title">{{ selected ? selected.username : t('profiles_title') }}</h1>
    <p v-if="notice && !selected" class="profiles-notice">{{ notice }}</p>

    <!-- Step 1: pick a profile -->
    <div v-if="!selected" class="profiles-grid">
      <div v-for="profile in shared.profiles" :key="profile.user_id" class="profile-card-wrap">
        <button type="button" class="profile-card" @click="pick(profile)">
          <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="" class="profile-avatar" />
          <span v-else class="profile-avatar profile-initial">{{ initial(profile.username) }}</span>
          <span class="profile-name">{{ profile.username }}</span>
        </button>
        <button
          type="button"
          class="profile-remove"
          :title="t('profiles_remove')"
          :aria-label="t('profiles_remove')"
          @click="removing = profile"
        >
          ✕
        </button>
      </div>

      <button type="button" class="profile-card profile-add" @click="router.push('/login')">
        <span class="profile-avatar profile-initial">+</span>
        <span class="profile-name">{{ t('profiles_add') }}</span>
      </button>
    </div>

    <!-- Step 2: password -->
    <form v-else class="profile-password" @submit.prevent="submit">
      <img v-if="selected.avatar_url" :src="selected.avatar_url" alt="" class="profile-avatar large" />
      <span v-else class="profile-avatar profile-initial large">{{ initial(selected.username) }}</span>

      <div class="password-field">
        <input
          ref="passwordInput"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          :placeholder="t('password')"
          autocomplete="off"
          class="password-input"
          :disabled="busy"
        />
        <button type="button" class="password-toggle" @click="showPassword = !showPassword">
          <EyeIcon v-if="!showPassword" />
          <EyeSlashIcon v-else />
        </button>
      </div>

      <p v-if="error" class="profiles-error">{{ error }}</p>

      <div class="profile-actions">
        <button type="button" class="secondary" @click="back">{{ t('profiles_back') }}</button>
        <button type="submit" class="primary" :disabled="!password || busy">
          {{ busy ? t('profiles_signing_in') : t('login') }}
        </button>
      </div>
      <RouterLink to="/forgot-password" class="forgot-link">{{ t('forgot_your_password') }}</RouterLink>
    </form>

    <div v-if="removing" class="remove-backdrop" @click.self="removing = null">
      <div class="remove-dialog">
        <p>{{ t('profiles_remove_confirm', { name: removing.username }) }}</p>
        <div class="profile-actions">
          <button type="button" class="secondary" @click="removing = null">{{ t('profiles_cancel') }}</button>
          <button type="button" class="primary" @click="confirmRemove">{{ t('profiles_remove') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profiles-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem 1rem 6rem;
  width: 100%;
  font-family: 'Poppins', sans-serif;
  color: white;
}

.profiles-title {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 2.6rem;
  letter-spacing: 0.1rem;
  transform: rotate(-1.5deg);
  margin: 0;
  text-align: center;
}

.profiles-notice {
  margin: 0;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 12px;
  padding: 0.6rem 1rem;
  text-align: center;
}

.profiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 1.25rem;
  width: min(900px, 100%);
}

.profile-card-wrap {
  position: relative;
}

.profile-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 16px;
  transition: transform 0.12s ease, background 0.12s ease;
}

.profile-card:hover,
.profile-card:focus-visible {
  transform: translateY(-3px);
  background: rgba(255, 255, 255, 0.08);
  outline: none;
}

.profile-avatar {
  width: 96px;
  height: 96px;
  border-radius: 20px;
  object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.85);
  background: var(--boly-button-purple, #6b4fd8);
}

.profile-avatar.large {
  width: 120px;
  height: 120px;
}

.profile-initial {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 2.6rem;
}

.profile-add .profile-avatar {
  background: rgba(255, 255, 255, 0.12);
  border-style: dashed;
}

.profile-name {
  font-weight: 700;
  text-align: center;
  word-break: break-word;
}

.profile-remove {
  position: absolute;
  top: 0;
  right: 6px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: white;
  cursor: pointer;
  font-size: 0.8rem;
  opacity: 0;
  transition: opacity 0.12s;
}

.profile-card-wrap:hover .profile-remove,
.profile-remove:focus-visible {
  opacity: 1;
}

.profile-password {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: min(340px, 100%);
}

.password-field {
  position: relative;
  width: 100%;
}

.password-input {
  width: 100%;
  border: none;
  border-bottom: 2px solid white;
  background: transparent;
  color: white;
  padding: 8px 32px 8px 0;
  font-size: 1.05rem;
  outline: none;
  font-family: 'Poppins', sans-serif;
}

.password-input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.password-toggle {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
}

.profiles-error {
  margin: 0;
  color: #ffd2d2;
  background: rgba(229, 72, 77, 0.3);
  border-radius: 10px;
  padding: 0.4rem 0.8rem;
  text-align: center;
}

.profile-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.profile-actions button {
  height: 38px;
  padding: 0 1.2rem;
  border-radius: 20px;
  border: none;
  font-weight: 700;
  cursor: pointer;
  font-family: 'Poppins', sans-serif;
}

.profile-actions .primary {
  background: var(--lightGreen, #8ee5a1);
  color: var(--bgGreen, #1d4d2b);
}

.profile-actions .primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.profile-actions .secondary {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.forgot-link {
  color: white;
  font-size: 0.85rem;
}

.remove-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
}

.remove-dialog {
  background: #2b2350;
  border-radius: 16px;
  padding: 1.25rem 1.5rem;
  width: min(380px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-align: center;
}
</style>
