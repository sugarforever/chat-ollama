# Provider Model Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover usable models for six supported providers, switch an idle Runtime Session from the CLI, and safely restore the non-secret default selection on later launches.

**Architecture:** The Runtime owns a small provider catalog, credential mapping, discovery orchestration, model resolution, and AI SDK provider construction. The CLI owns only cross-platform preference-file I/O and terminal presentation; it receives Runtime model descriptors/configs and calls the public `AgentSession.setModel()` API. Discovery failures are returned as sanitized warnings per provider, while startup selection follows explicit `AGENT_*` overrides, then a valid saved choice, then a deterministic available fallback, and finally the legacy Ollama default so the command loop can always start.

**Tech Stack:** TypeScript ESM, Node.js 24, Vercel AI SDK 7, official `@ai-sdk/openai`, `@ai-sdk/anthropic`, and `@ai-sdk/google` providers, `@ai-sdk/openai-compatible` for Ollama/DeepSeek/OpenRouter, Vitest, pnpm workspaces.

**Spec:** GitHub Issue #744 and the historical `docs/agent-runtime-plan.md` at commit `a83d4d0^` (the file is intentionally absent from current `main`).

## Global Constraints

- First-version providers are exactly Ollama, OpenAI, Anthropic, Google Gemini, DeepSeek, and OpenRouter.
- Do not copy pi's generated model database or add `pi-ai` as a dependency.
- CLI code must not import or construct AI SDK providers.
- Explicit `AGENT_*` values outrank saved preferences and discovered fallbacks.
- Never print, return in descriptors/warnings, or persist API keys.
- A single provider discovery failure must not stop discovery or the CLI loop.
- Do not implement OAuth, a full TUI, Tools, Skills, Compaction, Web changes, or provider plugin infrastructure.

---

### Task 1: Runtime provider catalog and discovery

**Files:**
- Create: `packages/agent-runtime/src/provider-catalog.ts`
- Create: `packages/agent-runtime/src/discovery.ts`
- Create: `packages/agent-runtime/src/discovery.spec.ts`
- Modify: `packages/agent-runtime/src/types.ts`
- Modify: `packages/agent-runtime/src/index.ts`

**Interfaces:**
- Produces: `ProviderId`, `AvailableModel`, `DiscoveryWarning`, `DiscoverModelsOptions`, and `discoverModels(options): Promise<ModelDiscoveryResult>`.
- Produces: sorted, de-duplicated model descriptors containing provider/model and optional non-secret base URL only.

- [ ] **Step 1: Write failing credential and catalog tests**

  Add table-driven tests proving each credential mapping, Gemini's two accepted variables, absent-key filtering, and hand-written built-in model IDs. Mutate each mapping mentally: changing or deleting an environment-variable name must fail a literal expected-provider assertion.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `pnpm --filter chatollama-agent-runtime test -- src/discovery.spec.ts`
  Expected: FAIL because the discovery API and provider types are not exported.

- [ ] **Step 3: Implement the six-provider catalog and credential filter**

  Keep catalog entries small and explicit. Return only provider/model/baseURL metadata from discovery; resolve keys only later when constructing a model config.

- [ ] **Step 4: Write failing fake-transport discovery tests**

  Cover multiple Ollama `/api/tags` models, OpenAI `/v1/models` merge/de-duplication, timeout, HTTP error, invalid payload, sanitized warnings, and continued discovery of another provider after failure.

- [ ] **Step 5: Verify RED, implement bounded isolated discovery, then verify GREEN**

  Run the focused test before and after implementation. Use an injected `fetch`, injected timeout, one `AbortController` per request, and `Promise.all`/settled isolation. Sort by provider then model ID.

- [ ] **Step 6: Commit the independently passing discovery unit**

  Commit: `feat(runtime): discover available provider models`

### Task 2: Runtime model construction and Session switching

**Files:**
- Modify: `packages/agent-runtime/src/model-registry.ts`
- Modify: `packages/agent-runtime/src/model-registry.spec.ts`
- Modify: `packages/agent-runtime/src/session-core.ts`
- Modify: `packages/agent-runtime/src/session.ts`
- Modify: `packages/agent-runtime/src/session.spec.ts`
- Modify: `packages/agent-runtime/src/types.ts`
- Modify: `packages/agent-runtime/src/index.ts`
- Modify: `packages/agent-runtime/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: six-provider `ModelConfig` values resolved by the Runtime registry.
- Produces: `AgentSession.setModel(model: ModelConfig): void`, `SessionSnapshot.model`, and typed `model.changed` events with previous/current descriptors.

- [ ] **Step 1: Write failing provider-construction tests**

  Assert official provider IDs for OpenAI, Anthropic, and Google, and compatible provider names/base URLs for Ollama, DeepSeek, and OpenRouter. Assert `describeModel()` excludes credentials.

- [ ] **Step 2: Verify RED and implement provider construction**

  Add AI SDK 7-compatible official Anthropic and Google packages. Keep all imports inside Runtime. Use OpenAI-compatible adapters only for the three stated compatible providers.

- [ ] **Step 3: Write failing Session switch tests**

  Create two controlled language models; assert a prompt before and after `setModel()` reaches the expected model, the second request includes the first user/assistant history, the snapshot exposes the new descriptor, and exactly one typed change event contains old/new descriptors.

- [ ] **Step 4: Write the active-run rejection test and verify RED**

  Hold a stream open, call `setModel()`, and expect `Session has an active run`; verify the original descriptor remains selected.

- [ ] **Step 5: Implement mutable model state and verify GREEN**

  Replace immutable model/descriptor fields with one current-model record. Reject switching whenever `#activeRun` exists, update atomically while idle, retain `#messages`, and publish `model.changed` only after the state change.

- [ ] **Step 6: Run all Runtime tests and commit**

  Run: `pnpm --filter chatollama-agent-runtime test`
  Commit: `feat(runtime): switch session models safely`

### Task 3: Safe preferences and deterministic startup resolution

**Files:**
- Create: `packages/agent-cli/src/preferences.ts`
- Create: `packages/agent-cli/src/preferences.spec.ts`
- Modify: `packages/agent-cli/src/config.ts`
- Modify: `packages/agent-cli/src/config.spec.ts`

**Interfaces:**
- Consumes: Runtime `AvailableModel[]`, six-provider environment credentials, and optional saved preference.
- Produces: `getPreferencesPath()`, `readModelPreference()`, `writeModelPreference()`, and `resolveStartupModel()` returning a Runtime `ModelConfig`, source, and optional user-safe notices.

- [ ] **Step 1: Write failing cross-platform path and corrupt-file tests**

  Cover macOS Application Support, Windows APPDATA, Linux XDG and home fallback. A corrupt JSON file returns no preference plus a clear warning rather than throwing.

- [ ] **Step 2: Verify RED, implement minimal read/path logic, and verify GREEN**

  Inject platform/env/home/path in tests. Validate exact allowed fields and provider values; do not accept or echo unknown secret-shaped fields.

- [ ] **Step 3: Write failing priority and persistence tests**

  Assert full explicit `AGENT_PROVIDER`/`AGENT_MODEL` selection wins, saved available selection is next, stale saved selection emits a notice and selects the lexically first available model, and no available model falls back to Ollama/qwen3:8b. Assert written JSON contains only provider/model and a necessary non-secret endpoint.

- [ ] **Step 4: Verify RED, implement resolution/write logic, and verify GREEN**

  Write via a parent-directory mkdir and temporary sibling file followed by rename. Apply `AGENT_API_KEY`/`AGENT_BASE_URL` only in memory. Keep default endpoint mapping in Runtime-facing configuration helpers.

- [ ] **Step 5: Commit the independently passing configuration unit**

  Commit: `feat(cli): persist model selection safely`

### Task 4: `/models` and `/model` CLI interaction

**Files:**
- Modify: `packages/agent-cli/src/cli.ts`
- Modify: `packages/agent-cli/src/cli.spec.ts`
- Modify: `packages/agent-cli/src/main.ts`
- Modify: `packages/agent-cli/src/main.spec.ts`

**Interfaces:**
- Consumes: discovered `AvailableModel[]`, `AgentSession.getSnapshot().model`, `AgentSession.setModel()`, and an injected async preference writer.
- Produces: sorted numbered `/models` output, one-line selection mode with empty cancellation, and `/model <provider>/<model-id>` direct switching.

- [ ] **Step 1: Write failing `/models` presentation tests**

  Assert sorted numbered output, current marker, empty-catalog configuration guidance, and that `/exit` still works after discovery warnings.

- [ ] **Step 2: Verify RED, implement listing only, and verify GREEN**

  Add no provider imports to CLI. Render stable plain text suitable for terminal and tarball smoke assertions.

- [ ] **Step 3: Write failing numbered/direct selection tests**

  Assert valid number and `/model provider/id` call `setModel`, persist only after success, print the new selection, and affect the next controlled prompt. Assert empty numeric input cancels and invalid number/name leaves model and preferences unchanged.

- [ ] **Step 4: Write failing active-run command test**

  Use a controlled Session that rejects `setModel()` while prompting and assert the CLI prints the explicit Runtime rejection without persisting.

- [ ] **Step 5: Implement selection state and direct command, then verify GREEN**

  Parse the provider at the first slash so model IDs may contain slashes. Catch switching and write errors separately. Keep the input loop alive after either error.

- [ ] **Step 6: Integrate startup discovery and verify no-credential startup**

  Inject fake transport in entry-point tests. Print sanitized discovery/config warnings, create the Runtime Session from the resolved model, and enter the loop even when the catalog is empty and Ollama is unreachable.

- [ ] **Step 7: Run all CLI tests and commit**

  Run: `pnpm --filter chatollama-agent test`
  Commit: `feat(cli): select discovered models`

### Task 5: Documentation, package artifact, and delivery

**Files:**
- Modify: `README.md`
- Modify: `packages/agent-cli/README.md`
- Modify: `packages/agent-runtime/README.md`
- Create: `blogs/20260908-discover-and-switch-agent-models_zh.md`
- Modify: `scripts/test-agent-packages.mjs` only if a behavior-level tarball assertion is missing.

**Interfaces:**
- Consumes: completed public Runtime/CLI behavior.
- Produces: copyable Ollama/OpenAI demos, environment/preference documentation, design article, and installed-package evidence.

- [ ] **Step 1: Update user and package documentation**

  Document all credential variables, `AGENT_*` precedence, `/models`, `/model`, platform-specific preference locations, failure isolation, Ollama and OpenAI commands, and the non-secret preference schema.

- [ ] **Step 2: Write and audit the Chinese development article**

  Use first-person opening, mention `chatollama-agent`, explain the catalog/auth/discovery/Session/persistence boundaries and tradeoffs, avoid numbered headings and a summary heading, then scan for straight Chinese quotes, em/en dashes, Unicode ellipses, and ASCII punctuation between Chinese characters.

- [ ] **Step 3: Add/extend tarball behavior coverage test-first if required**

  Install packed Runtime and CLI tarballs into a temporary clean project, run `/models` with fake/no credentials and `/exit`, and assert behavior comes from installed `dist` without repository source imports.

- [ ] **Step 4: Run the complete verification matrix fresh**

  Run, in order: `pnpm test:agent`, `pnpm typecheck:agent`, `pnpm build:agent`, `pnpm build`, and `pnpm test:agent:pack`. Then create fresh tarballs, install them in a new `mktemp -d` project, and smoke `/models`, direct selection where possible without a paid call, and `/exit`.

- [ ] **Step 5: Perform strict requirement and diff self-review**

  Re-read Issue #744 line by line, inspect `git diff origin/main...HEAD`, scan for leaked secret fixture values in built output/docs, verify CLI has no AI SDK provider dependency/import, and correct every gap.

- [ ] **Step 6: Request independent code review and address findings**

  Give the reviewer Issue #744, this plan, `origin/main` SHA, and branch HEAD SHA. Fix every Critical/Important finding and repeat the affected plus full verification commands.

- [ ] **Step 7: Commit, push, create PR, and update Project**

  Use a PR body with `Closes #744`, verification results, demo commands, and article link. Do not merge, tag, or publish. Change the linked GitHub Project item from `Ready` to `In review`.
