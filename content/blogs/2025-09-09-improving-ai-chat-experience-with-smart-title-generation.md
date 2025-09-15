---
title: 用AI为AI对话生成标题：改进用户体验的技术实践
date: 2025-09-09
slug: 2025-09-09-improving-ai-chat-experience-with-smart-title-generation
description: "在AI对话应用中，我们经常遇到这样的场景：用户开始了一个新的对话，询问关于\"意大利足球青训体系\"的问题，但会话列表中显示的却是\"新对话\"或者一串没有意义的ID。当用户想要回顾之前的对话时，面对一排\"新对话\"的标题，只能逐个点击查看内容。"
---

# 用AI为AI对话生成标题：改进用户体验的技术实践

> 一个看似简单的功能，背后的技术思考和实现细节

## 背景：从用户痛点到产品改进

在AI对话应用中，我们经常遇到这样的场景：用户开始了一个新的对话，询问关于"意大利足球青训体系"的问题，但会话列表中显示的却是"新对话"或者一串没有意义的ID。当用户想要回顾之前的对话时，面对一排"新对话"的标题，只能逐个点击查看内容。

这是一个典型的**用户体验债务**——功能完整，但缺乏人性化的细节。

## 产品思维：小功能，大体验

### 用户期望是什么？

- **即时识别**：一眼就能知道这个对话讨论了什么
- **智能生成**：不需要手动输入，自动理解内容
- **准确简洁**：标题既要准确又要简洁
- **实时更新**：生成后立即在界面上显示

### 技术挑战是什么？

看起来简单的功能，实际实现时会遇到不少挑战：

1. **模型一致性**：标题生成要使用和对话相同的AI模型
2. **触发时机**：什么时候生成标题？如何避免重复生成？
3. **性能考虑**：不能影响正常对话的响应速度
4. **错误处理**：生成失败时如何优雅降级？
5. **UI同步**：如何实时更新界面显示？

## 技术实现：从简单到优雅

### 第一版：直接复制聊天逻辑

最直观的想法是复制现有的聊天API逻辑，去掉知识库和流式返回：

```typescript
// 简单粗暴的实现
export default defineEventHandler(async (event) => {
  const { model, family, userMessage } = await readBody(event)
  
  const llm = createChatModel(model, family, event)
  const systemPrompt = `生成一个简洁的标题`
  
  const response = await llm.invoke([
    ['system', systemPrompt],
    ['user', userMessage]
  ])
  
  return { title: response.content.trim() }
})
```

这个版本能工作，但有几个问题：
- 缺乏配置灵活性
- 错误处理不完善  
- 无法复用到其他场景

### 第二版：解决模型配置问题

实际测试时发现一个关键问题：聊天使用的是Moonshot的Kimi模型，但标题生成却回退到了本地Ollama。

**根本原因**：自定义模型配置没有正确传递到标题生成API。

聊天API能正确工作是因为Web Worker传递了完整的请求头：

```typescript
// 聊天请求包含关键的配置信息
const response = await fetch('/api/models/chat', {
  method: 'POST',
  headers: {
    ...headers, // 这里包含了 x-chat-ollama-keys
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({...})
})
```

而我们的标题生成请求缺少了这个关键的header：

```typescript
// 修复后的实现
const { getKeysHeader } = await import('~/utils/settings')

const response = await fetch(`/api/sessions/${sessionId}/title`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    ...getKeysHeader() // 关键：传递模型配置
  },
  body: JSON.stringify({ model, family, userMessage })
})
```

**技术洞察**：看似独立的功能，往往依赖于系统的基础设施。确保新功能使用相同的基础组件是一致性的关键。

### 第三版：模块化重构

随着功能逐渐完善，我意识到代码耦合度太高，难以复用。于是进行了全面重构：

#### 1. 分层架构

```
Component Layer    → 使用自动标题生成
   ↓
Utility Layer     → 配置触发条件和策略  
   ↓
Composable Layer  → 核心逻辑和API调用
   ↓
API Layer         → 与AI模型交互
```

#### 2. 职责分离

**Composable层**负责核心逻辑：
```typescript
export function useSessionTitle() {
  const generateTitleAPI = async (model, family, userMessage, sessionId) => {
    // 纯粹的API调用
  }

  const updateSessionInDB = async (sessionId, title) => {
    // 纯粹的数据库操作
  }

  const generateSessionTitle = async (options) => {
    // 组合API调用和数据库更新
  }

  return { generateTitleAPI, updateSessionInDB, generateSessionTitle }
}
```

**Utility层**负责策略配置：
```typescript
export const titleTriggers = {
  firstUserMessage: {
    shouldGenerate: (context) => {
      // 判断是否应该生成标题的逻辑
    },
    extractMessage: (context) => {
      // 提取用于生成标题的内容
    }
  }
}
```

**Component层**只需要简单配置：
```typescript
// 组件中的使用非常简洁
const autoTitleGenerator = createAutoTitleGenerator.forFirstMessage((title) => {
  sessionInfo.value.title = title
  emit('title-updated', title)
})

// 在消息处理中调用
autoTitleGenerator.attemptTitleGeneration(context, sessionId, model, family)
```

## 设计模式的运用

### 1. 策略模式（Strategy Pattern）

不同场景下的标题生成策略：

```typescript
const strategies = {
  firstMessage: { /* 首条消息触发 */ },
  onDemand: { /* 按需生成 */ },
  periodic: { /* 定期更新 */ }
}
```

### 2. 工厂模式（Factory Pattern）

快速创建常用配置：

```typescript
const generator = createAutoTitleGenerator.forFirstMessage(callback)
// vs 复杂的手动配置
const generator = new AutoTitleGenerator({ 
  enabled: true,
  trigger: titleTriggers.firstUserMessage,
  onTitleGenerated: callback 
})
```

### 3. 观察者模式（Observer Pattern）

组件间的解耦通信：

```typescript
// Chat组件发出事件
emit('title-updated', title)

// 父组件响应事件
@title-updated="onTitleUpdated"
```

## 用户体验的细节

### 1. 非阻塞设计

标题生成完全异步，不影响正常对话：

```typescript
// 发送消息后立即继续，标题生成在后台进行
emits('message', userMessage)
messages.value.push(userMessage)

// 异步生成标题，成功后更新UI
autoTitleGenerator.attemptTitleGeneration(...)
```

### 2. 优雅降级

生成失败时不影响核心功能：

```typescript
generateSessionTitle(options)
  .then(title => {
    if (title) updateUI(title)
  })
  .catch(error => {
    console.warn('Title generation failed:', error)
    // 用户不会感知到失败，对话正常进行
  })
```

### 3. 实时反馈

标题生成后立即更新多个UI位置：

```typescript
const onTitleGenerated = (title) => {
  // 更新当前会话显示
  sessionInfo.value.title = title
  
  // 更新会话列表
  emit('title-updated', title)
}
```

## 技术亮点与创新

### 1. 配置化的提示工程

不同场景使用不同的提示策略：

```typescript
const TITLE_PROMPTS = {
  concise: (maxWords) => `生成${maxWords}字的简洁标题`,
  descriptive: (maxWords) => `生成${maxWords}字的描述性标题`,
  technical: (maxWords) => `生成${maxWords}字的技术性标题`,
  casual: (maxWords) => `生成${maxWords}字的轻松标题`
}
```

### 2. 智能内容提取

支持多模态内容的智能提取：

```typescript
extractMessage: (context) => {
  const content = context.messageContent
  if (Array.isArray(content)) {
    // 多模态内容：提取文本部分
    return content
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text)
      .join(' ')
  }
  // 纯文本内容
  return content
}
```

### 3. 渐进式增强

功能设计支持渐进式扩展：

```typescript
// 基础用法
const title = await generateSessionTitle({
  sessionId, model, family, userMessage
})

// 高级用法
const title = await generateSessionTitle({
  sessionId, model, family, userMessage,
  style: 'technical',
  maxWords: 8,
  onSuccess: (title) => notifyUser(title),
  onError: (error) => logError(error)
})
```

## 开发者体验

### 文档即代码

为了让功能真正可复用，我们创建了完整的开发者文档：

- **主文档**：完整的架构说明和使用指南
- **快速参考**：常用模式的代码片段  
- **API参考**：完整的TypeScript类型定义

### 示例驱动

文档中包含了丰富的实际使用示例：

```typescript
// 文档聊天场景
const generator = createAutoTitleGenerator.forFirstMessage(onTitleGenerated)

// 文档摘要场景  
const title = await generateSessionTitle({
  sessionId: docId,
  model: 'gpt-4',
  family: 'OpenAI',
  userMessage: documentContent,
  style: 'descriptive'
})

// 批量处理场景
const results = await Promise.allSettled(
  sessions.map(session => generateTitleAPI(session.model, session.family, session.firstMessage, session.id))
)
```

## 性能优化

### 1. 懒加载

避免增加初始包体积：

```typescript
// 动态导入，需要时才加载
import('~/composables/useSessionTitle').then(({ generateSessionTitle }) => {
  generateSessionTitle(options)
})
```

### 2. 错误边界

确保功能失败不影响主流程：

```typescript
try {
  const title = await generateTitleAPI(model, family, userMessage, sessionId)
  if (title) {
    await updateSessionInDB(sessionId, title)
    onSuccess?.(title)
  }
} catch (error) {
  console.warn('Title generation failed:', error)
  onError?.(error)
  // 继续执行，不抛出异常
}
```

## 测试策略

### 单元测试

测试核心逻辑：

```typescript
describe('Title Triggers', () => {
  it('should generate on first user message', () => {
    const context = {
      messages: [{ role: 'user', content: 'Hello' }],
      sessionTitle: ''
    }
    
    const shouldGenerate = titleTriggers.firstUserMessage.shouldGenerate(context)
    expect(shouldGenerate).toBe(true)
  })
})
```

### 集成测试

测试完整流程：

```typescript
describe('Session Title Generation', () => {
  it('should generate and save title', async () => {
    const { generateSessionTitle } = useSessionTitle()
    
    const title = await generateSessionTitle({
      sessionId: 1,
      model: 'test-model', 
      family: 'OpenAI',
      userMessage: 'Test message'
    })
    
    expect(title).toBeTruthy()
  })
})
```

## 经验总结

### 1. 从用户体验出发

技术实现要服务于用户体验，而不是相反。"自动生成标题"看起来是技术功能，本质上是为了解决用户"难以管理对话历史"的痛点。

### 2. 迭代式开发

- **第一版**：快速验证想法可行性
- **第二版**：解决实际部署中的问题  
- **第三版**：为长期维护和扩展做准备

### 3. 基础设施的重要性

新功能往往依赖现有的基础设施（如认证、配置管理、错误处理等）。确保新功能复用这些基础设施，而不是重复造轮子。

### 4. 可测试性设计

- 分离纯函数和副作用
- 依赖注入而不是硬编码
- 提供清晰的错误边界

### 5. 文档即投资

完善的文档不仅帮助他人理解代码，更重要的是确保功能能被正确使用和扩展。

## 未来展望

### 1. 个性化标题风格

根据用户偏好生成不同风格的标题：

```typescript
// 用户配置
const userPrefs = {
  titleStyle: 'technical',    // 偏好技术性表述
  titleLength: 'medium',      // 中等长度
  language: 'zh'              // 中文标题
}
```

### 2. 上下文感知生成

结合对话历史生成更精准的标题：

```typescript
generateContextAwareTitle({
  currentMessage: "具体问题",
  conversationHistory: previousMessages,
  userProfile: userInterests
})
```

### 3. 多语言支持

基于用户消息语言自动选择标题语言：

```typescript
const detectedLanguage = detectLanguage(userMessage)
const title = await generateSessionTitle({
  ...options,
  language: detectedLanguage
})
```

### 4. 批量优化

为已有的大量"无标题"对话批量生成标题：

```typescript
const batchGenerateService = new BatchTitleGenerator({
  concurrency: 5,
  rateLimiting: true,
  progressCallback: (progress) => updateUI(progress)
})

await batchGenerateService.processExistingSessions()
```

## 结语

一个"简单"的标题生成功能，背后涉及了产品设计、系统架构、性能优化、用户体验等多个方面。这个项目让我们看到：

- **细节决定体验**：小功能也能带来大的用户体验提升
- **技术服务产品**：技术实现要以用户需求为导向
- **架构考量长远**：为未来的扩展和维护做好准备
- **文档助力协作**：良好的文档让功能真正可复用

在AI应用快速发展的今天，我们不仅要关注AI能力本身，更要关注如何让这些能力更好地服务用户，创造真正有价值的产品体验。

---

*本文基于ChatOllama项目中自动标题生成功能的实际开发经验总结而成。相关代码和文档已开源，欢迎参考和讨论。*

**技术栈**：Vue3 + Nuxt3 + TypeScript + LangChain + 多种AI模型

**项目地址**：[ChatOllama](https://github.com/sugarforever/chat-ollama)

**文档路径**：`docs/guide/session-title-generation.md`