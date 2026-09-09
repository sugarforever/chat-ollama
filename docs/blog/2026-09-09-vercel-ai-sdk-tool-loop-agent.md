---
title: 用 ToolLoopAgent 给 ChatOllama 加入第一个工具
date: 2026-09-09
---

我会利用 `ChatOllama` 这次 Runtime 改造，梳理 `ToolLoopAgent` 如何把普通的流式回答变成多步工具调用：模型先决定调用工具，Runtime 校验并执行，再把结果交给下一次模型请求，最终回答仍然按 token 流式显示。整个示例离线运行，不需要付费 API，期望对大家有所帮助。

## 从一次模型请求开始

改造前的 Runtime 直接调用 `streamText`。它把 Session 历史交给模型，遍历 `textStream`，再把完整文本写成 assistant message。这条路径适合普通问答，却没有地方容纳工具调用与工具结果。

AI SDK 7 的 `ToolLoopAgent` 已经负责多步循环。Runtime 只需要提供模型、工具和终止条件：

```ts
const agent = new ToolLoopAgent({
  model,
  tools,
  stopWhen: stepCountIs(4),
});

const result = await agent.stream({ messages, abortSignal });
```

这里没有额外的 `while`。第一步出现工具结果后，`ToolLoopAgent` 会把 assistant tool call 与 tool message 一起放进下一次模型请求；模型返回普通文本或达到终止条件时，循环结束。

## 工具只有一种输入

这次只加入 `getCurrentUtcTime`。它没有文件、网络和进程权限，输入也刻意限制为一个字面量：

```ts
const getCurrentUtcTime = tool({
  description: 'Return the current time as an ISO 8601 UTC timestamp.',
  inputSchema: z.object({
    timezone: z.literal('UTC'),
  }),
  execute: async () => now().toISOString(),
});
```

模型如果提交 `Europe/Dublin`，schema 校验会在执行前失败。测试还会注入固定的 `now`，因此输出永远是 `2026-09-09T12:00:00.000Z`。这个注入点不进入公共 API，只用来让离线演示和测试可复现。

工具数量保持为一个也很重要。此时需要验证的是 Runtime 边界和终止语义，而不是提前设计插件系统。

## Runtime 拥有自己的事件

AI SDK 的 `fullStream` 会出现 `start-step`、`tool-call`、`tool-result`、`text-delta` 和 `finish-step`。这些对象适合 SDK 内部处理，但 CLI 不应该依赖它们。否则 AI SDK 升级一次，终端层也要跟着理解 provider metadata、动态工具和其他细节。

Runtime 因此立即完成转换：

- `start-step` 变成 `step.started`
- `tool-call` 变成 `tool.started`
- `tool-result` 变成 `tool.completed`
- `tool-error` 变成 `tool.failed`
- `text-delta` 仍然变成 `model.delta`
- `finish-step` 变成 `step.completed`

公共对象只包含字符串、数字和 ChatOllama 自己的结构。工具调用与结果共享 `callId` 和 `toolName`，Session 里也保存同样的两个字段。这样既能恢复展示顺序，也能确定某个结果属于哪次调用。

Session 内部另外保留 AI SDK 的 model messages。下一轮用户输入需要完整的模型上下文，但这份内部历史不会通过 `getSnapshot()` 暴露。公共快照只返回 user、tool call、tool result 和最终 assistant 四类 item。

## 每条失败路径都有终点

工具循环最危险的问题不是工具报错，而是报错之后不知道是否继续。这里给每种情况规定了单一结果：

- 未知工具或参数错误：发出经过清理的 `run.failed`，`prompt()` 以 `Model request failed` 拒绝
- 工具执行抛错：保存带相同 `callId` 的失败结果，但只公开 `Tool execution failed`
- 用户取消：发出 `run.cancelled`，不保存部分回答
- 连续四步仍然只调用工具：发出 `run.stopped`，原因是 `step-limit`

这些路径都不会补写一个空的 assistant message。只有模型真正完成最终文本后，Session 才加入 assistant item 并发出 `run.completed`。

## 终端只消费公共协议

plain CLI 把 step 和 tool lifecycle 写到 stderr，把最终模型文本写到 stdout，因此脚本仍然可以单独处理回答。pi-tui 则通过 transcript 和 status 组件更新画面，没有直接向 terminal 写工具文本。

后一个约束专门保护 Editor。模型流式输出期间，用户可以提前输入下一条问题；工具事件到来时，未提交文本和焦点都不能丢失。虚拟终端测试会先输入 `unfinished`，再发送 tool result，最后确认这段文字仍在编辑器中。

## 离线跑一遍

仓库内的演示使用两个 `MockLanguageModelV3` stream。第一个返回工具调用，第二个收到工具结果后返回最终文本：

```bash
pnpm install --frozen-lockfile
pnpm agent:tool-loop-demo
```

核心输出如下：

```text
[step 1] started
[tool getCurrentUtcTime] running {"timezone":"UTC"}
[tool getCurrentUtcTime] completed 2026-09-09T12:00:00.000Z
[step 1] completed: tool-calls
[step 2] started
The current UTC time is 2026-09-09T12:00:00.000Z.
[step 2] completed: stop
```

这条命令执行的就是 Runtime 中的 `ToolLoopAgent` 和真实工具定义，不是另写一套演示循环。固定时间让输出便于复制和核对，也让两步之间的消息关联可以在测试里逐项断言。
