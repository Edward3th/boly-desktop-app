import axios from 'axios'
import { defineStore } from 'pinia'
import { jwtDecode } from 'jwt-decode'
import { useUser } from '.'
import type { Router } from 'vue-router'
import type { User } from '@/types'
import useSharedDevice from '@/desktop-stores/sharedDevice'

// Why a profile sign-in failed, for the profiles screen.
export type ProfileLoginResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'locked' | 'error'; retryAfterSeconds?: number }

const useAuth = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    sessionId: localStorage.getItem('sessionId') || '',
    isLoggedIn: false,
    error: undefined,
    verifying: false,
    lastTokenCheck: 0
  }),
  actions: {
    // Stores a fresh sign-in. On a shared computer it also saves (or moves to
    // the front) this account's profile card.
    async signedIn(token: string, sessionId: string, rememberMe: boolean) {
      localStorage.setItem('token', token)
      localStorage.setItem('sessionId', sessionId)

      // Store remember me preference
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true')
      } else {
        localStorage.removeItem('rememberMe')
      }

      const user = useUser()
      const decodedData = jwtDecode<User & { id: number; profile_picture_url?: string | null }>(token)
      user.setUser(decodedData)

      this.token = token
      this.sessionId = sessionId
      this.isLoggedIn = true
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

      const shared = useSharedDevice()
      if (shared.isShared && decodedData.id) {
        await shared.upsertProfile({
          user_id: decodedData.id,
          username: decodedData.username,
          avatar_url: decodedData.profile_picture_url ?? null
        })
      }
    },

    async login(email: string, password: string, router: Router, rememberMe: boolean = false) {
      // A shared computer never remembers a sign-in.
      const shared = useSharedDevice().isShared
      if (shared) rememberMe = false
      try {
        const response = await axios.post('/v1/auth', {
          email: email,
          password: password,
          is_desktop_app: true,
          shared_device: shared,
          device_info: 'Boly Desktop App',
          remember_me: rememberMe
        })
        if (response.status == 200) {
          await this.signedIn(response.data.token, response.data.session_id, rememberMe)
          router.push('/')
        } else {
          this.error = response.data.message
          console.error(this.error)
        }
      } catch (error: any) {
        console.log(error)
        this.error = error.response?.data?.message || error.message
        console.error(this.error)
      }
    },

    // A profile on a shared computer: password only, by user id.
    async profileLogin(userId: number, password: string, router: Router): Promise<ProfileLoginResult> {
      try {
        const response = await axios.post('/v1/auth/profile-login', {
          user_id: userId,
          password,
          device_info: 'Boly Desktop App (shared)'
        })
        await this.signedIn(response.data.token, response.data.session_id, false)
        router.push('/')
        return { ok: true }
      } catch (error: any) {
        const status = error.response?.status
        if (status === 429) {
          return {
            ok: false,
            reason: 'locked',
            retryAfterSeconds: error.response?.data?.retry_after_seconds
          }
        }
        if (status === 401 || status === 404) return { ok: false, reason: 'invalid' }
        console.error('Profile sign-in failed:', status ?? error.message)
        return { ok: false, reason: 'error' }
      }
    },

    async checkToken(forceLoad = false) {
      if (!forceLoad) {
        // Prevent multiple simultaneous checks
        if (this.verifying) {
          return
        }

        // Only check once every 5 seconds maximum
        const now = Date.now()
        if (now - this.lastTokenCheck < 5000) {
          return
        }
      }

      this.lastTokenCheck = Date.now()
      this.verifying = true

      try {
        if (!localStorage.getItem('token')) {
          this.isLoggedIn = false
          this.verifying = false
          return
        }

        // Check if app just started (grace period for session validation)
        const appStartTime = (window as any).appStartTime || Date.now()
        const timeSinceStart = Date.now() - appStartTime
        const GRACE_PERIOD = 10000 // 10 seconds grace period

        // If within grace period, only do local token validation
        if (timeSinceStart < GRACE_PERIOD) {
          console.log('Within grace period, skipping backend session validation')

          // Only validate token locally during grace period
          const tokenData = jwtDecode(localStorage.getItem('token')!)
          if (tokenData.exp! < Date.now() / 1000) {
            console.log('Token expired locally during grace period')
            this.logout()
            this.verifying = false
            return
          }

          // Token is valid locally, set user as logged in
          const user = useUser()
          user.setUser(tokenData as User)
          this.isLoggedIn = true
          this.token = localStorage.getItem('token')!
          this.sessionId = localStorage.getItem('sessionId') || ''
          axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`
          this.verifying = false
          return
        }

        // After grace period, validate session with backend
        try {
          const sessionResponse = await axios.post(
            '/v1/auth/validate-session',
            {},
            {
              headers: { Authorization: `Bearer ${this.token}` }
            }
          )

          if (sessionResponse.status !== 200) {
            throw new Error('Session validation failed')
          }
        } catch (sessionError) {
          console.error('Session validation failed:', sessionError)
          this.logout()
          this.verifying = false
          return
        }

        const tokenData = jwtDecode(localStorage.getItem('token')!)
        if (tokenData.exp! < Date.now() / 1000) {
          await this.refreshToken()
        } else {
          const user = useUser()
          user.setUser(tokenData as User)
          this.isLoggedIn = true
          this.token = localStorage.getItem('token')!
          this.sessionId = localStorage.getItem('sessionId') || ''
          axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`

          if (forceLoad && user.userId) {
            try {
              const response = await axios.get(`/v1/users/${user.userId}`)
              if (response.status === 200) {
                user.setUser(response.data)
              }
            } catch (userError) {
              console.error('Error fetching complete user data:', userError)
            }
          }
        }
      } catch (error) {
        console.error('Token validation error:', error)
        // Clear invalid token state
        this.token = ''
        localStorage.removeItem('token')
        localStorage.removeItem('sessionId')
        this.isLoggedIn = false
        throw error
      } finally {
        this.verifying = false
      }
    },
    async refreshToken() {
      const currentToken = this.token || localStorage.getItem('token') || ''
      if (!currentToken) {
        return
      }
      try {
        const response = await axios.post('/v1/auth/refresh', {
          token: currentToken
        })
        if (response.status == 200) {
          const user = useUser()
          const userData = response.data.user
          user.setUser(userData)
          this.isLoggedIn = true
          this.token = response.data.token
          localStorage.setItem('token', response.data.token)
          axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`
        }
      } catch (error: any) {
        // A 401 means the token/session is no longer valid (e.g. logged in from
        // another computer). Let the session monitor's invalidation flow handle
        // logout; just don't keep a broken token around silently.
        console.error('Token refresh failed:', error.response?.status || error.message)
      }
    },
    async register(email: string, username: string, password: string) {
      try {
        const response = await axios.post('/v1/users', {
          email,
          username,
          password
        })
        return response
      } catch (error: any) {
        console.error(error)
        return error.response || { status: 500, data: { message: 'Network error' } }
      }
    },
    async requestPasswordReset(email: string) {
      try {
        const response = await axios.post('/v1/auth/reset-password', { email })
        return response.data // Contains { message: "Password reset email sent" }
      } catch (error: any) {
        console.error('Error requesting password reset:', error.response?.data || error.message)
        throw error.response?.data || new Error('Failed to request password reset')
      }
    },
    async confirmPasswordReset(token: string, newPassword: string) {
      try {
        const response = await axios.post('/v1/auth/confirm-reset-password', { token, newPassword })
        return response.data // Contains { message: "Password has been reset successfully" }
      } catch (error: any) {
        console.error('Error confirming password reset:', error.response?.data || error.message)
        throw error.response?.data || new Error('Failed to confirm password reset')
      }
    },
    async sendVerificationEmail(email: string) {
      try {
        const response = await axios.post('/v1/auth/send-verification-email', { email })
        return response.data
      } catch (error: any) {
        console.error('Error sending verification email:', error.response?.data || error.message)
        throw error.response?.data || new Error('Failed to send verification email')
      }
    },
    async verifyEmail(token: string) {
      try {
        const response = await axios.post('/v1/auth/verify-email', { token })
        return response.data // Contains { message: "Email verified successfully" }
      } catch (error: any) {
        console.error('Error verifying email:', error.response?.data || error.message)
        throw error.response?.data || new Error('Failed to verify email')
      }
    },
    async logout() {
      // Close the open game first, while the token can still record its final
      // playtime — otherwise it keeps running on this account after sign-out.
      try {
        await window.electronAPI?.endGameSession()
      } catch (error) {
        console.error('Error closing the active game on logout:', error)
      }
      try {
        // Notify backend about logout
        if (this.sessionId) {
          await axios.post(
            '/v1/auth/logout',
            {
              session_id: this.sessionId
            },
            {
              headers: { Authorization: `Bearer ${this.token}` }
            }
          )
        }
      } catch (error) {
        console.error('Error during logout:', error)
      } finally {
        const user = useUser()
        this.token = ''
        this.sessionId = ''
        localStorage.removeItem('token')
        localStorage.removeItem('sessionId')
        localStorage.removeItem('rememberMe')
        this.isLoggedIn = false
        this.error = undefined
        user.clearUser()
        useSharedDevice().notifySignedIn(false)
      }
    }
  }
})

export default useAuth
