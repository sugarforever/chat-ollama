import { Readable } from 'stream';
import { setEventStreamResponse } from '@/server/utils';
import { getOllama } from '@/server/utils/ollama'
import { MODEL_FAMILIES } from '~/config/index'

export default defineEventHandler(async (event) => {
  const { model, stream } = await readBody(event);

  setEventStreamResponse(event);

  // Check if model belongs to an external provider by fetching the models list
  const keys = event.context.keys
  const isExternalProviderModel = await checkIfExternalProviderModel(model, event)
  
  if (isExternalProviderModel) {
    // External providers don't support downloading models - they're already available
    const readableStream = Readable.from((async function* () {
      yield `${JSON.stringify({ status: "success", message: "Model is already available from external provider" })}\n\n`;
    })());
    return sendStream(event, readableStream);
  }

  const ollama = await getOllama(event, true)
  if (!ollama) {
    const readableStream = Readable.from((async function* () {
      yield `${JSON.stringify({ "error": "Ollama is not available. Please ensure Ollama is running." })}\n\n`;
    })());
    return sendStream(event, readableStream);
  }

  const response = await ollama.pull({ model, stream });

  const readableStream = Readable.from((async function* () {
    try {
      for await (const chunk of response) {
        yield `${JSON.stringify(chunk)}\n\n`;
      }
    } catch (error: any) {
      const error_response = JSON.stringify({ "error": error.message })
      yield `${error_response}\n\n`;// You can choose to yield an empty string or any other value to indicate the error
    }
  })());
  return sendStream(event, readableStream);
})

async function checkIfExternalProviderModel(modelName: string, event: any): Promise<boolean> {
  // Use the existing models endpoint logic to check if model is from external provider
  // Import the logic from the models index.get.ts to avoid code duplication
  
  const keys = event.context.keys

  // Check if model is from OpenAI
  if (keys.openai?.key) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${keys.openai.key}` }
      })
      if (response.ok) {
        const data = await response.json()
        const hasModel = data.data
          .filter((model: any) => !model.id.includes('embedding'))
          .some((model: any) => model.id === modelName)
        if (hasModel) return true
      }
    } catch (error) {
      console.error('Error checking OpenAI models:', error)
    }
  }

  // Check static external provider models
  const externalProviders = [
    { family: MODEL_FAMILIES.azureOpenai, hasKey: keys.azureOpenai?.key && keys.azureOpenai?.endpoint && keys.azureOpenai?.deploymentName },
    { family: MODEL_FAMILIES.anthropic, hasKey: keys.anthropic?.key },
    { family: MODEL_FAMILIES.moonshot, hasKey: keys.moonshot?.key },
    { family: MODEL_FAMILIES.gemini, hasKey: keys.gemini?.key },
    { family: MODEL_FAMILIES.groq, hasKey: keys.groq?.key },
  ]

  // Import static model lists to check against
  const { ANTHROPIC_MODELS, AZURE_OPENAI_GPT_MODELS, MOONSHOT_MODELS, GEMINI_MODELS, GROQ_MODELS } = await import('~/config/index')
  
  const staticModelLists = [
    { models: AZURE_OPENAI_GPT_MODELS, hasKey: keys.azureOpenai?.key && keys.azureOpenai?.endpoint && keys.azureOpenai?.deploymentName },
    { models: ANTHROPIC_MODELS, hasKey: keys.anthropic?.key },
    { models: MOONSHOT_MODELS, hasKey: keys.moonshot?.key },
    { models: GEMINI_MODELS, hasKey: keys.gemini?.key },
    { models: GROQ_MODELS, hasKey: keys.groq?.key },
  ]

  for (const provider of staticModelLists) {
    if (provider.hasKey && provider.models.includes(modelName)) {
      return true
    }
  }

  // Check custom providers
  if (Array.isArray(keys.custom)) {
    for (const customProvider of keys.custom) {
      if (customProvider.key && customProvider.endpoint && MODEL_FAMILIES.hasOwnProperty(customProvider.aiType)) {
        // If models are explicitly configured for this provider, check them
        if (Array.isArray(customProvider.models) && customProvider.models.includes(modelName)) {
          return true
        }
        
        // For custom providers that were successfully fetched in the models list,
        // we need to check if this model was listed there
        // Note: We could call the models API here but to avoid duplication,
        // we'll use a pattern-based approach for common external model names
        if (modelName.includes('gpt-') || modelName.includes('claude-') || 
            modelName.includes('gemini-') || modelName.includes('moonshot-') ||
            modelName.includes('phi') || modelName.includes('deepseek') ||
            modelName.includes('qwen') || modelName.includes('yi-')) {
          return true
        }
      }
    }
  }

  return false
}
