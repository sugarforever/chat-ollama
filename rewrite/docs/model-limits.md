# System-managed model capabilities

Users select a connection and model. Context capacity and maximum supported output are managed by the application, with no token-limit controls in Settings.

Native models use the installed Pi catalog unchanged. For legacy, custom, or uncatalogued discovered models, deployments can supply `model-capabilities.json` in `DATA_DIR` (default `data/`). Entries are keyed by connection ID, then exact model ID:

```json
{
  "legacy": {
    "local-model": { "contextWindow": 32768, "maxTokens": 8192 }
  },
  "my-local-connection": {
    "coding-model": { "contextWindow": 131072, "maxTokens": 16384 }
  }
}
```

Connection IDs are available from `GET /api/settings`. Native catalog entries remain authoritative even if the file includes matching IDs. Different connections can describe different server allocations for the same model ID. The file is read when resolving a new run; browser settings never write it. Replace it atomically when updating a running deployment.

Both capacities must be positive safe integers, and maximum output must fit within context. Invalid configuration fails explicitly rather than silently using defaults. A missing file or model entry preserves the existing custom-model compatibility values: **32,768 context / 4,096 output tokens**. These are unverified fallback values. Configure the actual inference server capacity; declaring context here does not allocate server memory. No database migration is needed.

## Generation and recovery

ChatOllama supplies the resolved Pi Model and leaves generation limits to Pi's adapters. There is no additional application output cap or payload rewriting. Pi normally derives a request budget from the model's maximum output and available context, with provider-specific reasoning adjustments. Adapters that omit an explicit output field, including Codex subscription requests, keep that behavior.

Capabilities describe one model generation, not a preferred answer length or a whole coding-task budget. A coding task can span many requests and file edits. Tool-output budgets, compaction, and usage UI remain separate features.

The existing private endpoint snapshot captures the resolved model and provenance on admission. Active and recovered runs retain their captured metadata after configuration changes or provider/model switches; later runs resolve the current configuration. Older snapshots keep their existing model or compatibility fallback.

## Safe metadata contract

`resolveModelMetadata(selection)` in `src/lib/server/settings.ts` returns metadata for the next run. `effectiveModelMetadata(endpoint)` in `src/lib/server/model-limits.ts` reads an already captured endpoint without consulting mutable configuration. The captured `endpoint.model` supplies runtime capacities.

`GET /api/settings` exposes `effectiveModel` for each connection's default model, plus catalog capabilities. Metadata includes `modelId`, `contextWindow`, `maxTokens`, `source` (`catalog`, `config`, or `default`), and `costSource` (`catalog` or `unknown`). Catalog pricing uses Pi's per-million-token rates. Custom pricing is unknown; zero costs on Pi's required Model object are placeholders. Credentials and private runtime snapshots are redacted. Settings writes do not accept model-capability overrides.
