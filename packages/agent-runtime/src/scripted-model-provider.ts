import { setTimeout as delay } from 'node:timers/promises'

import type { ModelEvent, ModelProvider, ModelRequest } from './types.js'

export interface ScriptedModelProviderOptions {
  readonly chunks: readonly string[]
  readonly delayMs?: number
}

export class ScriptedModelProvider implements ModelProvider {
  readonly #chunks: readonly string[]
  readonly #delayMs: number

  constructor(options: ScriptedModelProviderOptions) {
    this.#chunks = options.chunks
    this.#delayMs = options.delayMs ?? 0
  }

  async *stream(
    _request: ModelRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ModelEvent> {
    for (const delta of this.#chunks) {
      signal?.throwIfAborted()
      if (this.#delayMs > 0) {
        await delay(this.#delayMs, undefined, { signal })
      }
      yield { type: 'text.delta', delta }
    }
  }
}
