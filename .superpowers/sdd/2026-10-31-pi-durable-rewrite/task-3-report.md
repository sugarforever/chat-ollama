# Task 3: administrator access and endpoint settings

## Scope and implementation

- Central SvelteKit hook protects application pages, APIs, SSE and future `/sources/` routes. Anonymous pages redirect to login; API/source requests return a redacted 401. Every non-safe method requires an exact same-origin Origin header, including login/logout.
- One deployment `ADMIN_PASSWORD`, salted scrypt derivation in process memory, constant-time hash comparison. No account management or password database. Opaque random 256-bit tokens; only SHA-256 token digests and 24-hour expirations persist. HttpOnly, SameSite=Strict, HTTPS Secure cookies. Logout revokes the server session. Five failed logins per client address cause a 15-minute limit.
- Minimal login page. Chat and independent embedding settings are stored in a separate small `DATA_DIR/app.sqlite`; existing pi/catalogue databases are untouched. Data directory 0700, application database 0600. Public settings contain `hasApiKey` rather than credentials; omitted keys are preserved, empty keys clear them. HTTP(S) local/custom endpoints allowed; URL credentials/query/fragment rejected.
- Real configured chat provider is refreshed at the next admitted run through the existing pi models/provider API. Active run endpoint snapshot is atomically replaced (temporary file plus rename) and retained in a server-only 0600 sidecar, loaded before resumed work. Process-global startup owner remains intact. Existing conversation configuration remains creation metadata.
- Existing HTTP tests now log in and provide cookies/Origin for commands and SSE, preserving original admission/recovery/Stop assertions. HTTP fixture explicitly supplies its trusted HTTP scheme; adapter-node defaults to HTTPS without ORIGIN or a configured protocol header. README documents setting the public ORIGIN.

## RED and investigation evidence

1. Added real HTTP tests before production implementation. Initial run: new tests failed because API access returned 200 instead of 401, and missing login/settings routes returned 404 instead of expected success/validation behavior. Existing 15 tests passed.
2. Initial implementation check found `root.configure` accepts `AgentChange` directly, not `{agent: ...}`; corrected its type-safe API call.
3. First HTTP verification returned 403 on valid login. Traced request origin through adapter-node generated handler: `get_origin` defaults scheme to `https`. The real HTTP fixture was sending `http` Origin. Configured only the fixture's trusted scheme header; production uses documented ORIGIN configuration.
4. Focused auth/settings run passed all 3 tests. Extended existing tests to revoke expired sessions and kill/restart after editing the endpoint during an active run.
5. First full-suite attempt had these five failures: `HTTP admission deduplicates, rejects conflicts and concurrent distinct requests, and survives SIGKILL`; `SSE immediately resnapshots, disconnect leaves work running and reconnect sees completion`; `Stop is repeatable and invalid or unknown IDs never create sessions`; `startup completes interrupted catalogue creation with its saved config`; and `SIGKILL resumes admitted work without resubmission and does not repeat completed work`. Four were ERR_MODULE_NOT_FOUND for build/startup.js; runtime fixture timed out under contention. Both HTTP suites build the same output in beforeAll, and a separately launched check/build also overlapped. Serialized test files to prevent the shared-output build race; subsequent API and runtime suites passed.
6. A temporary additional HTTPS-cookie fixture test failed after its fixture scheme option was removed during an active suite; removed that unneeded expansion per coordinator scope direction. Do not edit test fixtures during running verification. This was test scaffolding, not a production Secure-cookie failure.

7. Extended the existing provider test to change configuration after a failed upstream run. RED: the new endpoint saw no request (`expected 2 to be greater than 2`), because refresh only allowed `idle`. Refresh now excludes only running/cancelling, so all terminal outcomes permit the next configured run.

## Final verification

Final commands ran sequentially under Node 24.22.2 (`PATH=/tmp/pi-rewrite-node/node_modules/node/bin:$PATH`) after all production changes:

- `pnpm test`: 6 files, 18 tests passed; 28.00 seconds. Includes the 3 auth/settings tests and all 15 existing tests.
- `pnpm check`: 0 errors, 0 warnings.
- `pnpm build`: exit 0; adapter-node output and bundled startup.js produced.
- `git diff --check`: clean.

Build output retains the known legacy ancestor .nuxt/tsconfig warning and expected node:sqlite externalization notices. No failing test remains.

## Operational limits and integration notes

- Set ADMIN_PASSWORD and exact public ORIGIN. Rate limits use the adapter's client address; configure a trusted proxy address header deliberately when appropriate. In-memory login rate limits reset on process restart; sessions and settings persist.
- Secrets remain server-side on disk (settings DB and endpoint snapshots); backups require the same filesystem protection. No encryption-at-rest claim.
- Embedding settings are ready for task 4's explicit reindex workflow. Polished settings/login interfaces remain task 6.
- No legacy data migration, no pushes/PRs. Known legacy ancestor tsconfig warning remains; node:sqlite bundler externalization warnings are expected on Node24.
