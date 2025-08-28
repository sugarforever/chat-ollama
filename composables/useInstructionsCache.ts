import { loadOllamaInstructions } from '~/utils/settings'
import type { Instruction } from '@prisma/client'

interface InstructionsCache {
  instructions: Instruction[]
  lastFetched: number
  loading: boolean
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const cache = ref<InstructionsCache>({
  instructions: [],
  lastFetched: 0,
  loading: false
})

export function useInstructionsCache() {
  const isCacheValid = computed(() => {
    return cache.value.lastFetched > 0 && 
           (Date.now() - cache.value.lastFetched) < CACHE_TTL
  })

  const instructions = computed(() => cache.value.instructions)
  const isLoading = computed(() => cache.value.loading)

  async function preloadInstructions(forceRefresh: boolean = false) {
    if (cache.value.loading) return cache.value.instructions
    if (!forceRefresh && isCacheValid.value) return cache.value.instructions

    cache.value.loading = true
    try {
      const fetchedInstructions = await loadOllamaInstructions()
      cache.value.instructions = fetchedInstructions
      cache.value.lastFetched = Date.now()
      return fetchedInstructions
    } catch (error) {
      console.error('Failed to preload instructions:', error)
      return []
    } finally {
      cache.value.loading = false
    }
  }

  async function getInstructions(forceRefresh: boolean = false) {
    if (!forceRefresh && isCacheValid.value) {
      return cache.value.instructions
    }
    return await preloadInstructions(forceRefresh)
  }

  function clearCache() {
    cache.value = {
      instructions: [],
      lastFetched: 0,
      loading: false
    }
  }

  return {
    instructions,
    isLoading,
    preloadInstructions,
    getInstructions,
    clearCache,
    isCacheValid
  }
}