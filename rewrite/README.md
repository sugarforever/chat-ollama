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

The release's packaged README/types are the API reference. The moving upstream main README already describes a different watch callback. In 1.4.0, `watch.start(async (value, ops, context) => ...)` delivers committed views; `Harness.resume()` starts pending work, `root.abort()` waits for idle, and `Harness.close()` preserves pending tasks. Custom providers need the model's baseUrl as well as the provider's baseUrl. Unsafe tools interrupted mid-call produce interrupted results; only explicitly replay-safe tools rerun. Tool integration and product features arrive in subsequent tasks.

Tests use a real local HTTP model fixture, real pi SQLite storage, and separate Node processes. They verify SIGKILL recovery without resubmission, completed work staying completed, custom URL/key forwarding, concurrent independent conversations, committed watches, explicit Stop, and detached observers.


Chat HTTP commands are `POST /api/conversations` with `{modelId, knowledgeBaseIds, mcpServerIds}`, `GET /api/conversations`, `GET /api/conversations/:id`, `POST /api/conversations/:id/messages` with `{requestId, content}`, and `POST /api/conversations/:id/stop`. Creation returns 201; durable message admission returns 202 with `{id}`. Repeating an identical request ID returns that original ID, conflicting content returns 409/REQUEST_CONFLICT, and distinct input while running returns 409/BUSY. Stop waits for pi to reach idle; connected state observers can see cancelling while that happens.

`GET /api/conversations/:id/events` sends application-owned `snapshot` envelopes as SSE `data:`. Every connection receives the current full state, including when Last-Event-ID is supplied. Slow clients retain only the newest pending snapshot. Revisions are process-local and are not resume cursors. The projection includes committed transcript, committed assistant partial text, tool output/status/uncertainty, and persisted run outcomes; it omits provider error details.

`DATA_DIR/sessions/catalogue.sqlite` stores conversation config and creation intent; each generated conversation ID has its own pi SQLite file alongside it. Startup completes interrupted creation before accepting HTTP. Unknown HTTP IDs never create session files. pi owns the single durable request receipt and user entry; the application has no second admission ledger or event journal. Authentication and same-origin mutation checks protect the application centrally.


Set `ADMIN_PASSWORD` before serving requests. Sign in at `/login`. Salted scrypt derives the password hash in process memory; comparisons are constant-time. Five failed logins per client address trigger a 15-minute limit. Opaque sessions expire after 24 hours; SQLite stores only token hashes. Cookies are HttpOnly, SameSite=Strict, and Secure under HTTPS. Set adapter-node `ORIGIN` to the exact public origin: `http://localhost:3000` for direct local HTTP, or `https://chat.example.com` behind TLS. Trust forwarding headers only from your own proxy. Every mutation, including login/logout, requires a matching Origin header.

Authenticated `GET /api/settings` returns `{chat, embedding}` containing `baseUrl`, `modelId`, and `hasApiKey`. `POST /api/settings` accepts partial chat/embedding objects. Omit `apiKey` to preserve it; an empty string clears it. URLs must use HTTP(S) without embedded credentials, query strings, or fragments; local endpoints are allowed. `CHAT_*` and `EMBEDDING_*` environment variables seed defaults until settings are saved. Settings and hashed sessions persist in `DATA_DIR/app.sqlite` (0600), inside the data directory (0700). Protect and back up the entire directory, including SQLite WALs and credential-bearing per-conversation endpoint snapshots.

Saved chat settings apply at the next admitted run, including existing conversations. Active runs retain the endpoint/key/model in `sessions/:id.endpoint.json` (0600), including across restart after a settings edit. Original conversation configuration remains creation metadata. Embeddings have independent configuration; the knowledge-base task adds explicit reindex behavior. The UI delivery task refines the minimal login page.

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
