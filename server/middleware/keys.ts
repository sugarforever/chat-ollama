import { tryParseJson } from '~/composables/utils'

export interface ContextKeys {
  /**
   * `http://127.0.0.1:1080` or `socks5://127.0.0.1:1080`
   * `http://username:password@127.0.0.1:1080` or `socks5://username:password@127.0.0.1:1080`
   */
  proxyUrl?: string,
  proxyEnabled: boolean,
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
  },
  groq: {
    key: string
    endpoint: string
    proxy: boolean
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
