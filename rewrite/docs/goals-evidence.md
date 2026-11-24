# Goal workbench validation — 2026-11-24

This validates the first supplied-text/Markdown capability slice. It does not claim
real-model content quality, live data access, arbitrary capability graphs, external
notifications, or host/power-loss recovery. The original Mr On HTML is a logic
simulation and was not used as recovery evidence.

## Execution evidence

Local Node 24.7.0, pnpm 10.8.1, real Pi Durable/AI/Chord 1.5.2 and SQLite:

- `pnpm check`: 0 errors, 0 warnings.
- `pnpm build`: passed, including the standalone startup bundle.
- `pnpm test`: 30 files, 178 tests passed. HTTP tests rebuild serially.
- `pnpm exec playwright test`: 50 tests passed against the shipped server.mjs.
- Goal-specific real-storage tests cover strict inputs and calendar dates, Dublin
  DST gaps/folds and collapsed-window decisions, once completion, weekly continuation,
  current-time reviews, evidence-based retrospect, persistent budgets, in-flight pause,
  revocation, bounded revision and phase deadlines, missing capabilities and clarification.
- Two isolated child-process tests SIGKILL during work generation or verification,
  then reopen the same SQLite file without resubmission. One visible result remains;
  a further restart does not repeat completed work. Unfinished model requests may be
  charged/executed again; no exactly-once billing guarantee is asserted.
- Production HTTP tests exercise same-origin rejection, strict principal-free input,
  stable command receipts, request conflicts, stale revisions, scoped artifact downloads
  and credential redaction.
- Browser tests exercise actual creation and saved result reading, pause/reload,
  390px layout without horizontal overflow, dropped successful command responses,
  and switching Goals while a command is delayed without losing another draft.

A macOS CI failure in PR #810 exposed a test waiting for interpreted schedule data
before its subsequent review had committed the actual wake time. A held-review
fixture reproduces the original assertion deterministically; the corrected test
explicitly distinguishes interpreted and scheduled state and waits for the committed
window. The fix is in the runtime PR, rather than relying on a later stacked PR.

## Review and limits

Independent Standards/Spec reviews identified and corrected ownership-safe permit
release, schedule clarification reconciliation, delivery-aware ordering, obsolete
provider cleanup, failed-bootstrap cleanup, command response identity and draft
isolation, and closing every owner when a prior cleanup fails.

Unanswered questions keep a native durable review wake and repeated questions do
not create repeated delivery records. Completed preparation remains accepted while
its weekly schedule is unresolved, including across repeated daily wakes. Retrospect consumes actual recorded work or
failure evidence. A collapsed DST window remains a concrete decision even after its
date passes, rather than silently moving to a later period. Hard limits and revoked
permission remain host-enforced across recovery.

The first slice has one text work stream per Goal. General within-Goal work graphs,
scoped knowledge/MCP capabilities, resource events, question expiry and external
push delivery remain explicit extensions. Default request limits are engineering
parameters; passing protocol fixtures is not evidence that a live model will infer
all user intent or judge subjective/factual quality correctly.

## Screenshots

Desktop and mobile captures are produced by `tests/goals.acceptance.ts` into ignored
`rewrite/test-results/goals-{desktop,mobile}.png`; they are not staged or committed.
They were visually inspected. Uploading PR attachments was unavailable: Chrome
DevTools could not attach to its existing profile, and the desktop browser connector
reported that browser attachment requires a network policy and a newer Codex client.
No user tab/window was closed and no screenshot was committed as a workaround.
