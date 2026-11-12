# ChatOllama Claude Design implementation plan

Goal: Apply the supplied Quiet Ink design to the Svelte application while retaining the real backend, routing, autosave, credential verification and account authorization.

Design references: user-supplied Main.dc.html, chatollama.css and 72 PNG exports. The prototype is a visual reference; its simulated APIs and proposed routes do not override existing application contracts.

Architecture: Keep state and network operations in their existing owners. Extract navigation and saving feedback where responsibilities are shared. Use existing shadcn-svelte primitives, Bits UI for modal focus handling, Lucide icons and bundled LobeHub logos. Do not copy prototype fixture data or dependencies into the app.

- [x] Establish Quiet Ink tokens and responsive layout styles; keep settings readable at 390px and wide screens.
- [x] Extract chat navigation with a mobile drawer, semantic conversation links, and a compact header/composer.
- [x] Extract settings navigation and save feedback; apply focused provider and settings layouts.
- [x] Simplify login, empty and error views; preserve accessible labels, feedback and reduced motion.
- [x] Run type checks, unit/integration suite and production build. Attempt browser validation using the available browser tools; disclose any tool blocker.
- [x] Review the final diff and keep screenshots outside Git.
- [x] Commit and create a new PR with validation evidence.

Review focus: long identifiers, mobile keyboard space, dirty settings navigation, invalid credentials, popup cancellation/recovery, failed saves, tool uncertainty and explicit collection reindexing. Do not add component tests that merely assert CSS; preserve the existing behavioral tests.

Validation: 64 unit/integration tests and all 37 browser acceptance tests passed; svelte-check reported no errors or warnings; production build passed. Manual in-app browser review covered desktop/390px layouts, message streaming, history, provider discovery, saving, knowledge creation/cancel and MCP acknowledgement. Chrome automation was unavailable.
