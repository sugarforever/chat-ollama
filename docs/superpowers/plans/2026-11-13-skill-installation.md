# Skill Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Install one or more Agent Skills from a browser-selected local folder or public GitHub repository, with a built-in one-click catalog.

**Architecture:** Add a file-backed skill store under `DATA_DIR/skills`, a bounded GitHub importer, and a dedicated Settings component. Discovery stages a resource and returns individual skills for selection before installation; catalog buttons discover and install a specific skill in one action. Expose installed skill metadata to the durable runtime and use native `read` to load instructions and supporting files on demand.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Node 24, Vitest, existing Playwright suite, pi durable 1.5.2.

**Spec:** https://github.com/sugarforever/chat-ollama/issues/787

**Preparation evidence:** Isolated checkout from `origin/main` at `/Users/wyang14/.codex/worktrees/skill-installation/chat-ollama`. Baseline `pnpm test` passed all 71 tests across 16 files on Node 24.7.0. GitHub recursive tree API verified all eight proposed catalog paths on 2026-11-13: `anthropics/skills` under `skills/{pdf,docx,pptx,xlsx,frontend-design,skill-creator}/SKILL.md`, and `vercel-labs/agent-skills` under `skills/{react-best-practices,web-design-guidelines}/SKILL.md`.

## Global Constraints

- The SvelteKit application in `rewrite/` is the primary, actively developed app.
- Use Node 24; execute application commands from `rewrite/`.
- Run `pnpm check`, `pnpm build`, and `pnpm test` sequentially; integration tests rebuild the application.
- Preserve unrelated modifications in the original checkout.
- Browser directory selection uploads client files, never interprets a client folder name as a server filesystem path.
- Initial remote support is public HTTPS GitHub repository and `tree/<ref>/<folder>` URLs. Clearly label this scope; reject unsupported hosts and private repositories with actionable errors.
- No imported code runs during discovery or installation. Supporting files are preserved verbatim.
- Default catalog: Anthropic PDF, DOCX, PPTX, XLSX, frontend-design, skill-creator; Vercel React best practices and web design guidelines. Verify each folder and SKILL.md before freezing the entries.

## Review Focus

- Nested skill directories: discover each SKILL.md and assign supporting files to the nearest skill ancestor.
- Unsafe paths: reject absolute paths, traversal, backslashes, control characters, duplicate paths, symlinks and submodules.
- Invalid resources: show malformed frontmatter and missing SKILL.md without installing partial results.
- Existing names and concurrent requests: reject collisions without overwriting installed files or leaving partial installations.
- Runtime refresh: existing conversations gain new skills on subsequent input; restarted conversations retain access, and uninstalled skills disappear.

---

### Task 1: Discover, stage and persist local skills

**Files:**
- Create `rewrite/src/lib/skills.ts` for browser-safe contracts and catalog.
- Create `rewrite/src/lib/server/skills/store.ts` for discovery, staging, installation and removal.
- Create `rewrite/tests/skills.spec.ts`.

**Interfaces:**
- `SkillFile = { path: string; content: Uint8Array }`.
- `SkillCandidate = { path: string; name: string; description: string; fileCount: number }`.
- `InstalledSkill = { id: string; name: string; description: string; source: string; installedAt: string }`.
- `createSkillStore(directory: string)` returns `discover(files, source)`, `install(importId, paths)`, `list()`, `remove(id)`, and `context()`.
- Discovery returns `{ importId: string; skills: SkillCandidate[] }`; install returns `InstalledSkill[]`.
- Staged imports expire after 30 minutes; permit at most 10 outstanding imports. Bound resources to 1,000 files, 20 MiB total, 5 MiB per file, 100 skills and 128 KiB per SKILL.md.
- Accept standard YAML frontmatter with required string `name` and `description`, including quoted and folded descriptions. Use an explicit YAML parser dependency; do not execute custom YAML tags.
- Installed IDs are generated UUIDs. Keep metadata outside each skill's payload directory; publish installation using staging and atomic directory rename.

- [x] Write tests for root and multi-skill folders, nested supporting files, binary content, standard frontmatter, invalid metadata, empty resources and every path/size constraint above.
- [x] Run `pnpm exec vitest run tests/skills.spec.ts`; confirm failures are caused by missing behavior.
- [x] Implement discovery and storage with bounded staging, deterministic results and cleanup on failure.
- [x] Add tests for duplicate names, duplicate selections, expired/unknown imports, removal, reopening the store and two competing install requests.
- [x] Run the focused tests and verify every assertion passes.

### Task 2: Import repository resources and add HTTP endpoints

**Files:**
- Create `rewrite/src/lib/server/skills/github.ts`.
- Create `rewrite/src/routes/api/skills/+server.ts`.
- Create `rewrite/src/routes/api/skills/discover/+server.ts`.
- Create `rewrite/src/routes/api/skills/install/+server.ts`.
- Create `rewrite/src/routes/api/skills/[id]/+server.ts`.
- Modify `rewrite/src/lib/server/api.ts` to map public skill error codes.
- Create `rewrite/tests/skills-http.spec.ts` and `rewrite/tests/skills-github.spec.ts`.

**Interfaces:**
- `githubSkillFiles(url: string): Promise<{ files: SkillFile[]; source: string }>` resolves the selected repository ref to a commit before downloading content.
- `GET /api/skills` returns `{ installed, catalog }`.
- `POST /api/skills/discover` accepts multipart `files` with explicit relative `paths`, or JSON `{ url }`; returns discovery with 200.
- `POST /api/skills/install` accepts `{ importId, paths }` or `{ catalogId }`; returns installed records with 201.
- `DELETE /api/skills/:id` removes a skill and returns 204; unknown IDs return 404.
- Define distinct errors for invalid skills, oversized resources, duplicate names, expired imports and repository retrieval failure. Never expose server paths or upstream credentials.

- [x] Write failing importer tests for repository root, folder URL, encoded branch/ref, immutable commit downloads, missing/inaccessible repository, rate limit, truncated tree, unsafe file modes and download limits.
- [x] Implement fixed-origin GitHub API/raw requests with redirect rejection, bounded streaming response reads and timeouts. Do not shell out to git or accept arbitrary fetch destinations.
- [x] Verify curated catalog sources and skill paths against their upstream repositories; record exact URLs in browser-safe catalog data.
- [x] Write failing HTTP tests for multipart browser paths, multi-skill selection, catalog installation, invalid IDs, error statuses and existing same-origin mutation protection.
- [x] Implement endpoints and pass focused importer/HTTP tests.

### Task 3: Make installed skills available to conversations

**Files:**
- Modify `rewrite/src/lib/server/runtime/session.ts`.
- Modify `rewrite/src/lib/server/runtime/manager.ts`.
- Modify `rewrite/src/lib/server/startup.ts`.
- Create `rewrite/tests/skills-runtime.spec.ts`.

**Interfaces:**
- Add optional `loadSkillContext: () => string` to manager/session options; production startup supplies the global store context loader.
- Context lists installed names, descriptions and absolute SKILL.md locations, and instructs the model to read a matching skill before following it. Supporting paths resolve relative to that file.
- Refresh context on each admitted input while idle. Preserve existing transcript, request-id semantics, native tools, model switching and MCP uncertainty checks.
- Use pi durable's supported generation hook to add a transient user context message; do not mutate persisted user input or assume unsupported system-message types.

- [x] Write a model-fixture test that installs a skill, submits input to an already open conversation, and verifies the provider receives metadata and reads the actual SKILL.md through native `read`.
- [x] Cover a supporting-file read, no-skills behavior, removal, restart and repeated request IDs.
- [x] Run the test to confirm missing integration fails; implement and rerun it together with `tests/native-tools.spec.ts`.

### Task 4: Add the Skills management interface and document usage

**Files:**
- Create `rewrite/src/lib/components/Skills.svelte`.
- Modify `rewrite/src/lib/components/shell/SettingsNavigation.svelte`.
- Modify `rewrite/src/lib/SettingsPage.svelte`.
- Modify `rewrite/src/routes/settings/[...path]/+page.server.ts`.
- Modify `rewrite/tests/acceptance.spec.ts`.
- Modify `rewrite/README.md`.

**Interfaces:**
- `/settings/skills` provides Installed skills, Import from folder, Import from GitHub, and Popular skills.
- Directory input uses `webkitdirectory` and `multiple`; submit `File.webkitRelativePath` separately from the multipart filename.
- Discovery lists all candidates with checked selection boxes, descriptions and file counts; install selected skills in one action.
- Catalog cards show descriptions, publisher/source links and Install/Installed/Installing states. Surface installation errors next to the action.
- Installed entries show source and removal; removal uses the existing confirmation-dialog pattern.
- Use existing shadcn-svelte controls and workspace surfaces; ensure keyboard access and a single-column layout at 390px.

- [x] Add failing acceptance coverage for Skills navigation, a multi-skill browser directory upload, deselecting one candidate, install feedback, duplicate errors, refresh persistence and removal.
- [x] Implement the component and route integration; add repository URL validation, pending states, empty states and retryable errors.
- [x] Explain GitHub-only public URL support, local directory uploads, size limits, dependencies required by some third-party skills, next-message runtime availability and `DATA_DIR/skills` backup storage in README.
- [x] Run `pnpm check`, then `pnpm build`, then `pnpm test`; report every failure by name.
- [x] Run `pnpm exec playwright test tests/acceptance.spec.ts` after build/tests finish. Inspect desktop/mobile screenshots outside Git and release browser automation control.
- [x] Review the diff against issue #787; commit only this feature's files and report validation evidence and any remaining limitations.
