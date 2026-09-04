---
title: 把 Vercel AI SDK 放进 ChatOllama Runtime
date: 2026-09-04
---

我最近开始为 ChatOllama 建立一个新的 `Agent Runtime`。第一步不是做工具调用，也不是马上做一个漂亮的终端界面，而是把模型流式调用、Session 状态和客户端事件之间的边界确定下来。这篇文章会记录第一个版本如何接入 `Vercel AI SDK`，以及测试过程中发现的一个错误日志问题。期望对大家有所帮助。

## 为什么先做 Runtime

ChatOllama 已经支持很多模型，也有现成的 Web Agent 页面。但现有能力主要装配在 Nuxt API 和界面里，模型流、会话状态与客户端显示还没有一层可以单独使用的 Runtime。

如果直接在新 CLI 里处理 AI SDK stream parts，CLI 很快就会知道 provider metadata、工具事件和 SDK 类型。以后再做 TUI 或 Web adapter，同样的转换还要重复一次。SDK 升级时，几个客户端也会一起变化。

这次先建立 `packages/agent-runtime`。AI SDK 可以留在包内，但包外只看到 ChatOllama 自己定义的消息、Session snapshot 和 RuntimeEvent。

## 版本选择

仓库原来依赖 `ai@2.2.37`，业务源码里没有直接 import。升级看起来只是改一个版本号，实际还要同时考虑 Node.js 基线和 provider ABI。

开发时 npm registry 中最新的 AI SDK 7 要求 Node.js 22，而 ChatOllama 当前的 Runtime 目标是 Node.js 20。因此我没有直接追最新 major，而是锁定以下版本：

```text
ai@6.0.276
@ai-sdk/openai@3.0.107
@ai-sdk/openai-compatible@2.0.74
```

这三个版本都支持 Node.js 20，并共同解析到 `@ai-sdk/provider@3.0.15`。`zod` 也升级到 provider packages 声明支持的 `3.25.76`。这样既完成了现代 AI SDK 的迁移，也没有悄悄抬高项目运行环境。

## 模型配置停在哪里

Runtime 对外接收两种配置。OpenAI 需要 model 和可选的 apiKey，OpenAI-compatible 还需要 baseURL，并允许设置 provider name。

```ts
type ModelConfig =
  | {
      provider: 'openai'
      model: string
      apiKey?: string
      baseURL?: string
    }
  | {
      provider: 'openai-compatible'
      name?: string
      model: string
      apiKey?: string
      baseURL: string
    }
```

内部 registry 分别调用 `createOpenAI` 与 `createOpenAICompatible`，返回 AI SDK 的 LanguageModel。这个返回类型没有从 package index 导出，AgentSession 也不接收 LanguageModel。正常调用者只需要 `createAgentSession({ model: config })`。

`model.started` 事件只保留 provider 与 model 两个字段。apiKey 和 baseURL 不会进入事件，也不会出现在 Session snapshot 里。

## streamText 之后的事件

无工具阶段只需要一次模型请求。Session 把自己的 UserMessage 转成 AI SDK ModelMessage，调用 `streamText`，然后遍历 `textStream`：

```ts
const result = streamText({
  model,
  messages,
  abortSignal,
  onError: ({ error }) => {
    streamError = error
  },
})

for await (const delta of result.textStream) {
  publish({ type: 'model.delta', runId, delta })
}
```

每段文本立刻变成 `model.delta`。只有流完整结束后，Session 才把拼好的 AssistantMessage 写进内存，然后发布 `model.completed` 与 `run.completed`。取消或失败时，已经收到的半段回答不会混进后续历史。

这个版本只允许一个 active run。第二个 prompt 不会替换第一个 run 的 AbortController，也不会把第二条 UserMessage 写进历史。连续会话和更完整的排队策略属于后续 Issue，这里没有提前增加队列抽象。

## 测试发现的日志问题

离线测试使用 `ai/test` 提供的 `MockLanguageModelV3`、`mockValues` 和 `simulateReadableStream`。测试可以精确控制两个 delta 的顺序，也可以在第一段文本前插入延迟，稳定覆盖取消和并发调用。

错误测试第一次运行时，provider 抛出的原始错误直接出现在 Vitest stderr 中。原因不是 Runtime 主动打印，而是 `streamText` 的默认 `onError` 会调用 `console.error(error)`。如果上游错误碰巧带有请求凭据，Runtime 事件虽然安全，日志仍然可能泄漏。

因此 Session 显式提供了 `onError`，只在内部记录这次流失败，不调用默认 logger。对外事件与 `prompt()` 的拒绝都使用固定消息 `Model request failed`，不附带原始 error cause。测试中的哨兵 key 随后不会再出现在事件、stdout 或 stderr。

## 本地运行

默认示例使用 MockLanguageModel，不访问网络：

```bash
pnpm install
pnpm agent:example
```

输出来自两个 `model.delta`：

```text
Hello from the mock model.
```

使用 OpenAI 时，通过环境变量切换 provider：

```bash
AGENT_PROVIDER=openai \
OPENAI_API_KEY='replace-me' \
AGENT_MODEL='gpt-5-mini' \
AGENT_PROMPT='Reply with exactly: OpenAI smoke test passed.' \
pnpm agent:example
```

Ollama 则使用官方支持的 OpenAI-compatible `/v1` 端点：

```bash
ollama pull qwen3:8b

AGENT_PROVIDER=ollama \
AGENT_BASE_URL='http://localhost:11434/v1' \
AGENT_API_KEY='ollama' \
AGENT_MODEL='qwen3:8b' \
AGENT_PROMPT='Reply with exactly: Ollama smoke test passed.' \
pnpm agent:example
```

`ollama` 这个 key 只是兼容 OpenAI client 的占位值，本地 Ollama 会忽略它。两个在线 smoke test 共用同一个 Runtime，没有另一套 provider adapter 或流式解析代码。

## 验收命令

这一阶段使用以下命令检查 Runtime 与原有 ChatOllama 应用：

```bash
pnpm test:agent
pnpm typecheck:agent
pnpm build
pnpm agent:example
git diff --check origin/main
```

在 Node.js 20.20.2 下，当前 4 个测试文件中的 15 个测试通过，Runtime typecheck、完整 Nuxt build、离线示例和 diff check 也都通过。build 仍会显示仓库原有的 Browserslist、bundle size 与 import 警告，本次没有顺手修改这些不属于 Runtime 的问题。

工具调用、ToolLoopAgent、CLI/TUI、持久化、Skills、compaction、MCP 与 Web 集成都没有进入这个 PR。下一步做客户端时，它只需要订阅这里的 RuntimeEvent，不需要了解 AI SDK 的 stream parts。
