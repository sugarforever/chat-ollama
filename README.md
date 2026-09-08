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

By default, ChatOllama connects to a local Ollama server and uses `qwen3:8b`:

```bash
ollama serve
ollama pull qwen3:8b
chatollama-agent
```

Enter a prompt at `You>` and type `/exit` when you are finished.

To use OpenAI instead:

```bash
AGENT_PROVIDER=openai \
AGENT_MODEL='gpt-5-mini' \
OPENAI_API_KEY='replace-me' \
chatollama-agent
```

See the [Agent CLI guide](./packages/agent-cli/README.md) for local installation, provider configuration, and development commands.

## Agent Runtime

The Agent Runtime is ChatOllama's execution layer. It manages model runs, in-memory session state, streaming, cancellation, and lifecycle events while keeping provider-specific details behind a stable boundary. The CLI installs and uses it automatically.

Its current interface includes:

- `getSnapshot()` returns an immutable copy of the in-memory messages.
- `subscribe(listener)` streams process-local lifecycle and model events.
- `prompt(input)` starts a streamed model run.
- `cancel()` aborts the active run.

See the [Agent Runtime guide](./packages/agent-runtime/README.md) for its architecture, complete event model, provider examples, and security boundary.

## Why a separate Runtime?

ChatOllama's Runtime keeps model-provider details behind a stable application boundary. The CLI receives ChatOllama messages, snapshots, and events instead of provider-specific stream parts. This separation lets ChatOllama evolve its interfaces without duplicating execution logic.

Today, version `0.1.0` provides the foundation: one tool-free streamed response through OpenAI, Ollama, or another OpenAI-compatible endpoint. Persistent sessions, tools, Skills, compaction, MCP, web integration, and a full terminal UI are not part of this release yet.

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
