# ChatOllama

ChatOllama is an open-source agentic app for running AI agents with hosted or
local models. The primary user entry point today is the installable
`chatollama-agent` command-line app.

## Install

Requires Node.js 24 or newer.

```bash
npm install --global chatollama-agent
chatollama-agent
```

## Configure a provider

Set the API key for any provider you want to use before starting the CLI. These
are the provider credentials recognized by the current release:

| Provider                   | Environment variable                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| OpenAI                     | `OPENAI_API_KEY`                                                       |
| Anthropic                  | `ANTHROPIC_API_KEY`                                                    |
| Google Gemini              | `GEMINI_API_KEY`, falling back to `GOOGLE_GENERATIVE_AI_API_KEY`       |
| DeepSeek                   | `DEEPSEEK_API_KEY`                                                     |
| OpenRouter                 | `OPENROUTER_API_KEY`                                                   |
| Ollama (OpenAI-compatible) | `OLLAMA_API_KEY` (optional; defaults to the non-secret value `ollama`) |

For example:

```bash
export OPENAI_API_KEY='replace-with-your-key'
chatollama-agent
```

The CLI also recognizes these explicit startup overrides:

| Variable         | Purpose                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| `AGENT_PROVIDER` | Select `openai`, `anthropic`, `google`, `deepseek`, `openrouter`, or `ollama` |
| `AGENT_MODEL`    | Select the model ID                                                           |
| `AGENT_BASE_URL` | Override the selected provider's API endpoint                                 |
| `AGENT_API_KEY`  | Override the selected provider's credential                                   |
| `AGENT_MAX_STEPS` | Set the positive-integer step budget for each prompt (default: `4`)          |

Use provider and model overrides together when you want a specific startup
model:

```bash
AGENT_PROVIDER=openai AGENT_MODEL=gpt-5-mini chatollama-agent
```

`AGENT_PROVIDER` or `AGENT_MODEL` takes precedence over a saved selection.
`AGENT_BASE_URL` and `AGENT_API_KEY` override its endpoint and credential
without changing its provider/model identity. A mapped provider credential is
still required to add that provider's built-in models to automatic discovery;
`AGENT_API_KEY` alone does not do so.

Compatibility note: Ollama is supported as one OpenAI-compatible provider
alongside the providers above. The CLI still falls back to `ollama/qwen3:8b`
when no model is available, and `AGENT_MODEL` without `AGENT_PROVIDER` uses
Ollama. This keeps the command loop available but does not mean that model is
installed or reachable. To select it explicitly, set `AGENT_PROVIDER=ollama`
and, when needed, `AGENT_BASE_URL`.

## Use the CLI

On startup, ChatOllama discovers available models. Configured remote providers
contribute a built-in model catalog; OpenAI also performs filtered model
discovery, and an available Ollama endpoint contributes its installed models.
Discovery failures produce warnings without preventing the CLI from opening.

At the prompt:

- Enter a message and press Return. Follow-up messages continue the same
  in-memory conversation.
- The Runtime may call the built-in `getCurrentUtcTime` demo tool. Both terminal
  modes show its validated input, execution status, and result before the final
  streamed answer.
- Enter `/models` to view available models and choose one. In an interactive
  terminal, use the arrow keys and Return; press Escape to cancel.
- Enter `/model <provider>/<model-id>` to switch directly, for example
  `/model openrouter/openai/gpt-5-mini`. The model must appear in `/models`.
- Enter `/new` to clear conversation history while keeping the selected model.
- Press Ctrl+C during a response to cancel that response and keep the CLI open.
  Press Ctrl+C while idle to quit.
- Enter `/exit` to quit cleanly.

A successful model selection applies to later messages and is saved as the next
startup default. Conversations and API keys are not saved.

For plain or scripted input, `/models` prints a numbered list instead of the
interactive picker:

```bash
printf '/models\n/exit\n' | chatollama-agent
```

To run a deterministic tool loop without a provider, network request, or paid
API key:

```bash
pnpm install --frozen-lockfile
pnpm agent:tool-loop-demo
```

The demo performs two real model steps with AI SDK `MockLanguageModelV3`: the
first requests the safe UTC-time tool, and the second receives its result and
streams the final answer.

For configuration precedence, saved preference locations, plain-mode behavior,
and provider-specific examples, see the
[Agent CLI guide](./packages/agent-cli/README.md).

ChatOllama is an app for running AI agents, not an SDK for building them.

[MIT License](./LICENSE)

This README should be updated with every release that changes user-visible
behavior.
