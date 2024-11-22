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
      f && clearTimeout(f)
      return new Promise((resolve, reject) => {
        f = setTimeout(() => reject(new Error('Timeout')), 5000)
        watch(models, data => {
          f && clearTimeout(f)
          resolve(data)
        }, { once: true })
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

      const response = await $fetchWithAuth('/api/models/', {
        headers: getKeysHeader(),
        signal: controller.signal,
      })
      firstLoaded = false
      models.value = response as ModelItem[]
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
