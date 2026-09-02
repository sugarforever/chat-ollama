import { stdin, stdout } from 'node:process'

import { ScriptedModelProvider } from '@chat-ollama/agent-runtime'

import { runCli } from './cli.js'

await runCli({
  input: stdin,
  output: stdout,
  provider: new ScriptedModelProvider({
    chunks: ['Hello ', 'from ', 'the scripted model.'],
    delayMs: 75,
  }),
})
