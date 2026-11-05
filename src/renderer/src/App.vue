<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router'
import { useCart } from '@/stores'
import TheNavbar from './components/navbar/TheNavbar.vue'
import TheFooter from './components/footer/TheFooter.vue'
import SkeletonPage from '@/components/skeletons/SkeletonPage.vue'
import DownloadProgressBar from '@/components/DownloadProgressBar.vue'
import ExclamationTriangle from '@/components/icons/ExclamationTriangle.vue'
import { provide, watch } from 'vue'
import { useAuth } from '@/stores'
import useDownloadStore from '@/desktop-stores/download'
import ModalComponent from '@/components/ModalComponent.vue'
import WindowControls from '@/desktop-components/WindowControls.vue'
import AppUpdateNotice from '@/desktop-components/AppUpdateNotice.vue'
import useAppUpdateStore from '@/desktop-stores/appUpdate'

const auth = useAuth()
const downloadStore = useDownloadStore()
const router = useRouter()
const route = useRoute()

auth.checkToken()
useAppUpdateStore().init()

// Match the scrollbar tint to the navbar color: orange on home, pink elsewhere
watch(
  () => route.path,
  (path) => {
    document.documentElement.dataset.navTheme = path === '/' ? 'orange' : 'pink'
  },
  { immediate: true }
)

const shoppingCart = useCart()

provide('cart', shoppingCart)

const goToReportProblem = () => {
  router.push('/report-problem')
}
</script>

<template>
  <!-- Custom frameless-window title bar (drag region + min/max/close), always visible -->
  <WindowControls />
  <AppUpdateNotice />
  <template v-if="auth.verifying && $route.path !== '/login' && $route.path !== '/register'">
    <TheNavbar :color="'pink'" style="z-index: 100 !important" />
    <SkeletonPage class="view-container" />
    <TheFooter :small="false" :color="'blue'" />
  </template>
  <template v-else>
    <template
      v-if="
        $route.path == '/login' ||
        $route.path == '/register' ||
        $route.path == '/forgot-password' ||
        $route.path == '/confirm-password-reset' ||
        $route.path == '/session-invalidated'
      "
    >
      <span class="view-container-login">
        <RouterView class="view-container" />
        <TheFooter :small="true" />
      </span>
    </template>
    <template v-else>
      <TheNavbar
        v-if="$route.path == '/'"
        :color="'orange'"
        :logo="'main'"
        style="z-index: 100 !important"
      />
      <TheNavbar v-else :color="'pink'" style="z-index: 100 !important" />
      <RouterView class="view-container" />
      <TheFooter v-if="$route.path == '/'" :small="false" :color="'dark-purple'" />
      <TheFooter v-else :small="false" :color="'blue'" />
    </template>
    <div class="bottom-buttons">
      <button
        class="report-button"
        :title="$t('report_problem_title') || 'Report a Problem'"
        @click="goToReportProblem"
      >
        <ExclamationTriangle />
      </button>
      <button class="lang-button" @click="$i18n.locale = $i18n.locale == 'es' ? 'en' : 'es'">
        {{ $i18n.locale.toUpperCase() }}
      </button>
    </div>
    <ModalComponent />

    <DownloadProgressBar
      :progress="downloadStore.downloadProgress"
      :game-name="downloadStore.downloadingGameName"
      :is-visible="downloadStore.isDownloading"
    />
  </template>
</template>

<style>
.bottom-buttons {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 1001;
  display: flex;
  gap: 10px;
  align-items: center;
}

.lang-button {
  /* Removed position: fixed to work with flexbox */
  width: 100px;
  height: 50px;
  border: none;
  border-radius: 25px;
  background-color: var(--lightGreen);
  color: var(--bgGreen);
  font-size: large;
  font-weight: bold;
  transition: 0.1s;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.lang-button:hover {
  background-color: var(--lightCyan);
  transition: 0.1s;
}

.report-button {
  width: 50px;
  height: 50px;
  border: none;
  border-radius: 50%;
  background-color: white;
  color: black;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.1s;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.report-button svg {
  width: 20px;
  height: 20px;
}

.report-button:hover {
  background-color: lightgray;
  transform: scale(1.05);
  transition: 0.1s;
}

.view-container {
  flex-grow: 1;
}

.view-container-login {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  background-image: url('@/assets/images/light-blue-background.png');
  justify-content: center;
  align-items: center;
}
</style>
