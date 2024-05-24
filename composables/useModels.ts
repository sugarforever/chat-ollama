import { useSessionStorage } from '@vueuse/core'
import type { ModelItem } from '~/server/api/models/index.get'

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

export function useModels(options?: Options) {
  const opts = Object.assign({ immediate: true, forceReload: false }, options)
  const models = useSessionStorage<ModelItem[]>('models', [])
  const loading = ref(false)
  const OLLAMA_EMBEDDING_FAMILY_LIST = ['nomic-bert']

  const chatModels = computed(() => {
    return models.value
      .filter(el => !OLLAMA_EMBEDDING_FAMILY_LIST.includes(el?.details?.family))
      .map(el => ({
        label: `${el?.details?.family === "Azure OpenAI" ? `Azure ${el.name}` : el.name}`,
        name: el.name!,
        family: el?.details?.family,
        value: [el?.details?.family || '', el.name!].join(':'),
      }))
  })

  const ollamaEmbeddingModels = computed(() => {
    return models.value
      .filter(el => OLLAMA_EMBEDDING_FAMILY_LIST.includes(el?.details?.family))
      .map(el => ({ label: el.name!, value: el.name!, family: el?.details?.family }))
  })

  let controller: AbortController | undefined

  async function loadModels() {
    controller?.abort()

    loading.value = true
    controller = new AbortController()
    if (models.value.length === 0 || opts.forceReload) {
      const response = await $fetchWithAuth('/api/models/', {
        headers: getKeysHeader(),
        signal: controller.signal,
      })
      models.value = response as ModelItem[]
    }
    loading.value = false
    return models.value
  }

  if (opts?.immediate)
    loadModels()

  return { models, chatModels, ollamaEmbeddingModels, loadModels, loading }
}
