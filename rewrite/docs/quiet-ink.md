# Quiet Ink UI

The Svelte app uses the user-supplied Claude Design export as its visual reference: white content surfaces, a neutral navigation surface, ink primary actions and blue focus/citation accents. Model IDs and endpoints use the monospace stack. The existing server API and credential ownership remain unchanged.

Navigation, saving feedback, model selection and knowledge collections are focused components under `src/lib/components/`. The settings owner retains its autosave and navigation guards. The mobile conversation drawer uses Bits UI for focus handling; interface icons use Lucide and provider marks use the existing bundled LobeHub assets.

Conversation links retain `/?conversation=…`, now adding history entries for explicit switches and restoring snapshots on Back/Forward. Collection details use `/settings/knowledge?collection=…`. Existing provider/settings deep links remain unchanged. No database migration or new runtime dependency is required.

New conversation creates and opens a chat immediately using the default provider selected in Providers. There is no setup dialog, and knowledge collections and MCP servers are not selected automatically. Creation errors preserve the current conversation; repeated clicks are blocked while a request is pending.

Known limitation: removing the setup screen also removed the UI for selecting knowledge collections and MCP servers for new conversations. Existing attached conversations and API-created configurations still work. Restoring an optional attachment workflow is outstanding; browser knowledge/MCP coverage creates those configurations through fixture API calls.

The conversation model chip opens a compact Bits UI popover over the transcript. IDs are grouped by connection, the current selection is checked, and picking an ID saves it for subsequent input. The list has no search input; it shows saved and discovered model IDs. Failed saves keep the picker open and retain the confirmed selection. Escape and outside clicks dismiss the picker and restore focus to its trigger.

Validation commands from `rewrite/`:

- `pnpm test`
- `pnpm check`
- `pnpm build`
- `pnpm exec playwright test`

For focused manual review, check chat submission/streaming/Stop, model selection and Escape focus, mobile history drawer, Back/Forward and reload, provider discovery before saving, provider-default autosave, knowledge deletion cancellation, and MCP replacement acknowledgement. Check at 390px and desktop width, including long identifiers. Use disposable local fixtures and never capture real credentials.

Browser acceptance screenshots stay in ignored `test-results/`; CI uploads that directory as the `rewrite-test-results` Actions artifact on both successful and failed runs. Do not commit review screenshots to Git.

The Providers panel owns the default for new conversations. Each row has a small Set default text button with an accessible pressed state; the selected button reads Default. Selection autosaves without changing existing conversations. The former `/settings/chat` URL redirects to `/settings/providers`.

While a response runs, the composer presents an inline Responding status and a compact outlined Stop action. The disabled input stays hidden until the run ends, avoiding a grey input fill and a separate status row. Cancellation displays Stopping and prevents duplicate stop requests.

Cmd+Enter or Ctrl+Enter sends a message. Enter and Shift+Enter insert new lines. IME composition and repeated keydown events do not trigger submission; empty drafts and duplicate pending submissions are ignored. The send button exposes the shortcut in its tooltip.
