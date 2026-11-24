# ChatOllama Goal implementation plan

> Execute natively in this chat, task by task, as authorized by the user; create stacked PRs.

**Goal:** Turn natural-language delegations into durable, evidence-checked work.
**Architecture:** One Pi Durable harness owns Goal state, model conversations, atomic results and waits. Reuse provider adapters and startup ownership.
**Tech Stack:** SvelteKit, Node 24, Pi 1.5.2, Temporal 0.5.1, Vitest/Playwright.
**Spec:** [Adaptation design](../../proactive-goals-design.md).

## Global constraints

- Preserve all unrelated changes and the Mr On checkout; no arbitrary tools inherited by Goals.
- Pi owns task/conversation recovery. No automatic missed-period discard/backfill engine.
- Explicit authorization, budget/deadline checks and stale-generation fencing survive restart.
- Completed period does not complete weekly/maintenance Goal; artifacts alone do not prove acceptance.
- Quiet ordinary activity, evidence-grounded retrospect, concrete user decisions only.

## Review focus

- Dublin DST gap/fold and inclusive end dates (task 1).
- Pause/revoke during model generation must fence delivery (task 2).
- Reopening saved work retains period/result identity (task 2).
- No live research capability must yield a question, not invented current facts (task 2).
- HTTP retries and browser disconnects cannot duplicate work (tasks 2–3).

## Task 1 / PR 1: contracts and calendar

Files: rewrite/src/lib/goals/contracts.ts, rewrite/src/lib/server/goals/schedule.ts,
rewrite/tests/goals-contracts.spec.ts; adaptation and this plan.
Interfaces: parseGoalInput(unknown), parseAgreement(unknown), nextWindow(goalId, revision, schedule, after).
- [x] Write and run failing contract/calendar tests.
- [x] Implement strict validation and future-window calculation; no existing-work mutation.
- [x] Run pnpm check, pnpm build, pnpm test (158 tests passed); commit and create PR against main.

## Task 2 / PR 2: native Goal execution

Files: rewrite/src/lib/server/goals/{documents,runtime}.ts and tests/goals-runtime.spec.ts,
tests/fixtures/goals-child.ts. Interfaces: openGoalRuntime({file,resolveEndpoint,now?}),
create(input), list(), snapshot(id), control(id,request), close().
- [x] Write failing real-storage tests for once/weekly, verification rejection,
  standing authorization, independent goals, budgets, pause races and process restart.
- [x] Add session document families, atomic command receipts and native loop task.
- [x] Add constrained interpretation/review/work/verification/retrospect conversations,
  current-time context, owned submissions, host checks and persistent sleeps.
- [x] Validate bounded request accounting and generation fencing with real HTTP fixture.
- [x] Run check/build/full test (171 tests), then new regression cases (19 Goal tests); commit and create PR based on PR 1.

## Task 3 / PR 3: application integration

Files: startup.ts, server/api.ts, routes/api/goals/**, routes/goals/+page.svelte,
ChatNavigation.svelte, tests/goals-http.spec.ts and browser acceptance.
Interfaces: GET/POST /api/goals; GET /api/goals/:id; POST /api/goals/:id/commands.
- [ ] Write failing production-server API tests including cross-origin and duplicate commands.
- [ ] Bootstrap Goal runtime once; close it with the application. Add workbench and controls.
- [ ] Test browser creation, result read, recurring active state, pause/revoke and mobile layout.
- [ ] Run check/build/test/browser checks; record evidence, review diff and create stacked PR.

## Self-review

The product's arbitrary capabilities exceed this first text-work slice. Expose missing
capabilities explicitly; do not describe text-only completion as live research, account
actions or a fully evaluated general-purpose autonomous agent. Future tool integrations
must reuse their existing security/uncertainty guarantees rather than bypassing them.
