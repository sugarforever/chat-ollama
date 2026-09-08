# Task 3 report: safe preferences and startup resolution

Implemented CLI-owned model preference persistence and startup selection.

- Preferences use ChatOllama-specific locations: macOS Application Support, Windows APPDATA (with the roaming fallback), and XDG/home config paths on Linux and other platforms.
- Saved JSON is schema-validated, contains only provider/model/safe base URL metadata, rejects secret-bearing URL components, and reports a fixed warning that never echoes file content.
- Writes create the parent directory, write a `0600` sibling temporary file, and atomically rename it into place.
- Startup selection precedence is explicit `AGENT_PROVIDER`/`AGENT_MODEL`, a still-available saved model, sorted discovered models, then the legacy Ollama `qwen3:8b` fallback. Stale settings report a sanitized notice.
- Model configuration uses only public Runtime exports, including `createModelConfig`.

TDD evidence:

1. RED: `pnpm --filter chatollama-agent exec vitest run src/preferences.spec.ts src/config.spec.ts` failed because the preferences module and `resolveStartupModel` export were missing; it also showed the old Ollama config shape and provider coverage were insufficient.
2. GREEN: the focused suite passed with 17 tests.
3. A review-found prototype-key provider case (`AGENT_PROVIDER=toString`) was added as a RED test, then fixed with `Object.hasOwn`; the focused suite and production build passed again.

Verification:

- `pnpm --filter chatollama-agent test` passed: 5 files, 28 tests.
- `pnpm --filter chatollama-agent build` passed.
- `pnpm --filter chatollama-agent typecheck` remains blocked by existing runtime-interface drift outside this task: `examples/mock-runtime.ts` and `src/cli.spec.ts` lack the Runtime Task 2 `AgentSession.setModel` and `SessionSnapshot.model` members. The changed production sources are typechecked by the successful build.

## Fix round 1

- Replaced stale-preference notices with fixed text, so no persisted provider/model/base URL value can be echoed at startup.
- Replaced locale-sensitive fallback ordering with explicit code-unit comparison for provider and model strings.
- RED: `pnpm --filter chatollama-agent exec vitest run src/config.spec.ts` failed three assertions: stale values appeared in notices and locale sorting selected `apple` before `Zebra`.
- GREEN: `pnpm --filter chatollama-agent exec vitest run src/preferences.spec.ts src/config.spec.ts` passed: 19 tests.
- `pnpm --filter chatollama-agent test` passed: 5 files, 30 tests.
- `pnpm --filter chatollama-agent build` passed.
- `pnpm --filter chatollama-agent typecheck` still reports only the pre-existing Runtime Task 2 interface drift in `examples/mock-runtime.ts` and `src/cli.spec.ts` (missing `setModel` and snapshot `model`).
