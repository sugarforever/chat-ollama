# Vercel AI SDK Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first independently runnable ChatOllama Agent Runtime using Vercel AI SDK `streamText`, with OpenAI and OpenAI-compatible model configuration, stable Runtime events, offline tests, and operator documentation.

**Architecture:** `packages/agent-runtime` owns the AI SDK integration and translates model output into ChatOllama-owned messages, snapshots, and events. Public consumers configure a model and use `AgentSession`; an internal model factory and an internal test injection point are the only places that reference AI SDK model types.

**Tech Stack:** Node.js 20, TypeScript, ESM, pnpm workspace, AI SDK 6, `@ai-sdk/openai` 3, `@ai-sdk/openai-compatible` 2, Vitest, `ai/test`.

**Spec:** GitHub Epic `sugarforever/chat-ollama#730` and Issue `sugarforever/chat-ollama#731`, read on 2026-09-04.

## Global Constraints

- Use Node.js 20-compatible stable packages: `ai@6.0.276`, `@ai-sdk/openai@3.0.107`, and `@ai-sdk/openai-compatible@2.0.74`.
- Do not implement a custom `ModelProvider`, `ScriptedModelProvider`, or streaming parser.
- Do not create an `agent-provider-openai` or CLI package.
- Public Runtime events, messages, snapshots, and `AgentSession` must not reference AI SDK UI messages or stream-part types.
- API keys must not appear in Runtime events, console output, or test snapshots.
- Do not modify the existing Web Agent.
- Do not add tools, `ToolLoopAgent`, persistence, Skills, compaction, MCP, or Web integration.
- Add only interfaces exercised by this issue.

---

### Task 1: Workspace and test harness

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.packages.json`
- Create: `packages/agent-runtime/package.json`
- Create: `packages/agent-runtime/tsconfig.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: the existing Nuxt root package and Node.js 20 baseline.
- Produces: `pnpm test:agent`, `pnpm typecheck:agent`, and `pnpm agent:example` workspace commands.

- [ ] **Step 1: Add the minimal workspace configuration and a package test script**

  Configure `packages/*`, an ESM package, Vitest, TypeScript, and exact compatible AI SDK dependencies. Upgrade the root `ai` dependency and `zod` peer dependency without moving existing application code.

- [ ] **Step 2: Install dependencies**

  Run: `pnpm install`

  Expected: lockfile contains one compatible AI SDK 6 provider family and no `ai@2.2.37` entry.

- [ ] **Step 3: Verify the empty package commands are wired**

  Run: `pnpm --filter @chatollama/agent-runtime exec vitest --version`

  Expected: Vitest prints its version under Node.js 20 or newer.

### Task 2: Public message, event, and model configuration contract

**Files:**
- Create: `packages/agent-runtime/src/types.spec.ts`
- Create: `packages/agent-runtime/src/types.ts`
- Create: `packages/agent-runtime/src/index.ts`

**Interfaces:**
- Consumes: no AI SDK types.
- Produces: `UserMessage`, `AssistantMessage`, `SessionMessage`, `SessionSnapshot`, `ModelConfig`, `RuntimeEvent`, `RuntimeEventListener`, and `AgentSession`.

- [ ] **Step 1: Write the failing public-contract test**

  Compile a fixture that constructs each public event using only string, boolean, and ChatOllama-owned object fields; add a type-only assertion that the public declaration graph contains no import from `ai` or `@ai-sdk/*`.

- [ ] **Step 2: Run the test and confirm RED**

  Run: `pnpm test:agent -- src/types.spec.ts`

  Expected: FAIL because `src/types.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal discriminated unions**

  Use `{ role: 'user' | 'assistant'; content: string }` messages, an immutable snapshot, `openai` and `openai-compatible` model configs, and the seven event variants required by #731. Expose only `subscribe`, `prompt`, `cancel`, and `getSnapshot` on `AgentSession`.

- [ ] **Step 4: Run the contract test and confirm GREEN**

  Run: `pnpm test:agent -- src/types.spec.ts`

  Expected: PASS.

### Task 3: Internal model registry and factory

**Files:**
- Create: `packages/agent-runtime/src/model-registry.spec.ts`
- Create: `packages/agent-runtime/src/model-registry.ts`

**Interfaces:**
- Consumes: public `ModelConfig`.
- Produces internally: `createLanguageModel(config): LanguageModel`.

- [ ] **Step 1: Write failing model selection tests**

  Assert that an OpenAI config creates a model with the requested model ID and that an OpenAI-compatible config uses its required base URL and provider name. Assert that serializing public config summaries never contains the API key.

- [ ] **Step 2: Run the focused tests and confirm RED**

  Run: `pnpm test:agent -- src/model-registry.spec.ts`

  Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Implement the two-entry registry**

  Use `createOpenAI` and `createOpenAICompatible` directly. Keep the registry, AI SDK `LanguageModel` return type, credentials, and provider construction internal to the package.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

  Run: `pnpm test:agent -- src/model-registry.spec.ts`

  Expected: PASS without network calls.

### Task 4: Streaming Session lifecycle

**Files:**
- Create: `packages/agent-runtime/src/session.spec.ts`
- Create: `packages/agent-runtime/src/session.ts`
- Modify: `packages/agent-runtime/src/index.ts`

**Interfaces:**
- Consumes internally: AI SDK `LanguageModel`, `streamText`, and public Runtime types.
- Produces publicly: `createAgentSession({ model, id? }): AgentSession`.
- Produces for package-local tests/examples only: an unexported-package-surface factory accepting a `LanguageModel`.

- [ ] **Step 1: Write the failing happy-path stream test**

  Use `MockLanguageModelV3`, `mockValues`, and `simulateReadableStream` to emit two text deltas. Assert exact event order and values, one completed assistant message in the snapshot, and no partial assistant message persisted.

- [ ] **Step 2: Run the happy-path test and confirm RED**

  Run: `pnpm test:agent -- src/session.spec.ts`

  Expected: FAIL because the Session implementation does not exist.

- [ ] **Step 3: Implement the minimal stream loop**

  Append the user message, call `streamText`, iterate `textStream`, publish ChatOllama string deltas, append the completed assistant message, and publish terminal events. Copy arrays and message objects from `getSnapshot` so callers cannot mutate memory state.

- [ ] **Step 4: Run the happy-path test and confirm GREEN**

  Run: `pnpm test:agent -- src/session.spec.ts`

  Expected: PASS.

- [ ] **Step 5: Add failing unsubscribe, failure, cancellation, and active-run tests**

  Verify unsubscribe stops delivery; provider failures emit only a stable sanitized `run.failed`; cancellation emits `run.cancelled` and does not persist a partial assistant; a second simultaneous prompt is rejected without replacing the active run.

- [ ] **Step 6: Run the edge tests and confirm RED**

  Run: `pnpm test:agent -- src/session.spec.ts`

  Expected: new cases FAIL for missing lifecycle behavior.

- [ ] **Step 7: Implement the minimal lifecycle guards**

  Keep one `AbortController` for the active run, classify cancellation using that signal, clear active state in `finally`, send listener snapshots while iterating a copied listener set, and use a constant public failure message.

- [ ] **Step 8: Run all Runtime tests and confirm GREEN**

  Run: `pnpm test:agent`

  Expected: all tests PASS with no online calls.

### Task 5: Runnable example and smoke-test guide

**Files:**
- Create: `packages/agent-runtime/examples/stream.ts`
- Create: `packages/agent-runtime/README.md`
- Create: `docs/agent-runtime-plan.md`
- Modify: `README.md`
- Modify: `README.zh-Hans.md`

**Interfaces:**
- Consumes: public Runtime model configuration and event subscription API; package-local mock injection only when `--mock` is selected.
- Produces: a deterministic default mock run plus documented OpenAI and Ollama `/v1` smoke commands.

- [ ] **Step 1: Implement the executable event subscriber**

  Default to `--mock`, render only `model.delta` text, and never print a config object or credential. Support `--provider openai` and `--provider ollama` using environment variables and the public `createAgentSession` factory.

- [ ] **Step 2: Run the offline example**

  Run: `pnpm agent:example`

  Expected: streamed deterministic text followed by a newline, without requiring a credential.

- [ ] **Step 3: Document online smoke tests and architecture boundaries**

  Include exact OpenAI and Ollama commands, expected endpoint shape, supported environment variables, event list, current non-goals, and the commands used for test/type/build verification.

### Task 6: Chinese development article and final verification

**Files:**
- Create: `blogs/20260904-vercel-ai-sdk-agent-runtime_zh.md`

**Interfaces:**
- Consumes: the implemented behavior and fresh command output.
- Produces: a Chinese development note explaining the design, TDD evidence, execution paths, constraints, and lessons.

- [ ] **Step 1: Write the article from verified behavior**

  Explain why AI SDK 6 was selected for Node.js 20, why SDK types stop at the Runtime boundary, how stream parts become stable events, and how to reproduce mock/OpenAI/Ollama runs.

- [ ] **Step 2: Run the complete verification matrix**

  Run: `pnpm test:agent && pnpm typecheck:agent && pnpm build && pnpm agent:example && git diff --check origin/main`

  Expected: every command exits 0; the example streams text; the existing Nuxt application builds.

- [ ] **Step 3: Scan for credential and scope leaks**

  Run focused searches over source, events, snapshots, logs, package names, and imports. Confirm no real credential is tracked; no public declaration imports an AI SDK type; no forbidden package or custom provider/parser exists; no existing Web Agent file changed.

- [ ] **Step 4: Commit, review, and prepare the PR**

  Commit a small cohesive change, request a read-only code review against #731, fix Critical/Important findings with new failing tests where behavior changes, re-run the full matrix, push the branch, and open a PR containing `Closes #731`, non-goals, commands, and fresh test evidence.

- [ ] **Step 5: Move Project status to In review**

  After the PR exists, update #731 in GitHub Project 1 from `In progress` to `In review` and verify the new status.
