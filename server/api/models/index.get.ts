import { Ollama, type ModelResponse, type ModelDetails } from 'ollama'
import { FetchWithAuth } from '@/server/utils';
import { OPENAI_GPT_MODELS, ANTHROPIC_MODELS, AZURE_OPENAI_GPT_MODELS, MOONSHOT_MODELS } from '@/server/utils/models';

export interface ModelItem extends Partial<Omit<ModelResponse, 'details'>> {
  details: Partial<ModelDetails> & { family: string }
}

export default defineEventHandler(async (event) => {
  const { host, username, password } = event.context.ollama;
  const {
    x_openai_api_key: openai_api_key,

    x_azure_openai_api_key: azure_openai_api_key,
    x_azure_openai_endpoint: azure_openai_endpoint,
    x_azure_openai_deployment_name: azure_openai_deployment_name,

    x_anthropic_api_key: anthropic_api_key,

    x_moonshot_api_key: moonshot_api_key,
    x_moonshot_api_host: moonshot_api_host
  } = event.context.keys;
  const models: ModelItem[] = []

  const ollama = new Ollama({ host, fetch: FetchWithAuth.bind({ username, password }) });
  const response = await ollama.list();

  models.push(...response.models)

  if (openai_api_key) {
    OPENAI_GPT_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: 'OpenAI'
        }
      });
    });
  }

  if (azure_openai_api_key && azure_openai_endpoint && azure_openai_deployment_name) {
    AZURE_OPENAI_GPT_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: 'Azure OpenAI'
        }
      });
    });
  }

  if (anthropic_api_key) {
    ANTHROPIC_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: 'Anthropic'
        }
      });
    });
  }

  if (moonshot_api_key) {
    MOONSHOT_MODELS.forEach((model) => {
      models.push({
        name: model,
        details: {
          family: 'Moonshot'
        }
      });
    });
  }

  return models
})
