import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const useAppUpdateStore = defineStore('appUpdate', () => {
  const state = ref<AppUpdateState>({ status: 'idle' })
  const currentVersion = ref('')
  const dismissed = ref(false)
  const blockedByGame = ref(false)

  // A check that fails, or finds nothing, says nothing: being offline when
  // opening the app is no reason to interrupt anyone.
  const hasNews = computed(
    () =>
      state.value.status === 'available' ||
      state.value.status === 'downloading' ||
      state.value.status === 'ready' ||
      (state.value.status === 'error' && !!state.value.version)
  )
  const showNotice = computed(() => hasNews.value && !dismissed.value)

  function setState(next: AppUpdateState) {
    // "Later" covers the offer to download, not the news that it finished or failed.
    if (next.status !== state.value.status && (next.status === 'ready' || next.status === 'error')) {
      dismissed.value = false
    }
    blockedByGame.value = false
    state.value = next
  }

  // The main process runs the check on its own at startup, so the result may
  // arrive before this store exists: read the current state as well as listening.
  async function init() {
    window.electronAPI.onUpdateState(setState)
    setState(await window.electronAPI.getUpdateState())
    currentVersion.value = await window.electronAPI.getVersion()
  }

  function dismiss() {
    dismissed.value = true
  }

  function check() {
    return window.electronAPI.checkUpdates()
  }

  function download() {
    return window.electronAPI.downloadUpdate()
  }

  async function install() {
    blockedByGame.value = !(await window.electronAPI.applyUpdate())
  }

  return {
    state,
    currentVersion,
    blockedByGame,
    showNotice,
    init,
    dismiss,
    check,
    download,
    install
  }
})

export default useAppUpdateStore
