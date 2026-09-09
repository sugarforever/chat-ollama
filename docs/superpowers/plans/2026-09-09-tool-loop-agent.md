# ToolLoopAgent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one safe deterministic tool and a real streamed multi-step agent loop to the ChatOllama Runtime and both CLI modes.

**Architecture:** Replace the Runtime's direct `streamText` call with an AI SDK 7 `ToolLoopAgent` configured with `stopWhen: stepCountIs(4)`. Translate SDK callbacks and stream parts immediately into ChatOllama-owned events and immutable Session items; the CLIs render only that public contract. Keep the provider/model registry and command router unchanged.

**Tech Stack:** TypeScript 5.9, AI SDK 7.0.93, Zod 3.25, Vitest 3.2, pi-tui 0.85, Node.js 24.

**Spec:** GitHub Issue [#734](https://github.com/sugarforever/chat-ollama/issues/734)

## Global Constraints

- Use AI SDK `tool()` and schema validation for exactly one deterministic demo tool.
- Use `ToolLoopAgent` with `stopWhen: stepCountIs(...)`; do not implement a custom loop.
- No file, shell, process, network, parallel-tool, MCP, approval, Skills, compaction, or Web capability.
- Public Runtime events and Session items must not expose AI SDK types.
- Unknown tools, invalid input, execution errors, cancellation, and the step limit must terminate deterministically without fabricated assistant messages.
- Both plain and pi-tui modes must show tool name, status, and result or safe error while preserving streamed editor input.

---

### Task 1: Public lifecycle and Session contract

**Files:**
- Modify: `packages/agent-runtime/src/types.ts`
- Modify: `packages/agent-runtime/src/index.ts`
- Test: `packages/agent-runtime/src/types.spec.ts`
- Test: `packages/agent-runtime/src/session.spec.ts`

**Interfaces:**
- Consumes: existing `AgentSession`, `RuntimeEvent`, and `SessionSnapshot` public contracts.
- Produces: `ToolCallItem`, `ToolResultItem`, `StepStartedEvent`, `StepCompletedEvent`, tool lifecycle events, and terminal run outcomes expressed only with strings, numbers, JSON-safe values, and ChatOllama types.

- [ ] **Step 1: Write failing type and Runtime tests** for immutable tool call/result associations, ordered step lifecycle, a successful two-step call, invalid input, unknown tool, execution failure, cancellation, and step-limit termination. Every test must assert observable events and Session state rather than SDK implementation calls.
- [ ] **Step 2: Run `pnpm --filter chatollama-agent-runtime test -- src/types.spec.ts src/session.spec.ts`** and verify failures name missing public types/events and absent tool-loop behavior.
- [ ] **Step 3: Add the minimal public discriminated unions** with stable `callId`, `toolName`, status/result summary, step number, and terminal reason. Keep SDK imports out of `types.ts` and generated declarations.
- [ ] **Step 4: Re-run the focused tests** and retain the expected Runtime failures for Task 2 while type-contract tests pass.
- [ ] **Step 5: Commit** with `test(runtime): define tool loop lifecycle contract` after the first coherent green slice.

### Task 2: Safe demo tool and ToolLoopAgent execution

**Files:**
- Create: `packages/agent-runtime/src/tools.ts`
- Modify: `packages/agent-runtime/src/session-core.ts`
- Modify: `packages/agent-runtime/src/session.ts`
- Test: `packages/agent-runtime/src/session.spec.ts`

**Interfaces:**
- Consumes: ChatOllama lifecycle types from Task 1 and an AI SDK `LanguageModel`.
- Produces: `createDemoTools()` containing one `getCurrentUtcTime` tool with `{ timezone: 'UTC' }` input and a deterministic injected-clock result; `createAgentSessionWithModel` accepts optional tool/step test configuration without exporting SDK types.

- [ ] **Step 1: Add a failing success-path test** using two `MockLanguageModelV3` streams: the first emits `getCurrentUtcTime`, the Runtime executes it, and the second prompt contains its result before emitting the final streamed answer.
- [ ] **Step 2: Run the focused test** and verify it fails because the second model step and tool events/items do not exist.
- [ ] **Step 3: Implement the tool via `tool({ inputSchema, execute })` and the run via `new ToolLoopAgent({ model, tools, stopWhen: stepCountIs(4) }).stream(...)`**, consuming `fullStream` once and translating only supported parts.
- [ ] **Step 4: Add and run one failing test at a time** for malformed arguments, unknown tool, thrown execution, cancellation, and four-step exhaustion; implement only the safe mapping/termination needed for each case.
- [ ] **Step 5: Run all Runtime tests and typecheck**, then refactor duplicate event/item construction while staying green.
- [ ] **Step 6: Commit** with `feat(runtime): add deterministic ToolLoopAgent flow`.

### Task 3: Plain and pi-tui rendering

**Files:**
- Modify: `packages/agent-cli/src/cli.ts`
- Modify: `packages/agent-cli/src/interactive-cli.ts`
- Test: `packages/agent-cli/src/cli.spec.ts`
- Test: `packages/agent-cli/src/interactive-cli.spec.ts`

**Interfaces:**
- Consumes: Runtime events from Task 1.
- Produces: concise `[tool <name>] ...` and step/limit status output in plain mode and transcript/status updates in pi-tui without direct terminal writes that bypass its render tree.

- [ ] **Step 1: Write failing plain CLI tests** for tool start, safe success summary, safe failure, and step-limit terminal output.
- [ ] **Step 2: Run the plain CLI tests** and verify the new lifecycle is not rendered.
- [ ] **Step 3: Implement exhaustive event rendering** and ensure response newline state remains correct across tool-only first steps.
- [ ] **Step 4: Write failing virtual-terminal tests** proving tool lifecycle is visible and unfinished editor input/focus survives tool events plus final text streaming.
- [ ] **Step 5: Run the pi-tui tests**, implement transcript/status rendering through pi-tui components, and re-run both CLI suites.
- [ ] **Step 6: Commit** with `feat(cli): render tool loop lifecycle`.

### Task 4: Offline demonstration and documentation

**Files:**
- Modify: `packages/agent-runtime/examples/stream.ts`
- Modify: `packages/agent-runtime/examples/stream.spec.ts`
- Modify: `packages/agent-cli/examples/mock-runtime.ts`
- Modify: `packages/agent-cli/examples/mock-runtime.spec.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `packages/agent-runtime/README.md`
- Modify: `packages/agent-cli/README.md`
- Create: `docs/blog/2026-09-09-vercel-ai-sdk-tool-loop-agent.md`

**Interfaces:**
- Consumes: the real Runtime tool loop and public event contract.
- Produces: `pnpm agent:tool-loop-demo`, a copyable credential-free demo that uses `MockLanguageModelV3`, performs the actual tool call, and prints the tool lifecycle and final answer.

- [ ] **Step 1: Write a failing example test** asserting tool call, deterministic result, second model step, and final answer in process output.
- [ ] **Step 2: Run the example test** and verify the existing single-step greeting cannot satisfy it.
- [ ] **Step 3: Build the demo on the real Runtime** with two protocol-correct mock streams and a fixed clock; do not create a second fake loop.
- [ ] **Step 4: Update all three READMEs** with the command, sample output, lifecycle contract, limits, and safety scope.
- [ ] **Step 5: Write the Chinese development article** with natural section transitions, AI SDK 7 API details, event/session design, failures, CLI behavior, and reproducible commands; run the personal punctuation audit.
- [ ] **Step 6: Run example tests and the copyable demo**, then commit with `docs(agent): add offline tool loop demo`.

### Task 5: Full verification, review, and delivery

**Files:**
- Modify only files required by verification fixes.

**Interfaces:**
- Consumes: all implementation and documentation from Tasks 1-4.
- Produces: clean verification evidence, a pushed branch, a `Closes #734` PR, and GitHub Project status `In review`.

- [ ] **Step 1: Run `pnpm test:agent`, `pnpm typecheck:agent`, `pnpm build:agent`, `pnpm build`, and `pnpm test:agent:pack`** and fix any failure with the systematic-debugging workflow plus a regression test.
- [ ] **Step 2: Run plain pipe smoke** against built packages with a prompt and `/exit`, asserting tool lifecycle, final response, clean exit, and no ANSI.
- [ ] **Step 3: Run pi-tui smoke** through the virtual terminal against the built/real Runtime path, asserting visible tool lifecycle, final answer, editor focus, and cancellation behavior.
- [ ] **Step 4: Run `pnpm agent:tool-loop-demo`** and capture its deterministic output.
- [ ] **Step 5: Inspect generated declarations and diffs** for SDK type leakage, unsafe capabilities, secret/error leakage, fabricated messages, and out-of-scope abstractions.
- [ ] **Step 6: Request code review, resolve every issue, and repeat the full verification suite.**
- [ ] **Step 7: Commit remaining fixes, push `codex/issue-734-tool-loop-agent`, create a PR containing `Closes #734`, verification evidence, and demo output, then move the issue's Project item to `In review`.** Do not merge, tag, or publish.
