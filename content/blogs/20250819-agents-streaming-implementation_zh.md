---
title: 20250819 - 🧠🤖 DeepAgents 集成：AI 智能体流式实现与 UI 增强
date: 2025-08-19
slug: 20250819-agents-streaming-implementation_zh
description: "DeepAgents 是 LangChain 开源的智能体开发包，包括 Python 和 JavaScript 版本，能够创建\"深度\"智能体，具备在更长、更复杂任务上进行规划和行动的能力。该实现具有结构化流式传输、工具消息处理和国际化支持等特性，专注于创建强大的服务器端处理流式架构，提供轻量级..."
---

# 20250819 - 🧠🤖 DeepAgents 集成：AI 智能体流式实现与 UI 增强

## 概述

`DeepAgents` 是 LangChain 开源的智能体开发包，包括 Python 和 JavaScript 版本，能够创建"深度"智能体，具备在更长、更复杂任务上进行规划和行动的能力。该实现具有结构化流式传输、工具消息处理和国际化支持等特性，专注于创建强大的服务器端处理流式架构，提供轻量级的客户端体验。

昨天，我将 DeepAgents 集成到 [ChatOllama](https://github.com/sugarforever/chat-ollama) 中，为这款开源 AI 平台添加了交互式深度研究能力。本文将分享开发过程，希望对大家有所帮助。

## 关于 DeepAgents

**DeepAgents** 相比简单的 LLM 工具调用架构代表了重大进步。虽然使用 LLM 在循环中调用工具是智能体的最简单形式，但这种方法通常会产生"浅层"智能体，无法在复杂的多步骤任务上有效地规划和行动。

DeepAgents 通过实现四个关键组件来解决这一限制，使智能体真正"深度"：

1. **🎯 规划工具**：内置规划系统，帮助智能体创建和维护结构化计划
2. **🤖 子智能体**：用于特定任务和上下文隔离的专门智能体
3. **📁 文件系统访问**：用于持久状态和文档管理的模拟文件系统
4. **📝 详细提示**：基于 Claude Code 等成功应用的复杂系统提示

这种架构使智能体能够：
- 将复杂任务分解为可管理的步骤
- 在长对话中保持上下文
- 将专门工作委托给专注的子智能体
- 通过文件系统接口持久化和操作信息
- 执行复杂的研究和分析工作流

DeepAgents 方法已在"Deep Research"、"Manus"和"Claude Code"等应用中得到成功验证，我们的实现将这些能力带到了通用聊天界面中。

### 如何使用 DeepAgents

#### 安装

```bash
npm install deepagents @langchain/core langchain-mcp-adapters
```

#### 基本使用示例

以下是使用 DeepAgents 创建研究智能体的简单示例：

```python
import os
from typing import Literal
from tavily import TavilyClient
from deepagents import create_deep_agent

# 初始化搜索工具
tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def internet_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = False,
):
    """运行网络搜索"""
    return tavily_client.search(
        query,
        max_results=max_results,
        include_raw_content=include_raw_content,
        topic=topic,
    )

# 定义智能体指令
research_instructions = """你是一名专业研究员。你的工作是进行彻底的研究，然后撰写精美的报告。

你可以使用几种工具。

## `internet_search`

使用此工具为给定查询运行互联网搜索。您可以指定结果数量、主题以及是否应包含原始内容。
"""

# 创建深度智能体
agent = create_deep_agent(
    [internet_search],
    research_instructions,
)

# 调用智能体
result = agent.invoke({"messages": [{"role": "user", "content": "什么是 langgraph？"}]})
```

#### 自定义子智能体

您可以为特定任务创建专门的子智能体：

```python
# 定义评论子智能体
critique_sub_agent = {
    "name": "critique-agent",
    "description": "评论和改进研究报告",
    "prompt": "你是一个严格的编辑，为研究报告提供建设性反馈。",
    "model_settings": {
        "model": "anthropic:claude-3-5-haiku-20241022",
        "temperature": 0,
        "max_tokens": 8192
    }
}

# 创建带有子智能体的智能体
agent = create_deep_agent(
    tools=[internet_search],
    instructions="你是一名专业研究员...",
    subagents=[critique_sub_agent],
)
```

#### 使用自定义模型

```python
from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model

# 使用自定义模型如 Ollama
model = init_chat_model(
    model="ollama:gpt-oss:20b",  
)

agent = create_deep_agent(
    tools=tools,
    instructions=instructions,
    model=model,
)
```

#### MCP 集成

DeepAgents 可以与 MCP（模型上下文协议）工具配合使用：

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from deepagents import create_deep_agent

async def main():
    # 收集 MCP 工具
    mcp_client = MultiServerMCPClient(...)
    mcp_tools = await mcp_client.get_tools()

    # 使用 MCP 工具创建智能体
    agent = create_deep_agent(tools=mcp_tools, instructions="...")

    # 流式输出智能体响应
    async for chunk in agent.astream(
        {"messages": [{"role": "user", "content": "什么是 langgraph？"}]},
        stream_mode="values"
    ):
        if "messages" in chunk:
            chunk["messages"][-1].pretty_print()

asyncio.run(main())
```

## ChatOllama DeepAgents 集成实现

### 服务器端实现

我们的 ChatOllama 集成在服务器端实现了 DeepAgents，具有结构化流式传输。以下是我们创建智能体端点的方法：

#### 智能体创建 (`server/api/agents/[id].post.ts`)

```typescript
import { StructuredTool } from '@langchain/core/tools'
import { createDeepAgent } from 'deepagents'
import { McpService } from '~/server/utils/mcp'

const createAgent = (instruction: string, tools: StructuredTool[]) => {
  const agent = createDeepAgent({
    tools: tools,
    instructions: instruction
  })
  return agent
}

export default defineEventHandler(async (event) => {
  // 获取 MCP 工具以增强功能
  const mcpService = new McpService()
  const mcpTools = await mcpService.listTools()
  
  const { instruction, prompt, conversationRoundId } = await readBody(event)
  const agent = createAgent(instruction, mcpTools as StructuredTool[])

  // 流式传输智能体响应
  const responseStream = await agent.stream({
    "messages": [{ "role": "user", "content": prompt }]
  }, { streamMode: "values" })

  // 处理和累积流式内容
  const readableStream = Readable.from((async function* () {
    const aiMessageId = `ai_${conversationRoundId}`
    let accumulatedAIContent = ''
    let aiMessageSent = false
    const toolMessages = new Map()
    
    for await (const chunk of responseStream) {
      const messages = chunk.messages
      const lastMessage = messages[messages.length - 1]
      const messageType = lastMessage._getType ? lastMessage._getType() : 'ai'
      
      if (messageType === 'ai') {
        // 处理和累积 AI 内容
        let textContent = ''
        if (Array.isArray(lastMessage.content)) {
          textContent = lastMessage.content
            .filter(item => typeof item === 'string' || 
                    (item && typeof item === 'object' && item.type === 'text'))
            .map(item => typeof item === 'string' ? item : item.text || '')
            .join(' ')
        } else {
          textContent = String(lastMessage.content || '')
        }
        
        if (textContent.length > accumulatedAIContent.length) {
          accumulatedAIContent = textContent
          yield JSON.stringify({
            id: aiMessageId,
            type: 'ai',
            content: accumulatedAIContent,
            conversationRoundId,
            timestamp: Date.now(),
            isUpdate: aiMessageSent
          }) + '\n'
          aiMessageSent = true
        }
      } else if (messageType === 'tool') {
        // 处理工具消息去重
        const toolCallId = lastMessage.tool_call_id || `tool_${Date.now()}`
        if (!toolMessages.has(toolCallId)) {
          yield JSON.stringify({
            id: toolCallId,
            type: 'tool',
            content: lastMessage.content,
            name: lastMessage.name || 'Tool',
            tool_call_id: toolCallId,
            conversationRoundId,
            timestamp: Date.now()
          }) + '\n'
          toolMessages.set(toolCallId, true)
        }
      }
    }
  })())

  return sendStream(event, readableStream)
})
```

### 客户端实现

#### 智能体聊天组件 (`components/AgentChat.vue`)

```vue
<script setup lang="ts">
import { useAgentWorker } from '~/composables/useAgentWorker'
import AgentToolMessage from '~/components/AgentToolMessage.vue'

const { onReceivedMessage, sendMessage } = useAgentWorker()
const messages = ref<ChatMessage[]>([])

// 受 DeepAgents 研究示例启发的默认智能体指令
const agentInstruction = ref(`你是一名专业研究员。你的工作是进行彻底的研究，然后撰写精美的报告。

你可以使用几种工具。

使用此工具为给定查询运行互联网搜索。您可以指定结果数量、主题以及是否应包含原始内容。`)

const onSend = async (data: ChatBoxFormData) => {
  const conversationRoundId = crypto.randomUUID()
  
  // 添加用户消息
  const userMessage = createChatMessage({
    role: "user",
    content: data.content,
    conversationRoundId
  })
  messages.value.push(userMessage)

  // 发送给智能体，包含指令和提示
  await sendMessage(conversationRoundId, {
    instruction: agentInstruction.value,
    prompt: typeof data.content === 'string' ? data.content : 
            data.content.map(item => item.type === 'text' ? item.text : '').join(' ')
  })
}

// 处理流式响应
onReceivedMessage((message) => {
  if (message.type === 'message') {
    const { messageType, content, conversationRoundId, isUpdate } = message.data
    
    if (messageType === 'ai') {
      // 更新或创建 AI 消息
      const existingIndex = messages.value.findIndex(m => 
        m.conversationRoundId === conversationRoundId && m.role === 'assistant')
      
      if (existingIndex >= 0 && isUpdate) {
        messages.value[existingIndex].content = content
      } else {
        messages.value.push(createChatMessage({
          role: "assistant",
          content,
          conversationRoundId
        }))
      }
    } else if (messageType === 'tool') {
      // 添加工具消息
      messages.value.push(createChatMessage({
        role: "tool",
        content,
        contentType: 'tool',
        toolName: message.data.name,
        conversationRoundId
      }))
    }
  }
})
</script>

<template>
  <div class="agent-chat">
    <!-- 使用工具消息组件渲染消息 -->
    <div v-for="message in visibleMessages" :key="message.id">
      <AgentToolMessage v-if="message.contentType === 'tool'" 
                        :message="message" />
      <ChatMessage v-else :message="message" />
    </div>
    
    <!-- 聊天输入 -->
    <ChatInputBox @send="onSend" />
  </div>
</template>
```

#### 流式传输的智能体工作器 (`composables/useAgentWorker.ts`)

```typescript
export function useAgentWorker() {
  const handlers: Handler[] = []
  const abortControllers = new Map<number, AbortController>()

  async function sendAgentRequest(uid: number, conversationRoundId: string, data: AgentRequestData) {
    const controller = new AbortController()
    abortControllers.set(uid, controller)

    try {
      const response = await fetch('/api/agents/1', {
        method: 'POST',
        body: JSON.stringify({ ...data, conversationRoundId }),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader!.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line)
              handlers.forEach(handler => handler({
                uid,
                id: parsed.id,
                type: 'message',
                data: {
                  messageType: parsed.type,
                  content: parsed.content,
                  name: parsed.name,
                  tool_call_id: parsed.tool_call_id,
                  conversationRoundId: parsed.conversationRoundId,
                  timestamp: parsed.timestamp,
                  isUpdate: parsed.isUpdate
                }
              }))
            } catch (e) {
              console.error('解析消息失败:', e)
            }
          }
        }
      }
    } catch (error) {
      handlers.forEach(handler => handler({
        uid, id: '', type: 'error', 
        message: error.message
      }))
    }
  }

  return {
    onReceivedMessage: (handler: Handler) => handlers.push(handler),
    sendMessage: async (conversationRoundId: string, data: AgentRequestData) => {
      const uid = Date.now()
      await sendAgentRequest(uid, conversationRoundId, data)
    }
  }
}
```

### 工具消息 UI (`components/AgentToolMessage.vue`)

```vue
<template>
  <div class="tool-message">
    <div class="tool-header" @click="expanded = !expanded">
      <UIcon :name="toolIcon" class="tool-icon" />
      <span class="tool-name">{{ message.toolName || '工具' }}</span>
      <UIcon :name="expanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" />
    </div>
    
    <div v-if="expanded" class="tool-content">
      <pre><code v-html="highlightedContent"></code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import hljs from 'highlight.js'

const props = defineProps<{ message: ChatMessage }>()
const expanded = ref(false)

const toolIcon = computed(() => {
  const toolName = props.message.toolName?.toLowerCase() || ''
  if (toolName.includes('search')) return 'i-heroicons-magnifying-glass'
  if (toolName.includes('browser')) return 'i-heroicons-globe-alt'
  if (toolName.includes('file')) return 'i-heroicons-document'
  if (toolName.includes('calculator')) return 'i-heroicons-calculator'
  return 'i-heroicons-wrench'
})

const highlightedContent = computed(() => {
  try {
    const content = typeof props.message.content === 'string' 
      ? props.message.content 
      : JSON.stringify(props.message.content, null, 2)
    return hljs.highlightAuto(content).value
  } catch {
    return props.message.content
  }
})
</script>
```

## 分支：`feature/deep-agents`
**基础分支：** `main`  
**开发日期：** 2025年8月19日

## 实现的关键功能

### 1. AI 智能体聊天系统
- **新的智能体聊天组件** (`components/AgentChat.vue` - 460 行)
  - 专用的 AI 智能体聊天界面，具有工具访问能力
  - 实时流式响应处理
  - 基于对话轮次的 UUID 分组
  - 工件支持集成
  - 智能体指令管理

- **智能体 API 端点** (`server/api/agents/[id].post.ts` - 127 行)
  - 服务器端 AI 内容处理和累积
  - 带有 JSON 消息格式的结构化流式传输
  - 工具消息去重和处理
  - 使用 UUID 的对话轮次跟踪

### 2. 结构化流式架构

#### 服务器端处理
- **内容累积**：AI 响应在服务器端累积，仅在内容增长时发送更新
- **消息类型检测**：自动检测 HumanMessage、AIMessage 和 ToolMessage 类型
- **内容处理**：复杂的数组结构被扁平化为可读字符串
- **基于 UUID 的分组**：每个对话轮次获得唯一的 UUID 来分组相关消息

#### 客户端简化
- **轻量级处理**：客户端简单地渲染服务器处理的内容
- **更新标志**：服务器指示消息是新消息还是更新
- **无内容逻辑**：所有累积和去重都在服务器端处理

### 3. 工具消息 UI 系统

#### AgentToolMessage 组件 (`components/AgentToolMessage.vue` - 88 行)
- **可折叠界面**：工具调用显示为小的可展开元素
- **图标集成**：基于工具类型（搜索、浏览器、文件等）自动选择图标
- **内容格式化**：带有语法高亮的工具输出格式化显示
- **展开/折叠**：用户可以按需查看工具详细信息

#### 支持的工具类型
- 网络搜索工具
- 浏览器/导航工具
- 文件操作
- 计算器功能
- 代码执行
- 通用工具回退

### 4. 智能体工作器系统 (`composables/useAgentWorker.ts` - 154 行)
- **流式处理器**：管理来自智能体 API 的实时消息流
- **消息处理**：解析来自服务器的 JSON 结构化消息
- **错误处理**：针对网络问题和解析错误的强大错误处理
- **中止功能**：能够取消正在进行的智能体请求

### 5. 国际化 (i18n) 支持

#### 英文语言包 (`locales/en-US.json`)
```json
"agents": {
  "title": "AI Agent Chat",
  "welcome": "Welcome to AI Agents",
  "welcomeMessage": "Start chatting with your AI agent. It has access to various tools to help you accomplish tasks.",
  "inputPlaceholder": "Ask the agent to help you with anything..."
}
```

#### 中文语言包 (`locales/zh-CN.json`)
```json
"agents": {
  "title": "AI 智能体聊天",
  "welcome": "欢迎使用 AI 智能体",
  "welcomeMessage": "开始与您的 AI 智能体聊天。它可以使用各种工具来帮助您完成任务。",
  "inputPlaceholder": "请告诉智能体您需要什么帮助..."
}
```

### 6. 类型系统增强 (`types/chat.d.ts`)
- **扩展的 ChatMessage 接口**：添加了对工具消息和智能体特定属性的支持
- **内容类型扩展**：支持 `'tool'` 内容类型
- **消息类型扩展**：添加了 `'tool'` 消息类型
- **智能体属性**：`messageType`、`toolName`、`additionalKwargs` 字段

## 技术架构

### 消息流
1. **用户输入** → 生成对话轮次 UUID
2. **客户端请求** → 发送到带有 UUID 的智能体 API
3. **服务器处理** → DeepAgents 流式处理与内容累积
4. **结构化输出** → 带有类型、内容和元数据的 JSON 消息
5. **客户端渲染** → 简单的消息显示和工具 UI 组件

### 流式协议
```json
// AI 消息
{
  "id": "ai_uuid-generated-id",
  "type": "ai",
  "content": "累积的 AI 响应文本...",
  "conversationRoundId": "conversation-uuid",
  "timestamp": 1692455200000,
  "isUpdate": true
}

// 工具消息
{
  "id": "tool_unique-id",
  "type": "tool",
  "content": "格式化的工具输出...",
  "name": "search",
  "tool_call_id": "call_xyz",
  "conversationRoundId": "conversation-uuid",
  "timestamp": 1692455200000
}
```

### 智能体配置
- **默认指令**：专家研究员，具有工具访问权限，用于彻底研究和报告撰写（受 DeepAgents 研究智能体示例启发）
- **DeepAgents 集成**：与 DeepAgents 的规划工具、子智能体和文件系统完全集成
- **工具集成**：MCP（模型上下文协议）服务器增强功能
- **动态指令**：用户可以实时修改智能体指令
- **内置功能**：
  - 用于任务分解和跟踪的规划工具
  - 用于专门任务的通用子智能体
  - 用于文档持久化的模拟文件系统
  - 通过子智能体委托进行上下文隔离

## 关键技术决策

### 1. 服务器端处理优先级
**决策**：将所有消息处理、累积和去重移至服务器端  
**理由**：提供一致的行为，降低客户端复杂性，确保可靠的流式传输

### 2. 基于 UUID 的对话轮次
**决策**：为每个用户问题/智能体响应周期生成唯一的 UUID  
**理由**：对话轮次之间的清晰分离，支持未来功能如编辑特定轮次

### 3. 独立的工具消息 UI
**决策**：将工具调用渲染为独立的可折叠 UI 元素，而不是内联文本  
**理由**：更好的用户体验，清晰显示智能体操作，可选的详细信息查看

### 4. JSON 流式协议
**决策**：使用换行分隔的 JSON 进行流式传输，而不是原始文本  
**理由**：结构化数据支持丰富的消息类型、元数据和客户端渲染逻辑

## 添加的依赖项
- **deepagents**：具有规划、子智能体和文件系统功能的核心"深度"AI 智能体功能
- **@langchain/core**：工具集成和结构化 AI 工作流
- **langchain-mcp-adapters**：MCP（模型上下文协议）集成，增强工具访问

## 文件更改摘要
- **新文件**：5 个（AgentChat.vue、AgentToolMessage.vue、useAgentWorker.ts、agents/[id].post.ts、agents/index.vue）
- **修改文件**：4 个（en-US.json、zh-CN.json、chat.d.ts、package.json）
- **总添加行数**：约 1,079 行
- **总删除行数**：约 44 行

## 解决的问题

### 1. AI 消息累积问题
**问题**：在流式传输过程中，AI 消息被替换而不是累积  
**解决方案**：基于长度检测更新的服务器端内容累积

### 2. 工具消息可见性
**问题**：工具调用对用户不够清晰可见  
**解决方案**：专用的可折叠 UI 组件，带有工具特定图标

### 3. 对话轮次分离
**问题**：多个对话轮次混合在一起  
**解决方案**：为每个用户问题/智能体响应周期基于 UUID 的分组系统

### 4. 流式块类型错误
**问题**：后端流式传输发送数组内容导致块类型错误  
**解决方案**：服务器端内容处理确保流式传输的字符串输出

## 未来增强

### 1. 智能体市场
- 支持多种预配置智能体类型
- 带有专门指令的智能体模板系统
- 智能体配置的社区共享

### 2. 增强的工具集成
- 可视化工具执行指示器
- 工具输出格式化改进
- 实时工具执行状态

### 3. 对话管理
- 编辑和重新生成特定对话轮次
- 导出对话记录
- 对话搜索和过滤

### 4. 性能优化
- 长对话的消息虚拟化
- 大型工具输出的后台处理
- 常用工具的缓存

## 测试建议
1. **流式可靠性**：在慢速网络和中断情况下测试
2. **工具消息渲染**：验证所有工具类型正确显示
3. **UUID 冲突**：测试快速连续请求
4. **国际化**：验证所有支持语言的文本渲染
5. **内存使用**：测试非常长的对话

## 部署说明
- **环境变量**：确保正确设置 MCP 服务器配置
- **工具依赖项**：验证所有必需的工具和服务可用
- **流式支持**：确保部署平台支持服务器发送事件
- **CORS 配置**：可能需要为工具相关的外部请求更新

---

**贡献者**：Claude Code Assistant  
**审查状态**：准备审查  
**合并目标**：`main` 分支
