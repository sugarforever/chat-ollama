export { createAgentSession } from './session.js';
export { discoverModels } from './discovery.js';
export { createModelConfig } from './model-registry.js';

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
  ModelDiscoveryResult,
  ModelDescriptor,
  OpenAICompatibleModelConfig,
  OpenAIModelConfig,
  ProviderId,
  RuntimeEvent,
  RuntimeEventListener,
  SessionMessage,
  SessionSnapshot,
  ToolCallItem,
  ToolResultItem,
  UserMessage,
} from './types.js';
