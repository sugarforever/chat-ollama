---
title: 给 ChatOllama Agent 加上模型发现与切换
date: 2026-09-08
---

我想让 `chatollama-agent` 启动以后就能查看和选择模型，不必每次退出程序、修改环境变量，再重新运行。这次我会围绕模型目录、凭证检测、Session 切换和终端交互，介绍这项能力在代码里的分工，以及选择结果怎样成为下次启动的默认值。

## 从环境变量走到模型目录

原来的入口只需要一个模型配置。默认连接 Ollama 的 `http://localhost:11434/v1`，模型是 `qwen3:8b`，也可以通过 `AGENT_PROVIDER` 和 `AGENT_MODEL` 显式指定。这个方式适合脚本，却没有回答交互用户最先遇到的问题：我现在能选哪些模型？

这里需要区分三个概念。catalog 记录程序认识的 provider 和一小组模型；认证检测判断对应环境变量是否配置；网络发现再补充服务实际返回的模型。目录里的“可用”只表示满足当前配置条件，并不保证账户拥有每一个模型的权限。真正发起请求时，服务端仍然可能拒绝。

Runtime 中的 `provider-catalog.ts` 维护六个 provider 的约定。OpenAI 对应 `OPENAI_API_KEY`，Anthropic 对应 `ANTHROPIC_API_KEY`，Google 优先读取 `GEMINI_API_KEY`，其次读取 `GOOGLE_GENERATIVE_AI_API_KEY`。DeepSeek 和 OpenRouter 分别使用 `DEEPSEEK_API_KEY`、`OPENROUTER_API_KEY`。Ollama 不需要远程密钥，目录来自本地服务的 `/api/tags`。

密钥只在构造实际模型配置和认证请求时使用。模型列表交给 CLI 的内容是 provider、model 和必要的 endpoint 元数据。把密钥放进列表对象会扩大它在日志、界面和配置文件中出现的机会，因此这些字段从接口上就没有进入列表。

目录也没有照搬 pi 的完整生成数据库。当前只维护少量明确的模型，后续发现的条目可以合并进来。这样做的代价是内置条目需要维护，而且某些账户可用的模型暂时不会出现在列表里；它换来的是可以直接理解和测试的配置范围。

## 网络发现可以部分失败

Ollama 必须读取实际安装的模型。机器上只有 `llama3.2` 时，不能因为源码里写着 `qwen3:8b`，就把后者标成已经安装。OpenAI 则在配置密钥后请求 models endpoint，把返回结果与内置目录合并、去重和排序。

两个请求并行执行，每个请求默认设置两秒超时。某个请求失败，只返回该 provider 的简短 warning。网络异常对象可能包含请求信息，直接打印它并不合适，所以这里使用固定的错误描述。OpenAI 发现失败时，已经由凭证启用的内置目录仍然保留；Ollama 失败也不会阻止其他 provider 出现。

如果没有任何远程密钥，本地 Ollama 也没有启动，CLI 仍然进入命令循环。此时 `/models` 说明需要配置 provider，`/exit` 仍然工作。内部保留旧的 Ollama 默认配置，只是为了兼容原有启动路径，并不把它伪装成已经发现的模型。

测试通过注入 `fetch` 提供多个本地模型、远程模型、失败和超时响应。它验证的是发现结果和错误隔离，不需要调用付费生成接口。安装产物的测试也使用同样的边界，在新进程启动前替换网络传输。

## 切换发生在 Session 内部

知道有哪些模型以后，下一步是让选择影响后续请求。我把模型切换放在 Runtime 的 `AgentSession.setModel()`，CLI 只提交选择，不直接创建 AI SDK provider。

空闲 Session 切换模型时保留结构化历史，并发布 `model.changed` 事件。下一次 `prompt()` 使用新的模型配置。活动 run 中则拒绝切换，避免一个响应生成到一半时更换 provider。这样 CLI 可以更新状态栏，其他未来的调用方也能通过同一个公共接口观察变化。

OpenAI、Anthropic 和 Google 分别使用官方 AI SDK provider adapter。Ollama、DeepSeek 和 OpenRouter 使用按 provider 配置的 OpenAI-compatible adapter。统一的是 Runtime 接口，底层请求仍按厂商协议处理。

命令处理也独立于界面。`/model <provider>/<model-id>` 只在第一个斜杠处分割，因而 `openrouter/openai/gpt-5-mini` 中后面的斜杠属于模型 ID。找不到的模型不会改变当前状态；切换成功以后才尝试写入偏好文件。写文件失败会提示用户，但本次 Session 已经完成的切换仍然有效。

## 只记住下一次的选择

保存默认模型和保存对话是两件事。这次配置文件只允许 `provider`、`model`，以及可选的 `baseURL`：

```json
{"provider":"ollama","model":"qwen3:8b","baseURL":"http://localhost:11434/v1"}
```

endpoint 只接受不含用户名、密码、查询参数和 fragment 的 HTTP(S) 地址。写入时重新构造最小对象，通过临时文件和 rename 替换原文件；支持文件权限的平台使用 `0600`。对话历史和 API Key 都不进入这个文件。

macOS 使用 `~/Library/Application Support/ChatOllama/agent.json`，Linux 使用 XDG 配置目录，没有设置时回退到 `~/.config/ChatOllama/agent.json`，Windows 使用 `%APPDATA%` 下的 `ChatOllama/agent.json`。文件不存在是正常首次启动，内容损坏或出现不允许的字段则提示并忽略。

恢复时仍要检查模型是否在当前列表中。以前选择的 provider 失去凭证，或者本地模型已经删除，就给出提示，按 provider 和 model 排序选择确定性的 fallback。不能仅凭磁盘里的旧字符串认定模型现在仍然可用。

显式环境配置继续保留优先级。`AGENT_PROVIDER` 或 `AGENT_MODEL` 高于保存选择，保存选择高于可用 fallback。只有 `AGENT_BASE_URL` 或 `AGENT_API_KEY` 时，它们覆盖启动模型的 endpoint 或认证，不改变保存的 provider/model 身份。`AGENT_API_KEY` 本身不会启用远程 catalog；目录仍依赖 provider 对应的环境变量。用户随后在界面中切换模型，则使用新条目的 endpoint 与该 provider 的认证配置。

## 终端与管道共用命令

stdin 和 stdout 都是 TTY 时，CLI 加载 `@earendil-works/pi-tui`。这里复用的是 Editor、slash-command completion、SelectList 和终端渲染能力。它没有进入 Runtime，也没有带入 pi-ai 或 pi agent runtime。

交互模式下输入 `/` 可以看到命令补全，`/models` 打开列表，用上下键移动，Enter 选择，Escape 取消。状态栏显示当前模型，流式文本进入 transcript，编辑器继续负责用户输入。测试使用 VirtualTerminal 检查实际屏幕和按键行为。

管道和 CI 则继续使用 plain line mode。它把 `/models` 输出成带编号的列表，用户输入编号选择，空行取消。`/model` 和 `/exit` 的处理逻辑与交互模式相同，输出不包含 ANSI 控制序列。

把启动和切换过程连起来看，调用关系是这样的：

```text
启动
  → 读取安全偏好
  → 发现可用模型
  → 按优先级选择默认模型
  → 创建 AgentSession
  → TTY 使用 pi-tui，pipe/CI 使用 plain mode

/models
  → command handler 校验选择
  → AgentSession.setModel()
  → 写入非秘密偏好
  → 下一次 prompt 使用新模型
```

## 为什么这样选

模型目录最先遇到的选择，是采用静态 catalog，还是每次都向 provider 请求完整列表。完全静态的实现容易测试，却无法反映 Ollama 实际安装了什么；完全动态又依赖各家是否提供稳定、语义一致的 models endpoint。首版采用“小型内置 catalog + 有选择的动态发现”：远程 provider 先通过凭证启用一组明确的文本模型，Ollama 必须查询 `/api/tags`，OpenAI 再通过 models endpoint 补充目录。这个方案没有假设所有 provider 都能用同一种方式枚举模型，也能在网络失败时保留确定的 fallback。

provider adapter 也没有强行统一。OpenAI、Anthropic 和 Google 使用 Vercel AI SDK 7 的官方 package，让鉴权、请求格式和流式协议跟随各自实现。Ollama、DeepSeek 和 OpenRouter 的接口与 OpenAI 协议兼容，使用 `@ai-sdk/openai-compatible` 可以减少重复装配，但每个 provider 仍然保留自己的名称、endpoint 和凭证规则。这样统一的是 Runtime 公共接口，不是把厂商差异藏进一个无差别配置。

终端框架比较过几条路径。Ink 需要引入 React renderer，而当前 CLI 没有 React；OpenTUI 当时要求 Node.js 26.4 以上，高于项目的 Node.js 24 基线，并带有 native runtime；Blessed 不适合作为这个新交互层的长期基础。如果继续用 readline 自己实现 Editor、命令补全、选择器和增量渲染，终端状态管理会逐渐成为另一套框架。`@earendil-works/pi-tui` 已经提供这些 primitives，也提供可替换的 Terminal abstraction，因此可以把它限制在 interactive adapter 内，不让 Runtime 跟着 TUI 设计变化。

双 adapter 并不是为了保留两套命令。TTY 和 pipe 对输出有不同要求：前者需要差量渲染与键盘交互，后者需要可以被脚本消费的稳定文本。把解析和切换行为放在共享 command handler，pi-tui 与 readline 只负责输入输出，才能避免两个入口逐渐产生不同语义。

## 这次用到的开发工具

项目基线是 Node.js 24、TypeScript ESM 和 pnpm workspace。Runtime 使用 Vercel AI SDK 7，TTY 交互层锁定 `@earendil-works/pi-tui@0.85.1`，provider package 也锁定到与 AI SDK 兼容的具体版本。依赖版本在这里不只是安装细节：CLI 最终会发布成 npm tarball，Node.js engine、ESM import 和 workspace package 的解析方式都要在安装产物里重新验证。

模型与 Session 测试使用 Vitest。网络发现通过注入 fake `fetch` 构造成功、HTTP 失败、超时、响应 body 挂起和 provider 部分失败，不连接真实付费 API。Session 测试使用 AI SDK 提供的可控模型和数据流，检查切换后的下一次请求确实使用新模型，同时仍然带着之前的结构化历史。

TTY 测试使用 `@xterm/headless@5.5.0` 实现 VirtualTerminal。这里验证的不是某个组件函数有没有被调用，而是屏幕和按键行为：输入 `/` 是否出现三个命令，上下键是否移动选择，Enter 是否确认，Escape 是否取消，模型流式输出时尚未提交的 Editor 内容是否还在。Terminal abstraction 让这些交互可以在测试进程中重复执行。

实现过程参考了本地 `pi-mono` 中的 ModelRegistry、`AgentSession.setModel()`、model listing 和 pi-tui 代码。参考重点是职责边界与已经验证过的交互 primitives，没有把 `pi-ai`、pi agent runtime 或完整生成模型库作为依赖带进项目。

开发按测试驱动方式推进。每一组行为先写失败测试，再补最小实现；完整功能通过以后，再从 npm tarball 安装到临时项目，分别调用实际 bin 和 `npx --no-install`。这一层测试可以发现源码测试看不到的问题，例如构建产物缺文件、workspace 源码被意外引用、pipe 输出混入 ANSI，以及可执行入口没有带上新命令。

这次开发也使用 Codex 组织任务。我先把 Issue 和参考实现整理成 repo-local 实施计划，再按模型发现、Session 切换、配置持久化、命令层和 TTY adapter 拆成可以独立验证的改动。每个阶段完成后由另一个 agent 只读检查 diff，最终再做一次全分支审查。这个过程找出了几个单元测试最初没有覆盖的问题，包括响应 body 挂起没有受到超时约束、保存 endpoint 与显式环境配置的优先级不一致，以及 TTY 列表没有标记当前模型。它们都先补回归测试，再进入最终提交。

## 从安装产物运行

源码测试通过以后，还要确认用户安装到的 `dist` 包含这套能力。package smoke test 为 Runtime 和 CLI 打包，在临时 npm 项目安装两个 tarball，再通过实际 bin 和 `npx --no-install` 执行模型命令。它检查列表、当前选择、切换反馈和无 ANSI 输出，也检查编译文件不再引用 workspace 源码。

本地使用时，先在一个终端运行 `ollama serve`，另一个终端安装模型并启动 CLI：

```bash
ollama pull qwen3:8b
AGENT_PROVIDER=ollama AGENT_MODEL=qwen3:8b chatollama-agent
```

如果只想检查发现与切换，可以直接使用管道：

```bash
printf '/models\n/model ollama/qwen3:8b\n/exit\n' | chatollama-agent
```

OpenAI 使用映射的环境变量，下面的占位符需要在本地换成自己的密钥：

```bash
export OPENAI_API_KEY='replace-me'
printf '/models\n/model openai/gpt-5-mini\n/exit\n' | chatollama-agent
```

这两条管道只查看和选择模型，不提交生成请求。下一次启动不再提供显式 provider/model 参数时，CLI 会尝试恢复刚保存的选择。
