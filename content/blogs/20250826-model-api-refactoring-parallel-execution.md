---
title: "Model API Refactoring: Implementing Parallel Execution and Proper Gemini Integration"
date: 2025-08-26
slug: 20250826-model-api-refactoring-parallel-execution
description: Like many fast-moving projects, ChatOllama started with a pragmatic approach to model management. In the early stages, we simply hardcoded the supp...
---

# Model API Refactoring: Implementing Parallel Execution and Proper Gemini Integration

*August 26, 2025*

## The Challenge

Like many fast-moving projects, ChatOllama started with a pragmatic approach to model management. In the early stages, we simply hardcoded the supported models for different AI provider families in static arrays. This was a conscious decision to move fast and get the core functionality working quickly - a classic "make it work first, optimize later" approach.

However, as the AI landscape evolved rapidly and our platform matured, this technical debt started to create real problems:

**Outdated Model Lists**: New models from providers like OpenAI, Gemini, and others weren't immediately available to users. We had to manually update our static lists every time providers released new capabilities.

**Maintenance Overhead**: Each provider update meant code changes, testing, and deployment cycles just to keep our model lists current.

**User Frustration**: Power users who wanted to try the latest models (like GPT-4 Turbo variants or new Gemini models) had to wait for us to update our hardcoded lists.

**Performance Issues**: On top of the maintenance burden, we discovered that our model discovery API had architectural limitations affecting performance. The existing implementation was processing external API calls sequentially, and our Gemini API integration wasn't aligned with the actual API response schema.

It was time to address this technical debt properly and build a more dynamic, sustainable solution.

## What We Discovered

During our analysis, we identified several key issues:

1. **Sequential API Processing**: The existing code was making API calls to different providers (OpenAI, Gemini, custom endpoints) one after another, creating unnecessary latency when multiple providers were configured.

2. **Incorrect Gemini API Schema**: Our interface definition didn't match the actual Gemini API response structure, which includes a `models` array and optional `nextPageToken` for pagination support.

3. **Monolithic Function**: All the model fetching logic was embedded in a single event handler, making it difficult to maintain and extend for new providers.

4. **Incomplete Field Utilization**: We were defining interface fields that the application didn't actually need, leading to unnecessary data processing.

## The Solution: Parallel Execution and Modular Design

We approached this refactoring with three main goals: improve performance through parallelization, ensure API accuracy, and enhance maintainability through modular design.

### 1. Extracting Provider-Specific Functions

First, we broke down the monolithic approach into dedicated functions for each provider:

```typescript
// Fetch OpenAI models
async function fetchOpenAIModels(apiKey: string): Promise<ModelItem[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    })
    // ... processing logic with fallback
  } catch (error) {
    console.error('Failed to fetch OpenAI models:', error)
  }
  // Fallback to static models
  return OPENAI_GPT_MODELS.map((model) => ({
    name: model,
    details: { family: MODEL_FAMILIES.openai }
  }))
}
```

This pattern was replicated for `fetchGeminiModels()`, `fetchOllamaModels()`, and `fetchCustomModels()`, giving each provider its own isolated logic while maintaining consistent error handling and fallback mechanisms.

### 2. Implementing Parallel Execution

The real performance breakthrough came from implementing parallel execution using `Promise.allSettled()`:

```typescript
export default defineEventHandler(async (event) => {
  const keys = event.context.keys
  const models: ModelItem[] = []

  // Prepare parallel API calls for providers that support dynamic fetching
  const apiCalls: Promise<ModelItem[]>[] = []
  
  // Always try to fetch Ollama models
  apiCalls.push(fetchOllamaModels(event))
  
  // Add API calls based on available keys
  if (keys.openai.key) {
    apiCalls.push(fetchOpenAIModels(keys.openai.key))
  }
  
  if (keys.gemini.key) {
    apiCalls.push(fetchGeminiModels(keys.gemini.key))
  }
  
  // Execute all API calls in parallel
  const results = await Promise.allSettled(apiCalls)
  
  // Process results gracefully
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      models.push(...result.value)
    } else {
      console.error('Failed to fetch models:', result.reason)
    }
  })
  
  // ... continue with static providers
})
```

This approach ensures that if you have both OpenAI and Gemini API keys configured, both APIs are called simultaneously rather than sequentially, significantly reducing the total response time.

### 3. Correcting the Gemini API Integration

We updated our Gemini API integration to match the actual response schema:

```typescript
// Updated interface matching actual Gemini API
interface GeminiModelApiResponse {
  models: Array<{
    name: string
    displayName?: string
    description?: string
    supportedGenerationMethods?: string[]
  }>
  nextPageToken?: string
}

// Proper API call implementation
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
          name: model.name.replace('models/', ''), // Remove API prefix
          details: {
            family: MODEL_FAMILIES.gemini
          }
        }))
    }
  } catch (error) {
    console.error('Failed to fetch Gemini models:', error)
  }
  
  // Fallback to static models
  return GEMINI_MODELS.map((model) => ({
    name: model,
    details: {
      family: MODEL_FAMILIES.gemini
    }
  }))
}
```

We also ensured that only the fields actually needed by the application are included in our interface definition, optimizing both memory usage and type safety.

## The Results

The refactoring delivered several tangible improvements:

**Performance Enhancement**: Users with multiple API providers configured now experience significantly faster model loading, as API calls execute in parallel rather than sequentially.

**Better Error Resilience**: Using `Promise.allSettled()` means that if one provider's API fails, others continue to work normally, providing a more robust user experience.

**Enhanced Maintainability**: The modular approach makes it much easier to add new AI providers or modify existing integrations without affecting other parts of the system.

**Accurate Data Integration**: The corrected Gemini API integration ensures we're getting the most up-to-date model information directly from Google's API, rather than relying solely on static lists.

**Future-Ready Architecture**: The inclusion of `nextPageToken` support means we're prepared for pagination if needed in the future, and the modular design makes extending functionality straightforward.

## Reflecting on Technical Debt

This refactoring is a perfect example of how early pragmatic decisions can evolve into technical debt over time. The initial choice to hardcode model lists was absolutely the right decision for rapid prototyping and early development. It allowed us to focus on core features without getting bogged down in API integration complexity.

However, the AI landscape moves incredibly fast. What seemed like a manageable list of models quickly became a maintenance burden as providers like OpenAI and Google released new models monthly, sometimes weekly. The static approach that served us well in the beginning became a bottleneck for user experience and developer productivity.

The key lesson here is recognizing when technical debt has grown from "helpful shortcut" to "user-impacting limitation." The transition point came when we realized users were asking for models that existed in the wild but weren't available in our platform due to our hardcoded lists.

## Technical Lessons Learned

This refactoring reinforced several important principles for API integration and technical debt management:

1. **Parallel Over Sequential**: When dealing with multiple independent external APIs, always consider parallel execution to improve user experience.

2. **Accuracy Over Assumption**: Always verify actual API response schemas rather than making assumptions based on documentation or other sources.

3. **Modular Design**: Breaking down complex operations into focused, single-responsibility functions improves both maintainability and testability.

4. **Graceful Degradation**: Each integration should have proper fallback mechanisms to ensure the application remains functional even when external services are unavailable.

5. **Interface Minimalism**: Only include the data fields your application actually needs to optimize performance and maintain clean code.

6. **Technical Debt Recognition**: Hardcoded solutions can be valuable for rapid development, but establishing clear criteria for when to transition to dynamic approaches prevents user-impacting limitations.

7. **Progressive Enhancement**: The new dynamic system maintains static fallbacks, ensuring reliability while providing the benefits of real-time data.

## Looking Forward

This refactoring sets a solid foundation for future enhancements to our model management system. The modular architecture makes it straightforward to add support for new AI providers, and the parallel execution pattern can be applied to other areas of the application where multiple external API calls are needed.

The improved Gemini integration also opens up opportunities to leverage additional features from Google's Generative AI API as they become available, while maintaining the performance benefits of our new parallel execution approach.

---

*This improvement is part of our ongoing effort to optimize ChatOllama's performance and maintainability. For more technical insights and updates, follow our development blog series.*
