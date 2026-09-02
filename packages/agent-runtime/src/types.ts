export interface UserMessage {
  readonly role: 'user'
  readonly content: string
}

export interface AssistantMessage {
  readonly role: 'assistant'
  readonly content: string
}

export type AgentItem = UserMessage | AssistantMessage

export interface ModelRequest {
  readonly items: readonly AgentItem[]
}

export interface ModelEvent {
  readonly type: 'text.delta'
  readonly delta: string
}

export interface ModelProvider {
  stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelEvent>
}

export type RuntimeEvent =
  | { readonly type: 'run.started'; readonly input: string }
  | { readonly type: 'model.started' }
  | { readonly type: 'model.delta'; readonly delta: string }
  | { readonly type: 'model.completed'; readonly message: AssistantMessage }
  | { readonly type: 'run.completed' }
  | { readonly type: 'run.cancelled' }
  | { readonly type: 'run.failed'; readonly message: string }

export type RuntimeEventListener = (event: RuntimeEvent) => void

export interface AgentSession {
  subscribe(listener: RuntimeEventListener): () => void
  prompt(input: string): Promise<void>
  cancel(): void
  getHistory(): readonly AgentItem[]
}
