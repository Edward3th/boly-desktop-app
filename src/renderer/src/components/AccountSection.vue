<script setup>
import { useAuth, useUser } from '@/stores'
import { avatarFor } from '@/utils/avatars'
import { useRouter } from 'vue-router'
import { onMounted, watch } from 'vue'
import EditIcon from '@/components/icons/EditIcon.vue'
import axios from 'axios'

const router = useRouter()
const auth = useAuth()
const user = useUser()

onMounted(async () => {
  if (auth.isLoggedIn && user.userId) {
    await refreshUserData()
  }
})

// Also refresh when returning to a view that uses this component
watch(
  () => router.currentRoute.value.path,
  async () => {
    if (auth.isLoggedIn && user.userId) {
      await refreshUserData()
    }
  }
)

async function refreshUserData() {
  try {
    const response = await axios.get(`/v1/users/${user.userId}`)
    if (response.status === 200) {
      user.setUser(response.data)
    }
  } catch (error) {
    console.error('Error fetching user data:', error)
  }
}

function EditProfile() {
  router.push('/edit')
}
</script>
<template>
  <div class="main-container">
    <img
      class="profile-pic"
      :src="avatarFor(user.userId, user.profilePictureUrl)"
      alt="Profile picture"
    />
    <div class="details">
      <div class="name">
        <h1>{{ user.username }}</h1>
        <EditIcon class="icon" @click="EditProfile" />
      </div>
      <p>{{ user.email }}</p>
      <br />
      <p class="info">{{ $t('profile_info', { username: user.username }) }}</p>
      <p>{{ $t('role') }}: {{ $t('role_' + user.roleId) }}</p>
      <p>{{ $t('birthday') }}: {{ user.birthday || $t('not_set') }}</p>
      <p v-if="user.bio">{{ $t('bio') }}: {{ user.bio }}</p>
    </div>
  </div>
</template>

<style scoped>
.main-container {
  display: flex;
  width: 100%;
  padding: 10px 100px 30px 100px;

  border-top: 2px white solid;
  border-bottom: 2px white solid;

  gap: 3rem;
}

.left-container {
  width: 850px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-pic {
  height: 175px;
  width: 175px;
  border-radius: 50%;
  border: 5px solid var(--boly-button-purple);
  align-self: center;
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
  min-width: 350px;
  padding: 50px;
  display: flex;
  flex-direction: column;
  text-align: start;
  align-self: flex-start;
  background-color: var(--boly-bg-dark-transparent);
  border-radius: 20px;
}

.details .title-bold {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: 150%;
}

.bio {
  width: 100%;
  min-height: 500px;
  display: flex;
  flex-direction: column;
  text-align: start;
  background-color: var(--boly-bg-blue-transparent);
  border-radius: 20px;
  padding: 40px;
  gap: 1rem;
}

.bio .title-bold {
  font-size: 200%;
}

.account-details > p {
  font-size: large;
}

.details {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-top: 25px;
  text-align: left;
  font-size: large;
  gap: 0.2rem;
}

.details > a,
.details > p {
  color: rgba(179, 184, 212, 0.75);
  font-size: large;
}

.details > a {
  cursor: pointer;
  text-decoration: underline;
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

.btn-purple:hover {
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
</style>
