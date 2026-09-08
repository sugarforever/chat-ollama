# ChatOllama Agent CLI

`chatollama-agent` is the installable terminal client for the ChatOllama Agent Runtime. It requires Node.js 24 or newer and supports Ollama, OpenAI, Anthropic, Google Gemini, DeepSeek, and OpenRouter.

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

At the `You>` prompt:

- `/models` prints the available catalog and accepts a model number; press Enter to cancel.
- `/model <provider>/<model-id>` switches directly, including IDs such as `openrouter/openai/gpt-5-mini`.
- `/exit` exits normally.

A successful switch affects the next prompt immediately and preserves the current in-memory conversation. Switching is rejected while a Runtime run is active.

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

Ollama discovery reads `/api/tags`, so `/models` reflects models installed on the selected server. Ollama ignores the placeholder API key used by its OpenAI-compatible request adapter.

## Use OpenAI

Set the provider, model, and a valid API key:

```bash
AGENT_PROVIDER=openai \
AGENT_MODEL='gpt-5-mini' \
OPENAI_API_KEY='replace-me' \
chatollama-agent
```

`AGENT_API_KEY` can be used instead of `OPENAI_API_KEY`. `AGENT_BASE_URL` can override the default OpenAI endpoint.

## Supported credentials

The startup catalog includes a remote provider only when its credential is configured:

| Provider | Provider ID | Credential |
| --- | --- | --- |
| Ollama | `ollama` | A reachable local endpoint; no secret required |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| Google Gemini | `google` | `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |

`AGENT_PROVIDER`, `AGENT_MODEL`, `AGENT_BASE_URL`, and `AGENT_API_KEY` remain the non-interactive override path. Any explicit `AGENT_*` model configuration takes priority over a saved choice. A valid saved choice is next, followed by the first available provider/model in deterministic sort order. If none is available, the CLI still starts with the legacy Ollama default and `/models` explains how to configure access.

The CLI isolates provider discovery failures and prints a provider-scoped warning without response bodies, URLs containing credentials, or API keys. It rejects unsupported providers before discovery.

## Saved default

After a successful interactive switch, the CLI writes a minimal `agent.json` containing `provider`, `model`, and an optional non-secret `baseURL`. It never writes an API key. The locations are:

- macOS: `~/Library/Application Support/ChatOllama/agent.json`
- Windows: `%APPDATA%/ChatOllama/agent.json`
- Linux: `$XDG_CONFIG_HOME/ChatOllama/agent.json`, or `~/.config/ChatOllama/agent.json`

A damaged file is ignored with a warning. If a saved model loses its credential or disappears from discovery, the CLI reports that condition and uses the deterministic fallback.

## Runtime events

The CLI creates an `AgentSession`, submits terminal input through `prompt()`, and renders public Runtime events as they arrive:

- `model.delta` text is streamed to stdout.
- Run lifecycle and sanitized errors are written to stderr.
- Provider streams are parsed only by the Runtime and its Vercel AI SDK dependencies.
- Model changes go through the Runtime's typed `model.changed` event.

This release does not add persistent conversation storage, `/new`, full Ctrl+C cancellation, a full TUI, Tools, Skills, compaction, or Web integration.

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
