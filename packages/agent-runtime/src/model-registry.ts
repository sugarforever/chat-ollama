import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

import type {
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
  'openai-compatible'(config: OpenAICompatibleModelConfig): LanguageModel {
    return createOpenAICompatible({
      name: config.name ?? 'openai-compatible',
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })(config.model);
  },
};

export function createLanguageModel(config: ModelConfig): LanguageModel {
  if (config.provider === 'openai') {
    return modelFactories.openai(config);
  }

  return modelFactories['openai-compatible'](config);
}

export function describeModel(config: ModelConfig): ModelDescriptor {
  return {
    provider: config.provider,
    model: config.model,
  };
}
