const KEYS = [
  'x_openai_api_key',
  'x_openai_api_host',
  'x_anthropic_api_key',
  'x_anthropic_api_host',
] as const;

export type KEYS = typeof KEYS[number];

export default defineEventHandler((event) => {
  const headers = getRequestHeaders(event);
  const keys: { [key: string]: any } = {};

  for (const key of KEYS) {
    keys[key] = headers[key];
  }

  event.context.keys = keys;
})
