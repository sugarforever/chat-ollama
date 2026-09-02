# Scripted Agent CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver GitHub Issue #731 as a runnable, deterministic one-prompt CLI backed by a framework-independent in-memory Agent Runtime.

**Architecture:** `@chat-ollama/agent-runtime` owns message types, the minimal provider port, typed process-local events, the in-memory `Session`, and `ScriptedModelProvider`. `@chat-ollama/agent-cli` owns a one-prompt `readline/promises` adapter that consumes Runtime events and writes streamed deltas. The repository root only wires the pnpm workspace and shared commands.

**Tech Stack:** TypeScript, Node.js 20, ESM, pnpm workspace, tsx, tsc `--noEmit`, Vitest, Node.js `readline/promises`

**Spec:** `docs/agent-runtime-plan.md` and GitHub Issues #730 and #731

## Global Constraints

- Runtime must not import Nuxt, Vue, LangChain, `deepagents`, OpenAI, or any concrete model SDK.
- All new Agent production code must remain inside its dedicated `packages/agent-*` package; existing Web Agent directories stay untouched.
- Scope is limited to `UserMessage`, `AssistantMessage`, one model step, typed in-process listeners, minimum cancellation, and a scripted provider.
- Do not add tools, persistence, a continuous REPL, a full TUI, Web integration, replay, or future provider abstractions.
- The CLI demo must run from a fresh install through one copyable root command.
- Every behavior change follows a red-green-refactor cycle and the final branch must pass tests and type checking.

---

### Task 1: Workspace and successful Runtime flow

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.packages.json`
- Modify: `package.json`
- Create: `packages/agent-runtime/package.json`
- Create: `packages/agent-runtime/tsconfig.json`
- Create: `packages/agent-runtime/src/index.ts`
- Create: `packages/agent-runtime/src/session.ts`
- Create: `packages/agent-runtime/src/types.ts`
- Create: `packages/agent-runtime/src/scripted-model-provider.ts`
- Test: `packages/agent-runtime/src/session.spec.ts`

**Interfaces:**
- Produces: `ModelProvider.stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelEvent>`
- Produces: `Session.subscribe(listener): () => void`, `Session.prompt(input): Promise<void>`, `Session.cancel(): void`, and `Session.getHistory(): readonly AgentItem[]`
- Produces: `new ScriptedModelProvider({ chunks, delayMs? })`

- [ ] **Step 1: Add workspace and test configuration**

Add root `agent:demo`, `test:agent`, and `typecheck:agent` commands; configure both packages for Node.js 20 and ESM.

- [ ] **Step 2: Write the successful-flow failing tests**

```ts
it('emits model deltas in lifecycle order and stores complete messages', async () => {
  const session = new Session(new ScriptedModelProvider({ chunks: ['Hello', ' world'] }))
  const events: RuntimeEvent[] = []
  session.subscribe(event => events.push(event))

  await session.prompt('Hi')

  expect(events.map(event => event.type)).toEqual([
    'run.started', 'model.started', 'model.delta', 'model.delta',
    'model.completed', 'run.completed'
  ])
  expect(session.getHistory()).toEqual([
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello world' }
  ])
})
```

Also verify that calling the returned unsubscribe function prevents later delivery.

- [ ] **Step 3: Run the Runtime test and verify RED**

Run: `pnpm --filter @chat-ollama/agent-runtime test`

Expected: FAIL because the Runtime exports do not exist.

- [ ] **Step 4: Implement the minimum successful flow**

Define only the two message variants, a text-delta `ModelEvent`, six successful lifecycle event variants, a listener type, the provider interface, the in-memory Session, and the deterministic provider.

- [ ] **Step 5: Run the Runtime tests and type check**

Run: `pnpm --filter @chat-ollama/agent-runtime test && pnpm --filter @chat-ollama/agent-runtime typecheck`

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.packages.json packages/agent-runtime
git commit -m "feat: add scripted agent runtime"
```

### Task 2: Runtime cancellation and failure terminals

**Files:**
- Modify: `packages/agent-runtime/src/types.ts`
- Modify: `packages/agent-runtime/src/session.ts`
- Test: `packages/agent-runtime/src/session.spec.ts`

**Interfaces:**
- Consumes: the Task 1 Session and provider port
- Produces: terminal `run.cancelled` and `run.failed` events

- [ ] **Step 1: Write cancellation and failure tests**

```ts
it('emits run.cancelled and does not store a partial assistant message', async () => {
  const session = new Session(new ScriptedModelProvider({ chunks: ['partial', 'later'], delayMs: 10 }))
  const eventTypes: string[] = []
  session.subscribe(event => {
    eventTypes.push(event.type)
    if (event.type === 'model.delta') session.cancel()
  })

  await session.prompt('stop')

  expect(eventTypes.at(-1)).toBe('run.cancelled')
  expect(session.getHistory()).toEqual([{ role: 'user', content: 'stop' }])
})
```

Use a small real throwing provider to verify `run.failed` is emitted and `prompt()` rejects with the original error.

- [ ] **Step 2: Run the targeted tests and verify RED**

Run: `pnpm --filter @chat-ollama/agent-runtime test`

Expected: FAIL because terminal cancellation and failure handling are absent.

- [ ] **Step 3: Add the minimum terminal handling**

Keep one active `AbortController`; treat an abort as a resolved cancelled run, treat other errors as a failed event followed by rejection, and clear active state in `finally`.

- [ ] **Step 4: Run tests and type check**

Run: `pnpm --filter @chat-ollama/agent-runtime test && pnpm --filter @chat-ollama/agent-runtime typecheck`

Expected: all checks exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-runtime
git commit -m "feat: add runtime terminal events"
```

### Task 3: Runnable one-prompt CLI

**Files:**
- Create: `packages/agent-cli/package.json`
- Create: `packages/agent-cli/tsconfig.json`
- Create: `packages/agent-cli/src/cli.ts`
- Create: `packages/agent-cli/src/main.ts`
- Test: `packages/agent-cli/src/cli.spec.ts`

**Interfaces:**
- Consumes: `Session`, `ScriptedModelProvider`, and `RuntimeEvent` from `@chat-ollama/agent-runtime`
- Produces: `runCli({ input, output, provider? }): Promise<void>` and package command `pnpm start`

- [ ] **Step 1: Write the CLI failing integration test**

```ts
it('reads one prompt and streams the scripted answer', async () => {
  const input = Readable.from(['What can you do?\n'])
  const output = new PassThrough()
  let rendered = ''
  output.on('data', chunk => { rendered += chunk.toString() })

  await runCli({ input, output, provider: new ScriptedModelProvider({ chunks: ['A ', 'scripted answer.'] }) })

  expect(rendered).toBe('You: Assistant: A scripted answer.\n')
})
```

- [ ] **Step 2: Run the CLI test and verify RED**

Run: `pnpm --filter @chat-ollama/agent-cli test`

Expected: FAIL because `runCli` does not exist.

- [ ] **Step 3: Implement the readline adapter and entry point**

Create one readline interface, read one question, subscribe before prompting, write only model lifecycle output, and always unsubscribe and close the interface in `finally`.

- [ ] **Step 4: Run CLI tests, type checks, and a piped smoke demo**

Run: `pnpm test:agent && pnpm typecheck:agent && printf 'Hello\n' | pnpm agent:demo`

Expected demo output: `You: Assistant: Hello from the scripted model.`

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml packages/agent-cli
git commit -m "feat: add scripted agent CLI"
```

### Task 4: Planning document, usage notes, and Chinese development article

**Files:**
- Create: `docs/agent-runtime-plan.md`
- Create: `docs/agent-runtime-scripted-cli.md`
- Create: `blogs/20260903-agent-runtime-scripted-cli_zh.md`
- Modify: `README.md`

**Interfaces:**
- Documents: fresh install, `pnpm agent:demo`, `pnpm test:agent`, and `pnpm typecheck:agent`

- [ ] **Step 1: Bring the approved local Runtime plan into this branch**

Copy the exact planning source from the shared main checkout without modifying unrelated local files.

- [ ] **Step 2: Write focused usage documentation**

Document the event order, package boundary, copyable command, output, and explicit non-goals.

- [ ] **Step 3: Write and audit the Chinese article**

Use the repository blog format and personal Chinese punctuation/voice rules; cover why the first provider is scripted, the event/history separation, the TDD path, commands, and the deliberately deferred work.

- [ ] **Step 4: Verify all commands from root**

Run: `pnpm install --frozen-lockfile && pnpm test:agent && pnpm typecheck:agent && printf 'Hello\n' | pnpm agent:demo`

Expected: install, tests, type checking, and demo all exit 0.

- [ ] **Step 5: Commit**

```bash
git add README.md docs blogs pnpm-lock.yaml
git commit -m "docs: explain the scripted agent CLI"
```

### Task 5: Review and Pull Request

**Files:**
- Review: all changes from `origin/main...HEAD`

- [ ] **Step 1: Request code review against Issue #731**

Review for scope, public contract, cancellation semantics, package isolation, tests, and documentation accuracy. Fix every Critical or Important finding and rerun affected checks.

- [ ] **Step 2: Run the final verification gate**

Run the frozen install, full Agent test suite, full Agent type check, CLI smoke demo, dependency import scan, and `git diff --check`.

- [ ] **Step 3: Push and create the Pull Request**

Use a PR body with context, features, explicit non-goals, copyable demo, automated evidence, and `Closes #731`. Do not merge.

- [ ] **Step 4: Move #731 to In review**

Update the existing GitHub Project item only after the PR exists.
