<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AVATARS, avatarIdOf, avatarPath, defaultAvatarId, type AvatarGroup } from '@/utils/avatars'
import { useUser } from '@/stores'

// Lets a player swap their icon for one of Boly's or a game character's.
const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ close: []; saved: [message: string] }>()

const { t } = useI18n()
const user = useUser()
const saving = ref<string | null>(null)
const error = ref('')

const GROUPS: AvatarGroup[] = ['boly', 'cerrajero', 'robogolf']
const groups = computed(() =>
  GROUPS.map((group) => ({ group, avatars: AVATARS.filter((a) => a.group === group) })).filter(
    (g) => g.avatars.length
  )
)

// The icon they're using now: the one they picked, or the one assigned to them.
const currentId = computed(() => {
  const picked = avatarIdOf(user.profilePictureUrl)
  if (picked) return picked
  return user.profilePictureUrl ? null : defaultAvatarId(user.userId)
})

async function choose(id: string): Promise<void> {
  if (saving.value) return
  error.value = ''
  saving.value = id
  const result = await user.chooseAvatar(id)
  saving.value = null
  if (result.success) {
    emit('saved', t('avatar_saved'))
    emit('close')
  } else {
    error.value = t('avatar_save_error')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.show" class="avatar-mask" @click.self="emit('close')">
      <div
        class="avatar-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-title"
      >
        <h3 id="avatar-picker-title">{{ t('avatar_choose_title') }}</h3>
        <section v-for="g in groups" :key="g.group" class="avatar-group">
          <h4>{{ t(`avatar_group_${g.group}`) }}</h4>
          <div class="avatar-grid">
            <button
              v-for="avatar in g.avatars"
              :key="avatar.id"
              type="button"
              class="avatar-option"
              :class="{ selected: avatar.id === currentId }"
              :aria-pressed="avatar.id === currentId"
              :aria-label="avatar.name"
              :title="avatar.name"
              :disabled="saving !== null"
              @click="choose(avatar.id)"
            >
              <img :src="avatarPath(avatar.id)" alt="" loading="lazy" />
            </button>
          </div>
        </section>
        <p v-if="error" class="avatar-error" role="alert">{{ error }}</p>
        <button type="button" class="avatar-close" @click="emit('close')">{{ t('close') }}</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.avatar-mask {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.55);
}

.avatar-dialog {
  width: min(560px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
  border-radius: 1.25rem;
  background: var(--boly-bg-blue, #2a1c5c);
  color: #fff;
  box-sizing: border-box;
}

h3 {
  margin: 0 0 1rem;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 1.5rem;
}

h4 {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #ffe3f4;
}

.avatar-group + .avatar-group {
  margin-top: 1rem;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 0.6rem;
}

.avatar-option {
  aspect-ratio: 1;
  padding: 0;
  overflow: hidden;
  border: 3px solid transparent;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  transition:
    transform 0.15s,
    border-color 0.15s;
}

.avatar-option img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-option:hover:not(:disabled) {
  transform: scale(1.06);
}

.avatar-option.selected {
  border-color: #fff;
}

.avatar-option:focus-visible {
  outline: 3px solid #ffe3f4;
  outline-offset: 2px;
}

.avatar-option:disabled {
  cursor: wait;
}

.avatar-error {
  margin: 1rem 0 0;
  color: #ffb4c8;
}

.avatar-close {
  display: block;
  margin: 1.25rem 0 0 auto;
  padding: 0.6rem 1.4rem;
  border: 0;
  border-radius: 0.6rem;
  background: var(--boly-button-purple, #bc3de4);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
</style>
