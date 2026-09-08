# Provider Model Discovery and TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover usable models for six providers, switch an idle Agent Session without losing history, persist a safe default, and expose the workflow through pi-tui on TTYs and stable plain text on pipes/CI.

**Architecture:** Runtime owns provider metadata, credential mapping, discovery, AI SDK construction, and atomic Session model switching. CLI command handlers own model-list and selection behavior without any rendering dependency; a plain readline adapter and a pi-tui adapter consume those handlers. CLI preference I/O persists only provider, model, and necessary non-secret endpoint metadata.

**Tech Stack:** Node.js 24, TypeScript ESM, pnpm, Vercel AI SDK 7, official `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`, `@earendil-works/pi-tui@0.85.1`, Vitest.

**Spec:** GitHub Issue #744 as read on 2026-09-08; historical `docs/agent-runtime-plan.md` from `a83d4d0^` is background only where it does not conflict with the Issue.

## Global Constraints

- Supported providers are exactly Ollama, OpenAI, Anthropic, Google Gemini, DeepSeek, and OpenRouter.
- Ollama availability is a reachable local service and its models come from `/api/tags`; remote credentials are detected only by environment-variable presence.
- `AGENT_*` explicit overrides outrank saved defaults, which outrank a deterministic available fallback.
- Provider failures are isolated, time-bounded, sanitized, and never prevent the command loop from starting.
- API keys are never printed, returned in discovery results, written to preferences, or embedded in warnings.
- Runtime, ModelRegistry, command parsing, and command handlers must not depend on pi-tui.
- TTY input/output uses pi-tui; non-TTY, pipe, and CI use stable line-oriented output with no ANSI escapes.
- Do not add Ink, OpenTUI, React, `pi-ai`, pi agent runtime, OAuth, a full dashboard, Tools, Skills, Compaction, or Web changes.

---

### Task 1: Provider catalog and isolated discovery

**Files:**
- Create: `packages/agent-runtime/src/provider-catalog.ts`
- Create: `packages/agent-runtime/src/discovery.ts`
- Create: `packages/agent-runtime/src/discovery.spec.ts`
- Modify: `packages/agent-runtime/src/types.ts`
- Modify: `packages/agent-runtime/src/index.ts`

**Interfaces:**
- Produces: `ProviderId`, `AvailableModel`, `DiscoveryWarning`, `ModelDiscoveryResult`, `DiscoverModelsOptions`, `discoverModels(options)`.
- Discovery output contains only provider/model and optional non-secret `baseURL`.

- [ ] Write table-driven failing tests for all credential names, Gemini aliases, absent keys, exact built-in catalog, sorting, and de-duplication.
- [ ] Run `pnpm --filter chatollama-agent-runtime test -- src/discovery.spec.ts`; verify failure is missing behavior.
- [ ] Implement the small six-provider catalog and credential filter.
- [ ] Add failing fake-fetch tests for multiple Ollama `/api/tags` models and one remote `/models` endpoint covering success, timeout, HTTP failure, malformed data, sanitized warnings, and provider isolation.
- [ ] Re-run RED, implement per-request `AbortController` timeouts and settled isolation, then run GREEN.
- [ ] Commit the passing unit as `feat(runtime): discover available provider models`.

### Task 2: Six-provider construction and Session model switching

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
- Produces: provider-specific `ModelConfig`, `createModelConfig(selection, env)`, `AgentSession.setModel(config)`, `SessionSnapshot.model`, and typed `model.changed` with previous/current descriptors.

- [ ] Write failing model-factory tests proving official OpenAI, Anthropic, and Google provider IDs and compatible Ollama, DeepSeek, and OpenRouter URLs/names; assert descriptors omit credentials.
- [ ] Run the focused test and verify RED.
- [ ] Add the pinned official provider packages and minimal factory/config resolver; run GREEN.
- [ ] Write failing Session tests for switching between two controlled models, immediate use on the next prompt, retained prior messages, updated snapshot, and exactly one typed event.
- [ ] Add a failing test that holds a stream active, expects `Session has an active run`, and proves the original model remains selected.
- [ ] Implement one mutable current-model record, atomic idle switching, and event publication; run focused and complete Runtime tests.
- [ ] Commit as `feat(runtime): switch session models safely`.

### Task 3: Safe preferences and startup resolution

**Files:**
- Create: `packages/agent-cli/src/preferences.ts`
- Create: `packages/agent-cli/src/preferences.spec.ts`
- Modify: `packages/agent-cli/src/config.ts`
- Modify: `packages/agent-cli/src/config.spec.ts`

**Interfaces:**
- Produces: `ModelPreference`, `getPreferencesPath()`, `readModelPreference()`, `writeModelPreference()`, and `resolveStartupModel()` returning selection source plus safe notices.

- [ ] Write failing tests for macOS Application Support, Windows APPDATA, Linux XDG/home fallback, corrupt JSON recovery, schema rejection, and no secret echo.
- [ ] Verify RED; implement injected path/platform/home reads and run GREEN.
- [ ] Write failing precedence tests for explicit `AGENT_*`, valid saved selection, stale saved fallback, lexically deterministic fallback, and empty-catalog legacy Ollama fallback.
- [ ] Write failing persistence tests proving minimal JSON and atomic temp-file rename contain only provider/model/necessary base URL.
- [ ] Verify RED; implement selection and persistence; run all CLI config tests GREEN.
- [ ] Commit as `feat(cli): persist model selection safely`.

### Task 4: Renderer-independent command handlers

**Files:**
- Create: `packages/agent-cli/src/commands.ts`
- Create: `packages/agent-cli/src/commands.spec.ts`
- Modify: `packages/agent-cli/src/cli.ts`
- Modify: `packages/agent-cli/src/cli.spec.ts`

**Interfaces:**
- Produces: parsed command union and handlers for `/models`, `/model <provider>/<model-id>`, numbered selection, cancellation, and `/exit`.
- Consumes only Runtime public APIs and an injected async preference writer.

- [ ] Write failing parser/handler tests for sorted numbered output, current marker, empty-catalog guidance, valid direct selection, model IDs containing `/`, invalid input preserving state, persistence only after successful switching, and active-run rejection.
- [ ] Run focused tests and verify RED.
- [ ] Implement pure parsing plus renderer-neutral results/actions; run GREEN.
- [ ] Add failing plain-mode integration tests for `/models`, numbered selection, `/model`, warnings followed by `/exit`, no-provider startup, and no ANSI bytes.
- [ ] Adapt readline mode to handlers, keeping its current pipe contract; run CLI tests GREEN.
- [ ] Commit as `feat(cli): add model selection commands`.

### Task 5: pi-tui interactive adapter

**Files:**
- Create: `packages/agent-cli/src/interactive-cli.ts`
- Create: `packages/agent-cli/src/interactive-cli.spec.ts`
- Create: `packages/agent-cli/test-utils/virtual-terminal.ts`
- Modify: `packages/agent-cli/src/main.ts`
- Modify: `packages/agent-cli/src/main.spec.ts`
- Modify: `packages/agent-cli/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `runInteractiveCli()` using injected pi-tui `Terminal`; main selects it only when both stdin and stdout are TTY.
- Uses `Editor`, `CombinedAutocompleteProvider`, `SelectList`, `TUI`, and terminal differential rendering; command behavior remains in `commands.ts`.

- [ ] Add exact pinned `@earendil-works/pi-tui@0.85.1` and test-only `@xterm/headless` compatible with the reference VirtualTerminal.
- [ ] Write failing VirtualTerminal tests showing `/` completion includes `/models`, `/model`, `/exit`; model picker Down/Up changes selection; Enter commits; Escape cancels.
- [ ] Verify RED; implement a minimal TUI root with transcript/status components, focused Editor, autocomplete, and SelectList overlay/component swapping; run GREEN.
- [ ] Add a failing controlled-stream test that types unfinished editor text, emits multiple deltas, and proves editor text/focus survive differential re-renders.
- [ ] Implement transcript updates through component state plus `requestRender()` without raw writes competing with Editor; run GREEN.
- [ ] Add main-mode tests proving TTY selects pi-tui while pipes select plain mode, then run all CLI tests.
- [ ] Commit as `feat(cli): add pi-tui interactive model picker`.

### Task 6: Startup wiring, documentation, artifacts, and delivery

**Files:**
- Modify: `packages/agent-cli/src/main.ts`
- Modify: `packages/agent-cli/src/main.spec.ts`
- Modify: `scripts/test-agent-packages.mjs` if installed behavior is not already covered
- Modify: `README.md`
- Modify: `packages/agent-cli/README.md`
- Modify: `packages/agent-runtime/README.md`
- Create: `blogs/20260908-discover-and-switch-agent-models_zh.md`

**Interfaces:**
- Startup performs discovery, safe preference read/resolution, Session construction, warning delivery, then selected adapter execution.

- [ ] Write failing entry-point tests with injected/fake transport for discovery warnings, zero credentials plus unavailable Ollama, restored saved selection, and explicit override precedence.
- [ ] Implement startup composition and run focused tests GREEN.
- [ ] Extend tarball smoke test first if necessary so installed `dist` accepts piped `/models`, `/model`, `/exit` without workspace-source resolution or ANSI output.
- [ ] Update READMEs with six credential mappings, priority, commands, platform paths, safe schema, failure behavior, and copyable Ollama/OpenAI demos.
- [ ] Use `personal-chinese-writing-style` to write the development article about discovery, failure isolation, Runtime switching, dual adapters, and persistence tradeoffs.
- [ ] Run fresh acceptance commands: `pnpm test:agent`, `pnpm typecheck:agent`, `pnpm build:agent`, `pnpm test:agent:pack`; also install fresh tarballs into `mktemp -d` and exercise piped commands.
- [ ] Re-read Issue #744 line by line, inspect the complete diff, scan source/build/docs for secret leakage and forbidden dependencies, and correct every gap.
- [ ] Request independent code review, fix every Critical/Important finding, and repeat affected plus full acceptance commands.
- [ ] Commit explicit paths only, push a `codex/` branch, create a PR whose body contains `Closes #744`, verification evidence, demos, and article link; move the linked Project item from `Ready` to `In review`. Do not merge, tag, or publish.
