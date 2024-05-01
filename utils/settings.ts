import { useStorage } from '@vueuse/core'
import type { KnowledgeBase } from '@prisma/client'
import type { ContextKeys } from '~/server/middleware/keys'

// todo: only for compatibility with old localStorage values, will be removed in the future
function getLocalValue(key: string) {
  return process.server ? '' : (localStorage.getItem(key) || '')
}

export const keysStore = useStorage<ContextKeys>('keys', {
  ollama: {
    endpoint: getLocalValue('ollama.host'),
    username: getLocalValue('ollama.username'),
    password: getLocalValue('ollama.password'),
  },
  openai: {
    key: getLocalValue('keys.openai_api_key'),
    endpoint: getLocalValue('keys.openai_api_host'),
    proxy: false,
  },
  azureOpenai: {
    key: getLocalValue('keys.azure_openai_api_key'),
    endpoint: getLocalValue('keys.azure_openai_endpoint'),
    deploymentName: getLocalValue('keys.azure_openai_deployment_name'),
    proxy: false,
  },
  anthropic: {
    key: getLocalValue('keys.anthropic_api_key'),
    endpoint: getLocalValue('keys.anthropic_api_host'),
    proxy: false,
  },
  moonshot: {
    key: getLocalValue('keys.moonshot_api_key'),
    endpoint: getLocalValue('keys.moonshot_api_host'),
  },
  gemini: {
    key: getLocalValue('keys.gemini_api_key'),
  },
  groq: {
    key: getLocalValue('keys.groq_api_key'),
    endpoint: getLocalValue('keys.groq_api_host'),
    proxy: false,
  },
} as ContextKeys)

export const getKeysHeader = () => ({ 'x-chat-ollama-keys': JSON.stringify(keysStore.value) })

export const loadOllamaInstructions = async () => {
  try {
    const { instructions } = await $fetchWithAuth<Record<string, { id: number, name: string, instruction: string }[]>>(`/api/instruction/`)
    return instructions
  } catch (e) {
    console.error("Failed to fetch Ollama instructions", e)
    return []
  }
}

export interface ModelInfo {
  label: string
  value: string
  family?: string
}

export async function loadModels(): Promise<ModelInfo[]> {
  const response = await $fetchWithAuth('/api/models/', {
    headers: getKeysHeader(),
  })
  return response
    // filter out nomic-bert family models，as they as embedding models do not support chat apparently.
    .filter(el => el?.details?.family !== 'nomic-bert')
    .map(el => {
      return {
        label: `${el?.details?.family === "Azure OpenAI" ? `Azure ${el.name}` : el.name}`,
        value: el.name!,
        family: el?.details?.family,
      }
    })
}

export async function loadKnowledgeBases() {
  const response = await $fetchWithAuth('/api/knowledgebases/').catch(() => null)
  return (response?.knowledgeBases || []) as KnowledgeBase[]
}
