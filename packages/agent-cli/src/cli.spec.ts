import { PassThrough, Readable } from 'node:stream'

import { ScriptedModelProvider } from '@chat-ollama/agent-runtime'
import { describe, expect, it } from 'vitest'

import { runCli } from './cli.js'

describe('runCli', () => {
  it('reads one prompt and streams the scripted answer', async () => {
    const input = Readable.from(['What can you do?\n'])
    const output = new PassThrough()
    let rendered = ''
    output.on('data', chunk => {
      rendered += chunk.toString()
    })

    await runCli({
      input,
      output,
      provider: new ScriptedModelProvider({
        chunks: ['A ', 'scripted answer.'],
      }),
    })

    expect(rendered).toBe('You: Assistant: A scripted answer.\n')
  })
})
