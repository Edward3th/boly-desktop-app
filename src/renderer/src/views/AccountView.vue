<script setup lang="ts">
import SkeletonList from '@/components/skeletons/SkeletonList.vue'
import { useAuth, useUser } from '@/stores'
import { RouterLink, useRouter } from 'vue-router'
import DiagonalPencilIcon from '@/components/icons/DiagonalPencilIcon.vue'
import DoorIcon from '@/components/icons/DoorIcon.vue'
import KingIcon from '@/components/icons/ManageIcon.vue'
import RightArrowIcon from '@/components/icons/RightArrowIcon.vue'
import TrophyIcon from '@/components/icons/TrophyIcon.vue'
import GameStatsIcon from '@/components/icons/GameStatsIcon.vue'
import HelpIcon from '@/components/icons/HelpIcon.vue'
import { onMounted, ref } from 'vue'
import axios from 'axios'
import AlertModal from '@/components/AlertModal.vue'
import VerifiedPersonIcon from '@/components/icons/VerifiedPersonIcon.vue'
import { useI18n } from 'vue-i18n'

const i18n = useI18n()
const router = useRouter()
const auth = useAuth()
const user = useUser()
const isMobile = ref(window.innerWidth < 768)

const showModal = ref(false)
const modalTitle = ref('')
const modalMessage = ref('')

if (!auth.isLoggedIn && !auth.token) {
  router.back()
}

onMounted(async () => {
  if (auth.isLoggedIn && user.userId) {
    try {
      const response = await axios.get(`/v1/users/${user.userId}`)
      if (response.status === 200) {
        user.setUser(response.data)
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    }
  }

  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 768
  })
})

const logout = (): void => {
  auth.logout()
  router.push({ path: '/' })
}

const EditProfile = (): void => {
  router.push('/edit')
}

// const AchievementPass = (): void => {
//   router.push("/ach-pass")
// }

const sendVerification = async () => {
  try {
    const response = await auth.sendVerificationEmail(user.email)
    console.log('Verification email sent:', response)
    if (response.status === 200) {
      // respons contains a message so for now we assume success at all times
      modalTitle.value = i18n.t('success')
      modalMessage.value = i18n.t('modal_email_verification_sent')
      showModal.value = true
    } else {
      modalTitle.value = i18n.t('success')
      modalMessage.value = i18n.t('modal_email_verification_sent', {
        message: 'Failed to send verification email.'
      })
      showModal.value = true
    }
  } catch (error: any) {
    modalTitle.value = i18n.t('success')
    modalMessage.value = i18n.t('modal_email_verification_sent', {
      message: error.message || 'Failed to send verification email.'
    })
    showModal.value = true
  }
}
</script>

<template>
  <AlertModal :show="showModal" @close="showModal = false">
    <template #header>
      <h3>{{ modalTitle }}</h3>
    </template>
    <template #body>
      <p>{{ modalMessage }}</p>
    </template>
  </AlertModal>
  <div v-if="isMobile">
    <div class="mobile-container">
      <div class="mobile-header">
        <img
          class="profile-pic"
          :src="
            user.profilePictureUrl ||
            'https://t4.ftcdn.net/jpg/02/15/84/43/360_F_215844325_ttX9YiIIyeaR7Ne6EaLLjMAmy4GvPC69.jpg'
          "
          alt="Profile picture"
        />
        <div class="details">
          <h1>{{ user.username }}</h1>
          <p>{{ user.email }}</p>
        </div>
      </div>
      <div class="mobile-bio">
        <p>{{ $t('bio') }}</p>
        <p class="bio-text">{{ user.bio }}</p>
      </div>

      <div class="mobile-section">
        <h2 class="mobile-section-title">{{ $t('account_title') }}</h2>
        <div class="mobile-button-stack">
          <RouterLink to="/edit" class="button btn-pink">
            <div class="button-content">
              <DiagonalPencilIcon class="button-icon" />
              <span>{{ $t('edit_profile') }}</span>
              <RightArrowIcon class="button-icon arrow-icon" />
            </div>
          </RouterLink>
          <RouterLink v-if="user.username" :to="`/u/${user.username}`" class="button btn-purple">
            <div class="button-content">
              <TrophyIcon class="button-icon" />
              <span>{{ $t('profile_public') }}</span>
              <RightArrowIcon class="button-icon arrow-icon" />
            </div>
          </RouterLink>
          <button class="button btn-blue" @click="logout">
            <div class="button-content">
              <DoorIcon class="button-icon" />
              <span>{{ $t('logout') }}</span>
              <RightArrowIcon class="button-icon arrow-icon" />
            </div>
          </button>
          <button v-if="!user.email_verified" class="button btn-pink" @click="sendVerification">
            <div class="button-content">
              <VerifiedPersonIcon class="button-icon" />
              <span>{{ $t('verify_account') }}</span>
              <RightArrowIcon class="button-icon arrow-icon" />
            </div>
          </button>
        </div>
      </div>

      <div v-if="user.roleId === 1" class="mobile-section">
        <h2 class="mobile-section-title">{{ $t('Admin') }}</h2>
        <div class="mobile-button-stack">
          <RouterLink to="/discount-codes" class="button btn-pink">
            <div class="button-content">
              <span>{{ $t('Discount codes') }}</span>
              <RightArrowIcon class="button-icon arrow-icon" />
            </div>
          </RouterLink>
        </div>
      </div>

      <div class="mobile-section">
        <h2 class="mobile-section-title">{{ $t('subscription_title') }}</h2>
        <div class="mobile-button-stack">
          <RouterLink to="/subscription-management" class="button btn-pink">
            <div class="button-content">
              <KingIcon class="button-icon" />
              <span>{{ $t('subscription_management') }}</span>
              <RightArrowIcon class="button-icon arrow-icon" />
            </div>
          </RouterLink>
        </div>
      </div>

      <div class="mobile-section">
        <h2 class="mobile-section-title">{{ $t('games_title') }}</h2>
        <div class="mobile-button-stack">
          <RouterLink to="/player-stats" class="button btn-blue">
            <div class="button-content">
              <GameStatsIcon class="button-icon" />
              <span>{{ $t('player_stats') }}</span>
              <RightArrowIcon class="button-icon arrow-icon" />
            </div>
          </RouterLink>
        </div>
      </div>

      <div class="mobile-section">
        <h2 class="mobile-section-title">{{ $t('help') }}</h2>
        <div class="mobile-button-stack">
          <RouterLink to="/contact" class="button btn-pink">
            <div class="button-content">
              <HelpIcon class="button-icon" />
              <span>{{ $t('help_text') }}</span>
              <RightArrowIcon class="button-icon arrow-icon" />
            </div>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
  <div v-else>
    <SkeletonList v-if="!auth.isLoggedIn && auth.token" :rows="4" />
    <div v-if="auth.isLoggedIn" class="section">
      <div class="main-container">
        <div class="left-container">
          <div class="account-preview">
            <img
              class="profile-pic"
              :src="
                user.profilePictureUrl ||
                'https://t4.ftcdn.net/jpg/02/15/84/43/360_F_215844325_ttX9YiIIyeaR7Ne6EaLLjMAmy4GvPC69.jpg'
              "
              alt="Profile picture"
            />
            <div class="details">
              <div class="name">
                <h1>{{ user.username }}</h1>
                <DiagonalPencilIcon class="icon" @click="EditProfile" />
              </div>
              <p>{{ user.email }}</p>
              <p
                v-if="!user.email_verified"
                class="text-warning"
                style="font-size: 0.9rem; color: var(--boly-yellow)"
              >
                {{ $t('email_not_verified') }}
              </p>
              <br />
            </div>
          </div>
          <div class="account-details">
            <div class="account-section">
              <h2 class="section-title">{{ $t('account_title') }}</h2>
              <div class="button-stack">
                <RouterLink to="/edit" class="button btn-pink">
                  <div class="button-content">
                    <DiagonalPencilIcon class="button-icon" />
                    <span>{{ $t('edit_profile') }}</span>
                    <RightArrowIcon class="button-icon arrow-icon" />
                  </div>
                </RouterLink>
                <RouterLink v-if="user.username" :to="`/u/${user.username}`" class="button btn-purple">
                  <div class="button-content">
                    <TrophyIcon class="button-icon" />
                    <span>{{ $t('profile_public') }}</span>
                    <RightArrowIcon class="button-icon arrow-icon" />
                  </div>
                </RouterLink>
                <button class="button btn-blue" style="cursor: pointer" @click="logout">
                  <div class="button-content">
                    <DoorIcon class="button-icon" />
                    <span>{{ $t('logout') }}</span>
                    <RightArrowIcon class="button-icon arrow-icon" />
                  </div>
                </button>
                <button
                  v-if="!user.email_verified"
                  class="button btn-pink"
                  style="cursor: pointer"
                  @click="sendVerification"
                >
                  <div class="button-content">
                    <VerifiedPersonIcon class="button-icon" />
                    <span>{{ $t('verify_account') }}</span>
                    <RightArrowIcon class="button-icon arrow-icon" />
                  </div>
                </button>
              </div>
            </div>

            <div v-if="user.roleId === 1" class="account-section">
              <h2 class="section-title">{{ $t('Admin') }}</h2>
              <div class="button-stack">
                <RouterLink to="/discount-codes" class="button btn-pink">
                  <div class="button-content">
                    <span>{{ $t('Discount codes') }}</span>
                    <RightArrowIcon class="button-icon arrow-icon" />
                  </div>
                </RouterLink>
              </div>
            </div>

            <div class="account-section">
              <h2 class="section-title">{{ $t('subscription_title') }}</h2>
              <div class="button-stack">
                <RouterLink to="/subscription-management" class="button btn-pink">
                  <div class="button-content">
                    <KingIcon class="button-icon" />
                    <span>{{ $t('subscription_management') }}</span>
                    <RightArrowIcon class="button-icon arrow-icon" />
                  </div>
                </RouterLink>
              </div>
            </div>

            <div class="account-section">
              <h2 class="section-title">{{ $t('games_title') }}</h2>
              <div class="button-stack">
                <RouterLink to="/player-stats" class="button btn-blue">
                  <div class="button-content">
                    <GameStatsIcon class="button-icon" />
                    <span>{{ $t('player_stats') }}</span>
                    <RightArrowIcon class="button-icon arrow-icon" />
                  </div>
                </RouterLink>
              </div>
            </div>

            <div class="account-section">
              <h2 class="section-title">{{ $t('help') }}</h2>
              <div class="button-stack">
                <RouterLink to="/contact" class="button btn-pink">
                  <div class="button-content">
                    <HelpIcon class="button-icon" />
                    <span>{{ $t('help_text') }}</span>
                    <RightArrowIcon class="button-icon arrow-icon" />
                  </div>
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
        <div class="bio">
          <p
            class="info"
            style="
              font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
              font-size: 100%;
            "
          >
            {{ $t('profile_info', { username: user.username }) }}
          </p>
          <br />
          <p class="title-bold">{{ $t('role') }}</p>
          <p class="role-id">{{ $t('role_' + user.roleId) }}</p>
          <p class="title-bold">{{ $t('birthday') }}</p>
          <p>{{ user.birthday }}</p>
          <p class="title-bold">{{ $t('bio') }}</p>
          <p class="bio-text">{{ user.bio }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-container {
  display: flex;
  flex-direction: row;
  gap: 1rem;
}

.left-container {
  width: 850px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-pic {
  height: 200px;
  width: 200px;
  border-radius: 50%;
  border: 3px solid var(--boly-bg-dark);
}

.account-preview {
  width: 100%;
  display: flex;
  flex-direction: row;
  gap: 2rem;
  background-color: var(--boly-bg-blue-transparent);
  border-radius: 20px;
  padding: 20px;
}
.account-details {
  width: 100%;
  min-width: 915px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  text-align: start;
  align-self: flex-start;
  border-radius: 20px;
  gap: 20px;
  background-color: transparent;
  margin-left: -4%;
}

.account-section {
  background-color: var(--boly-bg-blue-transparent);
  border-radius: 20px;
  padding: 20px;
}

.section-title {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1.5rem;
  color: var(--white);
  margin-top: 0;
  margin-bottom: 15px;
}

.button-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.button-stack .button {
  width: 100%;
  margin-top: 0;
  padding: 8px 15px;
}

.button-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  text-align: left;
  position: relative;
}

.button-content span {
  flex-grow: 1;
  font-size: 1.3rem;
}

.button-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: white;
}

.arrow-icon {
  color: white;
  margin-left: auto;
}

.account-details .info {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 100%;
}

.bio {
  min-width: 350px;
  display: flex;
  flex-direction: column;
  text-align: start;
  background: var(--boly-bg-blue-transparent);
  border-radius: 20px;
  padding: 25px;
  gap: 0.75rem;
}

.mobile-bio {
  width: 100%;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  text-align: start;
  border-radius: 20px;
  padding: 40px;
  gap: 1rem;
}

.bio .title-bold {
  font-size: 100%;
  margin-top: 15px;
  margin-bottom: -12px;
}

.bio-text {
  font-size: large;
  font-family: 'Poppins', sans-serif;
  color: var(--white);
}

.account-details > p {
  font-size: large;
}

.role-id {
  font-family: 'Poppins', sans-serif;
  color: var(--white);
}

.details {
  width: 100%;
  margin-top: 25px;
  text-align: left;
  font-size: large;
  font-family: 'Poppins', sans-serif;
  color: var(--white);
}

.details > a {
  font-size: 125%;
  cursor: pointer;
}

.details > a:hover {
  color: var(--lightGreen);
}

.name {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1rem;
}

.name > .icon {
  width: 25px;
  height: 25px;
}

.name svg {
  color: var(--gray);
  fill: var(--gray);
}

.name svg:hover {
  color: var(--lightGreen);
  fill: var(--lightGreen);
  transition: 0.1s;
  cursor: pointer;
}

button,
.button {
  padding: 5px;
  width: 100%;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: larger;
  flex-grow: 1;
  margin-top: 10px;
  color: var(--light);
  justify-content: center;
  border-radius: 5px;
  border: none;
  transition: 0.2s;
  text-align: center;
}

.btn-purple {
  background-color: var(--boly-button-purple);
}

.btn-pink:hover {
  background-color: var(--boly-button-purple-hover);
}

.btn-dark {
  background-color: var(--boly-bg-dark-transparent);
}

.btn-dark:hover {
  background-color: var(--boly-bg-blue);
}

.btn-blue {
  background-color: var(--boly-button-blue);
}

.btn-blue:hover {
  background-color: var(--boly-button-blue-hover);
}

.mobile-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem;
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
  margin: 0;
  overflow-x: hidden;
}

.mobile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding-bottom: 0.5rem;
}

.mobile-bio {
  width: 100%;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  text-align: start;
  background-color: var(--boly-bg-blue-transparent);
  border-radius: 15px;
  padding: 15px;
  gap: 0.5rem;
  box-sizing: border-box;
  margin-bottom: 10px;
}

.mobile-section {
  background-color: var(--boly-bg-blue-transparent);
  border-radius: 15px;
  padding: 15px;
  margin-bottom: 10px;
  width: 100%;
  box-sizing: border-box;
}

.mobile-section-title {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1.3rem;
  color: var(--white);
  margin-top: 0;
  margin-bottom: 15px;
}

.mobile-button-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-bio p:first-child {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1.3rem;
  margin-bottom: 0.25rem;
}

/* Mobile specific profile pic size */
.mobile-container .profile-pic {
  height: 80px;
  width: 80px;
  border-radius: 50%;
  border: 2px solid var(--boly-bg-dark);
}

/* Mobile specific details styles */
.mobile-container .details {
  text-align: center;
  width: 100%;
  margin-top: 5px;
  font-size: 0.9rem;
}

.mobile-container .details h1 {
  font-size: 1.5rem;
  margin: 0.25rem 0;
}

/* Adjusted the spacing between the bio and buttons for the mobile version */
.mobile-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  padding: 0 0.5rem;
  box-sizing: border-box;
}

.mobile-container button,
.mobile-container .button {
  padding: 8px;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1rem;
  color: var(--light);
  text-align: center;
  border-radius: 5px;
  border: none;
  transition: 0.2s;
  width: 100%;
  margin: 0;
  box-sizing: border-box;
}
</style>
