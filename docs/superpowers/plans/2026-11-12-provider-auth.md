# Native provider configuration and authentication implementation plan

**Goal:** Extend #779 with pi-ai-native catalog, protocols, API-key/cloud setup and subscription OAuth, using one Pi Durable core.
**Architecture:** Reuse fresh builtin provider factories. Save only configuration and opaque credential slots server-side; serialize refreshes in a persistent credential store. Capture model metadata, protocol, endpoint and credential slot per admitted run. Bridge pi-ai's AuthInteraction through authenticated polling commands so Web and future CLI use the same core.
**Tech stack:** SvelteKit, Node 24, SQLite, pi-ai/pi-durable/chord 1.5.2.
**Spec:** User request in this chat; base PR #779 at 309f451.

## Constraints and review focus
- Preserve 3010 and both other worktrees. Develop and test only in provider-auth.
- Never return stored keys, credential environment, access or refresh tokens; sanitize upstream failures.
- Official login, cancellation, device code and refresh; no cookies. OAuth state remains server-side and interrupted login restarts explicitly.
- Provider changes must not carry credentials to another service. Old endpoint snapshots and migrated settings stay usable.
- Capture model metadata; active runs retain provider/model/credential identity across restart. Refresh rotation persists atomically.
- Embeddings remain independent OpenAI-compatible configuration; chat subscription credentials never enter it.

## Tasks
- [x] Verify fixed and latest official provider factories/auth APIs/catalog, record capability matrix and compatible dependency upgrade.
- [x] Add failing tests for catalog/native protocol selection, legacy migration, redaction and service/mode changes; implement settings and snapshot resolver.
- [x] Add failing tests for generic login prompts/cancel, persistent serialized refresh, disconnect and restart; implement credential store and auth controller plus same-origin admin routes.
- [x] Test native wire requests and runtime recovery; replace completions-only adapter with built-in dispatch while keeping existing snapshot compatibility.
- [x] Add provider/mode/model controls, login interaction and status UI, catalog choices within conversations, and explicit embedding scope.
- [x] Run full unit/integration tests, browser tests, type checks and build; review migration/recovery and credential failure paths; document limitations and personal login handoff; commit, push, open stacked PR without merging.

## Evidence

- Node 24: `pnpm install --frozen-lockfile`, `pnpm check` (0 errors/warnings), `pnpm test` (62 passing), `pnpm build` (called by integration fixtures), `pnpm exec playwright test` (22 passing).
- Independent review identified cloud-auth/select defaults and partial-credential/disconnect isolation bugs; regression tests now pass and focused re-review found no remaining P1/P2 credential/snapshot blockers.
- 1.4.0 to 1.5.2 SIGKILL upgrade experiment resumed the captured request with original credentials.
- User Chrome: independent dev server at http://127.0.0.1:3012 with DATA_DIR provider-auth-review; confirmed built-in service presets, model selectors and official Codex browser/device login prompt. Personal subscription authorization remains a user handoff.
- Screenshots uploaded as GitHub attachments in the PR description. Original 3010 still responds HTTP 200.
