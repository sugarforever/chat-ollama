# Standalone rewrite

Run from this directory with Node **24.22.2 LTS** and pnpm **10.8.1**:

```sh
pnpm install
pnpm test
pnpm check
pnpm build
pnpm start
```

This folder has its own workspace boundary and lockfile; do not install the legacy Nuxt app to run it. `server.mjs` awaits runtime bootstrap before accepting HTTP, reopens every conversation SQLite file, and closes sessions on SIGTERM/SIGINT. One process must own the data directory. Set DATA_DIR (default `data`), CHAT_BASE_URL (default `http://127.0.0.1:11434/v1`), CHAT_API_KEY, CHAT_MODEL_ID, PORT and HOST. The endpoint uses OpenAI chat completions; it is not an Ollama-specific integration.

Pinned runtime: `@earendil-works/pi-durable`, `@earendil-works/pi-ai`, and `@earendil-works/chord` **1.4.0**. Upstream requires Node >=22.19.0; Node 24 is the selected supported LTS line. SvelteKit 2.49.1, Svelte 5.45.6, adapter-node 5.5.7, Vite 7.2.2, TypeScript 5.9.3, and Vitest 4.0.13 are pinned. See pnpm-lock.yaml for transitive pins.

The adapter exposes application snapshots, admission, Stop, subscriptions and close. pi types stay private. A process manager caches opening promises per conversation. Browser subscription cleanup cannot cancel agent work. SQLite WAL synchronous NORMAL protects against process crashes; no host-loss or power-loss guarantee is claimed.

The release's packaged README/types are the API reference. The moving upstream main README already describes a different watch callback. In 1.4.0, `watch.start(async (value, ops, context) => ...)` delivers committed views; `Harness.resume()` starts pending work, `root.abort()` waits for idle, and `Harness.close()` preserves pending tasks. Custom providers need the model's baseUrl as well as the provider's baseUrl. Unsafe tools interrupted mid-call produce interrupted results; only explicitly replay-safe tools rerun. Tool integration and product features arrive in subsequent tasks.

Tests use a real local HTTP model fixture, real pi SQLite storage, and separate Node processes. They verify SIGKILL recovery without resubmission, completed work staying completed, custom URL/key forwarding, concurrent independent conversations, committed watches, explicit Stop, and detached observers.
