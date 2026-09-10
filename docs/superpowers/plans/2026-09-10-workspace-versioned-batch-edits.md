# Versioned Workspace Writes and Batch Edits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale workspace writes with SHA-256 content versions and allow one atomic `edit_file` call to apply multiple disjoint exact replacements.

**Architecture:** Compute a stable `sha256:<hex>` version from complete file bytes. Return it from reads and mutations, accept an optional `expectedVersion` on writes and edits, and validate that condition while holding the existing per-path mutation lock. Batch edits match every `oldText` against the same original content, reject missing, non-unique, or overlapping ranges, then apply replacements in descending offset order before using the existing atomic write path.

**Tech Stack:** TypeScript, Node.js crypto/fs APIs, Zod, Vercel AI SDK tools, Vitest.

**Spec:** User-approved evolution from the current workspace write/edit implementation on 2026-09-10.

## Global Constraints

- Preserve workspace confinement, final-symlink rejection, the 1,048,576-byte limit, cancellation behavior, and temporary-file plus fsync plus rename commits.
- Matching remains literal and case-sensitive; no implicit fuzzy matching.
- Existing single-edit inputs remain accepted.
- A failed condition or failed batch must leave the target unchanged.

---

### Task 1: Content versions and conditional mutation

**Files:**
- Modify: `packages/agent-runtime/src/workspace-tools.ts`
- Test: `packages/agent-runtime/src/workspace-tools.spec.ts`

**Interfaces:**
- Produces: successful `read_file`, `write_file`, and `edit_file` results containing `version: string`.
- Produces: optional `expectedVersion: string` input for `write_file` and `edit_file`.
- Produces: stable `VERSION_CONFLICT` failures.

- [x] **Step 1: Write failing tests for returned versions and stale write/edit rejection.**
- [x] **Step 2: Run the focused workspace-tool tests and verify the new assertions fail for missing schema/results.**
- [x] **Step 3: Add SHA-256 version calculation and validate `expectedVersion` inside the path lock before mutation.**
- [x] **Step 4: Run the focused tests and verify they pass.**

### Task 2: Atomic batch exact edits

**Files:**
- Modify: `packages/agent-runtime/src/workspace-tools.ts`
- Test: `packages/agent-runtime/src/workspace-tools.spec.ts`

**Interfaces:**
- Consumes: existing atomic write path and content-version helper.
- Produces: `edit_file` input accepting either legacy `oldText`/`newText` or `edits: Array<{ oldText: string; newText: string }>`.
- Produces: stable `EDIT_OVERLAP` failure for intersecting matched ranges.

- [x] **Step 1: Write failing tests for disjoint batch replacement and all-or-nothing missing, duplicate, and overlapping batches.**
- [x] **Step 2: Run the focused tests and verify failure is caused by the absent batch input contract.**
- [x] **Step 3: Match all edits against the original file, validate the full range set, and apply it in reverse offset order.**
- [x] **Step 4: Run focused tests and verify legacy and batch behavior pass.**

### Task 3: Documentation and repository verification

**Files:**
- Modify: `packages/agent-runtime/README.md`
- Test: existing package and workspace verification commands.

**Interfaces:**
- Consumes: the final tool input/result contract from Tasks 1 and 2.
- Produces: user-facing documentation of content versions, conditional writes, and batch edit rules.

- [x] **Step 1: Document the new inputs, result versions, conflict behavior, and exact batch semantics.**
- [x] **Step 2: Run package tests, typecheck, build, and relevant repository checks.**
- [x] **Step 3: Review the final diff against every global constraint and address review findings.**
