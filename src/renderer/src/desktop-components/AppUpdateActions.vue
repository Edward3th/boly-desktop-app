<script setup lang="ts">
import { computed } from 'vue'
import useAppUpdateStore from '@/desktop-stores/appUpdate'

const update = useAppUpdateStore()

const percent = computed(() => Math.round(update.state.percent ?? 0))
const speed = computed(() => {
  const bytesPerSecond = update.state.bytesPerSecond ?? 0
  const megabytes = bytesPerSecond / (1024 * 1024)
  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB/s` : `${Math.round(bytesPerSecond / 1024)} KB/s`
})
</script>

<template>
  <template v-if="update.state.status === 'available'">
    <p class="update-text">
      {{
        $t('update_available_text', {
          version: update.state.version,
          current: update.currentVersion
        })
      }}
    </p>
    <button class="update-primary" @click="update.download()">{{ $t('download') }}</button>
  </template>

  <template v-else-if="update.state.status === 'downloading'">
    <p class="update-text">{{ $t('update_downloading_text') }}</p>
    <div class="update-progress-track">
      <div class="update-progress-fill" :style="{ width: percent + '%' }"></div>
    </div>
    <div class="update-progress-meta">
      <span class="update-progress-percent">{{ percent }}%</span>
      <span class="update-progress-speed">{{ speed }}</span>
    </div>
  </template>

  <template v-else-if="update.state.status === 'ready'">
    <p class="update-text update-text-ready">
      {{ $t('update_ready_text', { version: update.state.version }) }}
    </p>
    <p v-if="update.blockedByGame" class="update-text update-text-warning">
      {{ $t('update_close_game_first') }}
    </p>
    <button class="update-primary" @click="update.install()">
      {{ $t('update_install_button') }}
    </button>
  </template>

  <template v-else-if="update.state.status === 'error' && update.state.version">
    <p class="update-text">{{ $t('update_failed_text') }}</p>
    <button class="update-primary" @click="update.download()">{{ $t('update_retry') }}</button>
  </template>

  <template v-else>
    <p v-if="update.state.status === 'checking'" class="update-text">
      {{ $t('update_status_checking') }}
    </p>
    <p v-else-if="update.state.status === 'up-to-date'" class="update-text">
      {{ $t('update_status_up_to_date') }}
    </p>
    <p v-else-if="update.state.status === 'error'" class="update-text">
      {{ $t('update_status_error') }}
    </p>
    <button
      class="update-secondary"
      :disabled="update.state.status === 'checking'"
      @click="update.check()"
    >
      {{ $t('check_for_updates') }}
    </button>
  </template>
</template>

<style scoped>
.update-text {
  margin: 0 0 10px 0;
  font-size: 13px;
  font-family: 'Poppins', sans-serif;
  width: 100%;
  color: rgba(255, 255, 255, 0.75);
}

.update-text-ready {
  color: #a8e6a3;
}

.update-text-warning {
  color: #ffd27a;
}

.update-progress-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.update-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #b533c7, #e040fb);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.update-progress-meta {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 4px;
}

.update-progress-percent {
  font-size: 12px;
  font-family: 'Poppins', sans-serif;
  font-weight: 600;
  color: #e040fb;
}

.update-progress-speed {
  font-size: 12px;
  font-family: 'Poppins', sans-serif;
  color: rgba(255, 255, 255, 0.5);
}

.update-primary {
  margin-top: 4px;
  background: linear-gradient(135deg, #b533c7, #e040fb);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  font-family: 'Poppins', sans-serif;
  align-self: stretch;
  transition:
    opacity 0.2s ease,
    transform 0.1s ease;
  letter-spacing: 0.3px;
}

.update-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.update-primary:active {
  transform: translateY(0);
}

.update-secondary {
  margin-top: 4px;
  background-color: rgba(181, 51, 199, 0.2);
  color: #e040fb;
  border: 1px solid rgba(181, 51, 199, 0.4);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  font-family: 'Poppins', sans-serif;
  font-weight: 500;
  align-self: stretch;
  transition: background-color 0.2s ease;
}

.update-secondary:hover:not(:disabled) {
  background-color: rgba(181, 51, 199, 0.35);
}

.update-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
