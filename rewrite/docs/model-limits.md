# Per-model context and output limits

Issue #801 provides metadata and dispatch limits; compaction policy and context/usage display are separate features.

In **Settings → Providers → a connection → Model limits**, enter a model ID and its context window and maximum output token count, then click **Apply model limits**. Limits save with that connection. Repeat for each custom/discovered model ID; this does not change the connection's default model. **Use default limits** removes that model's override. Catalog models show read-only native limits. Valid overrides attached to a native catalog ID are retained but do not replace authoritative catalog metadata.

A context window and maximum output are required together, must be positive safe integers, and output must not exceed context. The API validates the entire settings update before writing providers or embeddings. Model IDs are nonempty, at most 200 characters, and contain no control characters; at most 2,000 model overrides are allowed per connection. This is configuration supplied by the operator, not a discovery of the endpoint's actual capabilities.

## Compatibility and migration

Existing rewrite settings need no manual migration. Native models continue using installed pi-ai 1.5.2 catalog metadata. Legacy, custom and uncatalogued discovered models without an override retain the previous **32,768 context / 4,096 output** defaults. Those defaults are compatibility values, not verified endpoint capabilities; configure the actual values for your model. Custom pricing remains unknown even though Pi requires zero placeholder costs on its Model object.

Settings store an optional `modelLimits` map keyed by exact model ID on each provider. Omitting the map preserves it for the same service; `{}` clears all overrides. Switching service without supplying a map resets overrides. Different connections, model IDs and case variants do not share overrides. The legacy `chat` settings alias accepts the same map for its legacy default provider. Embedding settings are independent and do not use chat limits.

```json
{
  "providers": [{
    "id": "local", "name": "Local", "service": "custom", "authMode": "none",
    "baseUrl": "http://127.0.0.1:11434/v1", "modelId": "example-small",
    "modelLimits": {
      "example-small": { "contextWindow": 8192, "maxTokens": 512 },
      "example-large": { "contextWindow": 131072, "maxTokens": 8192 }
    }
  }],
  "defaultProviderId": "local"
}
```

A new admission captures the resolved Pi Model in the existing atomic private endpoint sidecar. Editing settings or changing a conversation's selection affects the next run; queued/steered messages in an active run and recovered requests keep its captured model and limits. Old active sidecars retain their captured catalog model, or the former custom defaults if they predate captured models. No conversation rewrite or new admission mechanism is introduced. Keep backing up the whole data directory while stopped.

## Exported contract for follow-up features

- `src/lib/contracts.ts`: `ModelLimits = {contextWindow:number,maxTokens:number}` and `EffectiveModelMetadata = ModelLimits & {modelId,source,costSource,cost?}`. `source` is `catalog`, `custom`, or `default`; `costSource` is `catalog` or `unknown`. `cost` has Pi's per-million-token `input`, `output`, `cacheRead`, `cacheWrite` rates and is present only for catalog metadata.
- `src/lib/server/settings.ts`: `resolveChatEndpoint(selection)` returns the next selection's endpoint with an effective Pi `model`. `resolveModelMetadata(selection)` returns its safe effective metadata. It can throw the existing unavailable-provider/model errors.
- `src/lib/server/model-limits.ts`: `effectiveModelMetadata(endpoint)` reads an already captured endpoint, without resolving mutable settings. Use this for active runs. `DEFAULT_MODEL_LIMITS` provides the compatibility values. `validateModelLimits(value)` validates and copies a settings map.
- `ChatEndpointConfig.model` remains the authoritative captured Pi Model for runtime budgets. `modelMetadata` records provenance alongside it; metadata counts/costs are derived from `model`, not trusted duplicate fields.
- `GET /api/settings`: each public provider includes `modelLimits` when saved and `effectiveModel` for its default model. Catalog model entries also expose `contextWindow`, `maxTokens`, and native `cost`. Keys, credential environment, OAuth credentials and private endpoint details remain redacted. These additions do not add conversation usage UI.

## Dispatch

Both native stream entry points receive an output ceiling no greater than the captured model's `maxTokens`. Pi retains its native protocol, authentication, context-fit reduction and reasoning behavior. A final payload hook also caps supported token fields after adapter adjustments: OpenAI `max_tokens` / `max_completion_tokens`, Responses `max_output_tokens`, Anthropic `max_tokens`, and Gemini `generationConfig.maxOutputTokens`. This includes overriding Responses' built-in 16-token floor for an endpoint explicitly configured below it; such an endpoint must accept that value. Actual generated output can be shorter, and Pi may reduce the budget to fit input/context safety margins.

Provider APIs that deliberately omit output-budget fields (for example Codex subscription requests) keep their native supported payload shape; this feature does not invent unsupported fields or promise a remotely enforceable ceiling on those APIs. Their catalog metadata remains available for subsequent budgeting features.

Validation uses real local HTTP payloads for all four custom protocols, settings/metadata tests, and SIGKILL recovery and provider/model-switch tests. No external model credentials are required.

Verified on Node **v24.7.0** with `pnpm check` (0 errors/warnings), `pnpm build`, and `pnpm test` run serially: **24 files / 147 tests passed**. The focused Playwright test `per-model limits validate, persist separately, reset and show native catalog values` passed at desktop and mobile sizes. The reviewed change has no outstanding findings. The mobile capture is retained locally under ignored `test-results/model-limits-mobile.png`.
