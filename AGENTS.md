# Repository Guidelines

## Primary Application: SvelteKit
- The SvelteKit application in `rewrite/` is the primary, actively developed app. Default all application features, fixes, UI changes, and runtime work to `rewrite/` unless the user explicitly requests the legacy Nuxt app.
- Run application commands from `rewrite/`, which has its own package manifest, workspace boundary, and lockfile. Use Node 24 and follow `rewrite/README.md` for setup and deployment.
- Routes and HTTP handlers live in `rewrite/src/routes/`; shared UI and contracts live in `rewrite/src/lib/`; server logic, SQLite storage, knowledge retrieval, MCP integration, and the pi durable runtime live in `rewrite/src/lib/server/`.
- Validate SvelteKit changes with `pnpm check`, `pnpm build`, and `pnpm test` from `rewrite/`. Run build and test commands sequentially because integration tests rebuild the application.
- Follow existing Svelte and TypeScript conventions. Add relevant Vitest coverage under `rewrite/tests/` and use the existing Playwright acceptance suite for browser flows when appropriate.
- The Nuxt app at the repository root is legacy. The sections marked “Legacy Nuxt” below apply only when working on that app; its Prisma, PostgreSQL, vector-store, and Vue instructions do not apply to the SvelteKit app.

## Legacy Nuxt: Project Structure & Module Organization
- `app.vue` and `layouts/` provide the Nuxt shell; route components live in `pages/` using nested folders that mirror URLs.
- Shared UI belongs in `components/`, reusable logic in `composables/`, and typed helpers in `utils/` and `types/`.
- API handlers and background work live under `server/`, while Prisma schema and migrations sit in `prisma/`. Build-managed assets stay in `assets/`; static files go in `public/`.

## Legacy Nuxt: Build, Test, and Development Commands
- `pnpm install` sets up dependencies and prepares Nuxt types.
- `pnpm dev` starts the HMR server on http://localhost:3000; ensure PostgreSQL, Ollama, and the selected vector store are running.
- `pnpm build` creates the production bundle; use `pnpm preview` for smoke tests.
- `pnpm prisma-migrate` iterates on schema changes, and `pnpm prisma-deploy` applies checked-in migrations in CI or staging.
- `pnpm migrate:sqlite-to-postgres` upgrades legacy chat data. `docker compose up` reproduces the deployment stack for end-to-end validation.

## Legacy Nuxt: Coding Style & Naming Conventions
- Follow `.editorconfig`: UTF-8, LF endings, two-space indentation; only keep trailing Markdown spaces intentionally.
- Prefer `<script setup>` with TypeScript, PascalCase component filenames, and `useFoo` naming for composables. Co-locate feature assets with their page module.
- Name server handlers descriptively (`server/api/agents/[id].post.ts`) and share request/response contracts via `zod` schemas or exported interfaces.

## Legacy Nuxt: Testing Guidelines
- No runner is bundled; when adding coverage, configure Vitest and place `.spec.ts` files under `tests/` or beside the unit, documenting the command in your PR.
- Exercise Prisma migrations against a disposable PostgreSQL instance before review and attach the generated diff.
- Verify agent flows manually via `pnpm dev` and `/agents`, and note expected tool outputs in the PR description.

## Commit & Pull Request Guidelines
- Keep commits focused with imperative subjects; reuse the `feat:`, `fix:`, and `chore:` prefixes common in history.
- Pull requests must explain context, implementation, migration steps, and manual or automated test evidence. Link issues and include UI captures for visual changes.
- Update relevant docs (`README.md`, `docs/`, locales) when behaviour or configuration shifts, and request reviewers from the owning area before merge.

## Legacy Nuxt: Agent & Security Configuration
- Copy `.env.example`, provide `ANTHROPIC_API_KEY`, and set `ACL_ENABLED=true` to restrict MCP edits in shared deployments.
- Select a vector backend via `VECTOR_STORE` and start the matching Chroma or Milvus service before seeding; never commit credentials or database dumps.

## Browser Control & PR Screenshots
- Release Chrome automation control as soon as browser work is finished, including after failures or handoffs. Leave the user's tabs and windows open unless explicitly asked to close them.
- Never stage or commit screenshots created for PR review to Git. Keep them in ignored output directories or outside the repository, upload them as attachments, and embed them in the PR description.
