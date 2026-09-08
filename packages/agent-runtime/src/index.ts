export { createAgentSession } from './session.js';
export { discoverModels } from './discovery.js';

export type {
  AgentSession,
  AssistantMessage,
  AvailableModel,
  CreateAgentSessionOptions,
  DiscoverModelsOptions,
  DiscoveryWarning,
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
  UserMessage,
} from './types.js';
