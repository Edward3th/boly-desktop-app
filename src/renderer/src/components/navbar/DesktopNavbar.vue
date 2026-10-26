<script setup lang="ts">
import TheLogo from '../logo/TheLogo.vue'
import TheMainLogo from '../logo/TheMainLogo.vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth, useUser } from '@/stores'

const props = defineProps({
  color: {
    type: String,
    default: 'pink'
  },
  // 'pink' is the tinted wordmark used across the app; 'main' is the full-colour
  // logo, currently only used on the home page.
  logo: {
    type: String,
    default: 'pink'
  }
})

const router = useRouter()
const route = useRoute()
const auth = useAuth()
const user = useUser()

function GoToHome() {
  router.push('/')
}

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <header :class="props.color">
    <nav>
      <div class="left-section">
        <TheMainLogo v-if="props.logo === 'main'" class="logo" @click="GoToHome()" />
        <TheLogo v-else class="logo" @click="GoToHome()" />
      </div>

      <div class="navigation">
        <RouterLink :class="{ active: isActive('/') }" to="/">
          <p>{{ $t('home') }}</p>
        </RouterLink>
        <!-- Signed-in users are subscribers: every game is already theirs, so
             the library is the games page and there is nothing to buy. -->
        <RouterLink v-if="auth.isLoggedIn" :class="{ active: isActive('/library') }" to="/library">
          <p>{{ $t('games') }}</p>
        </RouterLink>
        <template v-else>
          <RouterLink :class="{ active: isActive('/games') }" to="/games">
            <p>{{ $t('games') }}</p>
          </RouterLink>
          <div class="dropdown-container">
            <button class="dropdown-button" :class="{ active: isActive('/contact') }">
              <p>{{ $t('contact') }}</p>
            </button>
            <div class="dropdown-menu">
              <a
                href="https://boly.cl/developer-contact"
                target="_blank"
                rel="noopener noreferrer"
                class="dropdown-item"
              >
                <p>{{ $t('developer_contact') }}</p>
              </a>
              <a
                href="https://boly.cl/educators"
                target="_blank"
                rel="noopener noreferrer"
                class="dropdown-item"
              >
                <p>{{ $t('educators') }}</p>
              </a>
              <RouterLink to="/contact" class="dropdown-item">
                <p>{{ $t('support') }}</p>
              </RouterLink>
            </div>
          </div>
          <RouterLink :class="{ active: isActive('/subscription') }" to="/subscription">
            <p>{{ $t('subscription') }}</p>
          </RouterLink>
        </template>
      </div>

      <div class="user-navigation">
        <!-- Authentication Links -->
        <RouterLink v-if="!auth.isLoggedIn" class="login" to="/login">
          <p>{{ $t('log_in') }}</p>
        </RouterLink>
        <a
          v-if="!auth.isLoggedIn"
          class="signup"
          href="https://boly.cl/register-pending"
          target="_blank"
        >
          <p>{{ $t('sign_up') }}</p>
        </a>

        <!-- User Profile -->
        <RouterLink v-if="auth.isLoggedIn" to="/account" class="user-profile-link">
          <img
            :src="
              user.profilePictureUrl ||
              'https://t4.ftcdn.net/jpg/02/15/84/43/360_F_215844325_ttX9YiIIyeaR7Ne6EaLLjMAmy4GvPC69.jpg'
            "
            class="icon user_icon"
            alt="Profile picture"
          />
          <p>{{ user.username }}</p>
        </RouterLink>
      </div>
    </nav>
  </header>
</template>

<style scoped>
header {
  padding: 2rem 4rem;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  transform: skewY(-3.5deg);
  transform-origin: top left;
  position: relative;
  z-index: 1;
}

nav {
  margin: 0 auto;
  max-width: 1500px;
  height: 150px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  transform: skewY(3.5deg);
  transform-origin: top left;
}

/* Logo Section Styles
-------------------------------------------- */
.left-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  padding: 0;
  min-width: 150px;
  cursor: pointer;
}

/* Main Navigation Styles
-------------------------------------------- */
.navigation {
  flex-grow: 0.5;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-left: -10px;
}

.navigation a {
  margin-right: 30px;
  margin-top: -80px;
  color: white;
  font-size: 22px;
  text-transform: uppercase;
}

.navigation a.active {
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 6px;
  border-radius: 15px;
  padding: 5px 12px;
}

/* Dropdown Styles
-------------------------------------------- */
.dropdown-container {
  position: relative;
  margin-right: 30px;
  margin-top: -80px;
}

.dropdown-button {
  background: none;
  border: none;
  color: white;
  font-size: 22px;
  text-transform: uppercase;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}

.dropdown-button.active {
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 6px;
  border-radius: 15px;
  padding: 5px 12px;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  background-color: var(--boly-button-pink);
  border-radius: 8px;
  padding: 10px 0;
  min-width: 200px;
  opacity: 100%;
  visibility: hidden;
  transform: translateY(-10px);
  transition: all 0.3s ease;
  z-index: 1000;
  margin-top: 5px;
  border: white 2px solid;
}

.dropdown-container:hover .dropdown-menu {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.dropdown-item {
  display: block;
  padding: 10px 20px;
  color: white;
  text-decoration: none;
  font-size: 18px;
  transition: background-color 0.2s ease;
  margin: 0 !important;
}

.dropdown-item:hover {
  background-color: var(--boly-button-pink-hover);
}

.dropdown-item p {
  margin: 0;
}

/* User Navigation Styles
-------------------------------------------- */
.user-navigation {
  width: 350px;
  justify-content: end;
  height: 46px;
  display: flex;
  align-items: center;
}

.user-navigation a {
  margin-top: -80px;
  font-size: 22px;
}

.user-profile-link {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Authentication Button Styles
-------------------------------------------- */
.login,
.signup {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 35px;
  font-size: 22px;
  color: white;
  transform: skew(-20deg);
  border-radius: 5px;
}

.login {
  width: 195px;
  background-color: #b93cb9;
  margin-right: 0px;
  z-index: 2;
}

.login:hover {
  background-color: #a032a0;
}

.signup {
  width: 175px;
  background-color: #96b91e;
  margin-left: 10px;
  z-index: 1;
}

.signup:hover {
  background-color: #849433;
}

/* Icon Styles
-------------------------------------------- */
.icon {
  height: 25px;
  width: 25px;
  fill: var(--light);
  transition-duration: 0.2s;
}

.user_icon {
  height: 30px;
  width: 30px;
  border-radius: 50%;
}

a:hover > .icon {
  fill: var(--lightCyan);
  transition-duration: 0.2s;
}

/* Utility Styles
-------------------------------------------- */
p {
  margin: 0;
}

/* Color Classes */
.blue {
  background-color: var(--boly-bg-orange);
}

.orange {
  background-color: var(--boly-bg-orange);
}

.pink {
  background-color: var(--boly-button-pink);
}
</style>
