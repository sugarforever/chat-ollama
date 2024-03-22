import { computed } from 'vue'
import { useStorage } from '@vueuse/core'

const OLLAMA_HOST = "ollama.host";
const OLLAMA_USERNAME = "ollama.username";
const OLLAMA_PASSWORD = "ollama.password";

const OPEN_AI_API_KEY = "keys.openai_api_key";
const OPEN_AI_API_HOST = 'keys.openai_api_host';

const AZURE_OPEN_AI_API_KEY = "keys.azure_openai_api_key";
const AZURE_OPEN_AI_ENDPOINT = "keys.azure_openai_endpoint";
const AZURE_OPEN_AI_DEPLOYMENT_NAME = "keys.azure_openai_deployment_name";

const ANTHROPIC_API_KEY = "keys.anthropic_api_key";
const ANTHROPIC_API_HOST = 'keys.anthropic_api_host';

const MOONSHOT_API_KEY = "keys.moonshot_api_key";
const MOONSHOT_API_HOST = 'keys.moonshot_api_host';

export const ollamaHost = useStorage(OLLAMA_HOST, '');
export const ollamaUsername = useStorage(OLLAMA_USERNAME, '');
export const ollamaPassword = useStorage(OLLAMA_PASSWORD, '');

export const openAiApiHost = useStorage(OPEN_AI_API_HOST, '');
export const openAiApiKey = useStorage(OPEN_AI_API_KEY, '');

export const azureOpenaiApiKey = useStorage(AZURE_OPEN_AI_API_KEY, '');
export const azureOpenaiEndpoint = useStorage(AZURE_OPEN_AI_ENDPOINT, '');
export const azureOpenaiDeploymentName = useStorage(AZURE_OPEN_AI_DEPLOYMENT_NAME, '');

export const anthropicApiHost = useStorage(ANTHROPIC_API_HOST, '');
export const anthropicApiKey = useStorage(ANTHROPIC_API_KEY, '');

export const moonshotApiKey = useStorage(MOONSHOT_API_KEY, '');
export const moonshotApiHost = useStorage(MOONSHOT_API_HOST, '');

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
  }
})

export const loadOllamaInstructions = async () => {
  try {
    const { instructions } = (await $fetch(`/api/instruction/`, {
      method: "GET",
    })) as Record<string, any>;
    return instructions;
  } catch (e) {
    console.error("Failed to fetch Ollama instructions", e);
    return []
  }
};
