import type { ChatMessage } from '~/types/chat'
import { getKeysHeader } from '~/utils/settings'

interface QuickChatOptions {
  systemPrompt?: string
  model?: string
  family?: string
  currentModels?: string[]
}

export function useQuickChat(options: MaybeRefOrGetter<QuickChatOptions> = {}) {
  const query = ref('')
  const response = ref('')
  const isLoading = ref(false)
  const error = ref('')

  const { t } = useI18n()
  const { chatModels } = useModels()
  
  // Make options reactive
  const reactiveOptions = computed(() => toValue(options))
  const currentModels = computed(() => reactiveOptions.value.currentModels || [])

  // Default system prompt for quick chat
  const defaultSystemPrompt = `You are a helpful AI assistant providing quick, concise answers to user questions. 
When provided with selected content as context, use it to better understand and answer the user's question.
Keep your responses clear, concise, and directly relevant to the question asked.`

  const reset = () => {
    query.value = ''
    response.value = ''
    error.value = ''
    isLoading.value = false
  }

  const sendQuickChat = async (userQuery: string, selectedContent?: string) => {
    if (!userQuery.trim()) return

    isLoading.value = true
    error.value = ''
    response.value = ''

    try {
      // Use current session models first, fallback to available models
      let availableModel = reactiveOptions.value.model
      
      if (!availableModel && currentModels.value.length > 0) {
        // Use the first model from current session
        availableModel = currentModels.value[0]
      } else if (!availableModel) {
        // Fallback to first available model
        availableModel = chatModels.value[0]?.value
      }
      
      if (!availableModel) {
        throw new Error(t('quickChat.noModelAvailable'))
      }

      console.log('Quick chat using model:', availableModel)

      // Parse model value to get family and name
      const [family, ...nameParts] = availableModel.split('/')
      const modelName = nameParts.join('/')

      // Construct system prompt with context if provided
      let systemPrompt = reactiveOptions.value.systemPrompt || defaultSystemPrompt
      if (selectedContent) {
        systemPrompt += `\n\nSelected content for context:\n"""${selectedContent}"""`
      }

      // Prepare messages for the chat API
      const messages: Array<{
        role: 'system' | 'user' | 'assistant'
        content: string
        toolResult: boolean
        toolCallId: string
      }> = [
        {
          role: 'system',
          content: systemPrompt,
          toolResult: false,
          toolCallId: ''
        },
        {
          role: 'user', 
          content: userQuery,
          toolResult: false,
          toolCallId: ''
        }
      ]

      // Make the streaming API call
      const response_stream = await fetch('/api/models/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: modelName,
          family: family,
          messages,
          stream: true,
          enableToolUsage: false // Disable tools for quick chat to keep it simple and fast
        }),
        headers: {
          'Content-Type': 'application/json',
          ...getKeysHeader()
        }
      })

      if (!response_stream.ok) {
        const errorData = await response_stream.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response_stream.status}`)
      }

      // Handle streaming response
      if (response_stream.body) {
        const reader = response_stream.body.getReader()
        await processStreamingResponse(reader)
      }
    } catch (err: any) {
      console.error('Quick chat error:', err)
      error.value = err.message || t('quickChat.error')
    } finally {
      isLoading.value = false
    }
  }

  const processStreamingResponse = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        
        // Process complete messages (separated by double newlines)
        const parts = buffer.split(' \n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const trimmedPart = part.trim()
          if (!trimmedPart) continue

          try {
            const data = JSON.parse(trimmedPart)
            if (data.message?.content) {
              // Handle both string and array content formats
              if (typeof data.message.content === 'string') {
                response.value = data.message.content
              } else if (Array.isArray(data.message.content)) {
                // Extract text from multimodal content
                const textContent = data.message.content
                  .filter(item => item.type === 'text')
                  .map(item => item.text)
                  .join('')
                response.value = textContent
              }
            }
          } catch (parseError) {
            console.warn('Failed to parse streaming response:', parseError)
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  return {
    query,
    response,
    isLoading,
    error,
    sendQuickChat,
    reset
  }
}