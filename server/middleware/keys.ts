const KEYS = [
  'x-openai-api-key',
  'x-openai-api-host',

  'x-azure-openai-api-key',
  'x-azure-openai-endpoint',
  'x-azure-openai-deployment-name',

  'x-anthropic-api-key',
  'x-anthropic-api-host',

  'x-moonshot-api-key',
  'x-moonshot-api-host',

  'x-gemini-api-key',

  'x-groq-api-key',
  'x-groq-api-host',
] as const

type Replace<T extends string, From extends string, To extends string> = From extends '' ? T
  : T extends `${infer Front}${From}${infer Rest}`
  ?
  `${Front}${To}${Replace<Rest, From, To>}`
  : T

export type KEYS = Replace<typeof KEYS[number], '-', '_'>

export type ContextKeys = Record<KEYS, string>

export default defineEventHandler((event) => {
  const headers = getRequestHeaders(event)
  const keys: { [key: string]: any } = {}

  for (const key of KEYS) {
    keys[key.replace(/-/g, '_')] = headers[key]
  }

  event.context.keys = keys
})
