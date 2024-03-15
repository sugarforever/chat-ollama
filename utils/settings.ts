import { computed } from 'vue'
import { useStorage } from '@vueuse/core'

const OLLAMA_HOST = "ollama.host";
const OLLAMA_USERNAME = "ollama.username";
const OLLAMA_PASSWORD = "ollama.password";
const OPEN_AI_API_KEY = "keys.openai_api_key";
const ANTHROPIC_API_KEY = "keys.anthropic_api_key";
const OPEN_AI_API_HOST = 'keys.openai_api_host';
const ANTHROPIC_API_HOST = 'keys.anthropic_api_host';

export const ollamaHost = useStorage(OLLAMA_HOST, '');
export const ollamaUsername = useStorage(OLLAMA_USERNAME, '');
export const ollamaPassword = useStorage(OLLAMA_PASSWORD, '');

export const openAiApiHost = useStorage(OPEN_AI_API_HOST, '');
export const openAiApiKey = useStorage(OPEN_AI_API_KEY, '');

export const anthropicApiHost = useStorage(ANTHROPIC_API_HOST, '');
export const anthropicApiKey = useStorage(ANTHROPIC_API_KEY, '');

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
    'x_anthropic_api_key': anthropicApiKey.value,
    'x_anthropic_api_host': anthropicApiHost.value,
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
