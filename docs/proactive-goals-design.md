# Goal-driven proactive work in ChatOllama

2026-11-24. Adaptation of the user-confirmed Mr On product contract, revision 2.

## Evidence and scope

Read from the local, uncommitted Mr On checkout: GLOSSARY.md,
docs/proactive-agent-design.md, both ADRs, the November 21 implementation plan,
src/goals/prototype.goal-lifecycle.html and docs/goal-prototype-notes.md. Those
files remain untouched. The HTML has simulated tools and recovery; it proves
neither model quality nor Pi crash recovery. The source product rules are accepted;
its module layout, numerical limits and single-user engineering assumptions are
not imported as requirements.

ChatOllama origin/main b3f2535 has a SvelteKit application in rewrite/. Its README,
startup.ts, runtime/{manager,session,provider}.ts, hooks.server.ts and recovery tests
establish the following:

| Capability | Reuse / gap |
| --- | --- |
| Pi Durable, AI, Chord | Already pinned to 1.5.2; released types support task checkpoints, durable sleep, atomic documents/tasks/submissions, ownership and resume. No signal/park dependency. |
| Providers | Reuse runtimeProvider, runtimeCredentialStore and runtimeAuthContext with stored provider selection. Never copy credentials into Goal documents. |
| Deployment | Single administrator, no login, same-origin mutation fence; one process per DATA_DIR. Network access already grants application access. No invented multiuser isolation claim. |
| Background work | Existing chats survive browser disconnect and resume at startup; Goals need their own registered task kinds and storage, not a SQL job queue. |
| Tools | Chat installs CodingTools and selected MCP/knowledge. Goal work must have an explicit capability set. Existing unrestricted tools cannot be silently inherited. |
| State and output | Chat catalogue does not represent outcome agreements, periods, acceptance or retrospect. Add native Durable documents for these concepts. |
| Notifications | No external proactive subscription. Deliver persistent results/questions in the Goal workbench; ordinary reviews remain activity. External delivery is a separate capability. |

## Product model

A Goal preserves the original natural-language request, a revisable result
agreement, explicit standing authorization, limits and lifecycle. Work plans may
change within those constraints. One period succeeding completes a once Goal;
weekly and maintenance Goals remain active. Missing information blocks only the
work that needs it. Generated prose is an artifact, not acceptance evidence.

The first executable capability is analysis/writing using user-supplied text and
saved Markdown results. No URL is required. Requests requiring unavailable live
data, posting, shell or other access produce a concrete question, while authorized
independent text preparation can proceed. This is the first capability slice,
not a claim that all arbitrary goals are supported. Existing MCP/knowledge tools
can be integrated later with host-enforced grants and their uncertainty barriers.

## Durable ownership and consistency

One Goal harness at DATA_DIR/goals.sqlite owns the new state. Session-scoped document
families keep each Goal, period, artifact, activity and command receipt separately.
A bounded task checkpoint records phase, generation, conversation and submission
IDs. A task creates its owned model conversation and submits input atomically with
its checkpoint; the subsequent phase waits on that same submission. Durable handles
restart/replay. No weekday-based skip, backfill queue or generic recovery scheduler.

A Goal loop owns short-lived model conversations. A waiting/sleeping phase occupies
no model permit. The loop commits a finished period and its next durable sleep in
one transaction. It does not run under a browser chat generation, so a week-long
sleep does not make a user chat busy. Pausing/revoking first persists an invalidating
generation and desired state, then aborts old work. Every dispatch and result commit
rechecks generation, authorization, hard deadline and budget. Resume preserves
artifacts and period identity and requests normal review of current progress/time.

Global request reservations and permits live in the same Durable store. Every actual
provider attempt, including retries/recovery, is charged. Resource admission orders
eligible goals by explicit delivery deadline, priority and waiting age; unavailable
work cannot block independent goals. Limits are technical defaults, exposed for
review, not user-confirmed constants. Finite phase deadlines, request/turn ceilings
and bounded revisions prevent unbounded loops. Failures remain visible and distinct
from no_action.

A constrained model interpretation produces an agreement but never a grant. Review
can execute, wait or ask without requiring an external change. A separately scoped
verification conversation checks saved artifact content against criteria; host checks
references, versions and existence. Subjective/unverifiable results ask the user.
Retrospect reads committed work/result/verification history since its coverage cursor,
records evidence and changes the next plan; it cannot end an open Goal by itself.

## Calendar and controls

Weekly scheduling uses Temporal 0.5.1 with explicit IANA zone, ISO weekdays, local
preparation/delivery times and optional inclusive end date. Compatible DST resolution
shifts gaps and chooses earlier folds. If that collapses or reverses a particular
preparation/delivery window, return a typed ScheduleConflict for the host to
surface as a concrete user decision; never invent a later deadline or skip the period. Stable keys include Goal ID, schedule revision
and local date. Expected delivery is distinct from explicit hard expiry. Recovery
retains submitted periods even when their expected dates pass.

Commands have stable request ID + fingerprint, revision checks and atomic receipts.
Same input returns the prior result; conflicting reuse fails. Ordinary answers do
not grant permissions. Explicit pause/resume/cancel/revoke/review and agreement edits
invalidate stale model results. Outputs are inert Markdown, scoped by Goal and period.
Routine activity does not create notifications; result/question IDs deduplicate delivery.

## Delivery sequence and acceptance

1. Contracts, calendar semantics, adaptation and implementation plan.
2. Native Durable Goal loop with interpretation, review, real Markdown work,
   independent verification, periodic review/retrospect, budgets and control races.
3. Same-origin HTTP commands and Goal workbench with readable agreements, work,
   periods, evidence, questions and explicit controls; production-entrypoint tests.

Each layer is an independently reviewable PR based on its predecessor. Validate with
Node 24, pnpm check/build/test sequentially. Test actual SQLite and separate-process
SIGKILL recovery with a local HTTP provider. Fixtures establish protocol/state behavior,
not real-model quality or live sports facts. Record any remaining unsupported capability
or untested failure window explicitly. No deployment, external messages or source-project
migration is included.


## Once-Goal independent deliverables — 2026-11-26

The fourth stacked layer extends the text slice with up to five independent once-Goal
items, not a general dependency graph. A new native session document family stores
item criteria, missing inputs, state, current artifact/evidence, clarifications and
next review. Optional fields preserve the old single-output/weekly/maintain shapes.
The existing Goal task serially advances ready items; Pi Durable still owns all
submission/checkpoint/sleep/restart behavior. No application replay queue is added.

Each item is accepted independently. Only its explicit clarification changes its
pending work; ambiguous unscoped replies conflict instead of reinterpreting and
resetting previously accepted items. Resume and review reuse saved verification
artifacts. Timed waits remain distinct from user questions and retain their requested
review time. Scheduled and manual reviews reconsider unfinished items only.

Item acceptance is necessary but not sufficient: after all items succeed, a saved
combined artifact receives an independent check against every overall criterion.
Aggregate rejection preserves the accepted items and permits a separate overall
clarification followed by strict re-verification. Editing the agreement is an explicit
new interpretation; old artifacts remain historical, and cards use only the current
artifact ID so reused item slugs cannot display old output as current work.

The November 25 live Gemini demo predates these integration-review fixes. Its three
accepted item artifacts establish that demo's execution, not live-model acceptance
of the later aggregate verification. See rewrite/docs/goals-evidence.md for batch
boundaries, provider configuration, recovery intervention and final regression results.
