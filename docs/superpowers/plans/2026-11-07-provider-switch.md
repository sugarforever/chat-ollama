# Provider and Model Switching Implementation Plan

**Goal:** Implement #778 with named providers and persistent per-conversation selections.
**Architecture:** Keep one Pi Durable core. Settings own server-only credentials; catalogue selections contain provider/model IDs. Resolve and capture credentials only for subsequent admission; recover admitted runs from their private endpoint snapshot.
**Spec:** https://github.com/sugarforever/chat-ollama/issues/778

## Constraints and review focus
- Preserve unrelated work and avoid the old CLI/runtime.
- Import legacy chat settings once and pin older conversations to that provider.
- Defaults affect creation only; edits to a selected provider apply on subsequent input.
- Missing/deleted providers fail explicitly while transcript and selection repair remain available.
- Retry IDs, concurrent admission, active-run edits, restart, and credential redaction require coverage.

## Tasks
- [x] Test and implement named provider validation, atomic save, redaction, default selection, legacy import and key preservation.
- [x] Test and implement provider/model selection command, catalogue persistence, snapshot events, admission resolution and recovery isolation.
- [x] Test and implement named provider Settings controls and conversation switcher; preserve conversation history.
- [x] Update usage/installation documentation. Run test, check, build and browser acceptance serially; review diff.

Publication: commit, push and open a PR referencing #778 after verification.
