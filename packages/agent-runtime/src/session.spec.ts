import { describe, expect, it } from 'vitest'

import { ScriptedModelProvider, Session } from './index.js'

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
})
