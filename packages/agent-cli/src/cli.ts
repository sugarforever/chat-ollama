import { createInterface } from 'node:readline/promises'

import { Session } from '@chat-ollama/agent-runtime'
import type { ModelProvider } from '@chat-ollama/agent-runtime'

export interface CliOptions {
  readonly input: NodeJS.ReadableStream
  readonly output: NodeJS.WritableStream
  readonly provider: ModelProvider
}

export async function runCli(options: CliOptions): Promise<void> {
  const session = new Session(options.provider)
  const readline = createInterface({
    input: options.input,
    output: options.output,
  })
  const unsubscribe = session.subscribe(event => {
    switch (event.type) {
      case 'model.started':
        options.output.write('Assistant: ')
        break
      case 'model.delta':
        options.output.write(event.delta)
        break
      case 'model.completed':
        options.output.write('\n')
        break
    }
  })

  try {
    const input = await readline.question('You: ')
    await session.prompt(input)
  }
  finally {
    unsubscribe()
    readline.close()
  }
}
