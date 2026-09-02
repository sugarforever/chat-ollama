# Scripted Agent CLI

GitHub Issue #731 introduces two isolated workspace packages:

- `packages/agent-runtime` contains the framework-independent Runtime contract and implementation.
- `packages/agent-cli` contains the `readline/promises` terminal adapter.

The Runtime keeps complete user and assistant messages in memory. Streaming deltas are transient events for consumers such as the CLI; they are not stored as separate history items. `ScriptedModelProvider` makes this boundary observable without a network request or model credential.

## Run

With Node.js 20 or newer and pnpm installed:

```bash
pnpm install
pnpm agent:demo
```

The demo reads one prompt and streams this deterministic answer:

```text
You: Hello
Assistant: Hello from the scripted model.
```

The same flow can be copied into a non-interactive shell:

```bash
printf 'Hello\n' | pnpm agent:demo
```

## Verify

```bash
pnpm test:agent
pnpm typecheck:agent
```

The tests assert successful lifecycle ordering, complete Session history, listener removal, cancellation without a partial assistant message, provider failure, and terminal rendering.

## Scope boundary

This increment does not connect a real model, execute tools, persist a Session, provide a continuous REPL or full TUI, integrate with the Web application, or add an external event transport. Those capabilities remain separate deliverables in the Agent Runtime milestone.
