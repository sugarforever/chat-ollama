# Task 4 report: selected MCP tools

## Delivered

- Official MCP SDK 1.25.3 stdio and Streamable HTTP clients, explicit command/args/environment and remote headers, paginated discovery, connection cleanup, sanitized actionable connection/authentication errors. OAuth setup remains outside v1.
- Global configuration lives in the existing application SQLite settings table. Authenticated `GET /api/mcp` redacts environment values and headers; authenticated `PUT /api/mcp` replaces the complete list. Use environment/header fields for credentials. HTTP credential-bearing URLs are rejected.
- Conversations select global server IDs at creation. Only selected tools are discovered and registered. JSON Schema enters native pi validation through TypeBox; deterministic 60-character names hash the unambiguous `[server ID, original name]` pair. Original names remain in descriptions and are used for MCP calls. Tool results use pi's actual `output` contract, retain the full MCP result in JSON, and propagate `isError`.
- Every arbitrary MCP tool is native `replay: unsafe`, regardless of server annotations. MCP calls are sequential and require no individual approval.
- Effective selected server configuration and discovered tool definitions are saved privately per conversation. Restart uses the frozen snapshot and cached discovery; merely reopening does not connect to or execute tools. Later input refreshes global server configuration/discovery. Unavailable initial discovery returns 502; startup remains available so settings can be repaired.

## Uncertain outcome safety

A small application-owned SQLite sidecar records an inflight marker before any external MCP call. It uses WAL/FULL and is separate from pi-owned schema. A remote result changes the marker to returned; only the committed pi view containing the matching native toolCallId releases it. Unrelated commits never release it. A crash in the result/cleanup gap conservatively requires acknowledgement.

Any retained marker becomes uncertainty on restart. Native unsafe recovery settles the interrupted tool result without re-executing it. A GenerationTask beforeRequest hook initiates native conversation abort and waits for the current task's AbortSignal before rejecting inference. This preserves native interrupted tool diagnostics and prevents a resumed model request from issuing another action. Every actual MCP dispatch also checks the marker; new input returns MCP_UNCERTAIN until explicit acknowledgement.

Snapshots expose `mcpUncertainty` and `interrupted` status. Authenticated, same-origin `POST /api/conversations/:id/acknowledge` releases the barrier after the run settles. It does not replay the previous action. Native interrupted entries remain in history, so status may remain interrupted until a later user input; UI should use `mcpUncertainty` to decide whether acknowledgement is required. Stop's native task AbortSignal is passed to the SDK request, and cancellation preserves uncertainty because it cannot undo an external effect.

## Evidence and debugging

- Test-first RED evidence: stubbed transport/name adapters failed all three initial assertions; config persistence failed expected length; result translation failed `output` versus `content`; per-input config loading initially failed unknown selected server; cached recovery initially tried an offline endpoint; Stop initially timed out because cancellation was not forwarded; unavailable discovery initially rejected startup; authenticated connection failure initially returned generic 500; native interrupted-entry assertion initially failed because eager root abort produced `aborted` diagnostics.
- Initial fixture setup failed because zod was only transitive; made it a pinned direct dependency. `pnpm test -- tests/mcp.spec.ts` selected the complete suite under this pnpm/Vitest combination; targeted runs use `pnpm exec vitest run ...`.
- Native source investigation showed `Conversation.abort()` resolves only when its scope is idle. Awaiting it inside its own beforeRequest hook deadlocked; the final hook initiates abort and awaits only its task AbortSignal, then rejects. Throwing alone was also insufficient: native fault recovery could resume after acknowledgement. The final real process test proves one external effect, no resumed inference, native interrupted result, blocked new input, and exactly one new request after deliberate acknowledgement.
- Real SDK fixture tests exercise both transports, Unicode argument/result round trips, close/disconnected errors, selected isolation, native unsafe policies, config refresh, cached offline discovery, marker commit boundaries, connection-loss uncertainty, and held-action cancellation.
- The actual child-process SIGKILL test records the effect in a file before withholding its response. A model fixture attempts repeated effect calls; after restart, the effect remains exactly one and model request count is unchanged. Native interrupted tool output and public uncertainty are present. Acknowledgement allows subsequent input. The marker test separately covers the returned-response/native-result-commit gap.
- Real built SvelteKit HTTP tests cover central login/origin gating, server credential redaction, actionable 502, blocked input, public uncertainty, and explicit authenticated acknowledgement. The interrupted-creation test now configures an actual selected SDK fixture instead of an unconfigured placeholder server.

## Task 5 integration boundary

`createSessionManager` accepts `createTools(config: ConversationConfig): RuntimeTool[] | Promise<RuntimeTool[]>` plus optional static `tools`. The callback runs once per opened conversation and receives selected `knowledgeBaseIds`; its result joins the `application` pi extension beside selected MCP tools. `RuntimeTool` is exported only from `src/lib/server/mcp/tools.ts` as the adapter's executable registration type. Retrieval should build its collection-scoped tool here and keep its own indexing/search outside the agent core. Provider/request safety hooks remain installed when MCP configuration refreshes.

MCP helpers: `connectServer(config)` returns listTools/callTool/close; `createMcpTools(serverIds, configs, guard, optionalCachedDescriptors)` returns tools/descriptors/close. All clients close when sessions close or partial discovery fails. The application owns native Harness lifetime and the extra uncertainty marker, not a second scheduler or replay log.

## Limits

No host-loss/power-loss or external exactly-once guarantee is claimed. Conservative acknowledgement is intentional when the application cannot prove the native result commit and marker cleanup completed. MCP OAuth setup, UI controls, and broader server administration are outside this task. PUT settings replaces secrets rather than supporting a redacted round-trip patch; UI must send a complete intended configuration and place secrets in environment/header fields.

## Final validation

Using Node 24.22.2 via `/tmp/pi-rewrite-node/node_modules/node/bin`:

- `pnpm test`: 8 files / 33 tests passed, 0 failed (29.99s). Includes built HTTP, process crash, model recovery, and all previous tests.
- `pnpm check`: zero errors and warnings. The final check first caught async beforeRequest's inferred `Promise<void>`; explicit `return undefined` satisfies the native HookResult contract without changing runtime behavior.
- `pnpm build`: successful Vite client/server build, adapter-node output, and bootstrap esbuild output (24.4 kB).
- `git diff --check`: clean.
- `pnpm exec vitest run tests/mcp.spec.ts tests/runtime-recovery.spec.ts` after the hook typing correction: 2 files / 15 tests passed (11.33s).

Existing warnings remain visible: ancestor legacy Nuxt tsconfig during Vite discovery, SvelteKit overriding the Vitest base, adapter-node treating node:sqlite as external, and Node's SQLite experimental warning in child stderr. No legacy files were changed or warning suppression added.
