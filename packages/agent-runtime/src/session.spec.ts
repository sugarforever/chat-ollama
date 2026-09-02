import { describe, expect, it } from 'vitest'

import { ScriptedModelProvider, Session } from './index.js'
import type { ModelEvent, ModelProvider } from './index.js'

describe('Session', () => {
  it('emits model deltas in lifecycle order and stores complete messages', async () => {
    const session = new Session(new ScriptedModelProvider({
      chunks: ['Hello', ' world'],
    }))
    const eventTypes: string[] = []

    session.subscribe(event => {
      eventTypes.push(event.type)
    })

    await session.prompt('Hi')

    expect(eventTypes).toEqual([
      'run.started',
      'model.started',
      'model.delta',
      'model.delta',
      'model.completed',
      'run.completed',
    ])
    expect(session.getHistory()).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello world' },
    ])
  })

  it('stops delivering events after a listener unsubscribes', async () => {
    const session = new Session(new ScriptedModelProvider({ chunks: ['unused'] }))
    const eventTypes: string[] = []
    const unsubscribe = session.subscribe(event => {
      eventTypes.push(event.type)
    })

    unsubscribe()
    await session.prompt('Hi')

    expect(eventTypes).toEqual([])
  })

  it('emits run.cancelled and does not store a partial assistant message', async () => {
    const session = new Session(new ScriptedModelProvider({
      chunks: ['partial', 'later'],
      delayMs: 10,
    }))
    const eventTypes: string[] = []
    let markFirstDelta: (() => void) | undefined
    const firstDelta = new Promise<void>(resolve => {
      markFirstDelta = resolve
    })

    session.subscribe(event => {
      eventTypes.push(event.type)
      if (event.type === 'model.delta') {
        markFirstDelta?.()
      }
    })

    const prompt = session.prompt('stop')
    await firstDelta
    session.cancel()
    await prompt

    expect(eventTypes.at(-1)).toBe('run.cancelled')
    expect(session.getHistory()).toEqual([
      { role: 'user', content: 'stop' },
    ])
  })

  it('emits run.failed and rejects when the provider fails', async () => {
    const failure = new Error('script failed')
    const provider: ModelProvider = {
      async *stream(): AsyncIterable<ModelEvent> {
        throw failure
      },
    }
    const session = new Session(provider)
    const eventTypes: string[] = []
    session.subscribe(event => {
      eventTypes.push(event.type)
    })

    await expect(session.prompt('fail')).rejects.toBe(failure)

    expect(eventTypes.at(-1)).toBe('run.failed')
    expect(session.getHistory()).toEqual([
      { role: 'user', content: 'fail' },
    ])
  })
})
