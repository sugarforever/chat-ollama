# ChatOllama web application: SvelteKit + pi durable

A standalone, single-administrator chatbot with durable agent conversations,
document knowledge bases, and MCP tools. SvelteKit serves both the browser UI
and the application HTTP/SSE API; pi durable owns agent execution. The legacy
Nuxt app does not call this backend and is not needed to run it.

## Storage compatibility

This app uses a new SQLite schema for settings, knowledge
metadata and embeddings, plus separate pi durable SQLite files and local
uploads. It cannot directly read the legacy Prisma/PostgreSQL records, older
SQLite databases, Chroma/Milvus indexes, or uploaded-file layout. Chat history,
accounts, settings and knowledge bases are not shared. No migration or
export/import tool is included; existing data is left untouched. Knowledge
content imported in a future migration would generally need reindexing.

The legacy app and this replacement can run independently on different ports.
For Compose, change both `PORT` and `ORIGIN` when using a port other than 3000.
The replacement does not need PostgreSQL, Redis, Chroma, or Milvus.

## Local Node.js setup

Run from this directory with Node **24.22.2 LTS** and pnpm **10.8.1**:

```sh
pnpm install
pnpm build
# Replace the example model ID; use your provider's URL/key.
export ORIGIN='http://localhost:3000'
export CHAT_BASE_URL='http://127.0.0.1:11434/v1'
export CHAT_MODEL_ID='your-chat-model'
# Set CHAT_API_KEY if your provider requires it.
pnpm start
```

Open the exact `ORIGIN` URL to open the workspace directly. Configure the independent embedding
endpoint and model in Settings before indexing knowledge documents. Environment
variables must be exported; `pnpm start` does not load `.env` automatically.
The `.env.example` provider URLs target Docker-to-host access; for direct local
Node execution, use addresses reachable from the host process.

For the single-service container setup, see
[Docker deployment and operations](#docker-deployment-and-operations).

This folder has its own workspace boundary and lockfile; do not install the legacy Nuxt app to run it. `server.mjs` awaits runtime bootstrap before accepting HTTP, reopens every catalogued conversation SQLite file, and closes sessions on SIGTERM/SIGINT. One process must own the data directory. Set DATA_DIR (default `data`), CHAT_BASE_URL (default `http://127.0.0.1:11434/v1`), CHAT_API_KEY, CHAT_MODEL_ID, PORT and HOST. The endpoint uses OpenAI chat completions; it is not an Ollama-specific integration.

Pinned runtime: `@earendil-works/pi-durable`, `@earendil-works/pi-ai`, and `@earendil-works/chord` **1.5.2**. Upstream requires Node >=22.19.0; Node 24 is the selected supported LTS line. SvelteKit 2.49.1, Svelte 5.45.6, adapter-node 5.5.7, Vite 7.2.2, TypeScript 5.9.3, and Vitest 4.0.13 are pinned. See pnpm-lock.yaml for transitive pins.

The adapter exposes application snapshots, admission, Stop, subscriptions and close. pi types stay private. A process manager caches opening promises per conversation. Browser subscription cleanup cannot cancel agent work. SQLite WAL synchronous NORMAL protects against process crashes; no host-loss or power-loss guarantee is claimed.

The release's packaged README/types are the API reference. Pi Durable 1.5.2 uses `observeCommits({advance,end})` for stored publications and `Conversation.watch()` for live progress. `Harness.resume()` starts pending work, `root.abort()` waits for idle, and `Harness.close()` preserves pending tasks. See [provider/authentication design and upgrade validation](docs/provider-auth.md). Unsafe tools interrupted mid-call produce interrupted results; only explicitly replay-safe tools rerun.

Tests use a real local HTTP model fixture, real pi SQLite storage, and separate Node processes. They verify SIGKILL recovery without resubmission, completed work staying completed, custom URL/key forwarding, concurrent independent conversations, committed watches, explicit Stop, and detached observers.


Chat HTTP commands are `POST /api/conversations` with `{providerId, modelId, knowledgeBaseIds, mcpServerIds}`, `GET /api/conversations`, `GET /api/conversations/:id`, `POST /api/conversations/:id/messages` with `{requestId, content}`, and `POST /api/conversations/:id/stop`. `PATCH /api/conversations/:id` with `{providerId, modelId}` saves a new selection and returns the updated snapshot (200). It leaves history, knowledge and MCP selections intact, and may be used during a run. The selection applies to subsequent input. Missing/invalid fields return 400/INVALID_INPUT; an unknown or deleted provider returns 409/PROVIDER_NOT_FOUND without fallback. Creation returns 201; durable message admission returns 202 with `{id}`. Repeating an identical request ID returns that original ID, conflicting content returns 409/REQUEST_CONFLICT, and distinct input while running returns 409/BUSY. Stop waits for pi to reach idle; connected state observers can see cancelling while that happens.

`GET /api/conversations/:id/events` sends application-owned `snapshot` envelopes as SSE `data:`. Every connection receives the current full state, including when Last-Event-ID is supplied. Slow clients retain only the newest pending snapshot. Revisions are process-local and are not resume cursors. The browser discards HTTP snapshot reads overtaken by SSE updates for the same selection, without comparing revisions across application restarts. The projection includes the saved `selection: {providerId, modelId}` (also published on selection changes), committed transcript, committed assistant partial text, tool output/status/uncertainty, and persisted run outcomes; it omits provider error details.

`DATA_DIR/sessions/catalogue.sqlite` stores conversation config and creation intent; each generated conversation ID has its own pi SQLite file alongside it. Startup completes interrupted creation before accepting HTTP. Unknown HTTP IDs never create session files. pi owns the single durable request receipt and user entry; the application has no second admission ledger or event journal. Same-origin mutation checks apply centrally.


The application opens directly without a login or admin password. Anyone with network access can use chat, settings, knowledge and MCP tools; bind to localhost for local use or restrict access at your reverse proxy. Set adapter-node `ORIGIN` to the exact public origin: `http://localhost:3000` for direct local HTTP, or `https://chat.example.com` behind TLS. Trust forwarding headers only from your own proxy. Every mutation requires a matching Origin header. Provider account authentication remains available for connecting AI services.

`GET /api/settings` returns named providers, default selection, the official pi-ai chat catalog/auth modes, custom protocols and independent embedding settings. Stored keys, credential environment and OAuth tokens are omitted. `POST /api/settings` accepts the complete `providers` array and/or `defaultProviderId`; omit secrets to preserve them and use an empty key to clear it. Native providers include `service`, `authMode`, `modelId` and an optional base URL/provider credential environment. Service or auth-mode changes do not inherit credentials. Stable provider IDs remain unchanged when renamed. The legacy `chat` alias edits a legacy default only. See [native setup, official account login, cloud credentials and protocol details](docs/provider-auth.md).

URLs must use HTTP(S) without embedded credentials, query strings, or fragments; local endpoints are allowed. `CHAT_*` seeds a named **Legacy chat** provider (`legacy`) once on first startup/settings read, importing previously saved `chat` settings in preference to environment values. Later environment changes do not overwrite imported providers. `EMBEDDING_*` still seeds embeddings until saved. Startup upgrades catalogue records without a provider ID to `legacy`, preserving their model, knowledge and MCP selections. Older creation clients that omit `providerId` use the default **at creation** and persist it. Changing defaults never redirects existing conversations. If the legacy provider is later removed, upgraded conversations must explicitly select another provider.

Settings persist in `DATA_DIR/app.sqlite` (0600), inside the data directory (0700). Back up the entire directory before upgrading, including SQLite WALs and private per-conversation sidecars; these contain credentials. This is an automatic additive upgrade of the rewrite's existing data, not an import of the Nuxt data format. Retain a pre-upgrade backup for rollback.

In Settings, add named providers and click **Save provider**; blank key fields preserve credentials and the removal checkbox clears them. The chat creation form selects a provider and model. Within an existing conversation open **Change model**, then use **Apply to next message** to save a different pair. Built-in model IDs come from pi-ai; custom model IDs must exist at that endpoint; upstream model rejection is shown as a failed run without provider error details. Removing a provider keeps existing history accessible but blocks new input with `PROVIDER_NOT_FOUND` until the selection is repaired. Duplicate admitted request IDs still return their original receipt after a switch or deletion.

Each new admission resolves its conversation's saved provider and model and atomically replaces `sessions/:id.endpoint.json` (0600) before configuring Pi. Active runs retain that captured endpoint/key/model across selection/default/provider edits or deletion and process restart. Recovery reads the private snapshot before resuming Pi; it does not resolve the current selection until new input. The snapshot reflects the last captured run and may contain an older key after a provider edit/removal; protect the whole data directory. Selection changes publish public snapshot events, without changing the running Pi agent. The manager's `selectModel` command and application-owned `ProviderSelection`/snapshot contracts are shared client boundaries for the Web UI and a future HTTP CLI; there is no additional execution runtime or integration with the old CLI.

Embeddings have independent configuration and require explicit collection reindexing after changes. Work continues after closing the browser; Stop explicitly cancels. Uncertain external actions require acknowledgment after checking the external system.

MCP servers are configured with `PUT /api/mcp`, using
`{"servers":[{"id":"local","transport":"stdio","command":"node","args":["server.js"],"env":{"TOKEN":"..."}}]}`
or `{"servers":[{"id":"remote","transport":"http","url":"https://host/mcp","headers":{"Authorization":"Bearer ..."}}]}`.
This replaces the entire server list, including credentials. `GET /api/mcp` returns
public configuration and credential presence flags; environment values and headers
remain server-side. Use environment/header fields for secrets. HTTP supports
Streamable HTTP; interactive OAuth setup is outside v1. Select server IDs when
creating a conversation. Only selected tools are registered, without per-call approval.

An interrupted MCP action may already have changed an external system. Snapshots
include `mcpUncertainty` and status `interrupted`; inspect the external outcome,
then explicitly `POST /api/conversations/:id/acknowledge` to allow subsequent input.
Acknowledgement does not retry the old action. Automatic model requests and all
MCP dispatch remain blocked until acknowledgement; native pi interrupted results
remain in the transcript. Running requests receive Stop's cancellation signal, but
cancellation cannot undo an external effect.

The application persists selected MCP configuration and discovery per conversation
with private file permissions, preserving a run's effective tools across restart.
Later input refreshes global configuration. The additional `.mcp.sqlite` file owns
only the application's uncertainty barrier; pi's SQLite schema is untouched. A crash
in the gap between native result commit and barrier cleanup conservatively requires
acknowledgement. This covers process failure, not host loss or power failure.

Knowledge collections and ingestion use `DATA_DIR/app.sqlite` plus generated
0600 files in `DATA_DIR/uploads`; they never modify pi's schema. Configure
`EMBEDDING_BASE_URL`, `EMBEDDING_MODEL_ID`, `EMBEDDING_API_KEY` or the independent
embedding settings. Changes to endpoint/model/key require explicit reindexing of
existing collections. A collection reindex stages a replacement generation and
publishes it atomically; incompatible collections cannot be searched or appended
to until reindex succeeds. Failed ordinary uploads affect only their own document. A failed replacement keeps compatible published passages searchable and exposes the rebuild error alongside ready status; incompatible settings still require successful reindexing.
Queued/indexing work resumes after process restart. No OCR is provided.

Authenticated knowledge HTTP endpoints:

- `GET /api/knowledge-bases`, `POST /api/knowledge-bases` with `{name}`, and
  `DELETE /api/knowledge-bases/:id`.
- `GET /api/knowledge-bases/:id/documents`; `POST` to the same URL with one
  multipart `file` field (`.pdf`, `.md`, `.markdown`, `.txt`). Upload returns 202
  with a generated document ID. Max file size 10 MiB; UTF-8 text; at most 1000 PDF
  pages and 2 million extracted characters. Text-free PDFs fail with a no-OCR
  message. Extracted chunks have at most 1200 characters and 150-character overlap.
- `GET /api/documents/:id`, `DELETE /api/documents/:id`, and
  `POST /api/documents/:id/retry`. Status is queued/indexing/ready/failed, with a
  sanitized failure message. Poll document/list APIs while indexing.
- `POST /api/knowledge-bases/:id/reindex` explicitly queues a collection rebuild.
- `POST /api/knowledge-bases/:id/search` with `{query, limit?}` returns excerpts,
  document/title, optional PDF page, cosine score and stable `sourceId`.
  `GET /api/sources/:sourceId?conversationId=:conversationId` returns inert JSON source details only when the source belongs to a selected conversation collection. The direct `/sources/:sourceId` route has the same required conversation scope. Missing scopes, unselected collections and deleted sources return 404. The UI verifies references before making them clickable and revalidates on inspection.

A conversation registers the replay-safe `search_knowledge` tool only when its
`knowledgeBaseIds` selection is nonempty. The model chooses when to search; it
cannot change the scoped collection IDs. Source IDs survive embedding reindexing
when the extracted passage is unchanged. Read-only retrieval needs no MCP outcome
barrier. Native Stop cancels a pending embedding request.

One in-process worker indexes persisted pending documents, batching at most 32
texts per embedding request. Upload admission caps pending documents at 100.
Search permits two concurrent scans and clamps top-k to 1–20. Float32 normalized
vectors are persisted in SQLite; a worker thread scans one row at a time and keeps
only top-k, avoiding a vector copy into the request heap. No external vector
service or retrieval framework is required. `tests/retrieval-scale.spec.ts`
generates 100,000 384-dimensional chunks and records latency, process RSS and
concurrent native chat responsiveness. See `docs/build-evidence.md` for results.


## Browser interface validation

Settings at `/settings` redirects to `/settings/providers`, a list of saved connections. The built-in catalog lives at `/settings/providers/new`; its entries are templates, not connected accounts. Each saved connection has its own `/settings/providers/[id]` editor. Existing connections expose only model and API-key editing; service, authentication, endpoint and protocol are plain-text details. The catalog selection fixes service/authentication for new connections. API setup automatically tests the entered key and loads the provider’s models endpoint; the model selector remains hidden until success. Most-recent creation timestamps determine the initial default, with response order as the fallback when dates are absent. Discovered model IDs persist for chat selection and execution. Interface icons use Lucide; provider brands keep their own logos. **Chat defaults** at `/settings/chat` independently selects the provider for new conversations. Embeddings, Knowledge and MCP servers also have individual routes. Links support browser Back/Forward, refresh, bookmarks and new tabs. Unsaved changes require a discard decision before leaving; drafts have stable non-secret URLs and are only persisted by Save or Connect. Settings and account-login controls use shadcn-svelte: Button, Input, Native Select, Checkbox, Textarea, Badge and confirmation dialogs. Review screenshots are uploaded to the PR description as GitHub attachments and stay out of source control. Settings also manage an independent embedding endpoint. Blank API key fields preserve saved credentials; a separate checkbox explicitly removes them. Knowledge collections support uploads, statuses, retries, deletion and explicit reindexing. A failed compatible rebuild displays its warning separately while published content remains ready.

The MCP editor replaces the complete global server list. It starts with a blank replacement and requires explicit acknowledgment: saved secrets are never fetched or filled into the editor. Supply every intended server and its full credentials; redacted presence flags are rejected. Select knowledge collections and MCP servers when creating a conversation.

The browser suite uses Chromium and a real adapter-node production build with local HTTP model/embedding and real stdio MCP fixtures. It needs no external credentials:

```sh
pnpm exec playwright install chromium
pnpm test
pnpm check
pnpm build
pnpm exec playwright test tests/acceptance.spec.ts
```

Run these serially because HTTP tests rebuild shared `build/` output. Browser tests are excluded from Vitest. Screenshots are written under ignored `test-results/` for desktop and 390-pixel layouts.

## Docker deployment and operations

This directory is a standalone replacement. It does not require or alter the legacy PostgreSQL, Redis, Chroma or Milvus services. Old-data migration is deferred. Use one app process and one replica per data directory; do not cluster Node workers or share the volume between running instances.

```sh
cd rewrite
cp .env.example .env
# Edit .env: choose exact ORIGIN, and provider/model settings.
docker compose config
docker compose up --build -d
docker compose logs -f app
```

Open the exact `ORIGIN` URL to use the workspace directly. Keep provider/MCP credentials private. Saved settings override environment defaults. For local Node execution, export the variables before `pnpm start`; Node does not automatically load `.env` here. `DATA_DIR` defaults to `./data` locally; Compose fixes it to `/data` in the persistent `rewrite-data` named volume.

The image uses Node 24.22.2 and runs `node server.mjs` as the unprivileged `node` user. It includes production JavaScript dependencies, generated adapter output and the bootstrap bundle. Stdio MCP executables and any runtimes they need must be installed by the operator in a derived image; a configured command executes inside the container, not on the host. Install them as root while building the derived image and switch back to `USER node`. Avoid credentials in image layers. HTTP MCP needs no local executable. Both transports are tested with local protocol fixtures; live third-party interoperability remains provider-specific.

Inside Docker, `localhost` means the app container. The example uses `host.docker.internal` (including a Linux host-gateway mapping). The host's model/embedding service must listen on a reachable interface and allow Docker traffic. Alternatively use a reachable LAN/service URL. Chat and embedding URLs are independent OpenAI-compatible endpoints. Select actual installed model IDs in Settings. Changing embedding settings requires **Reindex collection** for each existing collection; it never silently rebuilds your corpus.

For public access, put TLS in front of the app and set `ORIGIN=https://your-host` exactly, including any nondefault port. Only trust headers supplied by your own proxy. Disable response buffering and compression buffering for `/api/conversations/*/events`; for nginx use `proxy_buffering off`, `proxy_cache off`, and a suitably long `proxy_read_timeout`. Browser disconnects and proxy reconnects do not stop admitted work. The next SSE connection obtains a complete committed snapshot.

```sh
# Graceful shutdown preserves pending work; starting resumes it.
docker compose stop app
docker compose start app
# Destructive process-crash drill, on disposable test data only:
docker compose kill -s SIGKILL app
docker compose up -d app
```

Stop in the UI deliberately cancels a run; closing a tab does not. A crashed model request may execute again to recover unfinished work. An interrupted unsafe MCP action is different: it may already have affected the external system, so automatic model/MCP dispatch stays blocked. Inspect that system, then use **I checked the outcome — acknowledge**. Acknowledgment allows new input; it does not repeat the action. Do not infer that cancellation undoes external changes. The guarantee is recovery after application-process failure on an intact local volume, not host loss, filesystem loss or power failure.

The entire data directory is one backup unit:

```text
/data/app.sqlite                     settings, knowledge metadata/vectors
/data/uploads/                       original uploaded files
/data/sessions/catalogue.sqlite      conversation catalogue and creation intent
/data/sessions/<id>.sqlite            pi durable conversation storage
/data/sessions/                       endpoint/MCP snapshots and uncertainty sidecars
```

Preserve all files, including SQLite `-wal`/`-shm` files and per-conversation sidecars; endpoint/MCP snapshots contain secrets. Back up only while the app is stopped. For example, from this directory with the default named volume:

```sh
docker compose stop app
docker compose run --rm --no-deps --user root --entrypoint tar app -C /data -czf - . > rewrite-backup.tar.gz
docker compose start app
# Restore into an empty volume while every app instance is stopped:
docker compose stop app
cat rewrite-backup.tar.gz | docker compose run --rm -T --no-deps --user root --entrypoint sh app -c 'tar -xzf - -C /data && chown -R node:node /data'
docker compose start app
```

Protect the archive as credentials and user content. Restore into an empty volume to avoid mixing two catalogues; retain the original volume until restoration is verified. Never use `docker compose down -v` on valuable data. For a host bind mount, create its directory with ownership writable by container UID/GID 1000 and retain private permissions.

Acceptance now runs `tests/acceptance.spec.ts` against the shipped `server.mjs`, not the custom HTTP harness. Run `pnpm test`, `pnpm check`, `pnpm build`, then `pnpm exec playwright test` **serially**. It covers workspace/settings, named-provider creation and in-conversation switching, uploads/cited retrieval, MCP, Stop, offline/reconnect, SIGKILL chat recovery, actual interrupted indexing recovery, and unsafe MCP no-repeat across two restarts. Fixtures need no external keys. See [build evidence](./docs/build-evidence.md) and the [rewrite validation workflow](../.github/workflows/rewrite.yml) for verification details; the existence of packaging files alone does not establish a successful container smoke test.

On a disposable Docker host, `sh tests/container-smoke.sh` builds the image in a unique temporary Compose project, verifies direct access and a saved collection after SIGKILL/restart, and removes only that project's volume. It needs port 3000 free. This smoke is separate from the comprehensive host-built protocol/browser acceptance; its local execution was blocked by Docker availability. Ubuntu CI verified Compose configuration, image construction, and this container restart smoke on commit `ce0fa64`: [validation run](https://github.com/sugarforever/chat-ollama/actions/runs/41158776362). The local Docker limitation does not describe that successful remote run.


### Workspace interface

The rewrite uses one neutral workspace style across chat, settings and error recovery pages. Chat keeps model selection in a compact **Change model** editor, with keyboard focus returned after applying or pressing Escape. On mobile the transcript scrolls independently while the composer remains visible. Provider logos are served locally. New-conversation setup, tool activity and source excerpts use the same controls and surfaces as Settings.
