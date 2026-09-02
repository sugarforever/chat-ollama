# 20260903 - 从脚本模型开始搭建 ChatOllama Agent Runtime

我开始为 ChatOllama 建设一套可以独立运行的 Agent Runtime。第一个版本没有连接 OpenAI、Ollama 或其他真实模型，而是先实现了 `ScriptedModelProvider`：它按预先给定的文本片段返回回答，让 Runtime、事件订阅和命令行呈现可以在离线环境中一起运行。期望这次实现对准备拆分 Agent 核心与界面的开发者有所帮助。

## 第一个版本先解决什么

ChatOllama 已经有 Web Agent，但现有实现会在 Nuxt API 中同时装配模型、MCP、Skills 和文件系统。新 Runtime 的目标不是立即替换这条路径，而是先建立一组可以离开页面独立工作的边界。

这次只增加两个 workspace 包：

```text
packages/
  agent-runtime/
  agent-cli/
```

`agent-runtime` 只依赖 TypeScript 和 Node.js 标准能力。它不知道 Nuxt、Vue、LangChain、`deepagents`，也不导入任何具体模型 SDK。`agent-cli` 则是一个单独的客户端，它用 Node.js `readline/promises` 读取一条输入，再订阅 Runtime 事件，把模型输出写到终端。

根目录只负责 pnpm workspace、统一测试命令和类型检查。代码留在各自的包中，后续接入真实模型时，可以新增 provider 包，而不必把供应商 SDK 放进 Runtime。

## 事件和历史不是一回事

这次实现中，Session 历史只有两种结构化消息：

```ts
type AgentItem =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
```

模型流式返回的 delta 不会逐段写进历史。它们通过 `model.delta` 事件交给 CLI；等一次输出完整结束后，Runtime 才创建一条 AssistantMessage。这样一来，终端可以立即显示增量文本，后续模型看到的历史仍然是完整消息。

一次成功问答的事件顺序如下：

```text
run.started
model.started
model.delta
model.completed
run.completed
```

订阅接口返回一个取消订阅函数。当前实现是进程内的类型化 listener 集合，没有消息中间件、事件重放、topic 或跨进程协议。等 Web 客户端真正接入时，再把同一组 Runtime 事件转换成适合网络传输的格式。

## 为什么先使用脚本模型

如果第一个测试就连接在线模型，失败可能来自网络、密钥、模型服务或流式协议，很难快速判断 Runtime 自身是否正确。`ScriptedModelProvider` 接收一组固定片段，按照相同顺序输出，因此测试可以直接断言事件顺序和最终历史。

```ts
const session = new Session(new ScriptedModelProvider({
  chunks: ['Hello ', 'from ', 'the scripted model.'],
}))

session.subscribe(event => {
  if (event.type === 'model.delta') {
    process.stdout.write(event.delta)
  }
})

await session.prompt('Hello')
```

同一个 provider 还支持为片段设置短暂延迟，用来测试运行中的取消。Session 使用 `AbortController` 把信号传给 provider。取消后发布 `run.cancelled`，已经输出的片段不会拼成一条不完整的 AssistantMessage。provider 抛出其他错误时，Runtime 发布 `run.failed`，并把原始错误继续交给调用者处理。

## 用失败测试确定接口

实现过程按三个小的 TDD 循环推进。

第一个失败测试描述成功路径：输入一条 UserMessage 后，测试要求收到固定顺序的生命周期事件，并在历史中看到完整的 UserMessage 和 AssistantMessage。第二组测试分别中途取消脚本流、让 provider 主动抛错，用来确定两个终态以及历史写入时机。第三个测试使用真实的内存输入输出流运行 `readline/promises`，断言 CLI 最终呈现的文本。

这些测试都不需要 mock 模型 SDK。测试所依赖的 `ScriptedModelProvider` 本身就是 Runtime 提供的确定性测试工具，CLI 测试也会经过真实的 Session 和事件订阅。

## 在终端运行

准备 Node.js 20 或更新版本以及 pnpm，在仓库根目录执行：

```bash
pnpm install
pnpm agent:demo
```

输入一条消息后可以看到：

```text
You: Hello
Assistant: Hello from the scripted model.
```

也可以用一条命令完成非交互演示：

```bash
printf 'Hello\n' | pnpm agent:demo
```

测试和类型检查使用下面两条命令：

```bash
pnpm test:agent
pnpm typecheck:agent
```

这个 CLI 读取一条消息后就会退出。连续问答、`/new`、`/exit` 和 Ctrl+C 后继续提问会在后续 Issue 中实现；真实模型、Tools、持久化、完整 TUI 和 Web 接入也没有进入本次改动。当前这两个包只负责把一次确定的模型问答运行起来，并把每一层的职责留在自己的目录中。
