# ChatOllama Agent Runtime 开发计划

## 目标

ChatOllama 将新增一个独立的 TypeScript Agent Runtime。它负责模型调用、会话生命周期和稳定事件协议，CLI、TUI 与 Web 只消费 Runtime API，不直接处理某个模型 SDK 的流事件。

Runtime 内部采用现代 Vercel AI SDK。ChatOllama 不再实现另一套 provider wire format、流式解析器或工具循环，只保留产品真正需要的配置映射、状态与客户端边界。

## 当前技术选择

- Node.js 20、TypeScript、ESM 与 pnpm workspace。
- 无工具问答使用 `streamText`。
- OpenAI 使用 `@ai-sdk/openai`。
- Ollama 第一版通过 `@ai-sdk/openai-compatible` 连接 `/v1`。
- 离线测试使用 `ai/test` 的 `MockLanguageModelV3` 与 `mockValues`，流由 `simulateReadableStream` 控制。
- 进程内事件由类型化 listener 发布，不引入外部消息中间件。

AI SDK 7 当前要求 Node.js 22，与本项目的 Node.js 20 基线不兼容。因此首个 Runtime 版本锁定仍支持 Node.js 20 的 AI SDK 6，以及共享同一 `@ai-sdk/provider` 版本的 provider packages。

## 当前目录

```text
packages/
  agent-runtime/  # AI SDK 集成、Session 状态与 Runtime 事件
```

第一个 PR 不创建 `agent-cli` 或 `agent-provider-openai`。CLI/TUI 在 #732 出现实际消费需求时再建立，provider registry 暂时留在 Runtime 内部。

## Runtime 边界

公共 Session 只提供当前问答所需的方法：

```ts
interface AgentSession {
  getSnapshot(): SessionSnapshot
  subscribe(listener: RuntimeEventListener): () => void
  prompt(input: string): Promise<void>
  cancel(): void
}
```

公共消息目前只有 `UserMessage` 与 `AssistantMessage`。流式 delta 用于观察过程，完整 AssistantMessage 才进入内存状态。公开事件为：

```text
run.started
model.started
model.delta
model.completed
run.completed
run.failed
run.cancelled
```

这些类型由 ChatOllama 定义，不包含 AI SDK UI message、stream part、provider metadata、base URL 或 API key。内部工厂把 ChatOllama 模型配置映射为 AI SDK `LanguageModel`，客户端看不到这个类型。

## 首个 Milestone

当前 Milestone 按以下顺序推进：

- #731 集成 Vercel AI SDK、模型配置与无工具流式 Runtime。
- #732 建立只消费 Runtime 消息总线的 CLI/TUI 客户端。
- #733 根据真实客户端需求增加连续 Session 与更完整的取消语义。
- #734 使用 AI SDK `ToolLoopAgent` 完成第一个工具流程。

每个 Issue 对应一个可运行的 PR，包含自动测试、复制即可执行的演示命令、必要文档和一篇中文开发文章。

## 当前不做的内容

- 不修改现有 Web Agent。
- 不实现自有 ModelProvider、ScriptedModelProvider 或 streaming parser。
- 不实现 Tools、持久化、Skills、compaction、MCP 与 Web adapter。
- 不设计未来可能需要但当前没有消费者的接口。

后续 Issue 开始前重新检查前一阶段的实际使用结果，再决定新增类型和目录。当前文档只固定已经进入 Milestone 的顺序，不提前规定工具、存储和 Web 集成的内部结构。
