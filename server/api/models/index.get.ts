import { type ModelResponse, type ModelDetails } from 'ollama'
import { MODEL_FAMILIES, OPENAI_GPT_MODELS, ANTHROPIC_MODELS, AZURE_OPENAI_GPT_MODELS, MOONSHOT_MODELS, GEMINI_MODELS, GROQ_MODELS } from '~/config/index'
import { getOllama } from '@/server/utils/ollama'

export interface ModelItem extends Partial<Omit<ModelResponse, 'details'>> {
  details: Partial<ModelDetails> & { family: string }
}

// Add interface for the API response
interface ModelApiResponse {
  data: Array<{
    id: string
    name: string
    created?: number
    description?: string
    // ... other optional fields
  }>
}

// Interface for Gemini API response
interface GeminiModelApiResponse {
  models: Array<{
    name: string
    displayName?: string
    description?: string
    supportedGenerationMethods?: string[]
  }>
  nextPageToken?: string
}

// Fetch OpenAI models
async function fetchOpenAIModels(apiKey: string): Promise<ModelItem[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    })

    if (response.ok) {
      const data = await response.json()
      const openaiModels = data.data
        .filter((model: any) => !model.id.includes('embedding'))
        .sort((a: any, b: any) => a.id.localeCompare(b.id))
        .map((model: any) => model.id)

      return openaiModels.map((model: string) => ({
        name: model,
        details: {
          family: MODEL_FAMILIES.openai
        }
      }))
    }
  } catch (error) {
    console.error('Failed to fetch OpenAI models:', error)
  }

  // Fallback to static models if API call fails
  return OPENAI_GPT_MODELS.map((model) => ({
    name: model,
    details: {
      family: MODEL_FAMILIES.openai
    }
  }))
}

// Fetch Gemini models
async function fetchGeminiModels(apiKey: string): Promise<ModelItem[]> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)

    if (response.ok) {
      const data: GeminiModelApiResponse = await response.json()
      return data.models
        .filter(model =>
          model.supportedGenerationMethods?.includes('generateContent') &&
          !model.name.includes('embedding')
        )
        .map(model => ({
          name: model.name.replace('models/', ''), // Remove 'models/' prefix from name
          details: {
            family: MODEL_FAMILIES.gemini
          }
        }))
    }
  } catch (error) {
    console.error('Failed to fetch Gemini models:', error)
  }

  // Fallback to static models if API call fails
  return GEMINI_MODELS.map((model) => ({
    name: model,
    details: {
      family: MODEL_FAMILIES.gemini
    }
  }))
}

// Fetch Ollama models
async function fetchOllamaModels(event: any): Promise<ModelItem[]> {
  const ollama = await getOllama(event)
  if (ollama) {
    const response = await ollama.list()
    return response.models
  }
  return []
}

// Fetch custom endpoint models
async function fetchCustomModels(customConfigs: any[]): Promise<ModelItem[]> {
  const models: ModelItem[] = []

  await Promise.all(customConfigs.map(async (item) => {
    if (MODEL_FAMILIES.hasOwnProperty(item.aiType) && item.name && item.endpoint && item.key) {
      try {
        // Only attempt API call if modelsEndpoint is provided
        const modelsEndpoint = item.modelsEndpoint || "/models"
        const endpointWithSlash = item.endpoint.endsWith('/') ? item.endpoint : item.endpoint + '/'

        const normalizedModelsEndpoint = modelsEndpoint.startsWith('/') ? modelsEndpoint.substring(1) : modelsEndpoint
        const modelsUrl = new URL(normalizedModelsEndpoint, endpointWithSlash).toString()
        console.log(`Fetching models from ${modelsUrl}`)
        const response = await fetch(modelsUrl, {
          headers: {
            'Authorization': `Bearer ${item.key}`,
          }
        })

        if (response.ok) {
          const data: ModelApiResponse = await response.json()
          console.log(`${item.name} models:`, data.data?.length)
          data.data.forEach(model => {
            models.push({
              name: model.id || model.name,
              details: {
                family: item.name
              }
            })
          })
          return // Skip the fallback if API call succeeds
        } else {
          console.error(`Failed to fetch models for custom endpoint ${item.name}:`, response)
        }
      } catch (error) {
        console.error(`Failed to fetch models for custom endpoint ${item.name}:`, error)
      }

      // Fallback to predefined models list if API call fails or modelsEndpoint not provided
      if (Array.isArray(item.models) && item.models.length > 0) {
        item.models.forEach((model: string) => {
          models.push({
            name: model,
            details: {
              family: item.name
            }
          })
        })
      }
    }
  }))

  return models
}

export default defineEventHandler(async (event) => {
  const keys = event.context.keys
  const models: ModelItem[] = []

  // Prepare parallel API calls for providers that support dynamic fetching
  const apiCalls: Promise<ModelItem[]>[] = []

  // Always try to fetch Ollama models
  apiCalls.push(fetchOllamaModels(event))

  // Add OpenAI API call if key is present
  if (keys.openai.key) {
    apiCalls.push(fetchOpenAIModels(keys.openai.key))
  }

  // Add Gemini API call if key is present
  if (keys.gemini.key) {
    apiCalls.push(fetchGeminiModels(keys.gemini.key))
  }

  // Add custom endpoints if configured
  if (Array.isArray(keys.custom) && keys.custom.length > 0) {
    apiCalls.push(fetchCustomModels(keys.custom))
  }

  // Execute all API calls in parallel
  const results = await Promise.allSettled(apiCalls)

  // Process results and add models
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      models.push(...result.value)
    } else {
      console.error('Failed to fetch models:', result.reason)
    }
  })

  // Add static models for providers that don't support dynamic fetching
  if (keys.azureOpenai.key && keys.azureOpenai.endpoint && keys.azureOpenai.deploymentName) {
    AZURE_OPENAI_GPT_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.azureOpenai
        }
      })
    })
  }

  if (keys.anthropic.key) {
    ANTHROPIC_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.anthropic
        }
      })
    })
  }

  if (keys.moonshot.key) {
    MOONSHOT_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.moonshot
        }
      })
    })
  }

  if (keys.groq.key) {
    GROQ_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.groq
        }
      })
    })
  }

  return models
})
