<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameList from '@/components/games/GameList.vue'
import GameDetails from '@/components/games/GameDetails.vue'
import SkeletonDetail from '@/components/skeletons/SkeletonDetail.vue'
import axios from 'axios'
import { useI18n } from 'vue-i18n'
import type { Game } from '@/types'

const route = useRoute()
const { t } = useI18n()

const game = ref<Game | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const router = useRouter()

watch(
  () => route.params.id,
  async (newId) => {
    console.log('GameView: Route param changed to:', newId)
    if (!newId) {
      error.value = 'No game ID provided'
      router.push('/games')
      return
    }
    await UpdateData(String(newId))
  },
  { immediate: true }
)

async function UpdateData(gameId: string): Promise<void> {
  loading.value = true
  error.value = null
  try {
    if (!gameId) {
      throw new Error('Game ID is required')
    }
    const response = await axios.get(`/v1/games/${gameId}`)
    const gameData = response.data
    if (!gameData) {
      throw new Error('Game not found')
    }
    game.value = {
      game_id: gameData.game_id,
      name: gameData.name,
      description: gameData.description,
      price: gameData.price,
      banner_url: gameData.banner_url,
      release_date: gameData.release_date,
      developer_id: gameData.developer_id,
      game_type_id: gameData.game_type_id,
      game_type: gameData.game_type,
      game_Path: gameData.game_Path,
      free_to_play: gameData.free_to_play,
      education: gameData.education ?? null
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'An error occurred'
    router.push('/games')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <SkeletonDetail v-if="loading" />
  <div v-else-if="error" class="error-container">
    {{ error }}
  </div>
  <div v-else>
    <GameDetails :item="game" />
  </div>
  <GameList
    :show-filters="false"
    :exclude-game-id="game?.game_id ?? null"
    :related-to="game?.education ?? null"
    :title="t('store_more_games')"
  />
</template>

<style scoped>
.error-container {
  text-align: center;
  padding: 2rem;
  color: red;
}
</style>
