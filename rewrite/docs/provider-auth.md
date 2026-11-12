# Model providers and account authentication

ChatOllama uses one Pi Durable kernel. Web commands for configuration, selection and authentication live in server modules; the HTTP routes only authenticate and translate those commands. A future CLI can use the same commands without owning another model runtime.

## Verified upstream versions

The previous release pins `@earendil-works/{pi-ai,pi-durable,chord}` 1.4.0. This change pins all three to 1.5.2 and esbuild to Chord's required 0.28.2. These are the **earendil-works/pi** packages, not the separately published older `@mariozechner/pi-ai` package.

Checked on 2026-11-12 against [release v1.5.2](https://github.com/earendil-works/pi/tree/v1.5.2) (`b4afdddf44e059c67ccf5097e5317d913521b470`) and official main (`822b37a27580073ff3f5d2654df6126e8a6f4383`). Main contains an unreleased Anthropic message-thread default change; we use the published release. References: [provider factories and catalogs](https://github.com/earendil-works/pi/blob/v1.5.2/packages/ai/src/providers/all.ts), [auth interaction and credential store contract](https://github.com/earendil-works/pi/blob/v1.5.2/packages/ai/src/auth/types.ts), [model dispatch and refresh](https://github.com/earendil-works/pi/blob/v1.5.2/packages/ai/src/models.ts), [Codex login/device/refresh implementation](https://github.com/earendil-works/pi/blob/v1.5.2/packages/ai/src/auth/oauth/openai-codex.ts).

The add catalog groups ChatGPT/Claude subscriptions separately from API-key providers. Service identity and endpoints come from `builtinProviders()`; choosing a catalog item fixes its service and authentication. API setup shows the endpoint and key field, then automatically tests credentials and discovers models server-side after a short debounce. Compatible providers use GET `/models`; Anthropic and Gemini use their native model-list format. OpenRouter also checks `/key`, because its model catalog is public. Requests have a timeout and never follow credential-bearing redirects.

The model selector appears only after successful discovery. Failed or superseded key checks cannot leave stale choices visible or permit Save. Models are sorted newest-first using `created` or `created_at`; if an endpoint supplies no release timestamps, its returned order is preserved. The first model is the initial default; users can choose another. Discovered IDs are saved with the connection and reused in chat selectors/runtime, including models newer than the bundled catalog. Known models retain native metadata; new IDs use conservative context/output limits until the upstream catalog includes them. Credentials are only persisted on Save. Subscription model metadata continues to come from pi-ai. Existing server-credential/cloud connections retain their prior model/auth controls. Image/classifier generation is outside this text-chat app.

## Settings navigation

Settings has separate Providers, Embeddings, Knowledge and MCP server sections. Providers open as a searchable compact list with a default badge, selected model and credential status. Open a row to edit one provider; Save preserves blank credential fields, while Cancel discards that provider draft. Connecting an account opens a centered, resizable sign-in popup (up to 520 × 720 pixels, constrained to the available screen) immediately, saves the form and automatically sends the window to the official login URL. OpenAI Codex defaults to browser login without a method-selection step. The app polls server status and updates the connection after authorization. The provider list continues synchronizing after its editor closes, and both the list and editor refresh immediately when the page regains focus or becomes visible. Polling batches are serialized for slow networks, failed reads preserve the last known status, and authentication status responses are never cached. A blocked popup keeps an explicit login link; manual redirect input and device-code fallback are available under **Having trouble signing in?**. Removing a provider preserves conversation history but requires affected conversations to select a replacement.

The add-provider catalog groups subscriptions and vendor credentials and uses the same server-provided catalog as the editor. It does not add a second provider inventory. Provider logos are locally served SVGs from LobeHub Icons, with the upstream license and source revision in `static/provider-logos/`. Radius uses its official site icon because the pinned LobeHub collection does not include it. Custom endpoints use a generic endpoint icon; recognized Ollama and LM Studio configurations use their brand logos.

## Setup

1. Open **Settings → Providers → Add provider**. Choose an account under **Subscriptions**, a native service under **Vendors**, or **Custom provider** for Ollama, LM Studio and compatible endpoints. The selected entry presets its service and authentication mode. Select a model in the individual provider editor. Mainstream services have the official endpoint preset. Providers such as Azure, Cloudflare, Vertex, Bedrock and OpenCode own endpoint construction; a blank base URL means provider-managed, not missing OpenAI configuration.
2. For simple API-key services, enter the key and save. For cloud credentials, choose **Guided credential setup** after saving. It renders pi-ai's official text, secret and method-selection prompts. Advanced provider-scoped environment JSON supports configuration such as Azure deployment mappings, Cloudflare account/gateway IDs, AWS region/profile and Google project/location/credential-file paths. Stored values are never sent back to the browser.
3. For account login, select the OAuth mode and use **Connect account**. Connecting opens the sign-in window from the click, saves the current provider form, automatically selects the Codex browser flow and navigates to official sign-in; save failures close the preparation window and stop the login request. Complete sign-in and authorization on the opened official page; the app updates the connection automatically. If the browser blocks the window, use the fallback login link. Manual redirect and device-code steps are troubleshooting options. No browser cookies are collected. Pending login has a 15-minute timeout; Cancel closes the official flow. A process restart cancels pending interaction; start login again. Completed credentials persist.
4. Select provider/model when creating a conversation, or apply a new selection inside an existing conversation. Built-in model IDs are validated against the installed official catalog. Custom endpoints permit arbitrary model IDs.

**OpenAI API key**, **OpenAI / Sign in with ChatGPT** and **OpenAI Codex / ChatGPT Plus/Pro** are separate upstream auth choices. For the Codex subscription mode, select **OpenAI Codex** and click **Connect account**. Saving, choosing browser login and opening the official page happen automatically. Device login is available under **Having trouble signing in?**. Device login works when the server's loopback callback is inaccessible from your browser. Browser login uses upstream's localhost:1455 callback and manual redirect fallback. Enabling device-code login or access to particular models depends on the account. Your own login must be completed by you on the official page; tests use synthetic token responses and do not establish paid account access.

The upstream factories expose OAuth for Anthropic, OpenAI, OpenAI Codex, GitHub Copilot, Kimi Coding, Meta, OpenRouter, Radius and xAI. Labels and subscription policies come from pi-ai. OAuth may mint an API key (OpenRouter) rather than imply a subscription. Cloud provider setup also supports AWS bearer tokens/profiles/credential chains, Google API keys/ADC/service-account files, Anthropic bearer/federated identity and deployment-provided environment credentials where supported upstream. **Server credentials** explicitly uses server environment/files; Disconnect cannot revoke deployment-managed credentials. Use a stored key/account mode to control that connection within the app.

New custom endpoints use OpenAI-compatible Chat Completions and a models endpoint; existing custom protocol configurations are preserved. Ollama and LM Studio can use Chat Completions with the local `/v1` URL. Local keyless endpoints use a non-secret placeholder if the SDK requires a key. Built-in services retain mixed-protocol dispatch and model metadata (limits, reasoning, costs, compatibility flags); selecting OpenRouter, Copilot, OpenCode or Cloudflare does not force every model through Chat Completions. OAuth uses the official service endpoint to prevent redirecting subscription tokens to a custom host.

## Persistence, switching and errors

- Credentials and endpoint snapshots reside under the private `DATA_DIR` (directory 0700, files 0600). Keep this directory private and backed up; stored secrets are not encrypted at rest.
- The persistent credential store uses serialized SQLite leases for refresh rotation across independent Models instances/bundles. Pi-ai refreshes tokens and derives request headers. Refresh failure preserves the credential for retry and returns a sanitized reconnect instruction. Upstream response bodies, access/refresh tokens and credential environment are excluded from public settings, errors and conversation projections.
- New login, explicit credential replacement or a change of service/auth mode receives a new opaque credential slot. An admitted run captures its model metadata, endpoint, protocol, key/provider environment or OAuth slot. Later selection/configuration/account changes affect subsequent input. Refresh updates that slot in place. Retired slots remain private for captured-run recovery; provider removal does not erase an admitted run's credential snapshot.
- Disconnect cancels pending login and removes the current saved connection. It does not cancel an already dispatched network request. Other captured credential slots may still serve already admitted runs. To stop a run, use Stop. Provider-side revocation is managed in the provider's account settings. Ambient AWS/ADC/role credentials remain managed by the deployment and may rotate independently.
- Missing/invalid authentication blocks a new admission with `AUTH_REQUIRED`. Provider rejection during generation yields a generic failed status; fix authentication/model settings and send a new input. Missing providers and model IDs outside both the bundled catalog and the saved discovered list fail explicitly. Already admitted request IDs stay idempotent after selection edits/deletion.
- Existing `CHAT_*`, saved settings and conversation catalogs migrate as before into `legacy` with Chat Completions; no automatic protocol change is inferred from a URL. Old endpoint JSON snapshots are still accepted. The compatibility `chat` settings alias remains available for the legacy default; native settings use the named provider array.

**Embedding scope:** knowledge indexing/search uses the separate OpenAI-compatible embedding endpoint/key/model. Chat OAuth/subscription tokens are never used for embeddings. Changing embedding configuration requires an explicit collection reindex.

## Kernel authentication protocol

Authenticated, same-origin `/api/providers/:id/auth` delegates to the kernel auth controller:

- GET: connection presence, token expiry metadata and the current sanitized login interaction.
- POST `{action:"start",type:"api_key"|"oauth"}`: begin official provider login.
- POST `{action:"answer",flowId,promptId,value}`: answer one current prompt. Secret inputs are never returned.
- POST `{action:"cancel"}` or `{action:"disconnect"}`: cancel interaction or disconnect the saved connection.

Login URLs and device user codes are intentionally shown so the owner can authorize the account. Opaque device-auth IDs, code verifiers and tokens remain server-side. In-progress interactions are memory-only; completed credentials survive process restart. Polling is an adapter detail, not another execution loop.

## Validation

Automated coverage exercises native Anthropic/Gemini wire paths, catalog metadata and service-switch isolation, real pi-ai API-key and Codex device-login flows with controlled external responses, official refresh rotation/failure, persistent store reopening, guided cloud auth, authenticated browser setup and existing SIGKILL/selection/HTTP recovery. A separate upgrade experiment created a held run with the unchanged 1.4.0 worktree, killed its process, and resumed the same SQLite data using 1.5.2 with its original model/key. The user-owned 3010 process and data were not changed.

## Audited 1.5.2 factory inventory

This reference table was generated from the pinned package factories. Runtime configuration uses those factories directly. Relative to 1.4.0, 1.5.2 adds `qwen-token-plan-individual-cn`; the installed catalog/model metadata and native protocol fixes also update.

| Service ID | Default base URL | Native chat protocols | Authentication |
|---|---|---|---|
| amazon-bedrock | Provider/model-managed | bedrock-converse-stream | API key / server credentials |
| ant-ling | https://api.ant-ling.com/v1 | openai-completions | API key / server credentials |
| anthropic | https://api.anthropic.com | anthropic-messages | API key / server credentials; Official OAuth |
| azure | Provider/model-managed | azure-openai-responses, openai-completions | API key / server credentials |
| baseten | https://inference.baseten.co/v1 | openai-completions | API key / server credentials |
| cerebras | https://api.cerebras.ai/v1 | openai-completions | API key / server credentials |
| cloudflare-ai-gateway | Provider/model-managed | anthropic-messages, openai-completions, openai-responses | API key / server credentials |
| cloudflare-workers-ai | Provider/model-managed | openai-completions | API key / server credentials |
| deepseek | https://api.deepseek.com | openai-completions | API key / server credentials |
| fireworks | https://api.fireworks.ai/inference | anthropic-messages, openai-completions | API key / server credentials |
| github-copilot | https://api.individual.githubcopilot.com | anthropic-messages, openai-completions, openai-responses | API key / server credentials; Official OAuth |
| google | https://generativelanguage.googleapis.com/v1beta | google-generative-ai | API key / server credentials |
| google-vertex | Provider/model-managed | google-vertex | API key / server credentials |
| groq | https://api.groq.com/openai/v1 | openai-completions | API key / server credentials |
| huggingface | https://router.huggingface.co/v1 | openai-completions | API key / server credentials |
| kimi-coding | https://api.kimi.com/coding/v1 | openai-completions | API key / server credentials; Official OAuth |
| meta | https://api.meta.ai/v1 | openai-responses | API key / server credentials; Official OAuth |
| minimax | https://api.minimax.io/anthropic | anthropic-messages | API key / server credentials |
| minimax-cn | https://api.minimaxi.com/anthropic | anthropic-messages | API key / server credentials |
| mistral | https://api.mistral.ai | mistral-conversations | API key / server credentials |
| moonshotai | https://api.moonshot.ai/v1 | openai-completions | API key / server credentials |
| moonshotai-cn | https://api.moonshot.cn/v1 | openai-completions | API key / server credentials |
| nvidia | https://integrate.api.nvidia.com/v1 | openai-completions | API key / server credentials |
| openai | https://api.openai.com/v1 | openai-responses | API key / server credentials; Official OAuth |
| openai-codex | https://chatgpt.com/backend-api | openai-codex-responses | Official OAuth |
| opencode | Provider/model-managed | anthropic-messages, google-generative-ai, openai-completions, openai-responses | API key / server credentials |
| opencode-go | Provider/model-managed | anthropic-messages, google-generative-ai, openai-completions, openai-responses | API key / server credentials |
| openrouter | https://openrouter.ai/api/v1 | anthropic-messages, openai-completions | API key / server credentials; Official OAuth |
| qwen-token-plan | https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1 | openai-completions | API key / server credentials |
| qwen-token-plan-cn | https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1 | openai-completions | API key / server credentials |
| qwen-token-plan-individual | https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1 | openai-completions | API key / server credentials |
| qwen-token-plan-individual-cn | https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1 | openai-completions | API key / server credentials |
| radius | Provider/model-managed | pi-messages | API key / server credentials; Official OAuth |
| together | https://api.together.ai/v1 | openai-completions | API key / server credentials |
| typesafe | Provider/model-managed | No chat API | API key / server credentials |
| vercel-ai-gateway | https://ai-gateway.vercel.sh | anthropic-messages | API key / server credentials |
| xai | https://api.x.ai/v1 | openai-responses | API key / server credentials; Official OAuth |
| xiaomi | https://api.xiaomimimo.com/v1 | openai-completions | API key / server credentials |
| xiaomi-token-plan-ams | https://token-plan-ams.xiaomimimo.com/v1 | openai-completions | API key / server credentials |
| xiaomi-token-plan-cn | https://token-plan-cn.xiaomimimo.com/v1 | openai-completions | API key / server credentials |
| xiaomi-token-plan-sgp | https://token-plan-sgp.xiaomimimo.com/v1 | openai-completions | API key / server credentials |
| zai | https://api.z.ai/api/coding/paas/v4 | openai-completions | API key / server credentials |
| zai-coding-cn | https://open.bigmodel.cn/api/coding/paas/v4 | openai-completions | API key / server credentials |
