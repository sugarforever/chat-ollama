<template>
  <div class="fixed bottom-4 right-4 z-50">
    <!-- Collapsed state - just show button -->
    <div v-if="!isExpanded"
         @click="isExpanded = true"
         class="cursor-pointer bg-white dark:bg-gray-800 rounded-full shadow-lg p-4 hover:shadow-xl transition-all">
      <Gemini class="w-10 h-10" />
    </div>

    <!-- Expanded state - show full interface -->
    <div v-else class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[380px] border border-gray-200 dark:border-gray-700">
      <!-- Header -->
      <div class="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-t-lg">
        <div class="flex items-center">
          <Gemini class="w-8 h-8 mr-2" />
          <span class="font-semibold text-gray-900 dark:text-gray-100">Charlie Gemini</span>
        </div>
        <button @click="isExpanded = false"
                class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <div class="i-material-symbols-close text-xl"></div>
        </button>
      </div>

      <!-- Main content -->
      <div class="p-6 bg-white dark:bg-gray-800">
        <div class="space-y-6">
          <!-- Connection status and button combined -->
          <div class="flex flex-col items-center">
            <button
                    @click="handleConnectionToggle"
                    class="w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 relative"
                    :class="buttonStyles"
                    :disabled="connectionStatus === 'connecting'">
              <IconMicrophone v-if="connectionStatus === 'disconnected'" class="w-8 h-8" />
              <IconSpinner v-else-if="connectionStatus === 'connecting'" class="w-8 h-8 animate-spin" />
              <IconStop v-else class="w-8 h-8" />

              <!-- Ripple effect when active -->
              <div v-if="connectionStatus === 'connected'" class="absolute inset-0">
                <div class="absolute inset-0 rounded-full animate-ping opacity-25 bg-primary-500 dark:bg-primary-700"></div>
              </div>
            </button>

            <span class="mt-6 text-sm text-gray-600 dark:text-gray-400">{{ statusText }}</span>
          </div>

          <!-- Audio wave visualization when connected -->
          <div v-if="connectionStatus === 'connected'" class="flex justify-center items-center h-12">
            <div v-for="n in 5" :key="n"
                 class="mx-1 w-1 bg-primary-500 dark:bg-primary-700 rounded-full animate-wave"
                 :style="`height: ${20 + Math.random() * 20}px; animation-delay: ${n * 0.1}s`">
            </div>
          </div>

          <!-- Altair visualization -->
          <div v-if="jsonString" class="mt-4 border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
            <!-- Add your visualization component here using jsonString -->
            <pre class="text-xs overflow-auto max-h-40">{{ jsonString }}</pre>
          </div>

          <!-- Error message -->
          <div v-if="error" class="text-red-500 dark:text-red-400 text-center text-sm">
            {{ error }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useStorage } from '@vueuse/core'
import { useTools } from '~/composables/useTools'
import { MultimodalLiveClient } from '~/utils/MultimodalLiveClient'
import { SchemaType } from "@google/generative-ai";
import IconMicrophone from '~/components/IconMicrophone.vue'
import IconSpinner from '~/components/IconSpinner.vue'
import IconStop from '~/components/IconStop.vue'
import Gemini from '~/components/Gemini.vue'
import { AudioStreamer } from '~/utils/audio-streamer'
import { AudioRecorder } from '~/utils/audio-recorder'

const props = defineProps({
  defaultExpanded: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:expanded'])
const isExpanded = ref(props.defaultExpanded)
const connectionStatus = ref('disconnected')
const error = ref('')
const wsClient = ref(null)
const audioRecorder = ref(new AudioRecorder())
const audioContext = ref(null)
const audioStreamer = ref(null)
const jsonString = ref('')
const { getTools, executeToolHandler } = useTools()

watch(() => isExpanded.value, (newValue) => {
  emit('update:expanded', newValue)
})

const declaration = {
  name: "tavily_search",
  description: "Search the web using Tavily API to get relevant information.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "The search query to look up",
      },
    },
    required: ["query"],
  },
}

// Handle tool calls
async function handleToolCall(toolCall) {
  console.log('Got toolcall:', toolCall)
  const functionCall = toolCall.functionCalls.find(fc => fc.name === declaration.name)

  if (functionCall) {
    try {
      const config = useRuntimeConfig()
      const tavilyApiKey = config.public.tavilyApiKey

      if (!tavilyApiKey) {
        throw new Error('Tavily API key not found')
      }

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query: functionCall.args.query,
          search_depth: "basic",
          include_answer: false,
          include_images: true,
          include_image_descriptions: true,
          include_raw_content: false,
          max_results: 5,
          include_domains: [],
          exclude_domains: []
        })
      })

      const data = await response.json()
      console.log('Tavily search result:', data)
      // Format the search results
      let formattedResults = 'Search Results:\n\n'

      // Add text results
      data.results.forEach((result, index) => {
        formattedResults += `${index + 1}. ${result.title}\n`
        formattedResults += `URL: ${result.url}\n`
        formattedResults += `Content: ${result.content}\n\n`
      })

      // Add image results if available
      if (data.images && data.images.length > 0) {
        formattedResults += '\nRelevant Images:\n'
        data.images.forEach((image, index) => {
          formattedResults += `${index + 1}. ${image.description}\n`
          formattedResults += `URL: ${image.url}\n\n`
        })
      }

      // Send the response back
      wsClient.value.sendToolResponse({
        functionResponses: [{
          response: { output: formattedResults },
          id: functionCall.id
        }]
      })

    } catch (error) {
      console.error('Tavily search error:', error)
      wsClient.value.sendToolResponse({
        functionResponses: [{
          response: { output: `Error performing search: ${error.message}` },
          id: functionCall.id
        }]
      })
    }
  }
}

// Setup and cleanup tool call handler
watch(() => wsClient.value, (newClient, oldClient) => {
  if (oldClient) {
    oldClient.off('toolcall', handleToolCall)
  }
  if (newClient) {
    newClient.on('toolcall', handleToolCall)
  }
}, { immediate: true })

// Computed properties for UI
const buttonStyles = computed(() => ({
  'bg-primary-500 hover:bg-primary-600 dark:bg-primary-700 dark:hover:bg-primary-800 text-white':
    connectionStatus.value === 'disconnected',
  'bg-yellow-500 dark:bg-yellow-600 cursor-not-allowed':
    connectionStatus.value === 'connecting',
  'bg-red-500 hover:bg-red-600 dark:bg-red-700 dark:hover:bg-red-800 text-white':
    connectionStatus.value === 'connected'
}))

const statusText = computed(() => {
  switch (connectionStatus.value) {
    case 'connecting':
      return 'Initializing connection...'
    case 'connected':
      return 'Tap to end conversation'
    default:
      return 'Tap to start conversation'
  }
})

// Handle connection toggle
async function handleConnectionToggle() {
  if (connectionStatus.value === 'connected') {
    await stopConnection()
  } else {
    await initConnection()
  }
}

// Stop connection
async function stopConnection() {
  if (wsClient.value) {
    wsClient.value.disconnect()
    wsClient.value = null
  }
  audioRecorder.value.stop()
  if (audioStreamer.value) {
    audioStreamer.value.stop()
    audioStreamer.value = null
  }
  connectionStatus.value = 'disconnected'
}

async function initConnection() {
  try {
    connectionStatus.value = 'connecting'
    error.value = ''

    // Get API keys from settings
    const keys = await useStorage('keys', {}).value
    const GEMINI_API_KEY = keys.gemini?.key

    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not found')
    }

    // Initialize audio streamer for output
    audioContext.value = new AudioContext()
    audioStreamer.value = new AudioStreamer(audioContext.value)
    await audioStreamer.value.resume()

    // Initialize WebSocket client
    wsClient.value = new MultimodalLiveClient({
      apiKey: GEMINI_API_KEY
    })

    // Set up event handlers
    wsClient.value.on('log', (log) => {
      console.log('Gemini Log Event:', log)
    })

    wsClient.value.on('open', () => {
      connectionStatus.value = 'connected'
      // Start audio recording when connected
      audioRecorder.value.on('data', (base64Audio) => {
        if (connectionStatus.value === 'connected') {
          wsClient.value.sendRealtimeInput([{
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000"
          }])
        }
      })
      audioRecorder.value.start()
    })

    wsClient.value.on('close', (event) => {
      console.log('Gemini Event: WebSocket connection closed', event)
      stopConnection()
    })

    wsClient.value.on('error', (err) => {
      console.error('Gemini Event: WebSocket error:', err)
      error.value = `Connection error: ${err.message}`
      stopConnection()
    })

    wsClient.value.on('audio', async (audioData) => {
      if (audioStreamer.value) {
        audioStreamer.value.addPCM16(new Uint8Array(audioData))
      }
    })

    // Get runtime config for Tavily
    const config = useRuntimeConfig()
    const tools = []

    // Only add Tavily search if API key is present
    if (config.public.tavilyApiKey) {
      tools.push({ functionDeclarations: [declaration] })
    }

    await wsClient.value.connect({
      model: 'models/gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        responseModalities: ["audio"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
      },
      tools,
    })

    // Send initial greeting
    wsClient.value.send({
      text: "Hello!"
    })

  } catch (err) {
    console.error('Connection error:', err)
    error.value = `Failed to connect: ${err.message}`
    connectionStatus.value = 'disconnected'
    audioRecorder.value.stop()
    if (audioStreamer.value) {
      audioStreamer.value.stop()
      audioStreamer.value = null
    }
  }
}

// Clean up on component unmount
onUnmounted(() => {
  if (wsClient.value) {
    wsClient.value.off('toolcall', handleToolCall)
  }
  stopConnection()
})
</script>

<style scoped>
@keyframes wave {

  0%,
  100% {
    transform: scaleY(0.5);
  }

  50% {
    transform: scaleY(1);
  }
}

:deep(.animate-wave) {
  animation: wave 1s ease-in-out infinite;
}
</style>
