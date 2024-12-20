import { ref } from 'vue'
import { updateOpenAIModels } from '~/config/models'

const isLoadingModels = ref(false)
const lastLoadTime = ref(0)
const CACHE_DURATION = 1000 * 60 * 60 // 1 hour cache

export function useOpenAIModels() {
  const { t } = useI18n()
  const toast = useToast()

  async function loadOpenAIModels(apiKey: string, forceRefresh = false, silent = true) {
    // Return early if we're already loading
    if (isLoadingModels.value) return

    // Check cache unless force refresh is requested
    const now = Date.now()
    if (!forceRefresh && (now - lastLoadTime.value) < CACHE_DURATION) {
      return
    }

    try {
      isLoadingModels.value = true
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to load OpenAI models: ${response.statusText}`)
      }

      const data = await response.json()
      const models = data.data
        .sort((a: any, b: any) => a.id.localeCompare(b.id))
        .map((model: any) => model.id)

      updateOpenAIModels(models)
      lastLoadTime.value = now
      if (!silent) {
        toast.add({ title: t('settings.modelsLoaded'), type: 'success' })
      }
    } catch (error: any) {
      console.error('Error loading OpenAI models:', error)
      if (!silent) {
        toast.add({
          title: t('settings.failedToLoadModels'),
          description: error.message,
          type: 'error'
        })
      }
      throw error
    } finally {
      isLoadingModels.value = false
    }
  }

  return {
    isLoadingModels,
    loadOpenAIModels
  }
}
