<script setup lang="ts">
import { computed } from 'vue'
import useAppUpdateStore from '@/desktop-stores/appUpdate'
import AppUpdateActions from '@/desktop-components/AppUpdateActions.vue'

const update = useAppUpdateStore()

const titleKey = computed(() => {
  switch (update.state.status) {
    case 'downloading':
      return 'update_title_downloading'
    case 'ready':
      return 'update_title_ready'
    case 'error':
      return 'update_title_failed'
    default:
      return 'update_title_available'
  }
})
</script>

<template>
  <Teleport to="body">
    <transition name="update-notice">
      <div v-if="update.showNotice" class="update-notice-mask">
        <div class="update-notice" role="dialog" aria-modal="true">
          <h3>{{ $t(titleKey) }}</h3>
          <AppUpdateActions />
          <button class="update-notice-dismiss" @click="update.dismiss()">
            {{ update.state.status === 'downloading' ? $t('update_hide') : $t('update_later') }}
          </button>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.update-notice-mask {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
}

.update-notice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 360px;
  max-width: 90%;
  padding: 20px;
  border: 1px solid rgba(181, 51, 199, 0.3);
  border-radius: 12px;
  background: #1a1a2e;
  color: white;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.update-notice h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  font-family: 'Poppins', sans-serif;
  color: white;
}

.update-notice-dismiss {
  margin-top: 8px;
  padding: 6px;
  align-self: center;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  font-family: 'Poppins', sans-serif;
  color: rgba(255, 255, 255, 0.6);
}

.update-notice-dismiss:hover {
  color: white;
}

.update-notice-enter-active,
.update-notice-leave-active {
  transition: opacity 0.2s ease;
}

.update-notice-enter-from,
.update-notice-leave-to {
  opacity: 0;
}
</style>
