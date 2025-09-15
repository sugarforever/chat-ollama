---
title: 模型API重构：实现并行执行和正确的Gemini集成
date: 2025-08-26
slug: 20250826-model-api-refactoring-parallel-execution_zh
description: "像许多快速发展的项目一样，ChatOllama最初采用了一种实用的模型管理方法。在早期阶段，我们简单地将不同AI提供商系列支持的模型硬编码在静态数组中。这是一个有意识的决定，目的是快速推进并让核心功能先运行起来——经典的\"先让它工作，然后再优化\"的方法。"
---

# 模型API重构：实现并行执行和正确的Gemini集成

*2025年8月26日*

## 遇到的挑战

像许多快速发展的项目一样，ChatOllama最初采用了一种实用的模型管理方法。在早期阶段，我们简单地将不同AI提供商系列支持的模型硬编码在静态数组中。这是一个有意识的决定，目的是快速推进并让核心功能先运行起来——经典的"先让它工作，然后再优化"的方法。

然而，随着AI领域的快速发展和我们平台的成熟，这种技术债务开始产生真正的问题：

**过时的模型列表**：来自OpenAI、Gemini等提供商的新模型无法立即提供给用户。每次提供商发布新功能时，我们都必须手动更新我们的静态列表。

**维护开销**：每次提供商更新都意味着代码更改、测试和部署周期，只是为了保持我们的模型列表是最新的。

**用户挫折感**：想要试用最新模型（如GPT-4 Turbo变体或新的Gemini模型）的高级用户必须等待我们更新硬编码列表。

**性能问题**：除了维护负担之外，我们发现模型发现API存在影响性能的架构限制。现有实现是顺序处理外部API调用，而且我们的Gemini API集成与实际的API响应架构不一致。

是时候正确地解决这个技术债务，并构建一个更动态、更可持续的解决方案了。

## 发现的问题

在分析过程中，我们识别出了几个关键问题：

1. **顺序API处理**：现有代码是逐个调用不同提供商的API（OpenAI、Gemini、自定义端点），这在配置了多个提供商时会产生不必要的延迟。

2. **错误的Gemini API架构**：我们的接口定义与实际的Gemini API响应结构不匹配，实际响应包含一个`models`数组和用于分页支持的可选`nextPageToken`。

3. **单体函数**：所有模型获取逻辑都嵌入在单个事件处理器中，这使得维护和扩展新提供商变得困难。

4. **不完整的字段利用**：我们定义了应用程序实际上不需要的接口字段，导致了不必要的数据处理。

## 解决方案：并行执行和模块化设计

我们用三个主要目标来处理这次重构：通过并行化提高性能，确保API准确性，以及通过模块化设计增强可维护性。

### 1. 提取特定提供商的函数

首先，我们将单体方法分解为每个提供商的专用函数：

```typescript
// 获取OpenAI模型
async function fetchOpenAIModels(apiKey: string): Promise<ModelItem[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    })
    // ... 带有回退机制的处理逻辑
  } catch (error) {
    console.error('Failed to fetch OpenAI models:', error)
  }
  // 回退到静态模型
  return OPENAI_GPT_MODELS.map((model) => ({
    name: model,
    details: { family: MODEL_FAMILIES.openai }
  }))
}
```

这种模式被复制到了`fetchGeminiModels()`、`fetchOllamaModels()`和`fetchCustomModels()`中，为每个提供商提供了独立的逻辑，同时保持了一致的错误处理和回退机制。

### 2. 实现并行执行

真正的性能突破来自于使用`Promise.allSettled()`实现并行执行：

```typescript
export default defineEventHandler(async (event) => {
  const keys = event.context.keys
  const models: ModelItem[] = []

  // 为支持动态获取的提供商准备并行API调用
  const apiCalls: Promise<ModelItem[]>[] = []
  
  // 始终尝试获取Ollama模型
  apiCalls.push(fetchOllamaModels(event))
  
  // 根据可用密钥添加API调用
  if (keys.openai.key) {
    apiCalls.push(fetchOpenAIModels(keys.openai.key))
  }
  
  if (keys.gemini.key) {
    apiCalls.push(fetchGeminiModels(keys.gemini.key))
  }
  
  // 并行执行所有API调用
  const results = await Promise.allSettled(apiCalls)
  
  // 优雅地处理结果
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      models.push(...result.value)
    } else {
      console.error('Failed to fetch models:', result.reason)
    }
  })
  
  // ... 继续处理静态提供商
})
```

这种方法确保了如果你同时配置了OpenAI和Gemini API密钥，两个API会同时调用而不是顺序调用，显著减少了总响应时间。

### 3. 修正Gemini API集成

我们更新了Gemini API集成以匹配实际的响应架构：

```typescript
// 更新的接口匹配实际的Gemini API
interface GeminiModelApiResponse {
  models: Array<{
    name: string
    displayName?: string
    description?: string
    supportedGenerationMethods?: string[]
  }>
  nextPageToken?: string
}

// 正确的API调用实现
async function fetchGeminiModels(apiKey: string): Promise<ModelItem[]> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)

    if (response.ok) {
      const data: GeminiModelApiResponse = await response.json()
      return data.models
        .filter(model => 
          model.supportedGenerationMethods?.includes('generateContent') &&
          !model.name.includes('embedding')
        )
        .map(model => ({
          name: model.name.replace('models/', ''), // 移除API前缀
          details: {
            family: MODEL_FAMILIES.gemini
          }
        }))
    }
  } catch (error) {
    console.error('Failed to fetch Gemini models:', error)
  }
  
  // 回退到静态模型
  return GEMINI_MODELS.map((model) => ({
    name: model,
    details: {
      family: MODEL_FAMILIES.gemini
    }
  }))
}
```

我们还确保在接口定义中只包含应用程序实际需要的字段，优化了内存使用和类型安全性。

## 取得的成果

重构带来了几个切实的改进：

**性能提升**：配置了多个API提供商的用户现在体验到显著更快的模型加载速度，因为API调用是并行执行而不是顺序执行。

**更好的错误恢复能力**：使用`Promise.allSettled()`意味着如果一个提供商的API失败，其他提供商会继续正常工作，提供更稳健的用户体验。

**增强的可维护性**：模块化方法使得添加新的AI提供商或修改现有集成变得更加容易，而不会影响系统的其他部分。

**准确的数据集成**：修正的Gemini API集成确保我们直接从Google的API获取最新的模型信息，而不是仅仅依赖静态列表。

**面向未来的架构**：包含`nextPageToken`支持意味着我们为将来可能需要的分页做好了准备，模块化设计使得扩展功能变得简单直接。

## 对技术债务的反思

这次重构是早期实用主义决策如何随时间演变为技本债务的完美例子。最初选择硬编码模型列表对于快速原型开发和早期开发绝对是正确的决定。它让我们能够专注于核心功能，而不会被API集成的复杂性所困扰。

然而，AI领域的发展速度令人难以置信。最初看起来可管理的模型列表很快就变成了维护负担，因为OpenAI和Google等提供商每月甚至每周都会发布新模型。在开始阶段为我们提供良好服务的静态方法变成了用户体验和开发者生产力的瓶颈。

这里的关键经验是识别技术债务何时从"有帮助的捷径"变成了"影响用户的限制"。转折点在于我们意识到用户正在询问在外部存在但在我们平台上由于硬编码列表而不可用的模型。

## 学到的技术经验

这次重构强化了API集成和技术债务管理的几个重要原则：

1. **并行优于顺序**：当处理多个独立的外部API时，始终考虑并行执行以改善用户体验。

2. **准确性胜过假设**：始终验证实际的API响应架构，而不是基于文档或其他来源进行假设。

3. **模块化设计**：将复杂操作分解为专注的、单一职责的函数，可以改善可维护性和可测试性。

4. **优雅降级**：每个集成都应该有适当的回退机制，以确保即使外部服务不可用时应用程序仍能保持功能。

5. **接口最小化**：只包含应用程序实际需要的数据字段，以优化性能并保持代码整洁。

6. **技术债务识别**：硬编码解决方案对于快速开发很有价值，但建立清晰的标准来决定何时过渡到动态方法可以防止影响用户的限制。

7. **渐进式增强**：新的动态系统保持静态回退，确保可靠性的同时提供实时数据的好处。

## 展望未来

这次重构为我们模型管理系统的未来增强奠定了坚实的基础。模块化架构使得添加新AI提供商的支持变得简单直接，并行执行模式可以应用到应用程序中需要多个外部API调用的其他区域。

改进的Gemini集成也为利用Google生成式AI API的其他功能创造了机会，当这些功能可用时，同时保持我们新的并行执行方法的性能优势。

---

*这个改进是我们持续优化ChatOllama性能和可维护性努力的一部分。欲了解更多技术见解和更新，请关注我们的开发博客系列。*
