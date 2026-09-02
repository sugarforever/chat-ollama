# @chat-ollama/agent-runtime

Framework-independent TypeScript runtime for the ChatOllama Agent project.

The first increment exposes an in-memory `Session`, a minimal `ModelProvider` port, typed process-local events, cancellation, and a deterministic `ScriptedModelProvider`. It has no dependency on Nuxt, Vue, LangChain, `deepagents`, or a concrete model SDK.

## API

```ts
import { ScriptedModelProvider, Session } from '@chat-ollama/agent-runtime'

const session = new Session(new ScriptedModelProvider({
  chunks: ['Hello ', 'from ', 'the scripted model.'],
}))

const unsubscribe = session.subscribe(event => {
  if (event.type === 'model.delta') {
    process.stdout.write(event.delta)
  }
})

await session.prompt('Hello')
unsubscribe()
```

A successful prompt publishes events in this order:

```text
run.started
model.started
model.delta (one or more)
model.completed
run.completed
```

Cancellation ends with `run.cancelled` and does not append a partial assistant message. Provider failures publish `run.failed` and are rethrown to the caller.

## Development

From the repository root:

```bash
pnpm --filter @chat-ollama/agent-runtime test
pnpm --filter @chat-ollama/agent-runtime typecheck
```

Tools, persistence, concrete model providers, transport protocols, and Web integration are intentionally outside this package increment.
