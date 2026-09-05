# ChatOllama Agent Runtime

`@chatollama/agent-runtime` is the first standalone Runtime increment for
ChatOllama. It uses Vercel AI SDK internally and exposes ChatOllama-owned
messages, snapshots, and process-local events.

The package currently supports one tool-free streamed response through either
OpenAI or an OpenAI-compatible endpoint. It does not contain a CLI/TUI, tools,
persistence, Skills, compaction, MCP, or Web integration.

## Requirements

- Node.js 24 LTS (`>=24`)
- pnpm

## Run the offline example

From the repository root:

```bash
pnpm install
pnpm agent:example
```

The default example uses `MockLanguageModelV3`, subscribes to Runtime events,
and prints the two `model.delta` values as one line. It does not make a network
request or require a credential.

## Public API

```ts
import { createAgentSession } from '@chatollama/agent-runtime';

const session = createAgentSession({
  model: {
    provider: 'openai',
    model: 'gpt-5-mini',
    apiKey: process.env.OPENAI_API_KEY,
  },
});

const unsubscribe = session.subscribe(event => {
  if (event.type === 'model.delta') {
    process.stdout.write(event.delta);
  }
});

await session.prompt('Say hello in one sentence.');
unsubscribe();
```

`AgentSession` exposes only:

- `getSnapshot()` for an immutable copy of in-memory messages
- `subscribe(listener)` for process-local events and its unsubscribe function
- `prompt(input)` for one active streamed run
- `cancel()` for aborting the active run

The current event union contains:

- `run.started`
- `model.started`
- `model.delta`
- `model.completed`
- `run.completed`
- `run.failed`
- `run.cancelled`

These events contain strings and ChatOllama-owned objects. AI SDK UI messages,
provider stream parts, provider metadata, endpoints, and credentials do not
cross the public Runtime boundary. Provider failures are reported as the stable
message `Model request failed`; the AI SDK default streaming error logger is
disabled so a provider error cannot copy a credential into Runtime logs.

## OpenAI smoke test

Use a valid credential and choose any text model available to the account:

```bash
AGENT_PROVIDER=openai \
OPENAI_API_KEY='replace-me' \
AGENT_MODEL='gpt-5-mini' \
AGENT_PROMPT='Reply with exactly: OpenAI smoke test passed.' \
pnpm agent:example
```

The OpenAI provider defaults to `https://api.openai.com/v1`. The example never
prints the credential or the model configuration.

## Ollama OpenAI-compatible smoke test

Pull the selected model and run Ollama first:

```bash
ollama pull qwen3:8b
```

Then point the same Runtime at Ollama's OpenAI-compatible `/v1` endpoint:

```bash
AGENT_PROVIDER=ollama \
AGENT_BASE_URL='http://localhost:11434/v1' \
AGENT_API_KEY='ollama' \
AGENT_MODEL='qwen3:8b' \
AGENT_PROMPT='Reply with exactly: Ollama smoke test passed.' \
pnpm agent:example
```

Ollama requires an API-key value for OpenAI client compatibility but ignores it
for the local endpoint. See the official [Ollama OpenAI compatibility guide](https://docs.ollama.com/api/openai-compatibility).

## Development checks

```bash
pnpm test:agent
pnpm typecheck:agent
pnpm build
pnpm agent:example
```

The offline tests use the official AI SDK [`MockLanguageModelV3`, `mockValues`,
and simulated stream helpers](https://ai-sdk.dev/docs/ai-sdk-core/testing). The
Runtime itself delegates streaming to [`streamText`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
and model protocol handling to the official [OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
and [OpenAI-compatible](https://ai-sdk.dev/providers/openai-compatible-providers)
providers.
