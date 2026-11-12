# Quiet Ink UI

The Svelte app uses the user-supplied Claude Design export as its visual reference: white content surfaces, a neutral navigation surface, ink primary actions and blue focus/citation accents. Model IDs and endpoints use the monospace stack. The existing server API and credential ownership remain unchanged.

Navigation, saving feedback, provider defaults and knowledge collections are focused components under `src/lib/components/`. The settings owner retains its autosave and navigation guards. The mobile conversation drawer uses Bits UI for focus handling; interface icons use Lucide and provider marks use the existing bundled LobeHub assets.

Conversation links retain `/?conversation=…`, now adding history entries for explicit switches and restoring snapshots on Back/Forward. Collection details use `/settings/knowledge?collection=…`. Existing provider/settings deep links remain unchanged. No database migration or new runtime dependency is required.

Validation commands from `rewrite/`:

- `pnpm test`
- `pnpm check`
- `pnpm build`
- `pnpm exec playwright test`

For focused manual review, check chat submission/streaming/Stop, model selection and Escape focus, mobile history drawer, Back/Forward and reload, provider discovery before saving, Chat defaults autosave, knowledge deletion cancellation, and MCP replacement acknowledgement. Check at 390px and desktop width, including long identifiers. Use disposable local fixtures and never capture real credentials.

Browser acceptance screenshots stay in ignored `test-results/`; CI uploads that directory as the `rewrite-test-results` Actions artifact on both successful and failed runs. Do not commit review screenshots to Git.
