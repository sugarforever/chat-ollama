const KEYS = [
  'x_openai_api_key',
  'x_anthropic_api_key'
];

export default defineEventHandler((event) => {
  const headers = getRequestHeaders(event);
  const keys: { [key: string]: any } = {};

  for (const key of KEYS) {
    keys[key] = headers[key];
  }

  event.context.keys = keys;
})
