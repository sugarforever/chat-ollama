---
title: ChatOllama Agent Runtime 的渐进式 Skills
date: 2026-09-11
---

这次我为 `ChatOllama Agent Runtime` 增加了工作区 Skills。目标很明确：Session 启动时让模型知道有哪些 Skill，但不把每份 `SKILL.md` 的正文提前放进上下文。真正需要某项能力时，模型再通过已有的 `read_file` 读取完整说明。下面我会梳理发现、上下文注入和 CLI 展示怎样连接起来。期望对大家有所帮助。

## 从固定目录开始

第一版只查看 `<workspaceRoot>/.agents/skills/*/SKILL.md`。每份文件用 YAML frontmatter 声明 `name` 和 `description`，Runtime 不扫描用户目录，也不处理安装、Marketplace 或远程来源。

范围小有一个直接好处：locator 可以稳定地写成相对 workspace root 的路径，例如 `.agents/skills/release-note/SKILL.md`。这个 locator 既出现在模型看到的 catalog 中，也能原样交给 `read_file`。按需加载因此没有第二套读取接口，路径限制仍由工作区工具负责。

## 正文不进入初始上下文

discovery 会检查文件大小，并只读取有上限的 frontmatter 区域。有效条目最终只保留三个字段：`name`、`description` 和 `locator`。Runtime 按名称与 locator 稳定排序，再生成一段简短说明。

这段说明告诉模型：任务与某个 Skill 匹配时，应先调用 `read_file` 读取对应的完整文件。Skill 正文不会保存在 descriptor 里，也不会出现在首次模型请求中。这样既保留了发现能力，也避免了尚未使用的说明持续占用上下文。

catalog 在 Session 创建时确定。运行中新增或修改 `SKILL.md` 不会悄悄改变当前会话；重启 CLI 后才会重新发现。这个行为比目录监听简单，也让一次 Session 的输入保持可复现。

## 失败条目不会阻止 Session

工作区里的文件不一定都有效。Runtime 会跳过无效 frontmatter、重复名称、超大或不可读文件，也会拒绝真实路径位于 workspace root 外的符号链接。每次跳过都会产生带稳定 code、locator 和 message 的 warning。

这些 warning 与有效 descriptors 一起进入 `AgentSession` snapshot。客户端不需要读取 Runtime 日志，更不需要重新扫描文件系统，就能观察 discovery 的结果。单个错误条目也不会阻止其他 Skill 被使用。

## CLI 只消费 snapshot

`/skills` 做的事情很少：调用 `getSnapshot()`，显示其中的名称与描述；没有条目时显示明确的空状态。CLI 不解析 YAML，也不接触 AI SDK 的 message 或 stream 类型。

这种边界让交互式 TUI 与普通管道模式共享同一条命令处理逻辑。未来如果增加其他客户端，它们也可以读取同一份 Runtime 状态，不必各自实现发现规则。

仓库里提供了一条离线演示命令：

```bash
pnpm agent:skills-demo
```

演示会创建临时 Skill，先用 `/skills` 查看 Runtime snapshot，再让 `MockLanguageModelV3` 调用真实的 `read_file`。第二个模型步骤收到完整正文后给出答案，整个过程不需要凭据或网络请求。
