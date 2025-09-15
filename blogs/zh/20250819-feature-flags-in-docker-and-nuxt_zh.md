# 在 Docker 中启用功能开关：为什么 MCP_ENABLED 没生效？如何修复？

*2025年8月19日*

大家好！👋

延续昨天的界面与聊天可靠性优化，今天聊一个在部署中踩到的坑：在本地开发环境里设置 `MCP_ENABLED=true` 一切正常，但在 Docker 容器中却不生效。下面是原因与解决方案。

## 🐛 现象

- **本地开发**：`.env` 中设置 `MCP_ENABLED=true`，设置页能看到「MCP」模块。
- **Docker**：`docker-compose.yaml` 中设置 `MCP_ENABLED=true`，设置页没有出现「MCP」模块。

## 🔎 根因：Nuxt runtimeConfig 的构建时 vs 运行时

Nuxt 3 的 `runtimeConfig` 会在「构建阶段」读取 `process.env`。想在「运行时」覆盖配置，需要使用带有 `NUXT_` 前缀、且能映射到配置键名的环境变量。

我们在 `nuxt.config.ts` 中是这样写的：

```ts
runtimeConfig: {
  knowledgeBaseEnabled: process.env.KNOWLEDGE_BASE_ENABLED === 'true',
  realtimeChatEnabled: process.env.REALTIME_CHAT_ENABLED === 'true',
  modelsManagementEnabled: process.env.MODELS_MANAGEMENT_ENABLED === 'true',
  mcpEnabled: process.env.MCP_ENABLED === 'true',
  public: { /* ... */ }
}
```

- 在本地开发中，`.env` 会在构建前加载，因此 `process.env.MCP_ENABLED` 在构建时就为 true → `mcpEnabled` 被“烘焙”为 true。
- 在 Docker 中，我们运行的是预构建镜像。仅在运行时设置 `MCP_ENABLED=true` 无法改变 `runtimeConfig.mcpEnabled`。必须使用 `NUXT_MCP_ENABLED=true` 才能在运行时覆盖。

这也解释了为什么 `/api/features` 的日志里 `process.env.MCP_ENABLED` 显示为 true，但 `useRuntimeConfig().mcpEnabled` 仍然是 false。

## ✅ 解决方案

### 方案 A（推荐）：在 Docker 中使用 `NUXT_` 前缀变量

修改 `docker-compose.yaml`：

```yaml
services:
  chatollama:
    environment:
      - NUXT_MCP_ENABLED=true
      - NUXT_KNOWLEDGE_BASE_ENABLED=true
      - NUXT_REALTIME_CHAT_ENABLED=true
      - NUXT_MODELS_MANAGEMENT_ENABLED=true
```

这样即可直接在运行时映射到 `runtimeConfig`，无需改代码。

### 方案 B：同时兼容旧变量与 `NUXT_`

如果希望继续兼容 `MCP_ENABLED`，可以在 `nuxt.config.ts` 中优先读取运行时的 `NUXT_` 变量，并回退到旧变量：

```ts
runtimeConfig: {
  knowledgeBaseEnabled: process.env.NUXT_KNOWLEDGE_BASE_ENABLED === 'true' || process.env.KNOWLEDGE_BASE_ENABLED === 'true',
  realtimeChatEnabled: process.env.NUXT_REALTIME_CHAT_ENABLED === 'true' || process.env.REALTIME_CHAT_ENABLED === 'true',
  modelsManagementEnabled: process.env.NUXT_MODELS_MANAGEMENT_ENABLED === 'true' || process.env.MODELS_MANAGEMENT_ENABLED === 'true',
  mcpEnabled: process.env.NUXT_MCP_ENABLED === 'true' || process.env.MCP_ENABLED === 'true',
  public: { /* ... */ }
}
```

## 🔧 验证步骤

1. 使用更新后的 Compose 环境变量重新部署。
2. 请求 `/api/features` 并查看容器日志（会打印环境变量与 `runtimeConfig` 值）。
3. 打开设置页：当 `mcpEnabled` 为 true 时，应显示「MCP」模块。

## 🤔 为什么本地可用、Docker 不行？

- **本地**：`.env` 在构建前加载 → `runtimeConfig` 在构建时就被设置为 true。
- **Docker**：使用预构建镜像 → 运行时覆盖必须使用 `NUXT_` 前缀变量。

## 📝 小的开发体验改进（可选）

- 在 `composables/useFeatures.ts` 的 `FeatureFlags` 接口中补充 `modelsManagementEnabled`，以保持类型完整。

## 🎯 总结

使用 Nuxt 3 做容器化部署时，牢记：构建时环境变量决定默认值；运行时覆盖需要使用 `NUXT_` 前缀。配置正确后，设置页的功能模块就会在所有环境中一致显示。
