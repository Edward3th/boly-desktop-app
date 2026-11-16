import { defineStore } from 'pinia'
import type { User, UserUpdateRequest, PasswordUpdateRequest } from '@/types'
import axios from 'axios'
import { useSubscription } from './subscription'
import { avatarPublicUrl } from '@/utils/avatars'

const useUser = defineStore('user', {
  state: (): User => ({
    userId: 0,
    email: '',
    username: '',
    roleId: 3,
    birthday: undefined,
    bio: undefined,
    profilePictureUrl: undefined,
    developerId: 0,
    email_verified: false,
    isSubscribed: false
  }),
  actions: {
    setUser(userData: any) {
      if (!userData) {
        console.warn('setUser received null userData')
        return
      }
      this.userId = userData.user_id || userData.id
      this.email = userData.email
      this.username = userData.username
      this.roleId = userData.role_id || userData.roleId
      this.birthday = userData.birthday
      this.bio = userData.bio
      this.profilePictureUrl = userData.profile_picture_url || userData.profilePictureUrl
      this.developerId = userData.developer_id || userData.developerId
      this.email_verified = userData.email_verified || userData.emailVerified || false
    },
    clearUser() {
      this.$state = {
        userId: 0,
        email: '',
        username: '',
        roleId: 3,
        birthday: undefined,
        bio: undefined,
        profilePictureUrl: undefined,
        developerId: 0,
        email_verified: false,
        isSubscribed: false
      }
    },
    async checkSubscription() {
      const subscriptionStore = useSubscription()
      if (this.userId) {
        await subscriptionStore.getUserSubscriptions(this.userId, {
          token: localStorage.getItem('token') || ''
        })
        this.isSubscribed = subscriptionStore.subscriptions.some((sub) => sub.is_active)
      }
    },
    async updateUserInfo(data: UserUpdateRequest) {
      try {
        console.log('Updating user info:', data)
        const response = await axios.patch(`/v1/users/${this.userId}`, data)
        if (response.status === 200) {
          this.$patch({
            username: data.username,
            email: data.email,
            birthday: data.birthday,
            bio: data.bio
          })
          return { success: true, message: response.data.message }
        }
        return { success: false, message: response.data.message }
      } catch (error: any) {
        console.error('Error updating user info:', error)
        return {
          success: false,
          message: error.response?.data?.message || 'Error updating user info'
        }
      }
    },
    async updatePassword(data: PasswordUpdateRequest) {
      try {
        const response = await axios.patch('/v1/users/pass', data)
        if (response.status === 200) {
          return { success: true, message: response.data.message }
        }
        return { success: false, message: response.data.message }
      } catch (error: any) {
        console.error('Error updating password:', error)
        return {
          success: false,
          message: error.response?.data?.message || 'Error updating password'
        }
      }
    },
    // Switch to one of the Boly / game icons (see utils/avatars.ts).
    async chooseAvatar(id: string) {
      const url = avatarPublicUrl(id)
      try {
        const response = await axios.patch(`/v1/users/${this.userId}`, {
          profile_picture_url: url
        })
        if (response.status === 200) {
          this.profilePictureUrl = url
          return { success: true, message: response.data.message }
        }
        return { success: false, message: response.data.message }
      } catch (error: any) {
        console.error('Error choosing icon:', error)
        return {
          success: false,
          message: error.response?.data?.message || 'Error choosing icon'
        }
      }
    },
    async updateProfilePicture(file: File) {
      const toBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.readAsDataURL(file)
          reader.onload = () => {
            const result = reader.result
            if (typeof result === 'string') {
              resolve(result.split(',')[1])
            } else {
              resolve('')
            }
          }
          reader.onerror = (error) => reject(error)
        })

      try {
        const base64 = await toBase64(file)
        const response = await axios.post(`/v1/users/profile-picture/${this.userId}`, {
          profile_picture: base64
        })
        if (response.status === 200) {
          this.profilePictureUrl = response.data.profile_picture_url
          return { success: true, message: 'Profile picture updated successfully' }
        }
        return { success: false, message: response.data.message }
      } catch (error: any) {
        console.error('Error uploading profile picture:', error)
        return {
          success: false,
          message: error.response?.data?.message || 'Error uploading profile picture'
        }
      }
    }
  }
})

export default useUser
