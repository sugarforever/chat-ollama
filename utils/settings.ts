import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import type { KnowledgeBase } from '@prisma/client'

const OLLAMA_HOST = "ollama.host"
const OLLAMA_USERNAME = "ollama.username"
const OLLAMA_PASSWORD = "ollama.password"

const OPEN_AI_API_KEY = "keys.openai_api_key"
const OPEN_AI_API_HOST = 'keys.openai_api_host'

const AZURE_OPEN_AI_API_KEY = "keys.azure_openai_api_key"
const AZURE_OPEN_AI_ENDPOINT = "keys.azure_openai_endpoint"
const AZURE_OPEN_AI_DEPLOYMENT_NAME = "keys.azure_openai_deployment_name"

const ANTHROPIC_API_KEY = "keys.anthropic_api_key"
const ANTHROPIC_API_HOST = 'keys.anthropic_api_host'

const MOONSHOT_API_KEY = "keys.moonshot_api_key"
const MOONSHOT_API_HOST = 'keys.moonshot_api_host'

const GEMINI_API_KEY = "keys.gemini_api_key"

const GROQ_API_KEY = "keys.groq_api_key"
const GROQ_API_HOST = 'keys.groq_api_host'

export const ollamaHost = useStorage(OLLAMA_HOST, '')
export const ollamaUsername = useStorage(OLLAMA_USERNAME, '')
export const ollamaPassword = useStorage(OLLAMA_PASSWORD, '')

export const openAiApiHost = useStorage(OPEN_AI_API_HOST, '')
export const openAiApiKey = useStorage(OPEN_AI_API_KEY, '')

export const azureOpenaiApiKey = useStorage(AZURE_OPEN_AI_API_KEY, '')
export const azureOpenaiEndpoint = useStorage(AZURE_OPEN_AI_ENDPOINT, '')
export const azureOpenaiDeploymentName = useStorage(AZURE_OPEN_AI_DEPLOYMENT_NAME, '')

export const anthropicApiHost = useStorage(ANTHROPIC_API_HOST, '')
export const anthropicApiKey = useStorage(ANTHROPIC_API_KEY, '')

export const moonshotApiKey = useStorage(MOONSHOT_API_KEY, '')
export const moonshotApiHost = useStorage(MOONSHOT_API_HOST, '')

export const geminiApiKey = useStorage(GEMINI_API_KEY, '')

export const groqApiKey = useStorage(GROQ_API_KEY, '')
export const groqApiHost = useStorage(GROQ_API_HOST, '')

export const fetchHeadersOllama = computed(() => {
  return {
    'x-ollama-host': ollamaHost.value,
    'x-ollama-username': ollamaUsername.value,
    'x-ollama-password': ollamaPassword.value,
  }
})

export const fetchHeadersThirdApi = computed(() => {
  return {
    'x-openai-api-key': openAiApiKey.value,
    'x-openai-api-host': openAiApiHost.value,

    'x-azure-openai-api-key': azureOpenaiApiKey.value,
    'x-azure-openai-endpoint': azureOpenaiEndpoint.value,
    'x-azure-openai-deployment-name': azureOpenaiDeploymentName.value,

    'x-anthropic-api-key': anthropicApiKey.value,
    'x-anthropic-api-host': anthropicApiHost.value,

    'x-moonshot-api-key': moonshotApiKey.value,
    'x-moonshot-api-host': moonshotApiHost.value,

    'x-gemini-api-key': geminiApiKey.value,

    'x-groq-api-key': groqApiKey.value,
    'x-groq-api-host': groqApiHost.value,
  }
})

export const loadOllamaInstructions = async () => {
  try {
    const { instructions } = await $fetch<Record<string, { id: number, name: string, instruction: string }[]>>(`/api/instruction/`)
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
  const response = await $fetch('/api/models/', {
    headers: {
      ...fetchHeadersOllama.value,
      ...fetchHeadersThirdApi.value,
    }
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
  const response = await $fetch('/api/knowledgebases/').catch(() => null)
  return (response?.knowledgeBases || []) as KnowledgeBase[]
}
