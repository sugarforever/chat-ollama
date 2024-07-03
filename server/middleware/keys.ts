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
    proxy: boolean
  },
  azureOpenai: {
    key: string
    endpoint: string
    deploymentName: string
    proxy: boolean
  },
  anthropic: {
    key: string
    endpoint: string
    proxy: boolean
  },
  moonshot: {
    key: string
    endpoint: string
  },
  gemini: {
    key: string
    endpoint: string
    proxy: boolean
  },
  groq: {
    key: string
    endpoint: string
    proxy: boolean
  },
  /** custom model base on OpenAI API */
  custom: Array<{
    name: string
    aiType: Exclude<keyof ContextKeys, 'custom' | 'moonshot' | 'ollama'>
    key: string
    endpoint: string
    proxy: boolean
    models: string[]
  }>
}

export default defineEventHandler((event) => {
  const headers = getRequestHeaders(event)
  const value = headers['x-chat-ollama-keys']
  const data = (value ? tryParseJson(decodeURIComponent(value), {}) : {}) as ContextKeys

  event.context.keys = {
    ...data,
    ollama: {
      ...data.ollama,
      endpoint: (data.ollama?.endpoint || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    }
  }
})
