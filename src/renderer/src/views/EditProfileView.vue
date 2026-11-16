<script setup lang="ts">
import { useAuth, useUser } from '@/stores'
import { useRouter } from 'vue-router'
import TagAbove from '@/components/forms/TagAbove.vue'
import { onMounted, ref, onBeforeUnmount } from 'vue'
import AlertModal from '@/components/AlertModal.vue'
import SimpleLoadingIcon from '@/components/icons/SimpleLoadingIcon.vue'
import type { UserUpdateRequest, PasswordUpdateRequest } from '@/types'
import axios from 'axios'
import AvatarPicker from '@/components/AvatarPicker.vue'
import { avatarFor } from '@/utils/avatars'

const router = useRouter()
const auth = useAuth()
const user = useUser()

if (!auth.isLoggedIn && !auth.token) {
  router.back()
}

const showModal = ref<boolean>(false)
const modalWarning = ref<string>('')
const dataLoading = ref<boolean>(false)
const passwordLoading = ref<boolean>(false)

const username = ref<string>('')
const email = ref<string>('')
const oldpassword = ref<string>('')
const password = ref<string>('')
const repassword = ref<string>('')
const birthday = ref<string>('')
const bio = ref<string>('')

// Mobile detection
const isMobile = ref(window.innerWidth < 768)

// Handle window resize
const handleResize = () => {
  isMobile.value = window.innerWidth < 768
}

onMounted(() => {
  username.value = user.username
  email.value = user.email
  birthday.value = user.birthday?.toString() || ''
  bio.value = user.bio || ''

  // Add resize event listener
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  // Remove resize event listener
  window.removeEventListener('resize', handleResize)
})

// Uploading a picture of their own isn't available (the API's upload route is
// off), so the + opens the Boly / game icons instead.
const showAvatarPicker = ref<boolean>(false)

function onAvatarSaved(message: string): void {
  showModal.value = true
  modalWarning.value = message
}

function ChangeUserInfo(): void {
  const patch: UserUpdateRequest = {
    username: username.value,
    email: email.value,
    birthday: birthday.value,
    bio: bio.value
  }

  UpdateUser(patch)
}

async function UpdateUser(patch: UserUpdateRequest): Promise<void> {
  dataLoading.value = true
  try {
    const result = await user.updateUserInfo(patch)
    showModal.value = true
    modalWarning.value = result.message

    if (result.success) {
      // Refresh user data before navigating back
      const response = await axios.get(`/v1/users/${user.userId}`)
      if (response.status === 200) {
        user.setUser(response.data)
      }
      router.back()
    }
  } finally {
    dataLoading.value = false
  }
}

function ChangePassword(): void {
  if (repassword.value === password.value) {
    const request: PasswordUpdateRequest = {
      oldpass: oldpassword.value,
      pass: password.value
    }

    UpdatePassword(request)
  } else {
    showModal.value = true
    modalWarning.value = 'Passwords are different!'
  }
}

async function UpdatePassword(request: PasswordUpdateRequest): Promise<void> {
  passwordLoading.value = true
  try {
    const result = await user.updatePassword(request)
    showModal.value = true
    modalWarning.value = result.message

    if (result.success) {
      // Clear password fields after successful update
      oldpassword.value = ''
      password.value = ''
      repassword.value = ''
    }
  } finally {
    passwordLoading.value = false
  }
}
</script>

<template>
  <div class="section">
    <h1 class="title-bold" :class="{ 'mobile-title': isMobile }">{{ $t('edit_profile_title') }}</h1>
    <div class="mform" :class="{ mobile: isMobile }">
      <h2 class="section-title">{{ $t('user_info').toUpperCase() }}</h2>
      <p class="user-email">{{ user.email }}</p>

      <!-- Mobile view for profile section -->
      <div v-if="isMobile" class="mobile-input-container">
        <div class="profile-pic-container">
          <div class="profile-pic-wrapper">
            <img
              :src="avatarFor(user.userId, user.profilePictureUrl)"
              class="current-profile-pic"
              alt="Profile picture"
            />
            <button
              type="button"
              class="edit-icon"
              :aria-label="$t('avatar_choose')"
              :title="$t('avatar_choose')"
              @click="showAvatarPicker = true"
            >
              +
            </button>
          </div>
        </div>

        <TagAbove class="form-label field-spacing">
          {{ $t('username') }}
          <template #child>
            <input
              v-model="username"
              class="text"
              type="text"
              :placeholder="$t('enter_new_username')"
            />
          </template>
        </TagAbove>

        <TagAbove class="form-label field-spacing">
          {{ $t('email') }}
          <template #child>
            <input v-model="email" class="text" type="email" :placeholder="$t('enter_new_email')" />
          </template>
        </TagAbove>

        <TagAbove class="form-label field-spacing">
          {{ $t('birthday') }}
          <template #child>
            <input v-model="birthday" class="text" type="date" />
          </template>
        </TagAbove>

        <TagAbove class="form-label field-spacing">
          {{ $t('bio') }}
          <template #child>
            <textarea
              v-model="bio"
              class="text mobile-textarea"
              type="text"
              :placeholder="$t('enter_new_bio')"
            ></textarea>
          </template>
        </TagAbove>

        <button class="apply-button btn-purple mobile-button" @click="ChangeUserInfo()">
          <SimpleLoadingIcon v-if="dataLoading" />
          <span v-if="!dataLoading">{{ $t('apply') }}</span>
        </button>
      </div>

      <!-- Desktop view for profile section -->
      <div v-else class="input-container">
        <div class="halfsize">
          <TagAbove>
            <template #child>
              <div class="profile-pic-container">
                <div class="profile-pic-wrapper">
                  <img
                    :src="avatarFor(user.userId, user.profilePictureUrl)"
                    class="current-profile-pic"
                    alt="Profile picture"
                  />
                  <button
                    type="button"
                    class="edit-icon"
                    :aria-label="$t('avatar_choose')"
                    :title="$t('avatar_choose')"
                    @click="showAvatarPicker = true"
                  >
                    +
                  </button>
                </div>
              </div>
            </template>
          </TagAbove>
          <TagAbove class="form-label field-spacing">
            {{ $t('username') }}
            <template #child>
              <input
                v-model="username"
                class="text"
                type="text"
                :placeholder="$t('enter_new_username')"
              />
            </template>
          </TagAbove>
          <TagAbove class="form-label field-spacing">
            {{ $t('email') }}
            <template #child>
              <input
                v-model="email"
                class="text"
                type="email"
                :placeholder="$t('enter_new_email')"
              />
            </template>
          </TagAbove>
          <TagAbove class="form-label field-spacing">
            {{ $t('birthday') }}
            <template #child>
              <input v-model="birthday" class="text" type="date" />
            </template>
          </TagAbove>
          <button class="apply-button btn-purple" @click="ChangeUserInfo()">
            <SimpleLoadingIcon v-if="dataLoading" />
            <span v-if="!dataLoading">{{ $t('apply') }}</span>
          </button>
        </div>
        <div class="halfsize form-label">
          <TagAbove class="field-spacing">
            {{ $t('bio') }}
            {{ $t('profile_biography') }}
            <template #child>
              <textarea
                v-model="bio"
                class="text"
                type="text"
                :placeholder="$t('enter_new_bio')"
                style="height: 400px"
              ></textarea>
            </template>
          </TagAbove>
          <button class="apply-button btn-purple" @click="ChangeUserInfo()">
            <SimpleLoadingIcon v-if="dataLoading" />
            <span v-if="!dataLoading">{{ $t('apply') }}</span>
          </button>
        </div>
      </div>

      <h2 class="change-pass-section-title">{{ $t('change_password').toUpperCase() }}</h2>

      <!-- Mobile password section -->
      <div v-if="isMobile" class="mobile-password-section">
        <TagAbove class="form-label">
          {{ $t('password') }}
          <template #child>
            <input
              v-model="oldpassword"
              class="text"
              type="password"
              :placeholder="$t('enter_old_password')"
            />
            <input
              v-model="password"
              class="text password-field"
              type="password"
              :placeholder="$t('enter_new_password')"
            />
            <input
              v-model="repassword"
              class="text password-field"
              type="password"
              :placeholder="$t('repeat_password')"
            />
          </template>
        </TagAbove>
        <button class="apply-button btn-purple mobile-button" @click="ChangeUserInfo()">
          <SimpleLoadingIcon v-if="dataLoading" />
          <span v-if="!dataLoading">{{ $t('apply') }}</span>
        </button>
      </div>

      <!-- Desktop password section -->
      <div v-else class="password-container">
        <TagAbove class="halfsize form-label">
          {{ $t('password') }}
          <template #child>
            <input
              v-model="oldpassword"
              class="text"
              type="password"
              :placeholder="$t('enter_old_password')"
            />
            <input
              v-model="password"
              class="text"
              type="password"
              :placeholder="$t('enter_new_password')"
            />
            <input
              v-model="repassword"
              class="text"
              type="password"
              :placeholder="$t('repeat_password')"
            />
          </template>
        </TagAbove>
        <div class="password-button-container">
          <button class="apply-button btn-purple" @click="ChangePassword()">
            <SimpleLoadingIcon v-if="passwordLoading" />
            <span v-if="!passwordLoading">{{ $t('apply') }}</span>
          </button>
        </div>
      </div>
    </div>

    <AvatarPicker :show="showAvatarPicker" @close="showAvatarPicker = false" @saved="onAvatarSaved" />

    <Teleport to="body">
      <AlertModal :show="showModal" @close="showModal = false">
        <template #header>
          <h3>{{ $t('notification') }}</h3>
        </template>
        <template #body> {{ modalWarning }} </template>
      </AlertModal>
    </Teleport>
  </div>
</template>

<style scoped>
.title-bold {
  width: 100%;
  text-align: start;
  font-size: 300%;
}

.mobile-title {
  font-size: 130%;
  text-align: center;
  margin-bottom: 10px;
}

.section-title {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 150%;
}

.change-pass-section-title {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 120%;
}

h2 {
  text-align: left;
  width: 100%;
}

.mform {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background-color: var(--boly-bg-blue-transparent);
  padding: 30px;
  border-radius: 20px;
  box-sizing: border-box;
}

.mform.mobile {
  padding: 15px 10px;
  gap: 10px;
  max-width: 100%;
  overflow-x: hidden;
  background-color: var();
}

.change-password {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 100%;
}

.halfsize {
  width: 50%;
}

.mform > div {
  display: flex;
  gap: 5px;
}

.input-container {
  display: flex;
  flex-direction: row;
  gap: 1rem;
}

/* Mobile specific styles */
.mobile-input-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
}

.mobile-password-section {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
}

.mobile-textarea {
  height: 120px !important;
  width: 100% !important;
  box-sizing: border-box;
}

.mobile-button {
  width: 100% !important;
  margin-top: 10px;
  height: 45px !important;
  font-size: 100% !important;
}

.password-field {
  margin-top: 8px;
}

input,
textarea {
  resize: none;
  max-width: 100%;
  outline: none;
  padding: 0.8rem 0.8rem;
  border-radius: 0.8rem;
  background-color: var(--boly-bg-dark-transparent);
  color-scheme: dark;
  border: none;
  margin-top: 5px;
  box-sizing: border-box;
  width: 100%;
}

textarea {
  height: 200px;
}

.apply-button {
  width: 200px;
  color: var(--light);
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 120%;
  border-radius: 10px;
  border: none;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
}

.profile-pic-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.profile-pic-wrapper {
  position: relative;
  width: 150px;
  height: 150px;
}

/* Adjust profile pic size for mobile */
@media (max-width: 768px) {
  .profile-pic-wrapper {
    width: 120px;
    height: 120px;
  }

  .current-profile-pic {
    width: 120px !important;
    height: 120px !important;
  }
}

.current-profile-pic {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  border: 3px solid var(--boly-button-purple);
  object-fit: cover;
}

.edit-icon {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background-color: var(--boly-button-purple);
  color: white;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  font-size: 20px;
  font-weight: bold;
  border: none;
  padding: 0;
}

.user-email {
  text-align: left;
  font-size: 1rem;
  color: var(--light);
  margin-top: -15px;
}

.form-label {
  font-family: 'Poppins', sans-serif;
  color: var(--white);
}

.field-spacing {
  margin-bottom: 15px;
}

/* Additional mobile adjustments */
@media (max-width: 768px) {
  .section {
    padding: 1rem 0.5rem;
    width: 100%;
    max-width: 100vw;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  .field-spacing {
    margin-bottom: 10px;
  }

  input,
  textarea {
    padding: 0.7rem 0.7rem;
    width: 100%;
    max-width: 100%;
  }

  .user-email {
    font-size: 0.9rem;
    margin-top: -10px;
    word-break: break-word;
  }

  .edit-icon {
    width: 25px;
    height: 25px;
    font-size: 16px;
  }

  .section-title {
    font-size: 120%;
  }

  .change-pass-section-title {
    font-size: 110%;
    margin-top: 5px;
  }
}

.password-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.password-button-container {
  display: flex;
  justify-content: flex-start;
  margin-top: 15px;
}
</style>
