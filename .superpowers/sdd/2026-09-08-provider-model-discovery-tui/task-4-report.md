# Task 4 report: renderer-independent commands and plain mode

Implemented renderer-neutral command parsing and handling plus the readline/plain adapter.

- `/models` emits a deterministic code-unit-sorted, numbered catalog, marks the Runtime snapshot model as current, and enters one-line numeric selection mode.
- Numeric selection uses the displayed order; blank input cancels, invalid numeric/nonnumeric input remains in selection mode, and `/exit` remains available.
- `/model <provider>/<model-id>` splits only at the first slash, so provider model IDs may contain further slashes.
- Selections are validated against the current available catalog before mutation. The Runtime switches first and the injected preference writer runs only after a successful switch.
- Active-run rejection and unexpected switch failures keep the loop alive without persisting. Unexpected Runtime and preference-write error text is not echoed; a write failure leaves the successfully switched session active and reports that only the default was not saved.
- Empty catalogs provide credential-configuration guidance. Startup notices use fixed warning lines and do not prevent `/exit`.
- Plain-mode output adds no ANSI sequences and retains the existing pipe prompt/stream behavior.
- Command production code imports only Runtime public APIs, not pi-tui or AI provider packages.
- Updated the CLI test Runtime and mock example Runtime for the required `SessionSnapshot.model` and `AgentSession.setModel` interface.

TDD evidence:

1. RED: `pnpm --filter chatollama-agent exec vitest run src/commands.spec.ts` failed because `src/commands.ts` did not exist.
2. GREEN: the initial parser/handler suite passed 12 tests after the minimal command implementation.
3. RED: `pnpm --filter chatollama-agent exec vitest run src/cli.spec.ts` failed five new plain-mode cases because `/models` and `/model` were still submitted as prompts, notices were absent, empty-catalog guidance was absent, and queued selection input blocked behind a prompt.
4. GREEN: focused command/CLI coverage passed 25 tests after adapting readline mode.
5. RED/GREEN hardening: a nonnumeric selection was observed being parsed as a model prompt, then retained in selection mode; an unexpected Runtime error was observed being echoed, then replaced with stable sanitized output.
6. Interface check RED/GREEN: CLI typecheck first reported the expected Task 2 drift in `examples/mock-runtime.ts`; adding its model snapshot and switch method made typecheck pass.

Final verification:

- Focused: `pnpm --filter chatollama-agent exec vitest run src/commands.spec.ts src/cli.spec.ts` — 2 files, 26 tests passed.
- Full CLI: `pnpm --filter chatollama-agent test` — 6 files, 49 tests passed.
- Typecheck: `pnpm --filter chatollama-agent typecheck` — passed.
- Build: `pnpm --filter chatollama-agent build` — passed.
- Diff integrity: `git diff --check` — passed.
