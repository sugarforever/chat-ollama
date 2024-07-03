import { type ModelResponse, type ModelDetails } from 'ollama'
import { MODEL_FAMILIES, OPENAI_GPT_MODELS, ANTHROPIC_MODELS, AZURE_OPENAI_GPT_MODELS, MOONSHOT_MODELS, GEMINI_MODELS, GROQ_MODELS } from '~/config/index'
import { getOllama } from '@/server/utils/ollama'

export interface ModelItem extends Partial<Omit<ModelResponse, 'details'>> {
  details: Partial<ModelDetails> & { family: string }
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
    OPENAI_GPT_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.openai
        }
      })
    })
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
    keys.custom.forEach((item) => {
      if (MODEL_FAMILIES.hasOwnProperty(item.aiType) && item.name && item.endpoint && item.key && Array.isArray(item.models) && item.models.length > 0) {
        item.models.forEach(model => {
          models.push({
            name: model,
            details: {
              family: item.name
            }
          })
        })
      }
    })
  }

  return models
})
