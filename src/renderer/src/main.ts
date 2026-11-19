import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { useAuth } from '@/stores'
import useDownloadStore from '@/desktop-stores/download'
import useSharedDevice from '@/desktop-stores/sharedDevice'
import axios from 'axios'

// Set app start time for grace period calculations
;(window as any).appStartTime = Date.now()

if (process.env.NODE_ENV === 'production') {
  window.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error)
  })

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason)
  })
}

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(i18n)

const auth = useAuth()
const downloadStore = useDownloadStore()
downloadStore.setupDownloadListeners()
// I think there is an issue here when the logged in account in the browser differs from the one in the platform
// Handle deep link URLs for payment callbacks
if (window.electron && window.electron.ipcRenderer) {
  window.electron.ipcRenderer.on('deep-link-url', (_event, url: string) => {
    console.log('Received deep link URL:', url)

    // Parse the URL to extract the route and query parameters
    try {
      const urlObj = new URL(url)
      const pathAndQuery = urlObj.pathname + urlObj.search

      // Navigate to the appropriate route
      router.push(pathAndQuery)
    } catch (error) {
      console.error('Error parsing deep link URL:', error)
    }
  })

  // Refresh a near-expiry token when the main-process monitor asks for it, so
  // an active user is never logged out at the hard token expiry.
  window.electron.ipcRenderer.on('refresh-token', async () => {
    console.log('Token near expiry - refreshing')
    await auth.refreshToken()
  })

  // Handle session invalidation from main process
  window.electron.ipcRenderer.on('session-invalidated', async () => {
    console.log('Session invalidated by another desktop login')

    // Force logout in the auth store
    await auth.logout()

    // On a shared computer the API ends a session left idle; the next
    // student just picks a profile. Elsewhere, explain what happened.
    const shared = useSharedDevice()
    if (shared.isShared) {
      router.push(shared.hasProfiles ? { path: '/profiles', query: { reason: 'expired' } } : '/login')
      return
    }

    // Redirect to session invalidated page
    router.push('/session-invalidated')

    // Show notification to user
    // Todo: Use a proper notification system
    console.log(
      'You have been logged out because another desktop session was started with your account.'
    )
  })
}

// Set up custom protocol axios adapter for app://boly
// This will route all API requests through the custom protocol handler
axios.defaults.baseURL = 'app://boly'

// Create a custom axios interceptor to use IPC for API requests
axios.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('token')
  if (token) {
    auth.checkToken()
  }

  // Only intercept URLs that use the custom protocol
  if (config.url?.startsWith('app://boly') || !config.url?.includes('://')) {
    try {
      const path = config.url?.replace('app://boly', '') || ''

      const headers = config.headers || {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const result = await window.electron.ipcRenderer.invoke('api-request', {
        method: config.method || 'get',
        path: path.startsWith('/') ? path : `/${path}`,
        data: config.data,
        headers
      })

      // Create a response-like object
      if (result.error) {
        throw {
          response: {
            status: result.status,
            data: result.data
          },
          message: result.message
        }
      }

      // This creates a resolved promise, effectively cancelling the original request
      // and replacing it with our result
      return {
        ...config,
        adapter: () =>
          Promise.resolve({
            data: result,
            status: 200,
            statusText: 'OK',
            headers: {},
            config
          })
      }
    } catch (error) {
      console.error('Error with custom protocol request:', error)
      throw error
    }
  }

  return config
})

app.mount('#app')
