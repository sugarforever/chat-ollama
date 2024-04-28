import { Ollama } from 'ollama'
import type { H3Event, EventHandlerRequest } from 'h3'
import { FetchWithAuth } from '@/server/utils'

let ollamaConfig: Array<string | null> = []
let ollama: Ollama | null = null

function createOllama(endpoint: string, username: string | null, password: string | null) {
  const isConfigChanged = ollamaConfig[0] !== endpoint || ollamaConfig[1] !== username || ollamaConfig[2] !== password
  if (ollama && !isConfigChanged) {
    return ollama
  }

  if (isConfigChanged) {
    ollamaConfig = [endpoint, username, password]
  }

  console.log("Ollama: ", { host: endpoint, username, password })
  return new Ollama({ host: endpoint, fetch: FetchWithAuth.bind({ username, password }) })
}

async function pingOllama(endpoint: string) {
  const res = await $fetch.raw(endpoint, { ignoreResponseError: true }).catch(() => null)
  if (res?.status !== 200) {
    const errMsg = [
      `ChatOllama is unable to establish a connection with ${endpoint}, please check:`,
      '  1. Is Ollama server running ? (run `ollama serve` in terminal to start the server)',
      `  2. Can the server where ChatOllama is located connect to \`${endpoint}\` ?`
    ].join('\n')

    console.error(errMsg)
    return errMsg
  }
  return null
}

export async function getOllama(event: H3Event<EventHandlerRequest>, interceptResponse = false) {
  const { endpoint, username, password } = event.context.keys.ollama
  const result = await pingOllama(endpoint)
  if (result !== null) {
    if (interceptResponse)
      event.respondWith(new Response(result, { status: 500 }))
    return null
  }

  return createOllama(endpoint, username, password)
}
