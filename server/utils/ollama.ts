import { Ollama } from 'ollama'
import type { H3Event, EventHandlerRequest } from 'h3'
import { FetchWithAuth } from '@/server/utils'

interface URI {
  host: string;
  username: string | null;
  password: string | null;
}

let ollamaConfig: Array<string | null> = []
let ollama: Ollama | null = null

function createOllama(host: string, username: string | null, password: string | null) {
  const isConfigChanged = ollamaConfig[0] !== host || ollamaConfig[1] !== username || ollamaConfig[2] !== password
  if (ollama && !isConfigChanged) {
    return ollama
  }

  if (isConfigChanged) {
    ollamaConfig = [host, username, password]
  }

  console.log("Ollama: ", { host, username, password });
  return new Ollama({ host, fetch: FetchWithAuth.bind({ username, password }) })
}

async function pingOllama(host: string) {
  const res = await $fetch<string>(host, { ignoreResponseError: true }).catch(() => null)
  if (res !== 'Ollama is running') {
    const errMsg = [
      `ChatOllama is unable to establish a connection with ${host}, please check:`,
      '  1. Is Ollama server running ? (run `ollama serve` in terminal to start the server)',
      `  2. Can the server where ChatOllama is located connect to \`${host}\` ?`
    ].join('\n')

    console.error(errMsg)
    return errMsg
  }
  return null
}

export async function getOllama(event: H3Event<EventHandlerRequest>, interceptResponse = false) {
  const { host, username, password } = event.context.ollama as URI;
  const result = await pingOllama(host)
  if (result !== null) {
    if (interceptResponse)
      event.respondWith(new Response(result, { status: 500 }))
    return null
  }

  return createOllama(host, username, password)
}
