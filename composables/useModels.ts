import { useSessionStorage } from '@vueuse/core'
import { MODEL_FAMILY_SEPARATOR } from '~/config'
import type { ModelItem } from '~/server/api/models/index.get'
import { useOpenAIModels } from '~/composables/useOpenAIModels'
import { useStorage } from '@vueuse/core'
import { DEFAULT_KEYS_STORE } from '~/utils/settings'
import type { ContextKeys } from '~/server/middleware/keys'

export interface ModelInfo {
  label: string
  value: string
  family?: string
  /** model name */
  name: string
}

interface Options {
  /** default `false` */
  forceReload?: boolean
  /** default `true` */
  immediate?: boolean
}

let firstLoaded = true
let isLoading = false
const models = useSessionStorage<ModelItem[]>('models', [])

export function useModels(options?: Options) {
  const opts = Object.assign({ immediate: true, forceReload: false }, options)
  const loading = ref(false)
  const OLLAMA_EMBEDDING_FAMILY_LIST = ['nomic-bert']
  const embeddingRegExp = /(\b|_)embed(d?ed|d?ings?)?(\b|_)/i
  const { loadOpenAIModels } = useOpenAIModels()
  const keysStore = useStorage<ContextKeys>('keys', DEFAULT_KEYS_STORE)

  const chatModels = computed(() => {
    return models.value
      .filter(el => !OLLAMA_EMBEDDING_FAMILY_LIST.includes(el?.details?.family) && !embeddingRegExp.test(el.name!))
      .map(el => ({
        label: `${el?.details?.family === "Azure OpenAI" ? `Azure ${el.name}` : el.name}`,
        name: el.name!,
        family: el?.details?.family,
        value: [el?.details?.family || '', el.name!].join(MODEL_FAMILY_SEPARATOR),
      }))
  })

  const ollamaEmbeddingModels = computed(() => {
    return models.value
      .filter(el => OLLAMA_EMBEDDING_FAMILY_LIST.includes(el?.details?.family) || embeddingRegExp.test(el.name!))
      .map(el => ({ label: el.name!, value: el.name!, family: el?.details?.family }))
  })

  let controller: AbortController | undefined
  let f: ReturnType<typeof setTimeout> | null = null

  async function loadModels() {
    if (isLoading) {
      // If models are already loading, wait for them to finish or use cached models
      return new Promise((resolve, reject) => {
        f && clearTimeout(f)
        
        // If we already have models, return them immediately
        if (models.value.length > 0) {
          resolve(models.value)
          return
        }
        
        // Otherwise, wait for loading to complete with a longer timeout
        f = setTimeout(() => {
          // Even if timeout, resolve with current models instead of rejecting
          console.warn('Model loading timeout, using current models:', models.value.length)
          resolve(models.value)
        }, 15000) // Increased timeout to 15 seconds
        
        const stopWatching = watch([models, () => isLoading], ([data, loading]) => {
          if (!loading || data.length > 0) {
            f && clearTimeout(f)
            stopWatching()
            resolve(data)
          }
        }, { immediate: true })
      })
    }

    isLoading = true
    controller?.abort()

    loading.value = true
    controller = new AbortController()
    if (firstLoaded || models.value.length === 0 || opts.forceReload) {
      // Try to load OpenAI models if API key is available
      if (keysStore.value.openai?.key) {
        try {
          await loadOpenAIModels(keysStore.value.openai.key)
        } catch (error) {
          console.error('Failed to load OpenAI models:', error)
        }
      }

      try {
        const response = await $fetchWithAuth('/api/models/', {
          headers: getKeysHeader(),
          signal: controller.signal,
        })
        firstLoaded = false
        models.value = response as ModelItem[]
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          console.log('Models API request was aborted during navigation')
          // Don't update loading state if aborted, let the new request handle it
          return models.value
        } else {
          console.error('Failed to load models from API:', error)
          // For other errors, still reset loading state
        }
      }
    }
    loading.value = false
    isLoading = false
    return models.value
  }

  if (opts?.immediate)
    loadModels()

  if (getCurrentScope()) {
    onScopeDispose(() => {
      f && clearTimeout(f)
      controller?.abort()
    })
  }

  return { models, chatModels, ollamaEmbeddingModels, loadModels, loading }
}

export function parseModelValue(val: string) {
  const [family, ...parts] = val.split(MODEL_FAMILY_SEPARATOR)
  return { family, name: parts.join(MODEL_FAMILY_SEPARATOR) }
}
