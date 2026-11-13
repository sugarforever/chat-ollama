# Electron desktop

The desktop app loads the production SvelteKit UI and runs the same `server.mjs`
backend with a bundled Node **24.22.2**. There is no separate desktop agent,
settings database, retrieval implementation or MCP client.

## Develop and package (macOS)

Use Node 24 and pnpm 10.8.1, from `rewrite/`:

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
# Create an unsigned local build; this is not a distributable release.
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm desktop:package
pnpm desktop:smoke
```

`desktop:prepare` builds SvelteKit, installs production dependencies into ignored
`.desktop/`, and downloads a checksum-pinned official Node distribution. Backend
files and Node live outside ASAR. The shell contains only Electron-specific code.
The macOS icon in `desktop/icon.icns` is rendered from `static/logo.svg`.
`release/` contains the application, DMG and ZIP. Packaging currently targets the
host architecture. To package the other macOS architecture, run
`pnpm build && node desktop/prepare.mjs x64` (or `arm64`), then
`pnpm exec electron-builder --config desktop/electron-builder.yml --mac --x64 --publish never`.
Do not mix architectures between preparation and packaging.

The smoke command launches the actual packaged executable, with disposable data
and local model/embedding/MCP fixtures. It needs the macOS graphical session.
Pass an executable path as its first argument to smoke a relocated package.

## Data and lifecycle

The default data directory on macOS is
`~/Library/Application Support/ChatOllama/backend`. It is independent of the app
installation and version. `CHATOLLAMA_DATA_DIR=/absolute/path` overrides it for
local development, tests or sharing with another local UI. Existing standalone
rewrite data can be used by pointing to its directory while its old server is
stopped. Legacy Nuxt/PostgreSQL data is not compatible.

The app enforces single-instance focus per data directory. Closing the last
window on macOS keeps the backend running; **Quit ChatOllama** gracefully closes
it. An app-owned backend shuts down if its launcher crashes. Quitting never
sends Stop to a conversation: it preserves the existing durable restart behavior.
If another client already owns the backend, the app attaches and does not stop
that process when quitting. If the owner quits, attached clients must reconnect
after another owner starts; there is no daemon manager or client reference count.

Every production `server.mjs` process, including standalone web mode, holds an
exclusive SQLite transaction on `.backend-lock.sqlite` before importing runtime
storage. The lock is released by the OS after a crash. The lock file must **never
be deleted** to bypass a running owner. Use a local filesystem, not a shared
network volume. Development Vite and low-level test harnesses do not implement
this production ownership contract; do not point them at live desktop data.

Quit all clients before backing up the **entire** directory, including SQLite
WAL files, uploads, credentials and session sidecars. Keep a backup before an
upgrade. Replacing the `.app` does not remove data. Schema upgrades follow the
existing rewrite rules; rollback may require restoring the backup.

## Local backend contract (desktop and future TUI)

Launch `CHATOLLAMA_LOCAL=1 DATA_DIR=/absolute/path node server.mjs` to own a shared
local backend. It binds an OS-assigned port on `127.0.0.1`. Read the owner's
0600 `DATA_DIR/backend.json` only after it appears:

```json
{"protocol":1,"origin":"http://127.0.0.1:49152","token":"<private random token>","instance":"<unique launch ID>","pid":12345}
```

- Treat this file as a credential. Never put its token in URLs, logs or UI.
- Validate protocol `1`, the exact loopback origin, and authenticated
  `GET /_desktop/health`. It returns `{protocol:1, instance}` only after runtime
  recovery and handler initialization. Match the instance to the descriptor.
- All HTTP requests require `Authorization: Bearer <token>`. Mutations also
  require `Origin: <origin>`. Existing HTTP/SSE application APIs are unchanged;
  see the main README. Protocol 1 denotes this discovery/authentication contract,
  not a promise that arbitrary old application API versions are interchangeable.
  Ship clients from a compatible application revision; reject newer discovery
  protocols instead of opening the data directory independently.
- Start another backend only if discovery is absent or stale. Ownership contention
  exits with code `75`; retry discovery while the winning process starts. Never
  infer ownership from a PID or remove a live owner's lock/descriptor.
- Send SIGTERM only to a backend you launched. An attached UI has no shutdown API.
  Launch with an IPC channel if the backend should quit when its parent dies;
  without IPC, it is a standalone process and remains running until signalled.
- Directory paths are canonicalized before acquisition, so symlink aliases share
  the same ownership guard. Different data directories are independent installs.

Normal web mode retains its existing host/port/origin behavior and does not
publish a desktop descriptor. A desktop client cannot attach to an unauthenticated
web-mode owner: stop that server and relaunch in local mode first.

## Authentication, links and external requirements

There is no workspace login. Managed local mode authenticates every request with
a random per-launch token; Electron adds it only to the exact backend origin.
The renderer has no Node integration and runs sandboxed with context isolation.
The preload exposes only opening an HTTP(S) link in the system browser. Remote
pages and unsafe URL schemes cannot navigate the app window.

Provider OAuth uses the system browser. The existing pi provider runtime owns
its loopback callback listener, PKCE/state handling and device/manual-code flows.
The app does not intercept provider tokens or register a custom callback scheme.
If automatic callback is unavailable, use the provider's manual-code/device
prompt. Live provider OAuth still requires a real account and provider-specific
verification; local fixtures do not establish third-party interoperability.

Users need neither Node nor Docker to run the packaged app. Model services,
API accounts and embedding services remain external. Stdio MCP tools require
their own executable and any required runtimes on the user's machine; use absolute
command paths because Finder-launched apps may not inherit shell PATH settings.
HTTP MCP needs no local executable. Native agent shell tools retain the same
host permissions as the desktop user; this is not a tool sandbox.

## Releases and platform support

`.github/workflows/desktop.yml` validates macOS arm64 and x64 packages and uploads
build artifacts. A manual release run requires a `desktop-v*` tag. Release builds
require a Developer ID Application certificate (`CSC_LINK`, `CSC_KEY_PASSWORD`)
and Apple notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID`). The workflow enforces signing and notarization, then uploads
DMG/ZIP artifacts to a **draft** GitHub release. Review and publish it separately.
Do not treat unsigned local builds as notarized distribution evidence.

Updates are manual in this first release: quit, replace the application with the
new signed release, and reopen. No auto-updater or background installer runs.
A later updater should verify signed artifacts and preserve these data paths.
Windows/Linux are deferred: add platform runtime downloads and checksums,
packaging targets, executable paths and signing as appropriate, then run the
same lifecycle and packaged UI tests on each OS before claiming support.

## Validation evidence

Local validation on macOS arm64 with Node 24.22.2 (2026-11-13):

- `pnpm check` and `pnpm build` passed.
- `pnpm test`: 85 tests passed, including process ownership/crash recovery,
  concurrent client attachment, upload draining during quit, and fatal startup.
- `pnpm exec playwright test`: 44 browser tests passed, including desktop OAuth
  handoff and the existing provider, knowledge, MCP and durable recovery flows.
- Unsigned DMG/ZIP packaging and a relocated packaged-app smoke passed. The smoke
  uses the bundled Node executable for the backend and a stdio MCP fixture, then
  verifies chat streaming, Stop, knowledge search, window reopening and restart
  persistence. CI uploads the UI capture as `desktop-smoke-<architecture>`.

Signed/notarized distribution, live third-party OAuth accounts, and macOS x64
execution need the corresponding credentialed/target-host validation. Local
container validation was unavailable because Docker/Compose was not running.
