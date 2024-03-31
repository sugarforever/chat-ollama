import { type ModelResponse, type ModelDetails } from 'ollama'
import { MODEL_FAMILIES, OPENAI_GPT_MODELS, ANTHROPIC_MODELS, AZURE_OPENAI_GPT_MODELS, MOONSHOT_MODELS, GEMINI_MODELS } from '@/server/utils/models';
import { getOllama } from '@/server/utils/ollama'

export interface ModelItem extends Partial<Omit<ModelResponse, 'details'>> {
  details: Partial<ModelDetails> & { family: string }
}

export default defineEventHandler(async (event) => {
  const {
    x_openai_api_key: openai_api_key,

    x_azure_openai_api_key: azure_openai_api_key,
    x_azure_openai_endpoint: azure_openai_endpoint,
    x_azure_openai_deployment_name: azure_openai_deployment_name,

    x_anthropic_api_key: anthropic_api_key,

    x_moonshot_api_key: moonshot_api_key,
    x_moonshot_api_host: moonshot_api_host,

    x_gemini_api_key: gemini_api_key,

    x_groq_api_key: groq_api_key,
  } = event.context.keys;
  const models: ModelItem[] = []

  const ollama = await getOllama(event)
  if (ollama) {
    const response = await ollama.list();
    models.push(...response.models)
  }

  if (openai_api_key) {
    OPENAI_GPT_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.openai
        }
      });
    });
  }

  if (azure_openai_api_key && azure_openai_endpoint && azure_openai_deployment_name) {
    AZURE_OPENAI_GPT_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.azureOpenai
        }
      });
    });
  }

  if (anthropic_api_key) {
    ANTHROPIC_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.anthropic
        }
      });
    });
  }

  if (moonshot_api_key) {
    MOONSHOT_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.moonshot
        }
      });
    });
  }

  if (gemini_api_key) {
    GEMINI_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.gemini
        }
      });
    });
  }

  if (groq_api_key) {
    GROQ_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: MODEL_FAMILIES.groq
        }
      });
    });
  }

  return models
})
