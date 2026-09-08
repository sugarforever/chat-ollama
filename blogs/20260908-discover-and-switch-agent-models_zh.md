---
title: 让 ChatOllama Agent 自动发现并切换模型
date: 2026-09-08
---

`chatollama-agent` 最初只能在启动前读取 `AGENT_PROVIDER` 和 `AGENT_MODEL`。这对脚本很直接，但人在终端里使用时，往往还得先退出进程、改环境变量，再重新开始一段对话。

这次我会梳理模型目录怎样进入 Runtime、CLI 怎样在不接触 provider SDK 的前提下完成切换，以及默认选择为什么只保存非秘密字段。期望对大家有所帮助。

## 目录不等于模型数据库

我先研究了 `pi-mono` 的处理方式。它有一份完整的内置模型目录，再根据 provider 的认证状态过滤可用项。Session 切换模型时不会重建历史，同时把 provider 和 model 写入用户设置。

ChatOllama 首版只支持六个 provider，没有必要复制一份持续生成的大型数据库。Runtime 里保留的是一小组明确默认值：Ollama、OpenAI、Anthropic、Google Gemini、DeepSeek 和 OpenRouter 各有一个起始模型。它们解决的是确定性 fallback，不是假装掌握了 provider 的全部模型。

能从可靠 endpoint 获得目录时，发现结果会与内置项合并。Ollama 读取本机 `/api/tags`，因此 `/models` 展示的是用户真正安装的模型。OpenAI 的 `/v1/models` 也会补充当前账号可见的 ID，并对重复项去重。

## 认证只用于过滤

远程 provider 是否可用，由对应环境变量决定：

- OpenAI 使用 `OPENAI_API_KEY`
- Anthropic 使用 `ANTHROPIC_API_KEY`
- Google Gemini 使用 `GEMINI_API_KEY` 或 `GOOGLE_GENERATIVE_AI_API_KEY`
- DeepSeek 使用 `DEEPSEEK_API_KEY`
- OpenRouter 使用 `OPENROUTER_API_KEY`

这一步只回答“凭证有没有配置”，发现结果不会携带 key。网络错误也被压缩成 provider 名和固定 warning，响应正文与原始异常不会进入终端。每个请求有自己的短超时，一个 provider 失败不会中止其他目录，更不会阻止 `/exit`。

`AGENT_*` 仍然有最高优先级。自动发现改善的是交互默认值，不能破坏 CI、脚本和容器里已经存在的明确配置。

## Provider 实现留在 Runtime

CLI 看到的是 ChatOllama 自己的 `AvailableModel` 和 `ModelConfig`，不会 import AI SDK provider。OpenAI、Anthropic 与 Google Gemini 在 Runtime 内使用对应的官方 package；Ollama、DeepSeek 与 OpenRouter 则在验证接口兼容后使用 OpenAI-compatible adapter。

这个边界直接影响切换接口。CLI 找到目标项后，只调用 `session.setModel(config)`。Session 空闲时会原地替换当前模型、发布 `model.changed`，已有的 `UserMessage` 和 `AssistantMessage` 数组保持不变。下一次 `prompt()` 因而会把之前的结构化历史交给新模型。

如果一次 run 还没有结束，`setModel()` 会明确抛出 `Session has an active run`。这样一段响应不会在中途跨越两个模型，CLI 也不会把失败的选择写成下次默认值。

## 两种终端入口

`/models` 负责发现式使用：它按 provider 和 model 排序，给每一项编号，并用 `*` 标记当前选择。输入编号即可切换，直接按 Enter 会取消。

已经知道模型 ID 时，可以跳过列表：

```text
/model openrouter/openai/gpt-5-mini
```

解析时只把第一个 `/` 当作 provider 分隔符，因此 OpenRouter 这类自身包含 `/` 的模型 ID 不会被截断。无效编号或目录里不存在的 ID 都不会改变 Session。

## 默认值只记录选择

切换成功后，CLI 使用 Node.js 的平台目录写入 ChatOllama 专用 `agent.json`。文件只有 `provider`、`model`，以及本地或自定义 endpoint 确实需要的非秘密 `baseURL`。API key 始终来自当前进程环境。

写入过程先生成同目录临时文件，再通过 rename 替换目标文件，避免进程中断留下半段 JSON。读取时还会校验字段集合和 provider；损坏文件只产生提示，启动流程继续执行。

启动选择顺序因此很清楚：显式 `AGENT_*`、仍然可用的保存项、排序后的第一个可用模型，最后才是兼容旧行为的 `ollama/qwen3:8b`。即使没有远程 key，Ollama 也没有启动，CLI 仍会进入命令循环，用户可以通过 `/models` 看到下一步该配置什么。

## 从打包结果验证

单元测试里的网络发现全部使用 fake transport，不会访问付费 API。Runtime 测试还会保持第一个模型的流，验证活动 run 中切换被拒绝；完成后再切换到第二个 mock model，检查下一次请求确实包含之前的历史。

package 验收则构建 Runtime 与 CLI tarball，把它们安装到一个没有 workspace 链接的临时项目。安装后的 `chatollama-agent` 会实际执行 `/models`、`/model` 和 `/exit`。这样能同时确认目录代码进入了 `dist`，CLI 没有依赖仓库源码，模型切换也不需要真实发出一次付费请求。
