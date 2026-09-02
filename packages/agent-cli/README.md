# @chat-ollama/agent-cli

One-prompt terminal adapter for `@chat-ollama/agent-runtime`. It uses Node.js `readline/promises` and renders model deltas as they arrive.

## Run the scripted demo

Requirements: Node.js 20 or newer and pnpm.

```bash
pnpm install
pnpm agent:demo
```

Example:

```text
You: Hello
Assistant: Hello from the scripted model.
```

The answer is deterministic and no API key or model server is needed. To run the same flow without interactive input:

```bash
printf 'Hello\n' | pnpm agent:demo
```

## Development

```bash
pnpm --filter @chat-ollama/agent-cli test
pnpm --filter @chat-ollama/agent-cli typecheck
```

This increment reads exactly one prompt. A continuous REPL, `/new`, `/exit`, and Ctrl+C request cancellation belong to the later continuous-session increment.
