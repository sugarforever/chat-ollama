import type {
  AgentItem,
  AgentSession,
  ModelProvider,
  RuntimeEventListener,
} from './types.js'

export class Session implements AgentSession {
  readonly #history: AgentItem[] = []
  readonly #listeners = new Set<RuntimeEventListener>()
  readonly #provider: ModelProvider

  constructor(provider: ModelProvider) {
    this.#provider = provider
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.#listeners.add(listener)

    return () => {
      this.#listeners.delete(listener)
    }
  }

  async prompt(input: string): Promise<void> {
    const userMessage = { role: 'user', content: input } as const
    this.#history.push(userMessage)
    this.#emit({ type: 'run.started', input })
    this.#emit({ type: 'model.started' })

    let content = ''
    for await (const event of this.#provider.stream({
      items: this.getHistory(),
    })) {
      content += event.delta
      this.#emit({ type: 'model.delta', delta: event.delta })
    }

    const assistantMessage = { role: 'assistant', content } as const
    this.#history.push(assistantMessage)
    this.#emit({ type: 'model.completed', message: assistantMessage })
    this.#emit({ type: 'run.completed' })
  }

  cancel(): void {}

  getHistory(): readonly AgentItem[] {
    return this.#history.slice()
  }

  #emit(event: Parameters<RuntimeEventListener>[0]): void {
    for (const listener of this.#listeners) {
      listener(event)
    }
  }
}
