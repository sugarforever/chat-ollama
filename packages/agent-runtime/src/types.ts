export interface UserMessage {
  readonly role: 'user';
  readonly content: string;
}

export interface AssistantMessage {
  readonly role: 'assistant';
  readonly content: string;
}

export interface ToolCallItem {
  readonly type: 'tool-call';
  readonly callId: string;
  readonly toolName: string;
  readonly input: string;
}

export interface ToolResultItem {
  readonly type: 'tool-result';
  readonly callId: string;
  readonly toolName: string;
  readonly status: 'success' | 'error';
  readonly output: string;
}

export type SessionMessage =
  | UserMessage
  | AssistantMessage
  | ToolCallItem
  | ToolResultItem;

export interface SessionSnapshot {
  readonly id: string;
  readonly messages: readonly SessionMessage[];
  readonly model: ModelDescriptor;
}

export interface OpenAIModelConfig {
  readonly provider: 'openai';
  readonly model: string;
  readonly apiKey?: string;
  readonly baseURL?: string;
}

export interface AnthropicModelConfig {
  readonly provider: 'anthropic';
  readonly model: string;
  readonly apiKey?: string;
  readonly baseURL?: string;
}

export interface GoogleModelConfig {
  readonly provider: 'google';
  readonly model: string;
  readonly apiKey?: string;
  readonly baseURL?: string;
}

export interface OpenAICompatibleModelConfig {
  readonly provider: 'openai-compatible';
  readonly name?: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly baseURL: string;
}

export interface CompatibleProviderModelConfig {
  readonly provider: 'ollama' | 'deepseek' | 'openrouter';
  readonly name: 'ollama' | 'deepseek' | 'openrouter';
  readonly model: string;
  readonly apiKey?: string;
  readonly baseURL: string;
}

export type ModelConfig =
  | OpenAIModelConfig
  | AnthropicModelConfig
  | GoogleModelConfig
  | OpenAICompatibleModelConfig
  | CompatibleProviderModelConfig;

export type ProviderId =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'openrouter';

export interface AvailableModel {
  readonly provider: ProviderId;
  readonly model: string;
  readonly baseURL?: string;
}

export interface DiscoveryWarning {
  readonly provider: ProviderId;
  readonly message: string;
}

export interface ModelDiscoveryResult {
  readonly models: readonly AvailableModel[];
  readonly warnings: readonly DiscoveryWarning[];
}

export interface DiscoverModelsOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly ollamaBaseURL?: string;
  readonly openaiBaseURL?: string;
}

export interface CreateAgentSessionOptions {
  readonly id?: string;
  readonly model: ModelConfig;
  readonly maxSteps?: number;
}

export interface ModelDescriptor {
  readonly provider: ModelConfig['provider'];
  readonly model: string;
}

export type RuntimeEvent =
  | {
      readonly type: 'run.started';
      readonly runId: string;
      readonly input: string;
    }
  | {
      readonly type: 'step.started';
      readonly runId: string;
      readonly step: number;
    }
  | {
      readonly type: 'step.completed';
      readonly runId: string;
      readonly step: number;
      readonly reason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';
    }
  | {
      readonly type: 'tool.started';
      readonly runId: string;
      readonly call: ToolCallItem;
    }
  | {
      readonly type: 'tool.completed';
      readonly runId: string;
      readonly result: ToolResultItem & { readonly status: 'success' };
    }
  | {
      readonly type: 'tool.failed';
      readonly runId: string;
      readonly result: ToolResultItem & { readonly status: 'error' };
    }
  | {
      readonly type: 'model.started';
      readonly runId: string;
      readonly model: ModelDescriptor;
    }
  | {
      readonly type: 'model.delta';
      readonly runId: string;
      readonly delta: string;
    }
  | {
      readonly type: 'model.completed';
      readonly runId: string;
      readonly message: AssistantMessage;
    }
  | {
      readonly type: 'model.changed';
      readonly previous: ModelDescriptor;
      readonly current: ModelDescriptor;
    }
  | {
      readonly type: 'session.reset';
      readonly model: ModelDescriptor;
    }
  | {
      readonly type: 'run.completed';
      readonly runId: string;
    }
  | {
      readonly type: 'run.stopped';
      readonly runId: string;
      readonly reason: 'step-limit';
    }
  | {
      readonly type: 'run.failed';
      readonly runId: string;
      readonly error: { readonly message: string };
    }
  | {
      readonly type: 'run.cancelled';
      readonly runId: string;
    };

export type RuntimeEventListener = (event: RuntimeEvent) => void;

export interface AgentSession {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: RuntimeEventListener): () => void;
  setModel(config: ModelConfig): void;
  reset(): void;
  prompt(input: string): Promise<void>;
  cancel(): void;
}
