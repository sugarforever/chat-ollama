# ChatOllama Agent CLI

`chatollama-agent` is the installable terminal client for the ChatOllama Agent Runtime. It requires Node.js 24 or newer and talks to either a local Ollama server or OpenAI.

## Install

Install the CLI globally. npm installs its Runtime dependency automatically:

```bash
npm install --global chatollama-agent
chatollama-agent
```

For a project-local installation:

```bash
npm install chatollama-agent
npx --no-install chatollama-agent
```

Type `/exit` at the `You>` prompt to exit normally.

## Use Ollama

Install and start [Ollama](https://ollama.com/download), then pull the default model:

```bash
ollama serve
```

In another terminal:

```bash
ollama pull qwen3:8b
chatollama-agent
```

The Ollama defaults are:

- `AGENT_PROVIDER=ollama`
- `AGENT_MODEL=qwen3:8b`
- `AGENT_BASE_URL=http://localhost:11434/v1`
- `AGENT_API_KEY=ollama`

Override them when using another model or compatible endpoint:

```bash
AGENT_PROVIDER=ollama \
AGENT_MODEL='llama3.2' \
AGENT_BASE_URL='http://localhost:11434/v1' \
AGENT_API_KEY='ollama' \
chatollama-agent
```

Ollama ignores the placeholder API key, but the OpenAI-compatible client requires a non-empty value.

## Use OpenAI

Set the provider, model, and a valid API key:

```bash
AGENT_PROVIDER=openai \
AGENT_MODEL='gpt-5-mini' \
OPENAI_API_KEY='replace-me' \
chatollama-agent
```

`AGENT_API_KEY` can be used instead of `OPENAI_API_KEY`. `AGENT_BASE_URL` can override the default OpenAI endpoint.

The CLI rejects unsupported providers, empty model or base URL values, and a missing OpenAI API key. Error output never includes the configured secret.

## Runtime events

The CLI creates an `AgentSession`, submits terminal input through `prompt()`, and renders public Runtime events as they arrive:

- `model.delta` text is streamed to stdout.
- Run lifecycle and sanitized errors are written to stderr.
- Provider streams are parsed only by the Runtime and its Vercel AI SDK dependencies.

This release does not add persistent or continuous sessions, `/new`, full Ctrl+C cancellation, a full TUI, Tools, Skills, compaction, or Web integration.

## Repository development

From the ChatOllama repository root:

```bash
pnpm install --frozen-lockfile
pnpm build:agent
printf '/exit\n' | pnpm agent:cli
printf 'Hello\n/exit\n' | pnpm agent:cli:demo
pnpm test:agent
pnpm typecheck:agent
pnpm test:agent:pack
```

The demo injects a mock implementation of the public `AgentSession` interface, makes no network request, and needs no credential. The package test builds real tarballs and installs them in a clean temporary directory.
