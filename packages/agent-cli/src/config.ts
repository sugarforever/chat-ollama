import type { ModelConfig } from 'chatollama-agent-runtime';

export function readModelConfig(env: NodeJS.ProcessEnv): ModelConfig {
  const provider = env.AGENT_PROVIDER ?? 'ollama';

  if (provider === 'openai') {
    return {
      provider: 'openai',
      model: env.AGENT_MODEL ?? 'gpt-5-mini',
      baseURL: env.AGENT_BASE_URL,
      apiKey: env.AGENT_API_KEY ?? env.OPENAI_API_KEY,
    };
  }

  if (provider === 'ollama') {
    return {
      provider: 'openai-compatible',
      name: 'ollama',
      model: env.AGENT_MODEL ?? 'qwen3:8b',
      baseURL: env.AGENT_BASE_URL ?? 'http://localhost:11434/v1',
      apiKey: env.AGENT_API_KEY ?? 'ollama',
    };
  }

  throw new Error(`Unsupported AGENT_PROVIDER: ${provider}`);
}
