import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

import { getCredential } from './provider-catalog.js';
import type {
  AnthropicModelConfig,
  AvailableModel,
  CompatibleProviderModelConfig,
  GoogleModelConfig,
  ModelConfig,
  ModelDescriptor,
  OpenAICompatibleModelConfig,
  OpenAIModelConfig,
} from './types.js';

const modelFactories = {
  openai(config: OpenAIModelConfig): LanguageModel {
    return createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })(config.model);
  },
  anthropic(config: AnthropicModelConfig): LanguageModel {
    return createAnthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })(config.model);
  },
  google(config: GoogleModelConfig): LanguageModel {
    return createGoogle({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })(config.model);
  },
  compatible(
    config: OpenAICompatibleModelConfig | CompatibleProviderModelConfig,
  ): LanguageModel {
    return createOpenAICompatible({
      name: config.name ?? 'openai-compatible',
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })(config.model);
  },
};

export function createLanguageModel(config: ModelConfig): LanguageModel {
  switch (config.provider) {
    case 'openai':
      return modelFactories.openai(config);
    case 'anthropic':
      return modelFactories.anthropic(config);
    case 'google':
      return modelFactories.google(config);
    default:
      return modelFactories.compatible(config);
  }
}

export function createModelConfig(
  selection: AvailableModel,
  env: NodeJS.ProcessEnv,
): ModelConfig {
  switch (selection.provider) {
    case 'openai':
      return {
        provider: selection.provider,
        model: selection.model,
        apiKey: getCredential('openai', env),
        baseURL: selection.baseURL,
      };
    case 'anthropic':
      return {
        provider: selection.provider,
        model: selection.model,
        apiKey: getCredential('anthropic', env),
        baseURL: selection.baseURL,
      };
    case 'google':
      return {
        provider: selection.provider,
        model: selection.model,
        apiKey: getCredential('google', env),
        baseURL: selection.baseURL,
      };
    case 'ollama':
      return compatibleConfig(
        'ollama',
        selection,
        env.OLLAMA_API_KEY ?? 'ollama',
        'http://localhost:11434/v1',
      );
    case 'deepseek':
      return compatibleConfig(
        'deepseek',
        selection,
        getCredential('deepseek', env),
        'https://api.deepseek.com/v1',
      );
    case 'openrouter':
      return compatibleConfig(
        'openrouter',
        selection,
        getCredential('openrouter', env),
        'https://openrouter.ai/api/v1',
      );
  }
}

export function describeModel(config: ModelConfig): ModelDescriptor {
  return {
    provider: config.provider,
    model: config.model,
  };
}

function compatibleConfig(
  provider: CompatibleProviderModelConfig['provider'],
  selection: {
    readonly model: string;
    readonly baseURL?: string;
  },
  apiKey: string | undefined,
  defaultBaseURL: string,
): CompatibleProviderModelConfig {
  return {
    provider,
    name: provider,
    model: selection.model,
    baseURL: selection.baseURL ?? defaultBaseURL,
    apiKey,
  };
}
