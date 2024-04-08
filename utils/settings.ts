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

// 以下是 UMC Azure OpenAI 需要的參數 - 2024-04-08
const UMC_OPEN_AI_API_KEY = "keys.umc_openai_api_key"
const UMC_OPEN_AI_ENDPOINT = "keys.umc_openai_endpoint"
const UMC_OPEN_AI_DEPLOYMENT_NAME = "keys.umc_openai_deployment_name"
const UMC_OPEN_AI_API_VERSION = "keys.umc_openai_api_version"


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

// 以下是 UMC Azure OpenAI 需要的參數 - 2024-04-08
export const umcOpenaiApiKey = useStorage(UMC_OPEN_AI_API_KEY, '')
export const umcOpenaiEndpoint = useStorage(UMC_OPEN_AI_ENDPOINT, '')
export const umcOpenaiDeploymentName = useStorage(UMC_OPEN_AI_DEPLOYMENT_NAME, '')
export const umcOpenaiApiVersion = useStorage(UMC_OPEN_AI_API_VERSION, '')

export const fetchHeadersOllama = computed(() => {
  return {
    'x_ollama_host': ollamaHost.value,
    'x_ollama_username': ollamaUsername.value,
    'x_ollama_password': ollamaPassword.value,
  }
})

export const fetchHeadersThirdApi = computed(() => {
  return {
    'x_openai_api_key': openAiApiKey.value,
    'x_openai_api_host': openAiApiHost.value,

    'x_azure_openai_api_key': azureOpenaiApiKey.value,
    'x_azure_openai_endpoint': azureOpenaiEndpoint.value,
    'x_azure_openai_deployment_name': azureOpenaiDeploymentName.value,

    'x_anthropic_api_key': anthropicApiKey.value,
    'x_anthropic_api_host': anthropicApiHost.value,

    'x_moonshot_api_key': moonshotApiKey.value,
    'x_moonshot_api_host': moonshotApiHost.value,

    'x_gemini_api_key': geminiApiKey.value,

    'x_groq_api_key': groqApiKey.value,

    // 以下是 UMC Azure OpenAI 需要的參數 - 2024-04-08
    'x_umc_openai_api_key': umcOpenaiApiKey.value,
    'x_umc_openai_endpoint': umcOpenaiEndpoint.value,
    'x_umc_openai_deployment_name': umcOpenaiDeploymentName.value,
    'x_umc_openai_api_version': umcOpenaiApiVersion.value,
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

export async function loadModels() {
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
        label: `${el?.details?.family === "Azure OpenAI" ? `Azure ${el.name}` : (el?.details?.family === "UMC OpenAI" ? `UMC ${el.name}` : el.name)}`,
        value: el.name!,
        family: el?.details?.family,
      }
    })
}

export async function loadKnowledgeBases() {
  const response = await $fetch('/api/knowledgebases/').catch(() => null)
  return (response?.knowledgeBases || []) as KnowledgeBase[]
}
