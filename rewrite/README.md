# Standalone rewrite

Run from this directory with Node **24.22.2 LTS** and pnpm **10.8.1**:

```sh
pnpm install
pnpm test
pnpm check
pnpm build
pnpm start
```

This folder has its own workspace boundary and lockfile; do not install the legacy Nuxt app to run it. `server.mjs` awaits runtime bootstrap before accepting HTTP, reopens every catalogued conversation SQLite file, and closes sessions on SIGTERM/SIGINT. One process must own the data directory. Set DATA_DIR (default `data`), CHAT_BASE_URL (default `http://127.0.0.1:11434/v1`), CHAT_API_KEY, CHAT_MODEL_ID, PORT and HOST. The endpoint uses OpenAI chat completions; it is not an Ollama-specific integration.

Pinned runtime: `@earendil-works/pi-durable`, `@earendil-works/pi-ai`, and `@earendil-works/chord` **1.4.0**. Upstream requires Node >=22.19.0; Node 24 is the selected supported LTS line. SvelteKit 2.49.1, Svelte 5.45.6, adapter-node 5.5.7, Vite 7.2.2, TypeScript 5.9.3, and Vitest 4.0.13 are pinned. See pnpm-lock.yaml for transitive pins.

The adapter exposes application snapshots, admission, Stop, subscriptions and close. pi types stay private. A process manager caches opening promises per conversation. Browser subscription cleanup cannot cancel agent work. SQLite WAL synchronous NORMAL protects against process crashes; no host-loss or power-loss guarantee is claimed.

The release's packaged README/types are the API reference. The moving upstream main README already describes a different watch callback. In 1.4.0, `watch.start(async (value, ops, context) => ...)` delivers committed views; `Harness.resume()` starts pending work, `root.abort()` waits for idle, and `Harness.close()` preserves pending tasks. Custom providers need the model's baseUrl as well as the provider's baseUrl. Unsafe tools interrupted mid-call produce interrupted results; only explicitly replay-safe tools rerun. MCP and knowledge tools integrate through application adapters.

Tests use a real local HTTP model fixture, real pi SQLite storage, and separate Node processes. They verify SIGKILL recovery without resubmission, completed work staying completed, custom URL/key forwarding, concurrent independent conversations, committed watches, explicit Stop, and detached observers.


Chat HTTP commands are `POST /api/conversations` with `{modelId, knowledgeBaseIds, mcpServerIds}`, `GET /api/conversations`, `GET /api/conversations/:id`, `POST /api/conversations/:id/messages` with `{requestId, content}`, and `POST /api/conversations/:id/stop`. Creation returns 201; durable message admission returns 202 with `{id}`. Repeating an identical request ID returns that original ID, conflicting content returns 409/REQUEST_CONFLICT, and distinct input while running returns 409/BUSY. Stop waits for pi to reach idle; connected state observers can see cancelling while that happens.

`GET /api/conversations/:id/events` sends application-owned `snapshot` envelopes as SSE `data:`. Every connection receives the current full state, including when Last-Event-ID is supplied. Slow clients retain only the newest pending snapshot. Revisions are process-local and are not resume cursors. The projection includes committed transcript, committed assistant partial text, tool output/status/uncertainty, and persisted run outcomes; it omits provider error details.

`DATA_DIR/sessions/catalogue.sqlite` stores conversation config and creation intent; each generated conversation ID has its own pi SQLite file alongside it. Startup completes interrupted creation before accepting HTTP. Unknown HTTP IDs never create session files. pi owns the single durable request receipt and user entry; the application has no second admission ledger or event journal. Authentication and same-origin mutation checks protect the application centrally.


Set `ADMIN_PASSWORD` before serving requests. Sign in at `/login`. Salted scrypt derives the password hash in process memory; comparisons are constant-time. Five failed logins per client address trigger a 15-minute limit. Opaque sessions expire after 24 hours; SQLite stores only token hashes. Cookies are HttpOnly, SameSite=Strict, and Secure under HTTPS. Set adapter-node `ORIGIN` to the exact public origin: `http://localhost:3000` for direct local HTTP, or `https://chat.example.com` behind TLS. Trust forwarding headers only from your own proxy. Every mutation, including login/logout, requires a matching Origin header.

Authenticated `GET /api/settings` returns `{chat, embedding}` containing `baseUrl`, `modelId`, and `hasApiKey`. `POST /api/settings` accepts partial chat/embedding objects. Omit `apiKey` to preserve it; an empty string clears it. URLs must use HTTP(S) without embedded credentials, query strings, or fragments; local endpoints are allowed. `CHAT_*` and `EMBEDDING_*` environment variables seed defaults until settings are saved. Settings and hashed sessions persist in `DATA_DIR/app.sqlite` (0600), inside the data directory (0700). Protect and back up the entire directory, including SQLite WALs and credential-bearing per-conversation endpoint snapshots.

Saved chat settings apply at the next admitted run, including existing conversations. Active runs retain the endpoint/key/model in `sessions/:id.endpoint.json` (0600), including across restart after a settings edit. Original conversation configuration remains creation metadata. Embeddings have independent configuration and require explicit collection reindexing after changes. The interface at `/` provides the conversation sidebar, streaming Markdown, expandable tool activity, citation excerpts, Stop and reconnect state. Work continues after closing the browser; Stop explicitly cancels. Uncertain external actions require an explicit acknowledgment after checking the external system.

MCP servers are configured with authenticated `PUT /api/mcp`, using
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

Settings at `/settings` edit chat and embedding endpoints independently. Blank API key fields preserve saved credentials; a separate checkbox explicitly removes them. Knowledge collections support uploads, statuses, retries, deletion and explicit reindexing. A failed compatible rebuild displays its warning separately while published content remains ready.

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
# Edit .env: choose ADMIN_PASSWORD, exact ORIGIN, and provider/model settings.
docker compose config
docker compose up --build -d
docker compose logs -f app
```

Open the exact `ORIGIN` URL and log in with `ADMIN_PASSWORD`. There is no separate session-signing secret: tokens are random, and only their hashes are stored. Keep the password and provider/MCP credentials private. Changing the password does not revoke already-issued sessions; log out or remove persisted sessions during a stopped maintenance window to revoke them. Saved settings override environment defaults. For local Node execution, export the variables before `pnpm start`; Node does not automatically load `.env` here. `DATA_DIR` defaults to `./data` locally; Compose fixes it to `/data` in the persistent `rewrite-data` named volume.

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
/data/app.sqlite                     settings, hashed sessions, knowledge metadata/vectors
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

Acceptance now runs `tests/acceptance.spec.ts` against the shipped `server.mjs`, not the custom HTTP harness. Run `pnpm test`, `pnpm check`, `pnpm build`, then `pnpm exec playwright test` **serially**. It covers login/settings, uploads/cited retrieval, MCP, Stop, offline/reconnect, SIGKILL chat recovery, actual interrupted indexing recovery, and unsafe MCP no-repeat across two restarts. Fixtures need no external keys. See the task-7 report for actual Docker availability and verification evidence; the existence of packaging files does not establish a successful container smoke test.

On a disposable Docker host, `sh tests/container-smoke.sh` builds the image in a unique temporary Compose project, verifies login and a saved collection after SIGKILL/restart, and removes only that project's volume. It needs port 3000 free. This smoke is separate from the comprehensive host-built protocol/browser acceptance; its local execution was blocked by Docker availability. CI is configured to run it, but no CI result is claimed here.
