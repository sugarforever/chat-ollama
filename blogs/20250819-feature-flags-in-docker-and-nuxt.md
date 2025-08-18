# Feature Flags in Docker: Why MCP_ENABLED Didn’t Work and How We Fixed It

*August 19, 2025*

Hey everyone! 👋

Following yesterday’s UI improvements post, I dug into a deployment gotcha that bit us when running in Docker: feature flags like MCP worked locally but not inside containers. Here’s what happened and how to fix it.

## 🐛 The Symptom

- **Local dev**: Setting `MCP_ENABLED=true` in `.env` made the Settings → MCP module appear.
- **Docker**: Setting `MCP_ENABLED=true` in `docker-compose.yaml` did nothing — the MCP section didn’t show up.

## 🔎 Root Cause: Nuxt runtimeConfig (build-time vs runtime)

Nuxt 3 reads `runtimeConfig` values at build time via `process.env`. At runtime, overriding them requires environment variables that map to config keys with the `NUXT_` prefix.

Our `nuxt.config.ts` had:

```ts
runtimeConfig: {
  knowledgeBaseEnabled: process.env.KNOWLEDGE_BASE_ENABLED === 'true',
  realtimeChatEnabled: process.env.REALTIME_CHAT_ENABLED === 'true',
  modelsManagementEnabled: process.env.MODELS_MANAGEMENT_ENABLED === 'true',
  mcpEnabled: process.env.MCP_ENABLED === 'true',
  public: { /* ... */ }
}
```

- In dev, `.env` is loaded before build, so `process.env.MCP_ENABLED` was true when we built → `mcpEnabled` baked as true.
- In Docker, we used a prebuilt image. Setting `MCP_ENABLED=true` at runtime does not change `runtimeConfig.mcpEnabled`. You must use `NUXT_MCP_ENABLED=true` to override at runtime.

This explains why `/api/features` logs showed `process.env.MCP_ENABLED` as true, but `useRuntimeConfig().mcpEnabled` stayed false.

## ✅ The Fix

### Option A (Recommended): Use `NUXT_`-prefixed env vars in Docker

Update `docker-compose.yaml`:

```yaml
services:
  chatollama:
    environment:
      - NUXT_MCP_ENABLED=true
      - NUXT_KNOWLEDGE_BASE_ENABLED=true
      - NUXT_REALTIME_CHAT_ENABLED=true
      - NUXT_MODELS_MANAGEMENT_ENABLED=true
```

This maps directly to `runtimeConfig` at runtime — no code changes needed.

### Option B: Support both legacy and `NUXT_` in code

If you want `MCP_ENABLED` to keep working, make `nuxt.config.ts` prefer the runtime `NUXT_` variables and fall back to the legacy ones:

```ts
runtimeConfig: {
  knowledgeBaseEnabled: process.env.NUXT_KNOWLEDGE_BASE_ENABLED === 'true' || process.env.KNOWLEDGE_BASE_ENABLED === 'true',
  realtimeChatEnabled: process.env.NUXT_REALTIME_CHAT_ENABLED === 'true' || process.env.REALTIME_CHAT_ENABLED === 'true',
  modelsManagementEnabled: process.env.NUXT_MODELS_MANAGEMENT_ENABLED === 'true' || process.env.MODELS_MANAGEMENT_ENABLED === 'true',
  mcpEnabled: process.env.NUXT_MCP_ENABLED === 'true' || process.env.MCP_ENABLED === 'true',
  public: { /* ... */ }
}
```

## 🔧 How to Verify

1. Redeploy with the updated Compose env vars.
2. Hit `/api/features` and check logs — they print both environment vars and `runtimeConfig` values.
3. Open Settings: the MCP section should appear when `mcpEnabled` is true.

## 🤔 Why it worked locally but not in Docker

- **Local**: `.env` loaded before build → `runtimeConfig` baked with your values.
- **Docker**: prebuilt image → runtime overrides require `NUXT_`-prefixed variables.

## 📝 Small DX touch-up (optional)

- Add `modelsManagementEnabled` to the `FeatureFlags` interface in `composables/useFeatures.ts` for type completeness.

## 🎯 Takeaway

Remember this rule of thumb with Nuxt 3: build-time envs bake defaults; runtime overrides need `NUXT_`. With that in place, the Settings page correctly reflects features across environments.
