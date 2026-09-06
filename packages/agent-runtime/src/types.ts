export interface UserMessage {
  readonly role: 'user';
  readonly content: string;
}

export interface AssistantMessage {
  readonly role: 'assistant';
  readonly content: string;
}

export type SessionMessage = UserMessage | AssistantMessage;

export interface SessionSnapshot {
  readonly id: string;
  readonly messages: readonly SessionMessage[];
}

export interface OpenAIModelConfig {
  readonly provider: 'openai';
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

export type ModelConfig = OpenAIModelConfig | OpenAICompatibleModelConfig;

export interface CreateAgentSessionOptions {
  readonly id?: string;
  readonly model: ModelConfig;
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
      readonly type: 'run.completed';
      readonly runId: string;
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
  prompt(input: string): Promise<void>;
  cancel(): void;
}
