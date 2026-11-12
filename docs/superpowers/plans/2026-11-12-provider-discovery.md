# Provider discovery flow

- Fix catalog-selected service and authentication; show API provider endpoint as text, API key as input. Keep custom endpoint configuration and subscription account login separate.
- Add authenticated server-side model discovery with bounded requests, no credential echo or cross-origin redirects. Native Anthropic/Google requests retain their wire formats; compatible providers use GET /models.
- Debounce credential edits, cancel/ignore stale requests, clear stale options on failed validation, load options only after discovery, select most recently created model when timestamps exist (otherwise preserve endpoint order). Persist discovered IDs so newer models work at runtime.
- Reuse lightweight focused browser coverage for successful/failed discovery, stale keys and fixed fields; run type check/build and affected flows. Attach screenshots to PR, never Git.

Verification: type check (0 errors/warnings), production build, six focused unit/native tests and six affected browser flows pass. One focused unit test and one browser test were added; the existing full browser suite initially passed 32 cases and identified two outdated selectors, both corrected and passing in focused checks. Final setup captures pass separately. Independent review found ambient-credential connections needed exclusion from API-key discovery; fixed. Screenshots remain ignored and are uploaded as PR attachments.
