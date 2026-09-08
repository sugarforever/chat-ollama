import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

import type {
  ModelConfig,
  ModelDescriptor,
  OpenAICompatibleModelConfig,
  OpenAIModelConfig,
} from './types.js';

const COMPATIBLE_DEFAULTS = {
  ollama: { name: 'ollama', baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' },
  deepseek: { name: 'deepseek', baseURL: 'https://api.deepseek.com/v1' },
  openrouter: { name: 'openrouter', baseURL: 'https://openrouter.ai/api/v1' },
} as const;

const modelFactories = {
  openai(config: OpenAIModelConfig): LanguageModel {
    return createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })(config.model);
  },
  'openai-compatible'(config: OpenAICompatibleModelConfig): LanguageModel {
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
      return createAnthropic({ apiKey: config.apiKey, baseURL: config.baseURL })(
        config.model,
      );
    case 'google':
      return createGoogleGenerativeAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })(config.model);
    case 'ollama':
    case 'deepseek':
    case 'openrouter': {
      const defaults = COMPATIBLE_DEFAULTS[config.provider];
      return modelFactories['openai-compatible']({
        provider: 'openai-compatible',
        name: defaults.name,
        model: config.model,
        apiKey: config.apiKey ?? ('apiKey' in defaults ? defaults.apiKey : undefined),
        baseURL: config.baseURL ?? defaults.baseURL,
      });
    }
    case 'openai-compatible':
      return modelFactories['openai-compatible'](config);
  }
}

export function describeModel(config: ModelConfig): ModelDescriptor {
  return {
    provider:
      config.provider === 'openai-compatible' && isProviderId(config.name)
        ? config.name
        : config.provider,
    model: config.model,
  };
}

function isProviderId(value: string | undefined): value is 'ollama' | 'deepseek' | 'openrouter' {
  return value === 'ollama' || value === 'deepseek' || value === 'openrouter';
}
