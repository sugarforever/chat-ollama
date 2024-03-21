import { Ollama } from 'ollama'
import { FetchWithAuth } from '@/server/utils';
import { OPENAI_GPT_MODELS, ANTHROPIC_MODELS, AZURE_OPENAI_GPT_MODELS, MOONSHOT_MODELS } from '@/server/utils/models';

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
  const ollama = new Ollama({ host, fetch: FetchWithAuth.bind({ username, password }) });
  const response = await ollama.list();

  if (openai_api_key) {
    OPENAI_GPT_MODELS.forEach((model) => {
      response.models.push({
        name: model,
        model: model,
        details: {
          family: 'OpenAI'
        }
      });
    });
  }

  if (azure_openai_api_key && azure_openai_endpoint && azure_openai_deployment_name) {
    AZURE_OPENAI_GPT_MODELS.forEach((model) => {
      response.models.push({
        name: model,
        model: model,
        details: {
          family: 'Azure OpenAI'
        }
      });
    });
  }

  if (anthropic_api_key) {
    ANTHROPIC_MODELS.forEach((model) => {
      response.models.push({
        name: model,
        model: model,
        details: {
          family: 'Anthropic'
        }
      });
    });
  }

  if (moonshot_api_key) {
    MOONSHOT_MODELS.forEach((model) => {
      response.models.push({
        name: model,
        model: model,
        details: {
          family: 'Moonshot'
        }
      });
    });
  }

  return response
})
