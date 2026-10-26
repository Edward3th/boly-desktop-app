<script setup lang="ts">
import TheLogo from '../logo/TheLogo.vue'
import TheMainLogo from '../logo/TheMainLogo.vue'
import { ref } from 'vue'
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

const isMenuOpen = ref(false)

function GoToHome() {
  router.push('/')
}

function GoToAccount() {
  router.push('/account')
}

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value
}

function closeMenu() {
  isMenuOpen.value = false
}

function handleProfileClick() {
  GoToAccount()
  closeMenu()
}

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <header :class="props.color">
    <nav class="mobile-nav">
      <div class="mobile-left-section">
        <TheMainLogo
          v-if="props.logo === 'main'"
          class="logo mobile-logo"
          @click="GoToHome()"
        />
        <TheLogo v-else class="logo mobile-logo" @click="GoToHome()" />
      </div>

      <!-- Mobile Menu Toggle -->
      <button class="burger-menu" @click="toggleMenu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <!-- Profile Picture in Top Right -->
      <div v-if="auth.isLoggedIn" class="mobile-user-navigation">
        <img
          :src="
            user.profilePictureUrl ||
            'https://t4.ftcdn.net/jpg/02/15/84/43/360_F_215844325_ttX9YiIIyeaR7Ne6EaLLjMAmy4GvPC69.jpg'
          "
          class="icon user_icon"
          alt="Profile picture"
          @click="GoToAccount()"
        />
      </div>

      <!-- Main Navigation Links -->
      <div class="navigation mobile-menu" :class="{ 'mobile-menu-open': isMenuOpen }">
        <!-- User Profile Section in Menu -->
        <div v-if="auth.isLoggedIn" class="mobile-profile-section" @click="handleProfileClick">
          <img
            :src="
              user.profilePictureUrl ||
              'https://t4.ftcdn.net/jpg/02/15/84/43/360_F_215844325_ttX9YiIIyeaR7Ne6EaLLjMAmy4GvPC69.jpg'
            "
            class="menu-profile-pic"
            alt="Profile picture"
          />
          <p class="menu-username">{{ user.username }}</p>
        </div>

        <RouterLink :class="{ active: isActive('/') }" to="/" @click="closeMenu">
          <p>{{ $t('home') }}</p>
        </RouterLink>
        <!-- Signed-in users are subscribers: every game is already theirs, so
             the library is the games page and there is nothing to buy. -->
        <template v-if="auth.isLoggedIn">
          <RouterLink :class="{ active: isActive('/library') }" to="/library" @click="closeMenu">
            <p>{{ $t('games') }}</p>
          </RouterLink>
          <RouterLink :class="{ active: isActive('/ranking') }" to="/ranking" @click="closeMenu">
            <p>{{ $t('ranking') }}</p>
          </RouterLink>
        </template>
        <template v-else>
          <RouterLink :class="{ active: isActive('/games') }" to="/games" @click="closeMenu">
            <p>{{ $t('games') }}</p>
          </RouterLink>
          <RouterLink :class="{ active: isActive('/contact') }" to="/contact" @click="closeMenu">
            <p>{{ $t('contact') }}</p>
          </RouterLink>
          <RouterLink
            :class="{ active: isActive('/subscription') }"
            to="/subscription"
            @click="closeMenu"
          >
            <p>{{ $t('subscription') }}</p>
          </RouterLink>
        </template>

        <!-- Mobile-only Navigation Items -->
        <RouterLink
          v-if="auth.isLoggedIn"
          :class="{ active: isActive('/account') }"
          to="/account"
          class="mobile-menu-item"
          @click="closeMenu"
        >
          <p>{{ $t('account_title') }}</p>
        </RouterLink>
        <!-- Authentication Links for Mobile Menu -->
        <RouterLink
          v-if="!auth.isLoggedIn"
          :class="{ active: isActive('/login') }"
          to="/login"
          class="mobile-menu-item mobile-auth-link"
          @click="closeMenu"
        >
          <p>{{ $t('log_in') }}</p>
        </RouterLink>
      </div>
    </nav>
  </header>
</template>

<style scoped>
/* Base Layout Styles
-------------------------------------------- */
header {
  padding: 1rem 1.5rem;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  transform: skewY(-3.5deg);
  transform-origin: top left;
  position: relative;
  z-index: 1;
  width: 100vw;
}

nav.mobile-nav {
  height: 80px;
  padding: 0;
  position: relative;
  margin: 0 auto;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  transform: skewY(3.5deg);
  transform-origin: top left;
  z-index: 100 !important;
}

/* Logo Section Styles
-------------------------------------------- */
.mobile-left-section {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
}

.mobile-logo {
  min-width: 60px;
  width: 60px;
  height: auto;
  padding: 0;
  cursor: pointer;
}

/* Main Navigation Styles
-------------------------------------------- */
.navigation {
  margin-left: 0;
}

.navigation a {
  margin: 0.5rem 0;
  padding: 0.5rem;
  width: 100%;
  margin-top: 0;
  font-size: 18px;
  color: white;
  text-transform: uppercase;
}

.navigation a p {
  width: 100%;
  text-align: center;
}

.navigation a.active {
  text-decoration-thickness: 3px;
  text-underline-offset: 6px;
  border-radius: 15px;
  padding: 5px 12px;
  background-color: rgba(255, 255, 255, 0.2);
}

/* User Navigation Styles
-------------------------------------------- */
.mobile-user-navigation {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: auto;
  display: flex;
  align-items: center;
}

.mobile-user-navigation a {
  margin-top: 0;
  font-size: 16px;
}

/* User Profile Styles
-------------------------------------------- */
.user_icon {
  width: 35px;
  height: 35px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.user_icon:hover {
  transform: scale(1.1);
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

.mobile-profile-section {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.8rem 0.5rem;
  margin-bottom: 0.5rem;
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
}

.menu-profile-pic {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid white;
  margin-right: 10px;
}

.menu-username {
  color: white;
  font-size: 18px;
  text-transform: uppercase;
  font-weight: bold;
}

/* Burger Menu & Mobile Menu Styles
-------------------------------------------- */
.burger-menu {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  width: 25px;
  height: 25px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  z-index: 10;
}

.burger-menu span {
  width: 100%;
  height: 3px;
  background: var(--light);
  border-radius: 1px;
  transition: all 0.3s ease;
}

.mobile-menu {
  display: none;
  flex-direction: column;
  position: absolute;
  top: 80px;
  left: 0;
  width: 100%;
  padding: 1rem;
  z-index: 100 !important;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  min-height: fit-content;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
}

.mobile-menu-item {
  width: 100%;
  text-align: center;
  padding: 0.5rem;
  color: white;
  font-size: 18px;
  text-transform: uppercase;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.mobile-menu-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.mobile-menu-open {
  display: flex;
  animation: slideDown 0.2s ease-out forwards;
  transform-origin: top;
  opacity: 1;
  border-top: 2px solid rgba(255, 255, 255, 0.2);
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  background-color: var(--boly-button-pink);
}

/* Authentication & Cart Button Styles
-------------------------------------------- */
.login,
.signup {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 35px;
  font-size: 16px;
  color: white;
  transform: skew(-20deg);
  border-radius: 5px;
  width: auto;
  padding: 0 10px;
}

.login {
  background-color: #b93cb9;
  margin-right: 0px;
  z-index: 2;
}

.login:hover {
  background-color: #a032a0;
}

.signup {
  background-color: #96b91e;
  margin-left: 10px;
  z-index: 1;
}

.signup:hover {
  background-color: #849433;
}

.mobile-user-navigation a p {
  display: none;
}

/* Icon Styles
-------------------------------------------- */
.icon {
  height: 25px;
  width: 25px;
  fill: var(--light);
  transition-duration: 0.2s;
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
  background-color: #40a8e2;
}

.pink {
  background-color: #ff0099;
}

/* Animations */
@keyframes slideDown {
  from {
    transform: scaleY(0);
    opacity: 0;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}
</style>
