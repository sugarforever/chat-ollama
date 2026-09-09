# ChatOllama Agent Runtime

`chatollama-agent-runtime` is the standalone Runtime package for
ChatOllama. It uses Vercel AI SDK internally and exposes ChatOllama-owned
messages, snapshots, and process-local events.

The package supports streamed agent loops through Ollama, OpenAI, Anthropic,
Google Gemini, DeepSeek, and OpenRouter, plus reusable model discovery and
safe Session model switching. Its built-in tools provide a deterministic UTC
clock plus workspace-confined file reading, directory listing, content search,
file discovery, complete file writes, and exact edits. It does not contain a
CLI/TUI, preference persistence, Skills, compaction, MCP, arbitrary shell
execution, or network tools.

## Requirements

- Node.js 24 LTS (`>=24`)
- pnpm

## Run the offline example

From the repository root:

```bash
pnpm install
pnpm agent:tool-loop-demo
```

The CLI demo uses two `MockLanguageModelV3` responses. It requests
`getCurrentUtcTime`, executes the real Runtime tool with a fixed clock, returns
the result to the second model step, and streams the final answer. It does not
make a network request or require a credential.

## Public API

```ts
import { createAgentSession } from 'chatollama-agent-runtime';

const session = createAgentSession({
  workspaceRoot: process.cwd(),
  model: {
    provider: 'openai',
    model: 'gpt-5-mini',
    apiKey: process.env.OPENAI_API_KEY,
  },
  maxSteps: 128,
});

const unsubscribe = session.subscribe(event => {
  if (event.type === 'model.delta') {
    process.stdout.write(event.delta);
  }
});

await session.prompt('Say hello in one sentence.');
unsubscribe();
```

`workspaceRoot` is explicit and immutable for the Session. The Runtime
canonicalizes it and confines `read_file`, `list_directory`, `grep`,
`find_files`, `write_file`, and `edit_file` to that tree. Tool paths are
workspace-relative. Absolute paths,
lexical `..` escapes, sibling-prefix confusion, missing targets, unsupported
target types, and symlinks resolving outside the workspace produce stable,
sanitized result objects.

Workspace output limits are part of the tool results:

| Tool | Hard limits |
| --- | --- |
| `read_file` | 2,000 lines and 65,536 output bytes; optional one-based `offset` and `limit` |
| `list_directory` | 1,000 entries and 65,536 output bytes |
| `grep` | 100 matches and 65,536 output bytes |
| `find_files` | 1,000 files and 65,536 output bytes |
| `write_file` | 1,048,576 content bytes; creates missing parent directories and atomically creates or replaces the file |
| `edit_file` | 1,048,576 resulting content bytes; requires one exact literal match in an existing UTF-8 file |

Every successful read/search result contains `truncated`; a true value means
the model saw only the bounded prefix. Expected failures return `ok: false` with a stable
code and message. The tools observe the active run's `AbortSignal`; cancellation
returns `CANCELLED`. `grep` and `find_files` execute the platform-specific `rg`
binary supplied by the Runtime's `@vscode/ripgrep` production dependency, with
Runtime-owned argv arrays and `shell: false`. They do not require `rg` on the
host's `PATH`. Model text occupies one argument and cannot inject a flag or
command.

Writes revalidate the real parent and existing target immediately before the
atomic rename, remove temporary files after failures, and serialize operations
that resolve to the same workspace path. `edit_file` never uses fuzzy matching:
zero matches and multiple matches return different stable errors without
changing the file. Both write tools observe cancellation before committing.

This confinement boundary treats model-provided paths, content, and search text as
untrusted. It is not an OS sandbox against a separate hostile process running
as the same user and concurrently replacing workspace entries; command
execution and operating-system sandboxing remain outside this Runtime layer.

`AgentSession` exposes only:

- `getSnapshot()` for an immutable copy of in-memory messages
- `subscribe(listener)` for process-local events and its unsubscribe function
- `prompt(input)` for one active streamed run
- `cancel()` for aborting the active run
- `setModel(config)` for changing an idle Session's model while preserving history
- `reset()` for clearing an idle Session's history while preserving its model

The current event union contains:

- `run.started`
- `model.started`
- `step.started`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `step.completed`
- `model.delta`
- `model.completed`
- `model.changed`
- `session.reset`
- `run.completed`
- `run.stopped`
- `run.failed`
- `run.cancelled`

These events contain strings and ChatOllama-owned objects. AI SDK UI messages,
provider stream parts, provider metadata, endpoints, and credentials do not
cross the public Runtime boundary. Provider failures are reported as the stable
message `Model request failed`; the AI SDK default streaming error logger is
disabled so a provider error cannot copy a credential into Runtime logs.

`setModel()` rejects a switch during an active run. A successful idle switch
updates the snapshot and emits `model.changed`; subsequent requests use the
new provider without replacing the Session's structured conversation history.
`reset()` has the same active-run exclusion. An idle reset empties only the
Runtime-owned messages, retains the current model configuration, and emits
`session.reset`. Tool calls and results are Runtime-owned Session items linked
by stable `callId` and `toolName` strings. Unknown tools, invalid input, and
execution errors terminate with sanitized failures. `maxSteps` configures the
positive-integer step budget for each `prompt()` and defaults to `4`. Reaching
that limit emits `run.stopped` with reason `step-limit`. Cancelled,
stopped, and failed runs never append a fabricated completed assistant message;
all state remains process-local.

## Model discovery and resolution

```ts
import { createAgentSession, createModelConfig, discoverModels } from 'chatollama-agent-runtime';

const env = process.env;
const { models, warnings } = await discoverModels({ env });
for (const warning of warnings) {
  console.error(`${warning.provider}: ${warning.message}`);
}
const selected = models[0];
if (selected) {
  const session = createAgentSession({
    workspaceRoot: process.cwd(),
    model: createModelConfig(selected, env),
  });
  // Subscribe and prompt, or call session.setModel(createModelConfig(other, env)).
}
```

| Provider | Credential / availability |
| --- | --- |
| Ollama | Local `/api/tags` lists installed models; no secret required |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GEMINI_API_KEY`, then `GOOGLE_GENERATIVE_AI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

Blank credentials are ignored. Configured remote providers contribute a small
built-in catalog; OpenAI's models endpoint augments it. Credential presence
does not prove account access to every listed model. Each network discovery
has a two-second timeout by default, and one provider's failure yields a
sanitized warning without removing other providers or its built-in catalog.
With no remote credentials and unreachable Ollama, the result is an empty
model list with a warning, not a startup exception.

`discoverModels` accepts injected `fetch`, `timeoutMs`, `ollamaBaseURL`, and
`openaiBaseURL` options. Tests use fake transports for success, timeout, and
failure; no paid model requests are needed. `createModelConfig` resolves
credentials privately from the environment. Public discovery results contain
provider/model identity and optional non-secret endpoint metadata, never keys.

OpenAI, Anthropic, and Google use their official AI SDK provider adapters.
Ollama, DeepSeek, and OpenRouter use the OpenAI-compatible adapter with
provider-specific configuration. The Runtime has no pi-tui or pi-ai dependency.

Startup precedence and user preference files belong to the CLI. Its explicit
`AGENT_PROVIDER`/`AGENT_MODEL` selection overrides a saved choice, then a
deterministic available fallback; `AGENT_BASE_URL`/`AGENT_API_KEY` override the
startup endpoint/key. `/models` and `/model <provider>/<model-id>` use these
public Runtime APIs. See the [CLI guide](https://github.com/sugarforever/chat-ollama/blob/main/packages/agent-cli/README.md#saved-model-preference)
for platform preference paths and the minimal `provider`, `model`, optional
`baseURL` JSON schema. Credentials and conversation history are not persisted.

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
pnpm build:agent
pnpm test:agent:pack
pnpm agent:example
pnpm agent:workspace-tools-demo
```

The offline tests use the official AI SDK [`MockLanguageModelV3`, `mockValues`,
and simulated stream helpers](https://ai-sdk.dev/docs/ai-sdk-core/testing). The
Runtime itself delegates the loop to [`ToolLoopAgent`](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
with [`stepCountIs`](https://ai-sdk.dev/docs/reference/ai-sdk-core/step-count-is)
and model protocol handling to the official [OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
and [OpenAI-compatible](https://ai-sdk.dev/providers/openai-compatible-providers)
providers.
