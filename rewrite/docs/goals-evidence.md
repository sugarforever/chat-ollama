# Goal workbench validation

## Original workbench batch — 2026-11-24

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

The original batch had one text work stream per Goal; the November 26 extension below
adds bounded independent once-Goal items. General within-Goal work graphs,
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


## Swarm demonstration batch — 2026-11-25

The local delivery assessment, `CHATOLLAMA-DELIVERY-ASSESSMENT.md` in the
`verysmallwoods/studio/videos/20261125-antigravity-swarm` project, records the
`codex/swarm-goal-deliverables` worktree based on workbench commit `0d33b10`.
That report and its before/after JSON, preservation check, final Markdown and
recordings are external evidence; they are not copied into this repository.

- Scope: one once Goal, up to five independent supplied-text/Markdown deliveries,
  serial ready-item progress, item-specific missing input, directed replies and
  retention of accepted artifacts/evidence/result activities.
- Live runtime provider: native Google protocol, `gemini-4-hydrogen`. Three items
  succeeded and the Goal completed in that demo. Before/after comparisons retained
  the first two artifact IDs, full artifacts, evidence and result activities; the
  final result-activity count was three.
- Intervention: the third item's verifier returned invalid JSON after `artifact:7`
  was saved. A human clicked **Review now**; verification reused that artifact and
  succeeded. This is not a zero-intervention run.
- Provider boundary: Google's OpenAI-compatible path failed due to SDK request-field
  incompatibility. The native Google path succeeded; no all-provider compatibility
  claim follows. Configure the tested path with the native Google protocol/model,
  not an OpenAI-compatible endpoint. Credentials remain in server provider settings.
- The reported final Swarm checks were check/build, 25 related Vitest cases and
  five Goal browser cases. Earlier 31-file/190-case and four-browser-case runs were
  separate earlier snapshots. The assessment itself repeated check, diff whitespace
  validation and 25 related cases, but did not rerun build/browser/full tests.

## Integration review batch — 2026-11-26

The final integration adds stricter overall acceptance beyond the demo: three
accepted item artifacts are retained, then a fourth combined artifact is saved and
verified against the overall agreement. The live demo did not run this additional
verification, and has not been replayed with a live model after the review fixes.
Local fixtures establish protocol/state behavior, not live-model semantic quality.

Independent Spec and Standards reviews identified and corrected:

- Waiting items could not be reconsidered and timed waits became input blocks.
  Per-item durable review times now distinguish waiting from asking, and scheduled/
  manual review can reconsider unfinished items without repeating accepted work.
- Ambiguous unscoped answers could reset the interpretation and overwrite accepted
  state. They now return a public 409; current-question/single-waiting-item attribution
  remains supported. Completed-item answers return 409, unknown IDs return 404.
- All item successes could bypass overall criteria. A separate combined-artifact
  verification now gates Goal completion. Overall clarification is saved separately,
  then strict verification reruns without replacing accepted item artifacts/evidence.
- Reused item slugs could display a prior agreement's artifact in a new card.
  Cards now resolve only the current item's artifact ID; the browser regression edits
  an agreement and holds the new review to verify no historical output appears.

Three focused regression cases first failed against the demo implementation and
passed after fixes. Node 24.7.0 / pnpm 10.8.1 integration checks:

- `git diff --check`: passed.
- `pnpm check`: zero errors / zero warnings from svelte-check.
- `pnpm build`: passed, including the standalone startup bundle.
- Focused runtime/contracts/recovery/independent-deliverable suite: 38 passed.
- Full `pnpm test`: 31 files / 196 cases passed (203.23 seconds); HTTP rebuilds ran
  sequentially. The three production Goal HTTP cases include the public ambiguous-
  answer conflict and no state mutation on rejection.
- Full `pnpm exec playwright test`: 53 passed (1.8 minutes), including six Goal
  browser cases. It ran after all rebuilding tests, against shipped `server.mjs`.
- Updated desktop/completed and 390px captures were visually inspected in the ignored
  `test-results/goals-deliverables-{completed,mobile}.png` files. No horizontal
  overflow was observed or measured in the mobile viewport.

Both independent review axes were rechecked after fixes; no remaining actionable
findings were reported in the final focused re-review. Browser and fixture checks
must not be conflated with the historical live-model run above.

Recovery from invalid model JSON: inspect the visible diagnostic, repair provider/
model configuration if necessary, then use **Review now**. Saved work is retained;
review/verification cannot mark success without the usual exact-criterion/literal-
evidence checks. User replies supply information and never regrant revoked access.
The single-process SIGKILL tests do not establish host/power-loss or exactly-once
provider billing behavior.

No general DAG, complete cross-Goal resource optimization, live web/knowledge access,
external accounts or push delivery is added. Long-running real-model weekly behavior,
Windows/Linux/Docker, physical phones, real cross-version user database migrations
and installer upgrades remain unverified. Optional additive document fields and the
old-mode fixture regressions are not evidence of those broader deployment claims.

## PR stack status checked — 2026-11-26

#809 (foundation, base main), #810 (runtime, base foundation), and #812 (workbench,
base runtime) were all OPEN with CLEAN merge state. Each had successful standalone
validation and macOS arm64/x64 packaging; draft-release jobs were skipped. This
extension is stacked on #812. No PR was merged and no release was published.


The November 26 screenshot upload check reached GitHub, but the automation browser
was signed out and could not upload PR attachments. Only the agent-created inspection
tab was closed; user tabs/windows were left open. Screenshots remain ignored locally.

## Review follow-up — 2026-11-28

Two PR review defects were reproduced before changing production code:

- The multi-deliverable selection branch returned before due retrospect handling.
  Retrospect eligibility now runs before item selection, and a waiting Goal's next
  durable wake includes its next retrospect time. Accepted item artifacts/evidence
  remain unchanged. Empty covered-history intervals advance to another sleep without
  inventing retrospective evidence or repeatedly waking at an elapsed timestamp.
- Question delivery deduplication depended on the currently selected Goal question.
  Each item now persists its last delivered question, so switching among blocked
  items and restarting does not create another delivery for the same question.
  Explicit clarification starts a new question cycle. An optional field preserves
  old document shapes; the currently published older question is retained before
  controls clear its Goal pointer.

Four added native-storage regressions cover scheduled retrospect, manual overdue
review, repeated blocked-item reviews across two restarts, and a persisted older
item without per-item delivery state followed by manual Review and reopen. The
last case was first observed failing, then passed with preservation before controls.
Both independent review axes rechecked the focused patch; no remaining actionable
findings were reported. No scheduler framework, new task kind, or unrelated artifact
refactor was introduced.

Final frozen-snapshot validation (Node 24.7.0 / pnpm 10.8.1):

- `pnpm check`: zero errors / zero warnings from svelte-check.
- `pnpm build`: passed, including the standalone startup bundle.
- Focused Goal suite: 42 passed.
- Full `pnpm test`: 31 files / 200 cases passed (253.79 seconds).
- `pnpm exec playwright test tests/goals.acceptance.ts`: six passed (18.2 seconds),
  after all rebuilding tests. The earlier full 53-case browser result remains the
  November 26 batch, rather than a full-browser rerun for this backend-only patch.
- `git diff --check`: passed. No live-model or deployment validation was added.

The original worktree's revert and unrelated uncommitted work were left intact;
these fixes were prepared separately from PR head `ae4c328` for the existing #814.
