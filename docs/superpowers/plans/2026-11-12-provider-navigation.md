# Provider Navigation Implementation Plan

**Goal:** Give provider connections, the built-in catalog, individual configuration and chat defaults separate, browser-addressable purposes.
**Architecture:** Real SvelteKit settings routes render the shared settings UI with explicit route state. Links use native navigation semantics. New drafts carry stable non-secret IDs in their URL so saving/refreshing cannot duplicate a connection. Guard unsaved edits on navigation. Use official shadcn-svelte components with Tailwind isolated from existing CSS resets.
**Scope:** Existing provider-auth worktree and port3012; preserve saved configurations and credentials, including review data. No3010 changes.

- [x] Install/configure shadcn-svelte and generate Button, Input, Badge, Alert Dialog components from the official registry.
- [x] Add routes for provider list, catalog, new connection, saved editor and chat defaults; turn navigation into links and support Back/Forward/reload/deep links.
- [x] Isolate editor responsibilities, default-provider choice, deletion confirmation and unsaved-change handling. Preserve OAuth popup/status behavior.
- [x] Test saved/new draft history, discard/stay, modified-click links, reload, missing IDs, defaults independence, OAuth and mobile layouts.
- [x] Run checks/build/browser suite, focused review and update screenshots/docs/PR.

Verification: type check has 0 errors/warnings; production build passes; existing 62 unit/integration tests pass; all 33 browser tests pass. Only two browser regressions were added (history/drafts/deep links and independent-tab persistence); no new unit/integration coverage. Final CSS isolation changes passed the five focused settings/browser tests. Screenshots visually checked; focused review found legacy CSS collisions, now resolved.
