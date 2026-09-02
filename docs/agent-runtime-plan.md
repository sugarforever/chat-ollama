# ChatOllama Agent Runtime：目标、架构与开发路线图

> 文档状态：Draft for implementation handoff
> 编写日期：2026-09-01
> 目标仓库：`sugarforever/chat-ollama`
> 当前分支基线：`main@c7cca20`
> 用途：作为后续新会话创建 Issues、分支和 Pull Requests 的共同依据

## 一、项目目标

ChatOllama 当前的主体仍是一个带知识库、模型管理和 Web UI 的聊天应用。仓库也已经有一条基于 `deepagents`、LangChain、MCP 和 Skills 的 Agent 页面，但这条能力直接装配在 Nuxt API 与界面中，还不是一个边界清楚、可独立复用的 Agent Runtime。

本项目要新增一个模块化的 Agent Runtime，并逐步让它具备：

1. 连续对话和流式输出；
2. 模型—工具—环境反馈闭环；
3. Skills 的发现、选择和渐进式加载；
4. 长任务中的上下文计量与压缩；
5. 取消、错误恢复、事件观测与会话持久化；
6. 不依赖 ChatOllama Web UI，也能通过终端运行和验证；
7. 将来可作为独立 npm 包供其他应用嵌入。

一句话定义：

> ChatOllama Agent Runtime 是一个与 UI、数据库、知识库和具体模型供应商解耦的 TypeScript 任务运行时：模型提出下一步，Runtime 执行或委托执行，把环境结果写回结构化历史，再决定继续、暂停或结束。

## 二、交付方式

本项目不以“大功能完成”为交付单位，而以一个可以运行、观察和验证的小增量为交付单位。

每个实现 Issue 对应一个 Pull Request。合并请求至少包含：

- 一个边界明确、可以执行的功能增量；
- 自动测试，以及一条可以复制执行的演示命令；
- 必要的使用说明和测试证据；
- 一篇采用个人中文写作风格完成的开发笔记，记录本次设计、实现过程、具体问题和运行方式。

纯类型定义、纯目录搭建和暂时无法执行的内部接口，原则上不单独作为一次实现交付。如果某些基础工作必须先完成，应当同时提供最小可执行示例。

架构只服务当前阶段。新接口、新组件和新抽象在出现实际需求时再添加，不为了未来可能出现的功能提前设计。

## 三、非目标与边界

第一阶段不做以下工作：

- 不立即接入现有 ChatOllama Web 页面；
- 不把知识库/RAG 放进 core；它以后只是一种 context provider 或 tool；
- 不一开始就支持全部模型供应商；
- 不一开始就实现 MCP、子 Agent、审批沙箱、远程执行和多租户；
- 不把现有 `deepagents` 路径原地重构成新 core；先并行建设和验证，再迁移；
- 不为了“看起来像 TUI”过早引入大型终端 UI 框架。

这里还要区分两个概念：

- **CLI/REPL**：逐行输入、流式输出，依赖极少，适合第一个可运行版本；
- **完整 TUI**：有区域布局、快捷键、状态栏和工具面板，通常需要 Ink、Blessed 等依赖。

本路线图先交付 CLI REPL，并把交互边界设计成可替换的 event consumer；等核心事件稳定后，再决定是否升级为完整 TUI。

## 四、对当前仓库的判断

### 4.1 可以保留并复用的能力

- `server/utils/models.ts` 已积累多供应商配置经验；
- `server/utils/mcp.ts` 已有 MCP server 配置与连接逻辑；
- `server/utils/userSkills.ts` 已有用户级、项目级 Skill 目录扫描；
- `/agents` 和 `AgentChat.vue` 可在后期作为 Web adapter 的迁移对象；
- 项目已经依赖 `openai` SDK，并支持自定义 OpenAI-compatible endpoint；
- 现有数据库、鉴权和模型密钥中间件可在 Web 集成阶段通过 adapter 注入。

### 4.2 不应直接作为新 core 的基础

当前 `server/api/agents/[id].post.ts`：

- 在一次 HTTP handler 中创建 Agent、模型、MCP 连接、Skills middleware 和文件系统 backend；
- core 行为依赖 Nuxt `H3Event`、LangChain 类型和 `deepagents`；
- 使用 `FilesystemBackend({ rootDir: '/' })`，权限边界过宽；
- `recursionLimit: 50` 是框架级保护，不是我们自己定义的运行预算和停止协议；
- 流事件在 API handler 中被转换，尚未形成稳定、可复用的 Runtime 事件契约；
- 当前请求只提交本次 `prompt`，会话状态主要由外部框架或页面路径承担，缺少我们可控制的统一 session/rollout 模型。

当前 Skills 实现还会通过 `getSkillsContext()` 把所有 Skill 正文一次性拼进 instruction。这与希望采用的渐进式披露相反：启动时应先放入受预算控制的目录，只有 Skill 被明确选择或匹配时才加载正文及其 references/scripts。

因此，新 Runtime 应作为独立模块建立；现有 Agent 页面在迁移完成前保持可用，并明确标记为 legacy integration。

## 五、核心设计原则

### 5.1 Core 必须与模型 SDK 无关

`agent-runtime` 只依赖 TypeScript/Node 标准能力和少量数据校验工具。它只认识 `ModelProvider` 接口，不导入 OpenAI、Ollama、LangChain 或 Nuxt。

```ts
interface ModelProvider {
  stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelEvent>
}
```

供应商协议、鉴权、SSE 解析和 wire format 转换全部位于 adapter 中。

### 5.2 状态使用结构化 items，不以字符串拼接为中心

第一阶段只定义问答需要的消息：

```ts
type AgentItem =
  | UserMessage
  | AssistantMessage
```

工具开发开始时再加入 ToolCall 和 ToolResult；上下文压缩开始时再加入 checkpoint。模型可见历史和用于 UI 的事件是不同概念，不使用流式 delta 直接充当会话历史。

### 5.3 Runtime 通过事件暴露过程

第一阶段只发布 CLI 问答需要的事件：

```text
run.started
model.started / model.delta / model.completed
run.completed / run.failed / run.cancelled
```

工具、压缩和其他能力出现时，再增加对应事件。UI 不进入 agent loop，只提交输入、发送取消请求、订阅事件并渲染状态。

### 5.4 先保持最小边界

第一阶段只分开 Runtime、ModelProvider 和 CLI。工具、上下文管理、压缩、持久化等组件在对应功能开始开发时再提取，不提前建立空接口。

### 5.5 每一步都能被测试和替换

最重要的测试工具不是在线模型，而是 `ScriptedModelProvider`：按脚本返回文本、tool call、错误或超限响应。绝大多数 loop 测试都应离线、确定、快速。

### 5.6 事件机制只实现当前需要的范围

CLI、未来的 TUI 和 Web UI 都不参与 Agent Loop。客户端向 Session 提交用户输入，订阅 Runtime 发布的事件，并把事件呈现给用户。

第一阶段只实现进程内、类型化的订阅机制：

```ts
interface AgentSession {
  subscribe(listener: RuntimeEventListener): () => void
  prompt(input: string): Promise<void>
  cancel(): void
}
```

用户输入通过 `prompt()` 提交，Runtime 输出通过 `subscribe()` 发布。当前不引入外部消息中间件、事件重放、全局序号、复杂 topic、跨进程命令协议和多客户端权限。Web 集成出现时，再把同一组事件映射为 SSE 或其他合适的传输协议。

## 六、技术栈与模块边界

首期技术栈确定为：

| 用途 | 选择 |
|---|---|
| 编程语言 | TypeScript |
| 运行环境 | Node.js 20 |
| 模块格式 | ESM |
| 包管理 | pnpm workspace |
| 本地执行 | `tsx` |
| 类型检查 | `tsc --noEmit` |
| 测试 | Vitest |
| 模型接入 | `openai` SDK，仅用于 provider 包 |
| CLI 输入 | Node.js `readline/promises` |
| 取消 | `AbortController` |
| 事件订阅 | Runtime 内部的类型化 listener 集合 |

第一阶段不引入完整 TUI 框架、外部 message broker、通用多供应商框架和单独的构建打包工具。准备发布 npm package 时，再根据当时的发布需求选择构建方式。

仓库目前还不是 pnpm workspace。第一个架构 PR 应引入最小 workspace 配置，并采用以下目录：

```text
packages/
  agent-runtime/          # 无 UI、无 Nuxt、无具体 provider
  agent-provider-openai/  # 第一版 OpenAI-compatible adapter
  agent-cli/              # 终端 REPL，消费 runtime events
```

初期不必把每个内部概念拆成 npm 包。`agent-runtime` 内部可以保持清楚的目录边界：

```text
src/
  loop/          # run/turn 状态机与停止判定
  model/         # provider port 和统一 model events
  context/       # history、request projection、token usage
  tools/         # definitions、registry、executor、policy
  skills/        # discovery、catalog、activation
  compaction/    # trigger、selection、summary、checkpoint
  session/       # in-memory state、event log、restore
  events/        # public runtime event contract
  testing/       # scripted provider 和 fake tools
```

只有当某个子模块出现独立发布需求时，再拆包。

## 七、最小 Agent Loop 的语义

需要明确三层边界，避免后续所有“轮次”混淆：

1. **Session**：可跨多次用户输入、可保存和恢复的会话；
2. **Run**：用户提交一个任务后，直到完成、暂停、取消或失败；
3. **Model step**：一次模型请求及其产生的工具执行。

核心循环可以表达为：

```ts
while (!terminal) {
  const request = context.buildModelRequest(state)
  const response = await collect(provider.stream(request, signal))
  state.append(response.items)

  if (response.toolCalls.length > 0) {
    const results = await tools.execute(response.toolCalls, policy, signal)
    state.append(results)
    continue
  }

  if (state.hasPendingInput()) {
    state.append(state.takePendingInput())
    continue
  }

  terminal = true
}
```

正式实现还必须有：取消信号、运行步数/时间/token 预算、可分类错误、工具超时、非法 tool call 结果、事件顺序保证，以及 compaction hook。不能只写一个无上限 `while (true)`。

### 关于第一个版本

第一个版本按用户设想不支持工具，只实现连续问答。此时一次用户输入通常只触发一次模型请求，它验证的是 Runtime、Session、Provider、流事件和 CLI 这些底座；真正的模型—工具多步 Agent Loop 在下一阶段完成。文档和版本说明中不应把 v0 称为“已完成完整 Agent Loop”。

## 八、Provider 的第一版选择

### 推荐决策

- core 定义自己的 provider port；
- v0 用项目现有 `openai` SDK 实现 `agent-provider-openai`；
- adapter 支持 `apiKey`、`baseURL`、`model` 和额外 headers；
- 优先验证 OpenAI，以及提供 OpenAI-compatible endpoint 的 Ollama；
- 后续再增加 Ollama native、Anthropic 等 adapter；
- 最终如有必要，用自写 `fetch + SSE` 替换 OpenAI SDK，只影响 adapter。

### 为什么不直接依赖 pi provider 包

pi-mono 的 provider abstraction 很适合研究和借鉴，但当前 `pi-ai` 会带入 Anthropic、AWS Bedrock、Google、Mistral、OpenAI 等整套 SDK。它适合快速获得广泛 provider 覆盖，不符合本项目“先减少依赖”的首要目标。

如果后续多供应商覆盖速度比依赖体积更重要，可以新增一个可选 `agent-provider-pi`，但不应让 core 依赖它。

## 九、分阶段路线图

当前只承诺首个 Milestone 的具体 Issues。后续方向用于说明目标，不提前约定尚未需要的接口和实现细节。

### Milestone 1：可运行的 CLI Agent Runtime

首批四个实现 PR 依次交付：

1. 使用 `ScriptedModelProvider` 跑通最小 Runtime、事件订阅和 CLI 问答；
2. 接入 OpenAI-compatible 流式模型，让同一 CLI 可以使用 OpenAI 或 Ollama；
3. 根据前两个版本的实际使用补齐连续会话和取消；
4. 加入一个安全、简单的工具，让一次 run 可以包含多次 model step。

每个 PR 都必须能够独立运行，并附带测试、演示命令和开发文章。第一项交付同时建立必要的 workspace 和 package 目录，不再单独提交纯 scaffolding PR。

### 后续方向

首个 Milestone 完成后，再根据实际使用情况规划下一组 Issues。已经明确的产品方向包括：

- Session 持久化与恢复；
- Skills 渐进式加载；
- 上下文计量、工具结果裁剪和压缩；
- MCP 与更丰富的运行控制；
- 接入 ChatOllama Web；
- 新路径稳定后迁移现有 Agent 页面。

这些方向暂不定义完整公共接口、存储格式和传输协议。对应开发开始前，再结合前一阶段形成的代码和使用反馈设计。

## 十、Issue 与 PR 组织方式

GitHub Issue #730 作为 Agent Runtime 的总 Epic，记录最高层目标、边界、技术选择和开发顺序。首个 Milestone 管理当前承诺的四个实现 Issue。Epic 使用任务列表链接各个 Issue；每个实现 Issue 对应一个独立 PR。

整体计划和执行状态同时放入 [ChatOllama project](https://github.com/users/sugarforever/projects/1)。Project 用于查看 Ready、In progress、In review 和 Done 状态；Epic 与 Milestone 继续承担目标和阶段划分，详细设计保留在本文档中。

首批 Issue：

1. [#731 `feat(runtime): deliver a runnable scripted CLI conversation`](https://github.com/sugarforever/chat-ollama/issues/731)
2. [#732 `feat(provider): stream responses from an OpenAI-compatible model`](https://github.com/sugarforever/chat-ollama/issues/732)
3. [#733 `feat(cli): add continuous sessions and cancellation`](https://github.com/sugarforever/chat-ollama/issues/733)
4. [#734 `feat(runtime): complete the first tool-driven agent loop`](https://github.com/sugarforever/chat-ollama/issues/734)

暂时不创建长期 Project 看板。等并行 Issue、不同负责人或多个 Milestone 同时推进时，再引入 GitHub Project。

## 十一、测试策略与 Definition of Done

### 单元测试

- state transition 与停止判定；
- provider event → AgentItem 转换；
- tool call/result 配对；
- catalog budget、Skill 冲突与激活；
- compaction region selection 与事务提交；
- session replay。

### 集成测试

- 使用 ScriptedModelProvider 完成多步工具任务；
- 使用本地 fake streaming server 测 provider adapter；
- CLI 输入、流式输出和 Ctrl+C；
- JSONL 保存、退出、恢复；
- 压缩后继续同一 run。

### 在线 smoke tests

- OpenAI；
- Ollama 的 OpenAI-compatible endpoint；
- 这些测试默认跳过，仅在有环境变量时运行，不能成为普通 PR 的不稳定门禁。

### 每个 PR 必须提供

- 对应 Issue；
- 行为变化和明确非目标；
- 自动测试证据；
- 若改变 public contract，更新 ADR/API docs；
- 新增依赖的理由和体积/许可证说明；
- 不包含与该 Issue 无关的 Web 重构。

## 十二、安全与可靠性底线

- core 不默认获得整个文件系统访问权；
- 文件工具必须绑定显式 workspace root，并防止路径穿越和 symlink escape；
- 工具必须支持 timeout、AbortSignal 和输出大小上限；
- 环境变量默认不传给工具或子进程；
- API key 不写入 session log、RuntimeEvent 或 debug dump；
- tool error 默认可反馈给模型，runtime invariant/fatal error 才终止；
- 所有循环必须受 step、时间、token 或取消预算约束；
- compaction 不物理删除原始事件，只改变 model-visible projection；
- 未来的 shell、write、network 和 MCP 工具必须有权限/审批策略。

## 十三、从 pi-mono、Codex 和 DeepSeek Harness 借鉴什么

### 13.1 pi-mono：最值得借鉴的是可组合边界

- provider abstraction 独立于 loop；
- core loop 输出事件，TUI 是消费者；
- context transform 与 provider message conversion 分开；
- steering 和 follow-up 有不同队列语义；
- 持久化、压缩和 retry 可以在上层 session orchestration 中组织。

不照搬之处：不把 `pi-ai` 变成 core 的必选依赖；也不直接复制它对 turn 的命名。

参考基线：`pi-mono@3911d6f5cde8335c576e14051578eeffe812ed53`。

### 13.2 Codex：最值得借鉴的是生产级任务状态机

- 区分 Session、一次用户任务和单次模型请求；
- 工具结果写回结构化 history 后才开始下一次模型请求；
- pending input 在明确的 sampling 边界进入；
- 允许并行的工具可以并行，但结果与调用仍保持稳定配对；
- compaction、取消、hook、预算、持久化和恢复共同参与 run 生命周期；
- model-visible 完整历史与网络增量传输是两个不同层次；
- 当前能力/world state 与会话历史分开管理。

参考基线：`openai/codex@a63cb33e8deab97002c4ab6bb872183fbde99aa6`。

### 13.3 Codex Skills：采用渐进式披露

- discovery 时只读取 name、description 和 locator；
- catalog 有上下文预算，超限要裁剪并告警；
- 选中后才加载 `SKILL.md`；
- references、scripts、assets 再按需展开；
- 显示名不能作为唯一身份，同名时用稳定 locator 消歧；
- 当前 Skill catalog 属于能力状态，某轮注入的正文属于历史，不能混为一层。

### 13.4 DeepSeek Harness：压缩做成能力缝隙

- token meter、tool-result pruner、compactor 和 `/compact` 入口相互独立；
- 先做确定性裁剪，仍超限再调用模型摘要；
- 旧事件保留在 append-only log，checkpoint 替换当前 surface；
- 压缩提交有显式事务边界；
- 算法和阈值通过 policy/provider 替换，而不是硬编码在 loop。

这比把 `if token > limit: summarize(messages)` 直接写进主循环更容易测试和演进。

## 十四、关键架构决策摘要

| 决策 | 选择 | 理由 |
|---|---|---|
| 实现语言 | TypeScript | 与 ChatOllama、pi-mono 同生态，降低集成成本 |
| Core 依赖 | framework-free | 可独立发布、离线测试、避免 Nuxt/LangChain 锁定 |
| 首个 provider | OpenAI-compatible adapter | 复用现有 SDK，同时覆盖 OpenAI 与兼容端点 |
| 终端界面 | 先 CLI REPL，后 richer TUI | 先稳定事件与控制协议，减少 UI 依赖 |
| 历史格式 | 结构化 items + append-only events | 支持工具配对、恢复、审计和 compaction |
| 工具执行 | 首版顺序，后续策略化并行 | 优先保证确定性和错误语义 |
| Skills | catalog + on-demand activation | 避免所有正文挤占上下文 |
| Compaction | projection replacement | 保留原始日志，压缩失败可回滚 |
| Web 集成 | 最后通过 adapter 接入 | 防止 core 再次耦合页面和 Nuxt handler |
| 旧 Agent 路径 | 先并存，最后移除 | 降低迁移风险，允许对照验证 |

## 十五、后续新会话的建议起点

新会话从首个实现 Issue 开始：用 `ScriptedModelProvider` 跑通 Runtime、事件订阅和 CLI 问答。必要的 workspace、包目录、类型和测试在同一个 PR 中随可执行功能一起交付。

建议给新会话的开场指令：

> 阅读 `docs/agent-runtime-plan.md`、`AGENTS.md` 和当前实现 Issue，检查工作树，不要修改现有 Web Agent。只完成该 Issue 约定的可运行增量、测试、演示说明和开发文章，不提前实现后续能力。

## 十六、事实来源

本规划基于以下本地源码和已经完成的研究材料：

- ChatOllama `main@c7cca20`
  - `server/api/agents/[id].post.ts`
  - `server/utils/models.ts`
  - `server/utils/mcp.ts`
  - `server/utils/userSkills.ts`
  - `components/AgentChat.vue`
  - `composables/useAgentWorker.ts`
- Codex Agent Loop 源码研究：
  - `/Users/wyang14/github/verysmallwoods/studio/videos/20260830-codex-agent-loop/source-analysis.md`
- pi-mono 对比研究：
  - `/Users/wyang14/github/verysmallwoods/studio/videos/20260830-codex-agent-loop/pi-mono-comparison.md`
- Codex Skills 源码研究：
  - `/Users/wyang14/github/verysmallwoods/studio/videos/20260827-codex-skills-context/source-analysis.md`
- DeepSeek Harness compaction 研究：
  - `/Users/wyang14/github/verysmallwoods/studio/videos/20260825-deepseek-harness-context-compaction/source-analysis.md`

这些材料描述的是各自审核基线上的实现，不应被当作永恒协议。真正开发时，每个借鉴点仍需在对应 Issue 中重新核对目标依赖版本和源码。
