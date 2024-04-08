const KEYS = [
  'x_openai_api_key',
  'x_openai_api_host',

  'x_azure_openai_api_key',
  'x_azure_openai_endpoint',
  'x_azure_openai_deployment_name',

  'x_anthropic_api_key',
  'x_anthropic_api_host',

  'x_moonshot_api_key',
  'x_moonshot_api_host',

  'x_gemini_api_key',

  'x_groq_api_key',

  // 以下是 UMC Azure OpenAI 需要的參數 - 2024-04-08
  "x_umc_openai_api_key",
  "x_umc_openai_endpoint",
  "x_umc_openai_deployment_name",
  "x_umc_openai_api_version",
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
