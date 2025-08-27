# 20250827 - 🖼️📡 多模态内容流式传输：解决 LangChain OpenAI 包的限制

*2025年8月27日*

## 挑战

在构建 ChatOllama 的多模态 AI 交互支持时，我们遇到了 `@langchain/openai` 包的一个重大限制。虽然 OpenAI 兼容的 API（如通过 OpenRouter 的 Gemini 模型）能够成功生成并返回图像和文本内容，但这些图像在流式传输管道中完全丢失了。用户只能看到文本响应，而完全错过了生成的图像。

这不仅仅是一个次要的功能缺陷——这是一个根本性的架构限制，阻止了我们的平台支持现代语言模型能够提供的丰富多模态 AI 体验。

## 我们发现的问题

在调查过程中，我们识别了 LangChain OpenAI 包在处理多模态内容时的几个关键问题：

### 1. **缺失的 Images 字段**

OpenAI 兼容的 API 以这种格式返回多模态内容：

```json
{
  "role": "assistant",
  "content": "这里是一张图片：",
  "images": [
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/png;base64,iVBORw0KGgo...",
        "detail": "high"
      }
    }
  ]
}
```

然而，LangChain 的消息转换函数完全忽略了 `images` 字段，只处理 `content`、`tool_calls`、`function_call` 和 `audio` 字段。

**原始 LangChain 实现（修复前）：**

```typescript
// _convertCompletionsDeltaToBaseMessageChunk - 原始 LangChain 代码
protected _convertCompletionsDeltaToBaseMessageChunk(
  delta: Record<string, any>,
  rawResponse: OpenAIClient.Chat.Completions.ChatCompletionChunk,
  defaultRole?: OpenAIClient.Chat.ChatCompletionRole
) {
  const role = delta.role ?? defaultRole
  let content = delta.content ?? ""  // 只处理 content 字段

  let additional_kwargs: Record<string, unknown>
  if (delta.function_call) {                    // 处理 function_call
    additional_kwargs = { function_call: delta.function_call }
  } else if (delta.tool_calls) {                // 处理 tool_calls
    additional_kwargs = { tool_calls: delta.tool_calls }
  } else {
    additional_kwargs = {}
  }

  if (delta.audio) {                            // 处理 audio 字段
    additional_kwargs.audio = {
      ...delta.audio,
      index: rawResponse.choices[0].index,
    }
  }
  
  // 注意：没有处理 delta.images 字段！
  // 图像被完全忽略并丢失

  return new AIMessageChunk({ content, ... })
}
```

如您所见，没有处理 `delta.images` 的逻辑 - 该字段被完全忽略，导致所有图像内容都丢失了。

### 2. **流式 Delta 转换缺陷**

LangChain 中的 `_convertCompletionsDeltaToBaseMessageChunk()` 函数处理流式增量，但没有处理图像内容的逻辑。这意味着即使 API 流式传输图像，它们也会被静默丢弃。

**非流式转换中的类似问题：**

```typescript
// _convertCompletionsMessageToBaseMessage - 原始 LangChain 代码
protected _convertCompletionsMessageToBaseMessage(
  message: OpenAIClient.Chat.Completions.ChatCompletionMessage,
  rawResponse: OpenAIClient.Chat.Completions.ChatCompletion
): BaseMessage {
  // 处理 tool_calls、function_call、audio...
  const additional_kwargs: Record<string, unknown> = {
    function_call: message.function_call,     // 处理 function_call
    tool_calls: rawToolCalls,                 // 处理 tool_calls
  }
  
  if (message.audio) {                        // 处理 audio
    additional_kwargs.audio = message.audio
  }

  // 只将 content 字段作为字符串处理
  const content = message.content || ""       // 没有图像处理！

  return new AIMessage({
    content,  // images 字段被完全忽略
    tool_calls: toolCalls,
    additional_kwargs,
    // ...
  })
}
```

在非流式消息转换中存在相同的模式 - `message.images` 从未被处理。

### 3. **Token 计数复杂性**

LangChain 的 token 计数和回调系统期望字符串内容，但多模态内容需要数组格式。这造成了一个冲突：支持图像会破坏现有的 token 跟踪机制。

### 4. **聊天 API 流式传输限制**

我们的聊天 API 的内容提取也只处理文本，这进一步加剧了问题，即使数据通过了 LangChain 层，图像数据也无法保存。

## LangChain 的期望格式 vs 现实

LangChain 期望多模态内容采用这种数组格式：

```json
{
  "role": "assistant", 
  "content": [
    { "type": "text", "text": "这里是一张图片：" },
    { 
      "type": "image_url", 
      "image_url": { 
        "url": "data:image/png;base64,iVBORw0KGgo...",
        "detail": "high"
      }
    }
  ]
}
```

API 提供的内容（`images` 字段）和 LangChain 处理的内容（数组 `content`）之间的根本不匹配造成了集成鸿沟。

## 我们的解决方案：弥合差距

我们没有等待 LangChain 添加官方多模态支持，而是实现了一个全面的解决方案，将 API 响应转换为 LangChain 兼容的格式，同时保留所有功能。

### 1. 增强消息转换函数

我们修改了 LangChain 的核心消息转换函数来处理 `images` 字段：

#### 流式 Delta 转换

```typescript
// 之前：只处理字符串形式的内容
let content = delta.content ?? ""

// 之后：处理 images 字段并转换为数组格式
let content = delta.content ?? ""

// 处理可能包含 image_url 内容的 images 字段
if (delta.images && Array.isArray(delta.images)) {
  if (typeof content === "string") {
    const contentArray = []
    if (content) {
      contentArray.push({ type: "text", text: content })
    }
    // 从 images 字段添加图像内容
    for (const image of delta.images) {
      if (image.type === "image_url" && image.image_url) {
        contentArray.push({
          type: "image_url",
          image_url: image.image_url,
        })
      }
    }
    content = contentArray
  }
}
```

相同的逻辑也应用于非流式消息转换，确保所有响应类型的行为一致。

### 2. 增强聊天 API 流式传输

#### 问题：仅提取文本内容

我们的聊天 API 的 `extractContentFromChunk()` 函数只提取文本：

```typescript
// 之前：只提取文本（原始实现）
const extractContentFromChunk = (chunk: BaseMessageChunk): string => {
  let content = chunk?.content
  // 处理 text_delta 对象数组
  if (Array.isArray(content)) {
    content = content
      .filter(item => item.type === 'text_delta' || item.type === 'text')
      .map(item => ('text' in item ? item.text : ''))
      .join('')
  }
  return content || ''
  // 注意：图像被完全忽略！
  // 即使 LangChain 传递了它们，在这里也会丢失
}
```

这个函数只返回字符串，即使图像数据通过了 LangChain 层，也无法保存。

#### 解决方案：多模态内容提取

```typescript
// 之后：同时提取文本和图像
const extractContentFromChunk = (chunk: BaseMessageChunk): { text: string; images: any[] } => {
  let content = chunk?.content
  let textContent = ''
  let images: any[] = []
  
  if (Array.isArray(content)) {
    // 提取文本内容
    textContent = content
      .filter(item => item.type === 'text_delta' || item.type === 'text')
      .map(item => ('text' in item ? item.text : ''))
      .join('')
    
    // 提取图像内容
    images = content
      .filter(item => item.type === 'image_url' && item.image_url?.url)
      .map(item => ({ type: 'image_url', image_url: item.image_url }))
  } else {
    textContent = content || ''
  }
  
  return { text: textContent, images }
}
```

### 3. 智能内容累积

#### 问题：仅文本流式累积

原始流式传输逻辑只处理文本内容：

```typescript
// 之前：原始流式累积（仅文本）
let accumulatedContent = ''

for await (const chunk of stream) {
  const { text } = extractContentFromChunk(chunk)  // 只提取文本
  accumulatedContent += text  // 只累积文本
  
  // 只向客户端流式传输文本内容
  await streamToClient({
    id: 'msg-123',
    content: accumulatedContent,  // 只有字符串 - 没有图像！
    // 即使图像存在，在此时也会丢失
  })
}

// 最终消息也只是文本
const finalMessage = {
  role: 'assistant',
  content: accumulatedContent  // 字符串格式 - 多模态数据丢失
}
```

这种方法意味着即使 LangChain 以某种方式传递了图像数据，它也会在累积过程中被丢弃。

#### 解决方案：动态多模态累积

增强的流式传输逻辑动态处理文本和图像：

```typescript
// 之后：增强的流式累积（多模态）
let accumulatedTextContent = ''
let accumulatedImages: any[] = []

for await (const chunk of stream) {
  const { text, images } = extractContentFromChunk(chunk)  // 提取两者
  
  // 累积文本内容
  accumulatedTextContent += text
  
  // 累积唯一图像（避免重复）
  for (const image of images) {
    if (!accumulatedImages.some(img => img.image_url?.url === image.image_url?.url)) {
      accumulatedImages.push(image)
    }
  }
  
  // 动态内容格式转换
  let contentToStream: string | MessageContent[]
  if (accumulatedImages.length > 0) {
    const contentArray: MessageContent[] = []
    if (accumulatedTextContent) {
      contentArray.push({ type: 'text', text: accumulatedTextContent })
    }
    contentArray.push(...accumulatedImages)
    contentToStream = contentArray
  } else {
    contentToStream = accumulatedTextContent
  }
  
  // 向客户端流式传输多模态内容
  await streamToClient({
    id: 'msg-123',
    content: contentToStream,  // 字符串或数组 - 保留所有数据！
  })
}

// 最终消息保留多模态结构
const finalMessage = {
  role: 'assistant',
  content: contentToStream  // 保持原始格式
}
```

这种方法确保了：
- 纯文本响应保持为字符串（维持性能）
- 多模态响应自动转换为数组格式
- 内容在流式传输过程中逐步累积

### 4. 前端已具备能力

#### 幸运的架构：前端已经准备好

有趣的是，我们的 Vue.js 前端已经被设计为能够正确处理多模态内容。这显示了良好的架构预见：

```vue
<!-- 原始 ChatMessageItem.vue 模板（已支持多模态） -->
<template>
  <div class="message-container">
    <!-- 文本内容使用 markdown 渲染 -->
    <div class="prose" v-html="markdown.render(messageContent)" />
    
    <!-- 图像画廊（已存在但由于后端限制从未使用） -->
    <div v-if="messageImages.length > 0" class="image-gallery">
      <img v-for="(url, index) in messageImages"
           :key="index"
           :src="url"
           class="message-image"
           :alt="`图像 ${index + 1}`" />
    </div>
  </div>
</template>
```

```typescript
// 原始计算属性（已经处理两种格式）
const messageImages = computed(() => {
  const content = props.message.content
  if (!content || !Array.isArray(content)) return []

  return content
    .filter(item => item.type === 'image_url' && item.image_url?.url)
    .map(item => item.image_url!.url)
})

const messageContent = computed(() => {
  const content = props.message.content
  if (!content) return ''

  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .filter(Boolean)
      .join('\n')
  }
  return content  // 处理字符串内容（向后兼容）
})
```

前端已经为多模态内容做好了准备 - 只是由于后端限制从未收到任何多模态内容！

#### 我们的改进：样式和语义顺序

我们只需要进行小的改进：

```vue
<!-- 之后：使用 Tailwind 和语义顺序的改进样式 -->
<template>
  <div class="message-container">
    <!-- 文本内容优先渲染（语义优先级） -->
    <div v-html="markdown.render(messageContent)" />
    
    <!-- 图像在文本内容下方显示，使用响应式网格 -->
    <div v-if="messageImages.length > 0" 
         class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
      <img v-for="(url, index) in messageImages"
           :src="url"
           class="w-full h-auto rounded-lg max-h-64 object-contain bg-gray-100 dark:bg-gray-800"
           :alt="`图像 ${index + 1}`" />
    </div>
  </div>
</template>
```

进行的更改：
- 用 Tailwind 实用类替换自定义 CSS
- 添加响应式网格布局（`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`）
- 确保图像在语义上显示在文本内容下方
- 用 `mt-3` 添加适当间距

## 关键技术决策

### 1. 向后兼容优先

我们确保现有的纯文本功能保持不变：
- 字符串内容保持为字符串
- 只有在有图像时才转换为数组
- 对现有用户没有破坏性更改

### 2. Token 处理策略

LangChain 的回调期望文本用于 token 计数，所以我们：
- 从多模态内容中提取文本用于回调
- 保留完整的多模态结构用于渲染
- 为跟踪和显示维护独立的管道

### 3. 语义内容排序

遵循自然生成模式：
- 文本内容首先出现
- 图像在文本下方跟随
- 反映 AI 模型通常如何生成内容

### 4. 清洁的生产代码

- 从生产构建中移除所有调试日志
- 用 Tailwind 实用类替换自定义 CSS
- 针对性能和可维护性进行优化

## 性能考虑

### 流式传输效率
- 内容更新立即流式传输以防止超时
- 文本和图像的渐进式累积
- 高效的内存管理，无泄漏

### 内容处理
- 没有图像时开销最小
- 优化的验证和过滤操作
- 仅在需要时进行动态格式转换

## 测试和验证

我们实施了全面的测试，涵盖：

### 核心逻辑测试
- 带文本的单图像场景
- 带文本的多图像
- 仅图像响应（空文本）
- 仅文本响应（向后兼容）
- 无效图像对象处理
- 边缘情况和错误条件

### 集成测试
- 端到端多模态流式传输
- 前端渲染验证
- 性能基准测试
- 跨浏览器兼容性

## 实际使用

以下是系统如何处理典型多模态响应的示例：

### 输入（OpenAI 兼容 API）
```json
{
  "role": "assistant",
  "content": "这里是两个数据可视化：",
  "images": [
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,chart1..." } },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,chart2..." } }
  ]
}
```

### 输出（LangChain 兼容）
```json
{
  "role": "assistant",
  "content": [
    { "type": "text", "text": "这里是两个数据可视化：" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,chart1..." } },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,chart2..." } }
  ]
}
```

### 前端结果
用户看到解释性文本，然后是响应式网格布局中的两个图表图像，创造了无缝的多模态体验。

## 未来考虑

### LangChain 演进
- 监控官方多模态支持开发
- 在原生支持到达时准备迁移路径
- 在过渡期间维护版本兼容性

### 扩展媒体支持
架构易于扩展以支持：
- 视频内容流式传输
- 音频文件附件
- 文档预览
- 交互式媒体元素

### 提供商扩展
适用于任何使用 `images` 字段模式的 OpenAI 兼容 API：
- 带各种模型的 OpenRouter
- 自定义推理端点
- 未来的多模态 API 提供商

## 经验教训

这个实施教会了我们几个重要原则：

### 技术债务管理
- 早期实用决策（仅文本）实现了快速开发
- 明确的限制解决标准防止用户影响
- 渐进式增强保留现有功能

### 集成模式
- 始终验证实际 API 模式 vs 文档
- 为外部服务故障构建优雅的后备
- 从一开始就设计向后兼容性

### 性能优化
- 并行处理优于顺序 API 调用
- 基于内容类型的动态格式转换
- 高效验证，开销最小

## 结论

这个多模态流式传输实施成功地弥合了 LangChain 生态系统中的一个关键差距，同时保持了完全的向后兼容性。通过将 OpenAI 兼容的 API 响应转换为 LangChain 的预期格式，我们在不等待上游库更新的情况下，为 ChatOllama 启用了丰富的多模态体验。

该解决方案展示了深思熟虑的架构如何能够解决第三方限制，同时构建一个这样的变通方案变得不必要的未来。随着 AI 生态系统的发展和 LangChain 添加原生多模态支持，我们的实施提供了一个清晰的迁移路径。

最重要的是，这一增强为 ChatOllama 用户释放了现代多模态 AI 模型的全部潜力，使他们能够接收和与代表 AI 能力前沿的丰富视觉内容进行交互。

---

**修改的文件**: 
- `/server/models/openai/chat_models.ts`
- `/server/api/models/chat/index.post.ts`
- `/components/ChatMessageItem.vue`

**依赖项**: LangChain ^0.1.31, OpenAI SDK ^4.33.0, Vue 3, Nuxt 3

**状态**: 生产就绪 ✅