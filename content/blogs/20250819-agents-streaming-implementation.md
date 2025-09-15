---
title: "20250819 - 🧠🤖 DeepAgents Integration: AI Agents Streaming Implementation & UI Enhancement"
date: 2025-08-19
slug: 20250819-agents-streaming-implementation
description: "I integrated DeepAgents into my open source AI chatbot [ChatOllama](https://github.com/sugarforever/chat-ollama). Users now, can chat with AI and w..."
---

# 20250819 - 🧠🤖 DeepAgents Integration: AI Agents Streaming Implementation & UI Enhancement

## Overview

**DeepAgents** is a LangChain open sourced AI Agent application development package. It has both Python and JavaScript packages that create "deep" agents capable of planning and acting over longer, more complex tasks. The implementation features structured streaming, tool message handling, and internationalization support, with a focus on creating a robust, server-side processed streaming architecture that provides a lightweight client experience.

I integrated DeepAgents into my open source AI chatbot [ChatOllama](https://github.com/sugarforever/chat-ollama). Users now, can chat with AI and work out deep research tasks on ChatOllama. This note recorded my development experience. Hope it helps in your development.

## About DeepAgents

**DeepAgents** represents a significant advancement over simple LLM-tool calling architectures. While using an LLM to call tools in a loop is the simplest form of an agent, this approach often yields "shallow" agents that fail to plan and act effectively over complex, multi-step tasks.

DeepAgents solves this limitation by implementing four key components that make agents truly "deep":

1. **🎯 Planning Tool**: A built-in planning system that helps agents create and maintain structured plans
2. **🤖 Sub Agents**: Specialized agents for specific tasks and context quarantine
3. **📁 File System Access**: Mock file system for persistent state and document management
4. **📝 Detailed Prompts**: Sophisticated system prompts based on successful applications like Claude Code

This architecture enables agents to:
- Break down complex tasks into manageable steps
- Maintain context across long conversations
- Delegate specialized work to focused sub-agents
- Persist and manipulate information through a file system interface
- Execute sophisticated research and analysis workflows

The DeepAgents approach has been successfully demonstrated in applications like "Deep Research", "Manus", and "Claude Code", and our implementation brings these capabilities to a general-purpose chat interface.

### How to Use DeepAgents

#### Installation

```bash
npm install deepagents @langchain/core langchain-mcp-adapters
```

#### Basic Usage Example

Here's a simple example of creating a research agent with DeepAgents:

```python
import os
from typing import Literal
from tavily import TavilyClient
from deepagents import create_deep_agent

# Initialize search tool
tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def internet_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = False,
):
    """Run a web search"""
    return tavily_client.search(
        query,
        max_results=max_results,
        include_raw_content=include_raw_content,
        topic=topic,
    )

# Define agent instructions
research_instructions = """You are an expert researcher. Your job is to conduct thorough research, and then write a polished report.

You have access to a few tools.

## `internet_search`

Use this to run an internet search for a given query. You can specify the number of results, the topic, and whether raw content should be included.
"""

# Create the deep agent
agent = create_deep_agent(
    [internet_search],
    research_instructions,
)

# Invoke the agent
result = agent.invoke({"messages": [{"role": "user", "content": "what is langgraph?"}]})
```

#### Custom Sub-Agents

You can create specialized sub-agents for specific tasks:

```python
# Define a critique sub-agent
critique_sub_agent = {
    "name": "critique-agent",
    "description": "Critique and improve research reports",
    "prompt": "You are a tough editor who provides constructive feedback on research reports.",
    "model_settings": {
        "model": "anthropic:claude-3-5-haiku-20241022",
        "temperature": 0,
        "max_tokens": 8192
    }
}

# Create agent with sub-agents
agent = create_deep_agent(
    tools=[internet_search],
    instructions="You are an expert researcher...",
    subagents=[critique_sub_agent],
)
```

#### Using Custom Models

```python
from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model

# Use a custom model like Ollama
model = init_chat_model(
    model="ollama:gpt-oss:20b",  
)

agent = create_deep_agent(
    tools=tools,
    instructions=instructions,
    model=model,
)
```

#### MCP Integration

DeepAgents can work with MCP (Model Context Protocol) tools:

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from deepagents import create_deep_agent

async def main():
    # Collect MCP tools
    mcp_client = MultiServerMCPClient(...)
    mcp_tools = await mcp_client.get_tools()

    # Create agent with MCP tools
    agent = create_deep_agent(tools=mcp_tools, instructions="...")

    # Stream the agent response
    async for chunk in agent.astream(
        {"messages": [{"role": "user", "content": "what is langgraph?"}]},
        stream_mode="values"
    ):
        if "messages" in chunk:
            chunk["messages"][-1].pretty_print()

asyncio.run(main())
```

## ChatOllama DeepAgents Integration

### Server-Side Implementation

Our ChatOllama integration implements DeepAgents on the server side with structured streaming. Here's how we created the agent endpoint:

#### Agent Creation (`server/api/agents/[id].post.ts`)

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
  // Get MCP tools for enhanced capabilities
  const mcpService = new McpService()
  const mcpTools = await mcpService.listTools()
  
  const { instruction, prompt, conversationRoundId } = await readBody(event)
  const agent = createAgent(instruction, mcpTools as StructuredTool[])

  // Stream agent responses
  const responseStream = await agent.stream({
    "messages": [{ "role": "user", "content": prompt }]
  }, { streamMode: "values" })

  // Process and accumulate streaming content
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
        // Process and accumulate AI content
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
        // Process tool messages with deduplication
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

### Client-Side Implementation

#### Agent Chat Component (`components/AgentChat.vue`)

```vue
<script setup lang="ts">
import { useAgentWorker } from '~/composables/useAgentWorker'
import AgentToolMessage from '~/components/AgentToolMessage.vue'

const { onReceivedMessage, sendMessage } = useAgentWorker()
const messages = ref<ChatMessage[]>([])

// Default agent instruction inspired by DeepAgents research example
const agentInstruction = ref(`You are an expert researcher. Your job is to conduct thorough research, and then write a polished report.

You have access to a few tools.

Use this to run an internet search for a given query. You can specify the number of results, the topic, and whether raw content should be included.`)

const onSend = async (data: ChatBoxFormData) => {
  const conversationRoundId = crypto.randomUUID()
  
  // Add user message
  const userMessage = createChatMessage({
    role: "user",
    content: data.content,
    conversationRoundId
  })
  messages.value.push(userMessage)

  // Send to agent with instruction and prompt
  await sendMessage(conversationRoundId, {
    instruction: agentInstruction.value,
    prompt: typeof data.content === 'string' ? data.content : 
            data.content.map(item => item.type === 'text' ? item.text : '').join(' ')
  })
}

// Handle streaming responses
onReceivedMessage((message) => {
  if (message.type === 'message') {
    const { messageType, content, conversationRoundId, isUpdate } = message.data
    
    if (messageType === 'ai') {
      // Update or create AI message
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
      // Add tool message
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
    <!-- Render messages with tool message components -->
    <div v-for="message in visibleMessages" :key="message.id">
      <AgentToolMessage v-if="message.contentType === 'tool'" 
                        :message="message" />
      <ChatMessage v-else :message="message" />
    </div>
    
    <!-- Chat input -->
    <ChatInputBox @send="onSend" />
  </div>
</template>
```

#### Agent Worker for Streaming (`composables/useAgentWorker.ts`)

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
              console.error('Failed to parse message:', e)
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

### Tool Message UI (`components/AgentToolMessage.vue`)

```vue
<template>
  <div class="tool-message">
    <div class="tool-header" @click="expanded = !expanded">
      <UIcon :name="toolIcon" class="tool-icon" />
      <span class="tool-name">{{ message.toolName || 'Tool' }}</span>
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

## Branch: `feature/deep-agents`
**Base Branch:** `main`  
**Development Date:** August 19, 2025

## Key Features Implemented

### 1. AI Agents Chat System
- **New Agent Chat Component** (`components/AgentChat.vue` - 460 lines)
  - Dedicated chat interface for AI agents with tool access
  - Real-time streaming response handling
  - Conversation round-based UUID grouping
  - Artifact support integration
  - Agent instruction management

- **Agent API Endpoint** (`server/api/agents/[id].post.ts` - 127 lines)
  - Server-side AI content processing and accumulation
  - Structured streaming with JSON message format
  - Tool message deduplication and processing
  - Conversation round tracking with UUIDs

### 2. Structured Streaming Architecture

#### Server-Side Processing
- **Content Accumulation**: AI responses are accumulated on the server, only sending updates when content grows
- **Message Type Detection**: Automatic detection of HumanMessage, AIMessage, and ToolMessage types
- **Content Processing**: Complex array structures are flattened to readable strings
- **UUID-based Grouping**: Each conversation round gets a unique UUID to group related messages

#### Client-Side Simplification
- **Lightweight Processing**: Client simply renders server-processed content
- **Update Flags**: Server indicates whether message is new or an update
- **No Content Logic**: All accumulation and deduplication handled server-side

### 3. Tool Message UI System

#### AgentToolMessage Component (`components/AgentToolMessage.vue` - 88 lines)
- **Collapsible Interface**: Tool calls appear as small, expandable elements
- **Icon Integration**: Automatic icon selection based on tool type (search, browser, file, etc.)
- **Content Formatting**: Formatted display of tool outputs with syntax highlighting
- **Expand/Collapse**: Users can view tool details on demand

#### Tool Types Supported
- Web search tools
- Browser/navigation tools
- File operations
- Calculator functions
- Code execution
- Generic tool fallback

### 4. Agent Worker System (`composables/useAgentWorker.ts` - 154 lines)
- **Streaming Handler**: Manages real-time message streaming from agents API
- **Message Processing**: Parses JSON-structured messages from server
- **Error Handling**: Robust error handling for network issues and parsing errors
- **Abort Functionality**: Ability to cancel ongoing agent requests

### 5. Internationalization (i18n) Support

#### English Locale (`locales/en-US.json`)
```json
"agents": {
  "title": "AI Agent Chat",
  "welcome": "Welcome to AI Agents",
  "welcomeMessage": "Start chatting with your AI agent. It has access to various tools to help you accomplish tasks.",
  "inputPlaceholder": "Ask the agent to help you with anything..."
}
```

#### Chinese Locale (`locales/zh-CN.json`)
```json
"agents": {
  "title": "AI 智能体聊天",
  "welcome": "欢迎使用 AI 智能体",
  "welcomeMessage": "开始与您的 AI 智能体聊天。它可以使用各种工具来帮助您完成任务。",
  "inputPlaceholder": "请告诉智能体您需要什么帮助..."
}
```

### 6. Type System Enhancements (`types/chat.d.ts`)
- **Extended ChatMessage Interface**: Added support for tool messages and agent-specific properties
- **Content Type Extensions**: Support for `'tool'` content type
- **Message Type Extensions**: Added `'tool'` message type
- **Agent Properties**: `messageType`, `toolName`, `additionalKwargs` fields

## Technical Architecture

### Message Flow
1. **User Input** → Generate conversation round UUID
2. **Client Request** → Send to agents API with UUID
3. **Server Processing** → DeepAgents streaming with content accumulation
4. **Structured Output** → JSON messages with type, content, and metadata
5. **Client Rendering** → Simple message display and tool UI components

### Streaming Protocol
```json
// AI Message
{
  "id": "ai_uuid-generated-id",
  "type": "ai",
  "content": "Accumulated AI response text...",
  "conversationRoundId": "conversation-uuid",
  "timestamp": 1692455200000,
  "isUpdate": true
}

// Tool Message
{
  "id": "tool_unique-id",
  "type": "tool",
  "content": "Formatted tool output...",
  "name": "search",
  "tool_call_id": "call_xyz",
  "conversationRoundId": "conversation-uuid",
  "timestamp": 1692455200000
}
```

### Agent Configuration
- **Default Instruction**: Expert researcher with access to tools for thorough research and report writing (inspired by DeepAgents research agent example)
- **DeepAgents Integration**: Full integration with DeepAgents' planning tools, sub-agents, and file system
- **Tool Integration**: MCP (Model Context Protocol) servers for enhanced capabilities
- **Dynamic Instructions**: Users can modify agent instructions in real-time
- **Built-in Capabilities**: 
  - Planning tool for task breakdown and tracking
  - General-purpose sub-agent for specialized tasks
  - Mock file system for document persistence
  - Context quarantine through sub-agent delegation

## Key Technical Decisions

### 1. Server-Side Processing Priority
**Decision**: Move all message processing, accumulation, and deduplication to the server  
**Rationale**: Provides consistent behavior, reduces client complexity, and ensures reliable streaming

### 2. UUID-Based Conversation Rounds
**Decision**: Generate unique UUIDs for each user question/agent response cycle  
**Rationale**: Clean separation between conversation rounds, enables future features like editing specific rounds

### 3. Separate Tool Message UI
**Decision**: Render tool calls as separate, collapsible UI elements rather than inline text  
**Rationale**: Better user experience, clear visibility of agent actions, optional detail viewing

### 4. JSON Streaming Protocol
**Decision**: Use newline-delimited JSON for streaming instead of raw text  
**Rationale**: Structured data enables rich message types, metadata, and client-side rendering logic

## Dependencies Added
- **deepagents**: Core "deep" AI agent functionality with planning, sub-agents, and file system capabilities
- **@langchain/core**: Tool integration and structured AI workflows
- **langchain-mcp-adapters**: MCP (Model Context Protocol) integration for enhanced tool access

## File Changes Summary
- **New Files**: 4 (AgentChat.vue, AgentToolMessage.vue, useAgentWorker.ts, agents/[id].post.ts, agents/index.vue)
- **Modified Files**: 4 (en-US.json, zh-CN.json, chat.d.ts, package.json)
- **Total Lines Added**: ~1,079 lines
- **Total Lines Removed**: ~44 lines

## Issues Resolved

### 1. AI Message Accumulation Problem
**Issue**: AI messages were being replaced instead of accumulated during streaming  
**Solution**: Server-side content accumulation with length-based update detection

### 2. Tool Message Visibility
**Issue**: Tool calls were not clearly visible to users  
**Solution**: Dedicated collapsible UI components with tool-specific icons

### 3. Conversation Round Separation
**Issue**: Multiple conversation rounds were getting mixed together  
**Solution**: UUID-based grouping system for each user question/agent response cycle

### 4. Streaming Chunk Type Errors
**Issue**: Backend streaming was sending array content that caused chunk type errors  
**Solution**: Server-side content processing to ensure string output for streaming

## Future Enhancements

### 1. Agent Marketplace
- Support for multiple pre-configured agent types
- Agent template system with specialized instructions
- Community sharing of agent configurations

### 2. Enhanced Tool Integration
- Visual tool execution indicators
- Tool output formatting improvements
- Real-time tool execution status

### 3. Conversation Management
- Edit and regenerate specific conversation rounds
- Export conversation transcripts
- Conversation search and filtering

### 4. Performance Optimizations
- Message virtualization for long conversations
- Background processing for large tool outputs
- Caching for frequently used tools

## Testing Recommendations
1. **Streaming Reliability**: Test with slow networks and interruptions
2. **Tool Message Rendering**: Verify all tool types display correctly
3. **UUID Collision**: Test with rapid successive requests
4. **Internationalization**: Verify text rendering in all supported languages
5. **Memory Usage**: Test with very long conversations

## Deployment Notes
- **Environment Variables**: Ensure MCP server configuration is properly set
- **Tool Dependencies**: Verify all required tools and services are available
- **Streaming Support**: Ensure deployment platform supports Server-Sent Events
- **CORS Configuration**: May need updates for tool-related external requests

---

**Contributors**: Claude Code Assistant  
**Review Status**: Ready for review  
**Merge Target**: `main` branch