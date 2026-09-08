export { createAgentSession } from './session.js';
export { discoverModels, resolveModelConfig } from './discovery.js';

export type {
  AgentSession,
  AnthropicModelConfig,
  AssistantMessage,
  AvailableModel,
  CompatibleProviderModelConfig,
  CreateAgentSessionOptions,
  DiscoverModelsOptions,
  DiscoveryWarning,
  GoogleModelConfig,
  ModelConfig,
  ModelDescriptor,
  ModelDiscoveryResult,
  OpenAICompatibleModelConfig,
  OpenAIModelConfig,
  ProviderId,
  RuntimeEvent,
  RuntimeEventListener,
  SessionMessage,
  SessionSnapshot,
  UserMessage,
} from './types.js';
