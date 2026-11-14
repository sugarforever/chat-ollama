# Message queue and steering implementation plan

**Goal:** Allow messages during an active response, queue them durably, and let users steer individual pending messages.

**Architecture:** Use pi durable input admission with `whenBusy: followUp`, its exported `InboxDoc`, and native boundary placement. Promote an existing inbox item to `steer` in a pi transaction; preserve its submission identity and ordering. Project the committed inbox into SSE snapshots.

**Scope:** SvelteKit app in rewrite; no dependency upgrade or second scheduler. Steering waits for pi's next boundary; Stop uses native abort and withdraws queued inputs.

- [x] Add failing runtime tests for admission, deduplication, promotion, restart and Stop; update HTTP expectations for queue admission.
- [x] Expose committed queue data and atomic, idempotent steering in the runtime and HTTP API.
- [x] Keep composer available during responses; show pending messages with Steer and steering status, retaining Stop.
- [x] Run check, build and complete tests sequentially on Node 24; exercise desktop/mobile in a dev server and capture screenshots.
- [ ] Review diff, commit, push and create a PR with attached screenshots and validation evidence.

Review focus: concurrent admissions, consumed-message steering races, retries while queued, restart before boundary, Stop with pending inputs.
