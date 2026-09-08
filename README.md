# ChatOllama

ChatOllama is an open source agentic app for running AI agents across local and hosted models.

The project is now centered on two first-class packages:

- [`chatollama-agent`](https://www.npmjs.com/package/chatollama-agent), an installable command-line interface for running an agent from your terminal.
- [`chatollama-agent-runtime`](https://www.npmjs.com/package/chatollama-agent-runtime), the standalone execution layer that powers ChatOllama agents.

The existing web chatbot and knowledge-base platform remains available while it is separated from the new Agent architecture. Its setup and feature documentation has moved to the [Web chatbot and knowledge-base guide](./CHATBOT.md).

## Get started with the Agent CLI

The CLI requires Node.js 24 or newer. Install it globally from npm:

```bash
npm install --global chatollama-agent
chatollama-agent
```

Start Ollama in one terminal:

```bash
ollama serve
```

In another terminal, install and explicitly select a model:

```bash
ollama pull qwen3:8b
AGENT_PROVIDER=ollama AGENT_MODEL=qwen3:8b chatollama-agent
```

Enter prompts for a process-local multi-turn conversation. `/new` clears its history without changing the selected model, and `/exit` exits cleanly. In a terminal, Ctrl+C cancels an active model request but keeps the CLI open; Ctrl+C while idle exits. `/` offers command completion and `/models` opens an arrow-key picker; Enter selects and Escape cancels. In a pipe, `/models` prints a sorted numbered list with the current model marked; a number selects and an empty line cancels. `/model <provider>/<model-id>` works in both modes. A successful selection immediately affects future requests and becomes the next startup default.

To use OpenAI instead:

```bash
AGENT_PROVIDER=openai \
AGENT_MODEL='gpt-5-mini' \
OPENAI_API_KEY='replace-me' \
chatollama-agent
```

Command-only demos do not request generated responses:

```bash
printf '/models\n/model ollama/qwen3:8b\n/exit\n' | chatollama-agent
printf '/models\n/model openai/gpt-5-mini\n/exit\n' | OPENAI_API_KEY='replace-me' chatollama-agent
```

| Provider | Credential / availability |
| --- | --- |
| Ollama | Installed models from the local server's `/api/tags`; no secret required |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GEMINI_API_KEY`, then `GOOGLE_GENERATIVE_AI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

Startup combines a small catalog for configured providers with Ollama and OpenAI model discovery. Each discovery has a two-second timeout; a failure warns without blocking other providers. No credentials and an unavailable Ollama server still allow startup and `/models`. Credentials are detected, not validated against every catalog model.

Explicit `AGENT_PROVIDER` or `AGENT_MODEL` wins over a saved selection, which wins over the first available model sorted by provider and model. If none are available, startup retains `ollama/qwen3:8b` so commands still work. `AGENT_BASE_URL` and `AGENT_API_KEY` override the startup endpoint and credential without changing a saved provider/model identity. Mapped credentials enable discovery; `AGENT_API_KEY` alone does not. See the [CLI configuration guide](./packages/agent-cli/README.md#configuration-precedence) for defaults and custom discovery endpoints.

Preferences live at `~/Library/Application Support/ChatOllama/agent.json` on macOS, `$XDG_CONFIG_HOME/ChatOllama/agent.json` (default `~/.config/ChatOllama/agent.json`) on Linux, and `%APPDATA%\ChatOllama\agent.json` (default `%USERPROFILE%\AppData\Roaming\ChatOllama\agent.json`) on Windows. The JSON stores only `provider`, `model`, and optional non-secret `baseURL`, for example `{"provider":"ollama","model":"qwen3:8b"}`. API keys and conversations are never saved. Corrupt or unavailable selections warn and fall back; a failed save leaves the new model active for the current session.

See the [Agent CLI guide](./packages/agent-cli/README.md) for installation and configuration details.

## Agent Runtime

The Agent Runtime is ChatOllama's execution layer. It manages model runs, in-memory session state, streaming, cancellation, and lifecycle events while keeping provider-specific details behind a stable boundary. The CLI installs and uses it automatically.

Its current interface includes:

- `getSnapshot()` returns an immutable copy of the in-memory messages.
- `subscribe(listener)` streams process-local lifecycle and model events.
- `prompt(input)` starts a streamed model run.
- `cancel()` aborts the active run.
- `setModel(config)` changes an idle session's model while preserving history and emits `model.changed`.
- `reset()` clears history on an idle session while preserving its model and emits `session.reset`.

See the [Agent Runtime guide](./packages/agent-runtime/README.md) for its architecture, complete event model, provider examples, and security boundary.

## Why a separate Runtime?

ChatOllama's Runtime keeps model-provider details behind a stable application boundary. The CLI receives ChatOllama messages, snapshots, and events instead of provider-specific stream parts. This separation lets ChatOllama evolve its interfaces without duplicating execution logic.

The Runtime supports tool-free streaming through Ollama, OpenAI, Anthropic, Google Gemini, DeepSeek, and OpenRouter. The CLI adds process-local continuous conversations, cancellation, provider discovery, model switching, saved model preferences, and a pi-tui interactive adapter while retaining stable plain output for pipes and CI. Persistent sessions, multiple sessions, tools, Skills, compaction, MCP, and Web integration remain outside this feature.

## Develop the Agent packages

Clone the repository and install its pinned pnpm dependencies:

```bash
git clone https://github.com/sugarforever/chat-ollama.git
cd chat-ollama
corepack enable
pnpm install --frozen-lockfile
```

Run the offline demo, which uses a mock model and needs no API key:

```bash
pnpm agent:cli:demo
```

Build and verify both packages:

```bash
pnpm test:agent
pnpm typecheck:agent
pnpm build:agent
pnpm test:agent:pack
```

Additional development commands are documented in the [CLI](./packages/agent-cli/README.md) and [Runtime](./packages/agent-runtime/README.md) package guides.

## Web chatbot and knowledge bases

The original Nuxt application, multi-model chat, knowledge bases, realtime voice chat, MCP management, Docker deployment, database migration, and administrator setup are still part of this repository. They are no longer the primary focus of the project README.

See the [Web chatbot and knowledge-base guide](./CHATBOT.md) for installation, configuration, and maintenance instructions.

## Community

Join the [ChatOllama Discord community](https://discord.gg/TjhZGYv5pC) for support, technical discussion, and project updates.

## License

[MIT License](./LICENSE)
