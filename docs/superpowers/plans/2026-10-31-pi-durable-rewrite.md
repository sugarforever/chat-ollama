# Pi Durable Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace chat-ollama with a simple, self-hosted SvelteKit chatbot backed by pi durable, knowledge-base search, and MCP.

**Architecture:** A SvelteKit Node server owns runtime sessions for its entire process lifetime. HTTP admits commands and SSE carries committed state; reconnects start from a fresh snapshot. Application records, document chunks, and credentials use SQLite; each conversation has a separate pi durable SQLite file so runtime and product schemas remain independent.

**Tech Stack:** SvelteKit, TypeScript, adapter-node, pi durable/pi-ai/Chord, SQLite, official MCP SDK, Vitest, Playwright. Pin compatible dependency versions after Task 1 proves the runtime boundary.

**Spec:** [Agreed design](../specs/2026-10-31-pi-durable-rewrite.md).

## Global Constraints

- Single-user, self-hosted; one administrator login.
- One application process; SQLite and persistent local files; Docker Compose.
- One durable session per conversation, one active run per conversation.
- HTTP commands and SSE updates; reconnect recovery; browser closure never cancels work.
- OpenAI-compatible chat endpoint; independent embedding configuration; explicit reindex on changes.
- Knowledge-base retrieval is a tool outside the agent core.
- MCP stdio and HTTP; no per-call approval for selected servers.
- English and Chinese; personal collection up to roughly 100,000 chunks.
- No old-data migration, voice, skills, OCR, crawling, branching, editing, or regeneration in v1.
- Never modify existing user changes, credentials, database files, or uploaded content.

## Review Focus

1. A duplicated or concurrent HTTP message must not launch duplicate runs (Task 2).
2. A disconnected or slow SSE client must not block runtime work or miss committed final state (Task 2).
3. An interrupted MCP mutation must not silently execute twice (Task 4).
4. Deleted documents and a changed embedding model must not leak stale retrieval results (Task 5).
5. A model-supplied citation or rendered Markdown must not expose arbitrary files or execute scripts (Task 6).

## Repository and delivery boundary

Current root is Nuxt with Prisma, LangChain/Deep Agents, Chroma/Milvus, and Redis dependencies. `docs/agent-runtime-plan.md` is an older plan, not an implementation prerequisite. The checkout contains unrelated tracked and untracked changes.

Build an independently installable replacement in `rewrite/` first, with its own package.json and lockfile. This is staging for a full replacement, not an incremental runtime integration. Do not turn the root into a workspace or rewrite its lockfile. Final delivery uses `rewrite/compose.yaml` and documents `cd rewrite`; moving the replacement to repository root and deleting legacy files is a separate cleanup after acceptance, preserving unrelated work.

## File map

All paths below are relative to `rewrite/` unless prefixed with `docs/`.

- `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`: app, Node adapter, tests.
- `server.mjs`, `src/lib/server/startup.ts`: explicit server bootstrap and graceful shutdown.
- `src/lib/contracts.ts`: application DTOs, validation, SSE envelope.
- `src/lib/server/runtime/{session,manager,projection}.ts`: pinned pi adapter, process ownership, public state.
- `src/lib/server/db/{index,migrations}.ts`: application SQLite records and migrations.
- `src/lib/server/auth.ts`, `src/hooks.server.ts`: admin credentials, sessions, request protection.
- `src/lib/server/settings.ts`: server-only configuration and redacted responses.
- `src/lib/server/mcp/{client,tools}.ts`: SDK connections and pi tool conversion.
- `src/lib/server/knowledge/{ingest,embeddings,index,search,tool}.ts`: document pipeline and retrieval.
- `src/routes/api/`: HTTP commands, snapshots, SSE, settings, documents, sources.
- `src/lib/components/`: conversation and settings UI.
- `src/routes/{login,chat,settings}/`: pages.
- `tests/`: unit/integration tests, child-process recovery tests, browser acceptance.
- `Dockerfile`, `compose.yaml`, `.env.example`, `README.md`: complete standalone deployment.

## Application contract

Types belong in `src/lib/contracts.ts` and never export pi types:

```ts
type RunStatus = 'idle' | 'running' | 'cancelling' | 'interrupted' | 'failed';
type ConversationConfig = { modelId: string; knowledgeBaseIds: string[]; mcpServerIds: string[] };
type PublicEntry = { id: string; kind: 'user' | 'assistant' | 'tool'; content: string; toolName?: string; uncertain?: boolean };
type ConversationSnapshot = { id: string; revision: string; status: RunStatus; entries: PublicEntry[] };
type StateEvent = { type: 'snapshot'; snapshot: ConversationSnapshot };
type SearchHit = { sourceId: string; documentId: string; title: string; text: string; page?: number; score: number };
```

- `POST /api/conversations` creates a conversation from ConversationConfig.
- `GET /api/conversations` lists conversations; `GET /api/conversations/:id` returns a snapshot.
- `POST /api/conversations/:id/messages` takes `{requestId, content}`, returns 202 plus submission ID after durable admission. Retries of the same ID return the original admission; a new ID while busy returns 409. Reject conflicting reuse of an ID.
- `POST /api/conversations/:id/stop` is idempotent; report cancelling until runtime reaches idle.
- `GET /api/conversations/:id/events` sends a full snapshot immediately and subsequent committed snapshots, coalesced for slow clients. On reconnect always resnapshot, including when Last-Event-ID is supplied. No unbounded per-client queue or persistent duplicate event log.
- Settings responses omit secrets; unchanged secret fields preserve stored values. Run configuration is frozen for the duration of a run; edits apply to later runs.
- All application routes, source downloads, and SSE require login. Browser mutations require same-origin checks. API failures use `{error: {code, message}}` with sanitized messages.

## Task 1: Prove the runtime and server lifetime

**Files:** package.json, server.mjs, Svelte config, runtime/session.ts, startup.ts, tests/runtime-recovery.spec.ts, tests/fixtures/model-server.ts.

**Interfaces:** `openSession(id: string): Promise<AgentSession>`; AgentSession exposes `snapshot()`, `submit(requestId, content)`, `stop()`, `watch(listener)`, `close()`. Exact pi types remain private. A single manager owns opened sessions.

- [ ] Read pinned upstream package exports, Node engine requirements, provider base-URL configuration, watch API, tool replay rules, and cancellation semantics. Reference: https://github.com/earendil-works/pi/blob/main/packages/durable/README.md (experimental API). Record resolved versions in README and lockfile; choose an actively supported Node version satisfying every engine.
- [ ] Scaffold the standalone app with Vitest and a controllable local OpenAI-compatible model fixture. Add a failing child-process test: submit, observe persisted work, kill with SIGKILL, reopen the same file, resume, and receive a final answer without another user submission.
- [ ] Run `pnpm test -- tests/runtime-recovery.spec.ts`; require failure before implementation.
- [ ] Implement the adapter using Harness.open, SQLite storage, root conversation, explicit resume, and committed watches from the pinned release. Bootstrap before serving requests; graceful shutdown closes sessions. Browser abort signals never own agent work. Do not initialize a harness per request.
- [ ] Repeat the test with a browser observer detached and with two separate conversation files running concurrently. Verify completed work is not repeated after reopening. Verify provider requests use the configured base URL.
- [ ] Run `pnpm test -- tests/runtime-recovery.spec.ts && pnpm check && pnpm build`; require passing results. If the installed API cannot meet the spec, record the concrete blocker before implementing dependent tasks.
- [ ] Commit only rewrite files: `feat: establish durable agent runtime`.

## Task 2: Ship chat commands and reconnectable state

**Files:** contracts.ts, runtime/manager.ts, runtime/projection.ts, db/index.ts, db/migrations.ts, routes/api/conversations routes, tests/conversation-api.spec.ts.

**Interfaces:** `createConversation(config): Promise<{id: string}>`; `getSession(id): Promise<AgentSession>`; `projectState(raw): ConversationSnapshot`; application DB stores conversation catalogue and config, while pi owns transcript and task state.

- [ ] Add failing tests for identical request retries, conflicting request-ID reuse, simultaneous distinct requests, reload after admission, repeated Stop, detached SSE clients, and a final snapshot after reconnect.
- [ ] Run `pnpm test -- tests/conversation-api.spec.ts`; require failures.
- [ ] Implement the contract above. Reuse pi durable request-ID admission; if additional application metadata is needed, recover it from durable admission rather than creating an uncoordinated dual-write. Serialize admission per conversation and use the runtime busy-reject option.
- [ ] Implement snapshot projection and a bounded SSE writer that retains only the latest pending snapshot. Clean up watchers on disconnect. Do not forward unstable internal deltas as a public protocol.
- [ ] Recover the catalogue/session association if interrupted during creation; reject unknown IDs without creating storage files. Validate generated IDs before constructing paths.
- [ ] Run `pnpm test -- tests/conversation-api.spec.ts tests/runtime-recovery.spec.ts`; require no duplicate runs, 409 on distinct busy input, and equivalent recovered state.
- [ ] Commit: `feat: add chat API and SSE recovery`.

## Task 3: Protect the app and configure providers

**Files:** auth.ts, hooks.server.ts, settings.ts, routes/login, routes/api/settings routes, tests/auth-settings.spec.ts.

**Interfaces:** `requireAdmin(event): AdminSession`; `loadChatConfig(): ChatEndpointConfig`; `loadEmbeddingConfig(): EmbeddingConfig`. Endpoint configs contain baseUrl, modelId, apiKey; only server code reads apiKey.

- [ ] Write failing tests for unauthenticated API/SSE/source access, invalid login, logout, forged cross-origin mutations, secret redaction, secret-preserving settings edits, and custom chat base URL.
- [ ] Run `pnpm test -- tests/auth-settings.spec.ts`; require failures.
- [ ] Implement one admin password supplied through deployment configuration, stored/checked using a password hash; opaque expiring sessions, HttpOnly/SameSite cookies, Secure under HTTPS, login rate limiting. No registration or user management.
- [ ] Implement SQLite-backed settings with filesystem-restricted data directory. Redact keys from responses/logs and validate HTTP(S) endpoint URLs. Local provider URLs are allowed. Freeze effective configuration for active runs.
- [ ] Run `pnpm test -- tests/auth-settings.spec.ts`; require passing results; verify a restarted server retains valid configuration without returning credentials.
- [ ] Commit: `feat: add administrator access and model settings`.

## Task 4: Connect selected MCP tools

**Files:** mcp/client.ts, mcp/tools.ts, routes/api/mcp routes, tests/mcp.spec.ts, tests/fixtures/mcp-server.ts.

**Interfaces:** `connectServer(config): Promise<McpConnection>`; `createMcpTools(serverIds: string[]): Promise<RuntimeTool[]>`. RuntimeTool is private to the pi adapter boundary; registered names deterministically encode server ID and original tool name.

- [ ] Write failing tests using fixture stdio and HTTP servers: discovery, schema/argument/result translation, selected-server isolation, disconnect errors, cleanup, and a tool that records an external effect then loses its connection before returning.
- [ ] Run `pnpm test -- tests/mcp.spec.ts`; require failures.
- [ ] Use the official MCP SDK for stdio and Streamable HTTP. Allow explicit command/argument/environment configuration and remote headers; keep secrets server-only. Return actionable authentication errors; OAuth setup is outside v1.
- [ ] Register selected tools through pi extensions, with no per-call approval. Do not mark arbitrary MCP tools replay-safe based on descriptive annotations. Use native interrupted results and persist a visible uncertainty marker. Block new MCP dispatch from that run until the user explicitly acknowledges the uncertainty; a simple interrupted-state action is sufficient, no generic approval system.
- [ ] Verify after process death that the recorded external effect occurs once, the UI state exposes uncertainty, and reconnecting alone never retries it. Add an authenticated acknowledgment command to clear the interruption for subsequent input.
- [ ] Run `pnpm test -- tests/mcp.spec.ts tests/runtime-recovery.spec.ts`; require passing results.
- [ ] Commit: `feat: expose MCP servers as durable agent tools`.

## Task 5: Build simple document ingestion and search

**Files:** knowledge modules, routes/api/knowledge-bases routes, routes/api/documents routes, tests/knowledge.spec.ts, tests/retrieval-scale.spec.ts.

**Interfaces:** `ingestDocument(documentId: string): Promise<void>`; `searchKnowledgeBases(ids: string[], query: string, limit?: number): Promise<SearchHit[]>`; `createKnowledgeTool(ids: string[]): RuntimeTool`.

- [ ] Write failing tests for English/Chinese passages, text PDF page references, unsupported/oversized uploads, empty/scanned PDFs, interrupted indexing, retry, deletion, collection isolation, and incompatible embedding configuration.
- [ ] Run `pnpm test -- tests/knowledge.spec.ts`; require failures.
- [ ] Store uploads under generated IDs. Add explicit upload limits, text extraction, paragraph-aware bounded chunks with overlap, and an in-process bounded indexing queue. Save queued/indexing/ready/failed status and retry interrupted jobs on startup. Reject image-only PDFs with a clear no-OCR message.
- [ ] Batch embedding requests through the independently configured compatible endpoint; persist vectors, text, source metadata, and a configuration fingerprint in application SQLite. Reject mixed dimensions and empty vectors. Stage replacement indexes, then publish atomically; keep incompatible collections unavailable until explicit successful reindex.
- [ ] Start with SQLite vector storage and batched cosine scoring outside the request event loop; avoid an external vector service. Add a generated 100,000-chunk benchmark that records latency, memory, and concurrent chat responsiveness. Target search under two seconds on documented development hardware. If it misses, replace scoring with one embedded vector index before acceptance, not a search-service framework.
- [ ] Expose bounded top-k search through a replay-safe read-only pi tool scoped to selected collections; return source IDs and excerpts. Delete documents, chunks, and files consistently, and make source lookup reject deleted records.
- [ ] Run `pnpm test -- tests/knowledge.spec.ts tests/retrieval-scale.spec.ts`; record measured scale results, not just assertions.
- [ ] Commit: `feat: add document knowledge bases and retrieval tool`.

## Task 6: Complete the user interface

**Files:** routes/chat pages, routes/settings pages, lib/components, routes/api/sources routes, tests/ui.spec.ts, playwright.config.ts.

**Interfaces:** UI consumes only the application contract; sources resolve through authenticated database lookups, never model-provided filesystem paths or URLs.

- [ ] Add failing browser tests for login, conversation creation, streaming, tool expansion, source inspection, Stop, busy input, reconnect, uncertainty acknowledgment, and settings/upload/retry/delete flows.
- [ ] Run `pnpm exec playwright test tests/ui.spec.ts`; require failures.
- [ ] Build the responsive sidebar/chat layout and settings screens with ordinary Svelte components. Render sanitized Markdown, show persisted partial content and status, and use EventSource with credential cookies. After stream failure, show reconnecting state and resnapshot without clearing confirmed entries.
- [ ] Link citations only when source IDs resolve within the conversation's allowed collections. Render invalid references as plain text. Verify script HTML, unsafe links, path traversal, and deleted-source references cannot execute or disclose files.
- [ ] Run `pnpm exec playwright test tests/ui.spec.ts && pnpm check && pnpm build`; require passing results. Capture desktop and narrow-screen screenshots and inspect chat, settings, tool errors, citations, and indexing states.
- [ ] Commit: `feat: add Svelte chat and configuration interface`.

## Task 7: Deliver a restart-tested deployment

**Files:** Dockerfile, compose.yaml, .env.example, README.md, tests/acceptance.spec.ts; update root README.md only with a clearly scoped rewrite entry point.

**Interfaces:** `docker compose up --build` from rewrite/ runs one app service; a mounted data directory contains app.sqlite, sessions/, and uploads/. No Redis, PostgreSQL, Chroma, or Milvus requirement for the replacement.

- [ ] Add an acceptance test covering the spec's complete workflow against the built server and persistent temporary data, with fixture model/MCP endpoints. Include SIGKILL restart rather than only graceful close, and indexing restart as well as chat restart.
- [ ] Run `pnpm exec playwright test tests/acceptance.spec.ts`; require failures before deployment fixes.
- [ ] Package the Node server, install only required runtime assets, configure session secrets/admin access through environment, disable proxy buffering for SSE where applicable, and document stdio server executables that the operator must install in the image. Avoid multiple replicas or worker clustering.
- [ ] Document setup, configuration, explicit reindexing, uncertain MCP outcomes, stop/restart behavior, file layout, stopped-process backup/restore, and the deferred legacy-data migration. State the process-crash guarantee without claiming host-loss durability. Do not remove the existing app or change its database.
- [ ] Run `pnpm test && pnpm check && pnpm build && pnpm exec playwright test`; require passing results. Run `docker compose config`, build the image, and smoke-test restart with the mounted volume. Record commands, results, screenshots, and any unverified live-provider behavior.
- [ ] Commit: `feat: package and document pi durable rewrite`.

## Self-review and execution handoff

Coverage: runtime/recovery (1), protocol/concurrency (2), admin/providers (3), MCP/uncertainty (4), documents/embeddings/retrieval (5), UI/citations (6), deployment/full acceptance (7). Review-focus conditions each have an owning test above. Provider and MCP interoperability beyond fixture coverage must be reported honestly.

Planning creates documentation only. No application code has been changed and no runtime compatibility claim has been verified by execution yet. Before implementation, use an isolated checkout preserving existing changes and inspect applicable instructions there. Review this plan and choose native execution or subagent-driven execution; do not silently authorize delegation from the header alone.
