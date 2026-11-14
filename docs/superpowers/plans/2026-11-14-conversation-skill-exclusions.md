# Conversation Skill Exclusions Implementation Plan

**Goal:** Keep installation global while allowing each conversation to view its skills and persist exclusions.

**Architecture:** Store optional `excludedSkillIds` in the conversation catalogue configuration. Filter global skill discovery using the current conversation configuration at each new input, preserving the existing active-run recovery snapshot. A dedicated conversation skills endpoint and compact header popover expose the inventory and save exclusions.

**Tech Stack:** SvelteKit, TypeScript, SQLite, pi durable, Vitest, Playwright.

**Spec:** User instructions in this chat: all global skills remain available by default; conversations can view and exclude/re-enable skills. No user/project scopes or selected-only installation.

## Constraints and review focus

- Existing conversations without exclusions retain all global skills; new global installs are automatically available.
- Exclusions affect only the target conversation and persist across restart.
- Existing transcript content remains; exclusions are context selection, not filesystem access controls.
- In-flight runs keep their captured context; subsequent messages use current exclusions.
- Navigation and failed saves must not corrupt a different conversation's state; support mobile, loading, empty and error states.

## Tasks

- [ ] Add failing tests for per-conversation exclusion persistence, filtered model requests, re-enable, and newly installed global skills.
- [ ] Add optional configuration field, validated manager accessors, filtered store context, and GET/PATCH conversation skills endpoint. Cover malformed input, missing IDs, same-origin mutations and default compatibility.
- [ ] Add failing browser coverage for inventory display, exclusion persistence, conversation isolation, re-enable, mobile layout, and save failure/retry.
- [ ] Implement header skill popover with checked availability controls and a global inventory link. Update documentation.
- [ ] Run check, build, test and browser acceptance sequentially. Run a dev server, verify in Chrome with learn-taste, and capture screenshots outside Git.
- [ ] Review the diff, create a PR with screenshots and validation, wait for checks, then merge when all pass.
