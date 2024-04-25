import { tryParseJson } from '~/composables/utils'

export interface ContextKeys {
  ollama: {
    endpoint: string
    username: string
    password: string
  },
  openai: {
    key: string
    endpoint: string
  },
  azureOpenai: {
    key: string
    endpoint: string
    deploymentName: string
  },
  anthropic: {
    key: string
    endpoint: string
  },
  moonshot: {
    key: string
    endpoint: string
  },
  gemini: {
    key: string
  },
  groq: {
    key: string
    endpoint: string
  }
}

export default defineEventHandler((event) => {
  const headers = getRequestHeaders(event)
  const value = headers['x-chat-ollama-keys']
  const data = (value ? tryParseJson(value, {}) : {}) as ContextKeys

  event.context.keys = {
    ...data,
    ollama: {
      ...data.ollama,
      endpoint: (data.ollama?.endpoint || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    }
  }
})
