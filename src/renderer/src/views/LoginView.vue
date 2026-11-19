<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AlertModal from '@/components/AlertModal.vue'
import EyeIcon from '@/components/icons/EyeIcon.vue'
import EyeSlashIcon from '@/components/icons/EyeSlashIcon.vue'

import { useAuth } from '@/stores'
import { useI18n } from 'vue-i18n'
import useSharedDevice from '@/desktop-stores/sharedDevice'

const i18n = useI18n()

const auth = useAuth()
const router = useRouter()

const showModal = ref<boolean>(false)
const modalWarning = ref<string>('')

const email = ref<string>('')
const password = ref<string>('')
const showPassword = ref<boolean>(false)
const rememberMe = ref<boolean>(localStorage.getItem('rememberMe') === 'true')

// Shared computers: never "remember me", a way back to the profiles, and on
// the very first launch, the question that turns the mode on.
const shared = useSharedDevice()
const askShared = ref<boolean>(false)
shared.load().then(() => {
  askShared.value = shared.enabled === null
})

async function answerShared(isShared: boolean): Promise<void> {
  await shared.setMode(isShared)
  askShared.value = false
}

function togglePasswordVisibility(): void {
  showPassword.value = !showPassword.value
}

function modalCallback(): void {
  showModal.value = false
  if (auth.isLoggedIn) router.push('/')
}

async function submit(): Promise<void> {
  console.log('submit')
  if (email.value.length === 0 || password.value.length === 0) {
    showModal.value = true
    modalWarning.value = i18n.t('modal_all_fields') as string
    return
  }

  await auth.login(email.value, password.value, router, rememberMe.value)

  if (auth.isLoggedIn) {
    router.push('/')
  } else {
    showModal.value = true
    modalWarning.value =
      (i18n.t('error') as string) + ': ' + (i18n.t('invalid_credentials') as string)
  }
}
</script>

<template>
  <div class="login-page-wrapper">
    <img src="@/assets/images/elements/11.webp" alt="Decorative element" class="left-side-image" />
    <div class="login-container">
      <img
        src="@/assets/images/elements/9.webp"
        alt="Decorative element"
        class="login-element-image top-image"
      />
      <div class="fields">
        <form @submit.prevent="submit()">
          <h1 class="login-title">{{ $t('login').toUpperCase() }}</h1>
          <div class="form_group">
            <input v-model="email" type="text" class="form_field" placeholder="email or username" />
            <label for="name" class="form_label">{{ $t('login_email') }}</label>
          </div>
          <div class="form_group">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="form_field"
              placeholder="Password"
            />
            <label for="name" class="form_label">{{ $t('password') }}</label>
            <button type="button" class="password-toggle-btn" @click="togglePasswordVisibility">
              <EyeIcon v-if="!showPassword" />
              <EyeSlashIcon v-else />
            </button>
          </div>

          <!-- Remember me checkbox (never on a shared computer) -->
          <div v-if="!shared.isShared" class="form_group remember-me-group">
            <label class="remember-me-label">
              <input v-model="rememberMe" type="checkbox" class="remember-me-checkbox" />
              <span class="checkmark"></span>
              {{ $t('remember_me') }}
            </label>
          </div>

          <button class="login_button_text">{{ $t('login').toUpperCase() }}</button>
          <button
            v-if="shared.hasProfiles"
            type="button"
            class="back-to-profiles"
            @click="router.push('/profiles')"
          >
            {{ $t('profiles_back_to_list') }}
          </button>

          <Teleport to="body">
            <AlertModal :show="showModal" @close="modalCallback">
              <template #header>
                <h3>{{ $t('notification') }}</h3>
              </template>
              <template #body> {{ modalWarning }} </template>
            </AlertModal>
          </Teleport>
          <Teleport to="body">
            <div v-if="askShared" class="shared-question-backdrop">
              <div class="shared-question">
                <h3>{{ $t('shared_question_title') }}</h3>
                <p>{{ $t('shared_question_text') }}</p>
                <div class="shared-question-actions">
                  <button type="button" class="shared-yes" @click="answerShared(true)">
                    {{ $t('shared_question_yes') }}
                  </button>
                  <button type="button" class="shared-no" @click="answerShared(false)">
                    {{ $t('shared_question_no') }}
                  </button>
                </div>
              </div>
            </div>
          </Teleport>
        </form>
        <div class="register">
          <p>{{ $t('no_account') }}</p>
          <a
            href="https://boly.cl/register-pending"
            target="_blank"
            style="color: white; text-decoration: underline"
            >{{ $t('register') }}</a
          >
        </div>
        <div class="forgot-password">
          <RouterLink to="/forgot-password" style="color: white; text-decoration: underline">{{
            $t('forgot_your_password')
          }}</RouterLink>
        </div>
      </div>
      <img
        src="@/assets/images/elements/8.webp"
        alt="Decorative element"
        class="login-element-image bottom-image"
      />
    </div>
    <img src="@/assets/images/elements/10.webp" alt="Decorative element" class="right-side-image" />
  </div>
</template>

<style scoped>
.back-to-profiles {
  background: transparent !important;
  border: 1px solid rgba(255, 255, 255, 0.6) !important;
  color: white;
}

.shared-question-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.shared-question {
  background: #2b2350;
  color: white;
  border-radius: 20px;
  padding: 1.5rem 2rem;
  width: min(460px, 90vw);
  font-family: 'Poppins', sans-serif;
  text-align: center;
}

.shared-question h3 {
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.05rem;
  margin: 0 0 0.5rem;
}

.shared-question-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  margin-top: 1rem;
}

.shared-question-actions button {
  height: 40px;
  padding: 0 1.2rem;
  border-radius: 20px;
  border: none;
  font-weight: 700;
  cursor: pointer;
}

.shared-yes {
  background: var(--lightGreen, #8ee5a1);
  color: var(--bgGreen, #1d4d2b);
}

.shared-no {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

a {
  color: var(--lightGreen);
}

a:hover {
  color: var(--lightCyan);
}

h1 {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
}

.login-page-wrapper {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 100%;
  padding: 0 1rem;
}

.login-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.login-title {
  font-size: 3rem;
  text-align: center;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  transform: rotate(-1.5deg);
  letter-spacing: 0.2rem;
}

.login-container .fields {
  min-width: 300px;
  border-radius: 20px;
  padding: 2rem;
}

/* input form */

.login-container .fields .form_group {
  position: relative;
  padding: 20px 0 0;
}

.password-toggle-btn {
  position: absolute;
  right: 0;
  top: 40%;
  transform: translateY(-50%);
  background: transparent !important;
  border: none;
  color: white;
  cursor: pointer;
  padding: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.password-toggle-btn:hover {
  opacity: 0.7;
  background: transparent !important;
}

.login-container .fields .form_field {
  width: 100%;
  border: none;
  border-bottom: 2px solid white;
  border-radius: 0px;
  outline: 0;
  color: #fff;
  padding: 7px 0;
  background: transparent;
  transition: border-color 0.2s;
}

.login-container .fields .form_field::placeholder {
  color: transparent;
}

.login-container .fields .form_field:placeholder-shown ~ .form_label {
  cursor: text;
  top: 20px;
}

.login-container .fields .form_label {
  position: absolute;
  top: 0;
  display: block;
  transition: 0.2s;
  /* color: var(--boly-text-inactive-blue); */
  pointer-events: none;
  font-family: 'Poppins', sans-serif;
}

.login-container .fields .form_field:focus {
  padding-bottom: 6px;
  border-width: 3px;
  border-image: linear-gradient(to right, white);
  border-image-slice: 1;
}

.login-container .fields .form_field:focus ~ .form_label {
  position: absolute;
  top: 0;
  display: block;
  transition: 0.2s;
  color: white;
  font-size: small;
}

.login-container .fields .form_field:required,
.form_field:invalid {
  box-shadow: none;
}

/* --- */

.remember-me-group {
  padding: 0;
}

.remember-me-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.9rem;
  color: white;
  font-family: 'Poppins', sans-serif;
}

.remember-me-checkbox {
  opacity: 0;
  position: absolute;
  cursor: pointer;
}

.checkmark {
  height: 18px;
  width: 18px;
  background-color: transparent;
  border: 2px solid white;
  border-radius: 3px;
  margin-right: 8px;
  display: inline-block;
  position: relative;
  transition: all 0.2s ease;
}

.remember-me-checkbox:checked + .checkmark {
  background-color: var(--boly-button-purple);
  border-color: var(--boly-button-purple);
}

.remember-me-checkbox:checked + .checkmark::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.remember-me-label:hover .checkmark {
  border-color: var(--boly-button-purple);
}

/* --- */

.login-container form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.login-container form button {
  height: 35px;
  padding: 0 15px;
  margin-top: 1rem;
  float: right;
  background-color: var(--lightGreen);
  color: white;
  border: none;
  border-radius: 15px;
  background-color: var(--boly-button-purple);
}

.login-container form button:hover {
  transition: 0.2s;
  background-color: var(--boly-button-purple-hover);
}

.login-container .register {
  font-size: small;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--light);
  margin-top: 1rem;
}

.forgot-password {
  font-size: small;
  text-align: center;
  margin-top: 0.5rem;
}

.login_button_text {
  font-family: 'Anton', sans-serif;
  font-size: larger;
}

.login-element-image {
  margin-top: 20px;
  width: 40px;
  height: auto;
}

.right-side-image {
  position: relative;
  width: 40px;
  height: auto;
  margin-left: 0.5rem;
}

.left-side-image {
  position: relative;
  width: 40px;
  height: auto;
  margin-right: 0.5rem;
}

/* Media queries for responsive design */
@media screen and (max-width: 768px) {
  .login-page-wrapper {
    flex-direction: column;
  }

  .right-side-image,
  .left-side-image {
    width: 20px;
    margin: 1rem 0;
  }

  .login-element-image {
    width: 20px;
  }
}

@media screen and (max-width: 480px) {
  .right-side-image,
  .left-side-image {
    width: 20px;
  }

  .login-element-image {
    width: 20px;
  }

  .login-title {
    font-size: 2rem;
  }
}
</style>
