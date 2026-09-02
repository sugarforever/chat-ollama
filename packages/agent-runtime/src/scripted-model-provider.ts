import type { ModelEvent, ModelProvider, ModelRequest } from './types.js'

export interface ScriptedModelProviderOptions {
  readonly chunks: readonly string[]
  readonly delayMs?: number
}

export class ScriptedModelProvider implements ModelProvider {
  readonly #chunks: readonly string[]

  constructor(options: ScriptedModelProviderOptions) {
    this.#chunks = options.chunks
  }

  async *stream(
    _request: ModelRequest,
    _signal?: AbortSignal,
  ): AsyncIterable<ModelEvent> {
    for (const delta of this.#chunks) {
      yield { type: 'text.delta', delta }
    }
  }
}
