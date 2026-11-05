# ChatOllama

ChatOllama's new web application is a standalone rewrite built with **SvelteKit,
TypeScript, and pi durable**. It provides persistent agent conversations,
document knowledge bases, and Model Context Protocol (MCP) tools through one
self-hosted Node.js process.

The implementation lives in [`rewrite/`](./rewrite/README.md). The legacy
Nuxt application at the repository root and the existing Agent CLI remain
separate applications; they have not been converted to use the new backend.
Run the rewrite from its own directory, not through the root Nuxt commands.

## New web application

- Streaming Markdown chat, conversation history, expandable tool activity,
  source citations, and explicit Stop controls.
- Pi durable execution: closing the browser does not cancel work; unfinished
  runs resume after the application process restarts on an intact data volume.
- One durable session per conversation and one active run per conversation.
  HTTP commands and Server-Sent Events (SSE) connect the browser to the server.
- OpenAI-compatible chat endpoints with configurable base URL, API key, and
  model ID. Ollama can be used through its compatible endpoint; no dedicated
  Ollama integration is required.
- Named knowledge bases with text-based PDF, Markdown, and plain-text uploads,
  indexing status, retry, deletion, and source excerpts. Retrieval is an agent
  tool scoped to the conversation's selected collections.
- Independent embedding endpoint/model settings and explicit collection
  reindexing after embedding configuration changes.
- Local stdio and remote Streamable HTTP MCP servers, selected per
  conversation. Selected tools run without individual approval. An uncertain
  interrupted action blocks further execution until you check its external
  outcome and acknowledge it; acknowledgment does not retry that action.
- A single administrator login and one Docker Compose service. SQLite and
  local files replace the legacy app's external storage dependencies.

### Quick start with Docker Compose

From a checkout containing the rewrite:

```sh
cd rewrite
cp .env.example .env
# Edit .env before starting (see below).
docker compose up --build -d
```

Set `ADMIN_PASSWORD`, the exact public `ORIGIN`, and your chat and embedding
endpoint/model settings. Open `http://localhost:3000` with the default origin
and log in. API keys are needed when required by your provider. Inside Docker,
`localhost` refers to the container; use a reachable provider address such as
`host.docker.internal` for services on the host.

The rewrite has its own package manifest, lockfile, and workspace boundary.
For direct Node.js setup, use Node **24.22.2** and pnpm **10.8.1** and follow the
[standalone setup instructions](./rewrite/README.md#local-nodejs-setup).
For data protection, proxy/SSE settings, MCP executables, and backup/restore,
see [deployment and operations](./rewrite/README.md#docker-deployment-and-operations).

### Architecture and coexistence

```text
SvelteKit browser UI → HTTP commands / SSE → SvelteKit server → pi durable
                                                    ├─ knowledge search tool
                                                    └─ selected MCP tools
```

Nuxt does not serve the new UI or call this backend. Each app has its own
build, configuration, authentication, and storage. Running both requires
different ports; both web applications otherwise default to port 3000. For
example, set the rewrite's Compose `PORT=3001` and
`ORIGIN=http://localhost:3001` together to keep the legacy app on port 3000.

### Existing data is not compatible

| | Legacy Nuxt application | New web application |
| --- | --- | --- |
| Application records | Prisma/PostgreSQL; older releases used SQLite | New application SQLite schema |
| Knowledge vectors | Chroma or Milvus | Embeddings stored in SQLite |
| Agent conversations | Legacy chat/agent records | Pi durable SQLite sessions |
| Uploaded files | Legacy storage layout | Private files under the rewrite data directory |

The rewrite cannot directly read or share legacy chats, users, settings,
documents, or vector indexes. It starts with its own data. No automatic
migration or export/import tool is included, and the legacy data is left
untouched. A future import would need an explicit conversion; knowledge
content would generally need reindexing. An old SQLite database is not
compatible merely because both apps use SQLite.

Docker Compose stores the rewrite's data in its own `rewrite-data` volume.
Local Node.js execution uses `./data` by default. Preserve the whole directory,
including uploads, runtime sidecars, and SQLite WAL files; some files contain
provider/MCP credentials. See the [backup procedure](./rewrite/README.md#docker-deployment-and-operations).

### Current scope

This version targets one administrator and one application process. Voice,
legacy-data migration, skills, OCR, crawling, branching, message editing, and
regeneration are deferred. Recovery covers application-process failure on an
intact volume; it does not guarantee recovery from host or power loss.

[Build and validation evidence](./rewrite/docs/build-evidence.md) records
fixture-based integration, browser, and recovery checks. These do not establish
live-model answer quality or every third-party provider's compatibility.

## Existing Agent CLI

The installable `chatollama-agent` CLI is a separate entry point. The provider
variables and commands below belong to that CLI, not to the new web app. Its
in-memory conversation behavior does not describe pi durable web sessions.

### Install

Requires Node.js 24 or newer.

```bash
npm install --global chatollama-agent
chatollama-agent
```

### Configure a provider

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

### Use the CLI

On startup, ChatOllama discovers available models. Configured remote providers
contribute a built-in model catalog; OpenAI also performs filtered model
discovery, and an available Ollama endpoint contributes its installed models.
Discovery failures produce warnings without preventing the CLI from opening.

At the prompt:

- Enter a message and press Return. Follow-up messages continue the same
  in-memory conversation.
- The Runtime may call `read_file`, `list_directory`, `grep`, and `find_files`
  to inspect the directory where the CLI was started. Both terminal modes show
  each tool's validated input, execution status, and bounded result.
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

To exercise all six workspace tools without a provider or network request:

```bash
pnpm agent:workspace-tools-demo
```

The CLI startup directory is the workspace root. Tool paths must be relative to
that root; absolute paths, `..` escapes, prefix-confusion paths, and symlinks
that resolve outside it are rejected. Read/search results are capped and report
truncation. `write_file` and exact `edit_file` use atomic replacement, serialize
changes to the same path, and reject content over 1,048,576 bytes. Successful
`read_file`, `write_file`, and `edit_file` results include a complete-content
`sha256:<hex>` version. `write_file` and `edit_file` accept an optional
`expectedVersion`; a stale value returns `VERSION_CONFLICT` without changing
the file. `edit_file` supports the legacy single exact replacement and batches
of up to 100 replacements: every literal `oldText` must match exactly once in
the original content, ranges must be non-overlapping, and the whole batch is
atomic. The cumulative edit input and resulting content are each limited to
1,048,576 UTF-8 bytes; matching is never fuzzy. They do not expose shell
commands.

For configuration precedence, saved preference locations, plain-mode behavior,
and provider-specific examples, see the
[Agent CLI guide](./packages/agent-cli/README.md).


[MIT License](./LICENSE)
