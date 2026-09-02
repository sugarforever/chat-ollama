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
  #activeController: AbortController | undefined

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
    if (this.#activeController !== undefined) {
      throw new Error('A run is already active')
    }

    const controller = new AbortController()
    this.#activeController = controller
    const userMessage = { role: 'user', content: input } as const
    this.#history.push(userMessage)

    try {
      this.#emit({ type: 'run.started', input })
      controller.signal.throwIfAborted()
      this.#emit({ type: 'model.started' })
      controller.signal.throwIfAborted()

      let content = ''
      for await (const event of this.#provider.stream({
        items: this.getHistory(),
      }, controller.signal)) {
        controller.signal.throwIfAborted()
        content += event.delta
        this.#emit({ type: 'model.delta', delta: event.delta })
        controller.signal.throwIfAborted()
      }
      controller.signal.throwIfAborted()

      const assistantMessage = { role: 'assistant', content } as const
      this.#history.push(assistantMessage)
      this.#emit({ type: 'model.completed', message: assistantMessage })
      this.#emit({ type: 'run.completed' })
    }
    catch (error) {
      if (controller.signal.aborted) {
        this.#emit({ type: 'run.cancelled' })
        return
      }

      this.#emit({
        type: 'run.failed',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    finally {
      if (this.#activeController === controller) {
        this.#activeController = undefined
      }
    }
  }

  cancel(): void {
    this.#activeController?.abort()
  }

  getHistory(): readonly AgentItem[] {
    return this.#history.slice()
  }

  #emit(event: Parameters<RuntimeEventListener>[0]): void {
    for (const listener of this.#listeners) {
      listener(event)
    }
  }
}
