# ChatOllama Agent CLI

`chatollama-agent` is the installable terminal client for the ChatOllama Agent Runtime. It requires Node.js 24 or newer.

## Install and run

```bash
npm install --global chatollama-agent
chatollama-agent
```

For a project-local installation, run `npm install chatollama-agent`, then `npx --no-install chatollama-agent`.

Both stdin and stdout must be TTYs to enable the pi-tui editor, slash-command completion, streaming transcript, and model picker. Type `/` for completion. `/models` opens a picker with the current model marked, ↑/↓ navigation, Enter to select, and Escape to cancel. `/new` clears process-local conversation history while preserving the selected model and non-secret configuration. `/exit` exits cleanly. Ctrl+C cancels an active model request and returns to the editor; Ctrl+C while idle exits. Redirected input or output, or a truthy `CI` environment variable, uses plain line mode with no ANSI sequences. Empty, `false`, and `0` values of `CI` do not force plain mode (case and surrounding whitespace are ignored).

Both modes render agent steps and built-in tools with their name, running/completed/failed status, and a safe input or bounded result summary. The tools include `getCurrentUtcTime` plus the read-only workspace tools `read_file`, `list_directory`, `grep`, and `find_files`. pi-tui adds these records through its transcript component, so streamed model text and tool events do not replace unfinished editor input or move focus.

The directory where `chatollama-agent` starts is the workspace root for the lifetime of that process. Workspace tool paths are relative to this root. Absolute paths, paths escaping through `..`, sibling-prefix confusion, and symlinks resolving outside the root are rejected. Missing paths and unsupported file types return stable results. Outputs are capped at 65,536 bytes and additionally at 2,000 read lines, 1,000 directory entries, 100 grep matches, or 1,000 found files; a truncated result says so explicitly. Ctrl+C cancellation reaches active filesystem and `ripgrep` work through the Runtime. Search uses the platform-specific `rg` executable supplied by the Runtime package, with structured arguments and no shell or host `PATH` dependency. This boundary distrusts model input; it is not an OS sandbox against a separate hostile process running as the same user and concurrently replacing workspace entries.

In plain mode, `/models` prints models sorted by provider and model, marks the current selection, and accepts a listed number. An empty line cancels selection. `/new` and `/exit` have the same newline-delimited command behavior without ANSI output. Both modes accept `/model <provider>/<model-id>` directly; IDs may contain slashes, for example `/model openrouter/openai/gpt-5-mini`. Invalid selections leave the current model unchanged. Successful selections affect the next request, retain in-memory history, and save the next startup default. Model switching and conversation reset are both rejected during an active run, so neither can overwrite active-run state.

## Providers and credentials

| Provider | Credential / availability |
| --- | --- |
| Ollama | Reachable local service; installed models from `/api/tags`; no secret required |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GEMINI_API_KEY`, then `GOOGLE_GENERATIVE_AI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

Blank credentials are ignored. Configured remote providers contribute a small built-in catalog. OpenAI also queries `/v1/models`, admitting only an explicit set of text Responses model families and their dated snapshots; image, embedding, audio, realtime, and unknown IDs are excluded from automatic discovery. `AGENT_MODEL` remains available for explicit model overrides. Ollama lists actual installed models. Catalog availability means a credential is configured, not that the account has been verified or can access every listed model.

Each network discovery has a two-second timeout. A failed provider produces a sanitized warning while other providers and `/exit` remain usable; OpenAI's built-in catalog survives discovery failure. With no credentials and no Ollama server, startup still succeeds and `/models` explains that credentials are needed. The empty-list compatibility fallback is `ollama/qwen3:8b`; it is not represented as an installed model. Starting the CLI and selecting a model do not generate a paid model response.

## Configuration precedence

Explicit `AGENT_PROVIDER` or `AGENT_MODEL` selects the startup model ahead of a saved preference. Without either, a still-available saved selection wins; otherwise the first available model sorted by provider and model is used. An unavailable saved model produces a warning. With no available models, the legacy Ollama selection is retained so the command loop can start.

`AGENT_PROVIDER` supports `ollama`, `openai`, `anthropic`, `google`, `deepseek`, and `openrouter`. An explicit provider without a model uses its default: respectively `qwen3:8b`, `gpt-5-mini`, `claude-sonnet-4-5`, `gemini-2.5-flash`, `deepseek-chat`, or `openai/gpt-5-mini`. `AGENT_MODEL` alone uses Ollama.

`AGENT_BASE_URL` and `AGENT_API_KEY` override the endpoint and credential of the startup selection, including a restored selection. These two overrides alone do not replace its provider/model identity. Startup reads validated saved endpoint metadata before discovering Ollama or OpenAI models. `AGENT_BASE_URL` takes priority for discovery of the explicit provider, the saved provider when no provider/model override is set, or Ollama by default. For Ollama, `/v1` is removed before requesting `/api/tags`. `AGENT_API_KEY` does not enable a provider's discovery catalog; configure the provider's mapped credential for that. Later `/model` selections use their discovered endpoint and mapped provider credential. Secrets are never stored in preferences or exposed by Runtime events.

`AGENT_MAX_STEPS` sets the positive-integer tool-loop budget for each prompt and defaults to `4`. A run that exhausts this budget stops with `step-limit`; a later prompt can continue from the preserved Session history. Increasing this value permits longer runs but does not add persistence or process recovery.

## Saved model preference

| Platform | File |
| --- | --- |
| macOS | `~/Library/Application Support/ChatOllama/agent.json` |
| Linux / other Unix | `$XDG_CONFIG_HOME/ChatOllama/agent.json`, or `~/.config/ChatOllama/agent.json` |
| Windows | `%APPDATA%\ChatOllama\agent.json`, or `%USERPROFILE%\AppData\Roaming\ChatOllama\agent.json` |

The minimum schema is:

```json
{"provider":"ollama","model":"qwen3:8b","baseURL":"http://localhost:11434/v1"}
```

`baseURL` is optional. Only HTTP(S) endpoints without credentials, query strings, or fragments are saved. No other fields, API keys, or conversations are persisted. Writes use a temporary file and atomic rename, with mode `0600` where supported. Missing files are normal; malformed, unreadable, or unsafe preferences produce a warning and are ignored. If saving fails, the new model remains active for this session and the CLI reports that it could not save the default.

## Ollama demo

Install [Ollama](https://ollama.com/download), then run its server in one terminal:

```bash
ollama serve
```

In another terminal:

```bash
ollama pull qwen3:8b
AGENT_PROVIDER=ollama AGENT_MODEL=qwen3:8b chatollama-agent
```

To exercise discovery and selection without requesting a response:

```bash
printf '/models\n/model ollama/qwen3:8b\n/exit\n' | chatollama-agent
```

For a custom endpoint, set `AGENT_PROVIDER=ollama AGENT_BASE_URL=http://localhost:11434/v1`. Ollama uses the non-secret compatibility key `ollama` unless overridden.

## OpenAI demo

```bash
export OPENAI_API_KEY='replace-me'
AGENT_PROVIDER=openai AGENT_MODEL=gpt-5-mini chatollama-agent
```

Enter a prompt to request a streamed response, or use only commands to inspect and select:

```bash
printf '/models\n/model openai/gpt-5-mini\n/exit\n' | chatollama-agent
```

Replace the placeholder with your key locally. Discovery can contact OpenAI's models endpoint; these command-only examples do not request model generation.

## Runtime boundary and development

The CLI consumes public `AgentSession` events and the Runtime's discovery/resolver API. Provider construction, structured message history, and `AbortController` ownership stay in the Runtime. pi-tui is imported only by the interactive adapter. Plain mode streams response text to stdout and lifecycle events, startup warnings, and sanitized request errors to stderr. Cancelled, stopped, and failed runs do not create a completed assistant message. Tool call/result Session items use Runtime-owned types, not AI SDK stream parts. Conversation history remains process-local; persistence, multiple Sessions, custom tools, Skills, compaction, MCP, approvals, and Web integration are outside this feature.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm test:agent
pnpm typecheck:agent
pnpm build:agent
pnpm test:agent:pack
printf 'Hello\n/exit\n' | pnpm agent:cli:demo
pnpm agent:tool-loop-demo
pnpm agent:workspace-tools-demo
```

Tests use fake transports and virtual terminals. `agent:cli:demo` uses a small mock public `AgentSession`; `agent:tool-loop-demo` connects the real Runtime and plain CLI around `MockLanguageModelV3`. `agent:workspace-tools-demo` creates a temporary fixture workspace and exercises all four real read/search tools through the Runtime-to-CLI path without credentials or network access. The package smoke test installs actual tarballs in a clean temporary project and exercises `/models`, numeric selection, `/model`, and `/exit` with fake discovery and no paid API calls.
