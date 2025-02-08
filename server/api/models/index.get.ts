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

export default defineEventHandler(async (event) => {
  const keys = event.context.keys
  const models: ModelItem[] = []

  const ollama = await getOllama(event)
  if (ollama) {
    const response = await ollama.list()
    models.push(...response.models)
  }

  if (keys.openai.key) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${keys.openai.key}`,
        }
      })

      if (response.ok) {
        const data = await response.json()
        const openaiModels = data.data
          .filter((model: any) => !model.id.includes('embedding'))
          .sort((a: any, b: any) => a.id.localeCompare(b.id))
          .map((model: any) => model.id)

        openaiModels.forEach((model: string) => {
          models.push({
            name: model,
            details: {
              family: MODEL_FAMILIES.openai
            }
          })
        })
      }
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error)
      // Fallback to static models if API call fails
      OPENAI_GPT_MODELS.forEach((model) => {
        models.push({
          name: model,
          details: {
            family: MODEL_FAMILIES.openai
          }
        })
      })
    }
  }

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

  if (keys.gemini.key) {
    GEMINI_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.gemini
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

  if (Array.isArray(keys.custom)) {
    await Promise.all(keys.custom.map(async (item) => {
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
            console.log(`${item.name} models:`, data.data.map(d => d.id || d.name))
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
          item.models.forEach(model => {
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
  }

  return models
})
