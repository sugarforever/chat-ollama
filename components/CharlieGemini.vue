<template>
  <div class="fixed bottom-4 right-4 z-50">
    <!-- Collapsed state - just show button -->
    <div v-if="!isExpanded"
         @click="isExpanded = true"
         class="cursor-pointer bg-white dark:bg-gray-800 rounded-full shadow-lg p-4 hover:shadow-xl transition-all">
      <Gemini class="w-10 h-10" />
    </div>

    <!-- Expanded state - show full interface -->
    <div v-else class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[380px]">
      <!-- Header -->
      <div class="flex justify-between items-center p-4 border-b dark:border-gray-700">
        <div class="flex items-center">
          <Gemini class="w-8 h-8 mr-2" />
          <span class="font-semibold dark:text-gray-100">Charlie Gemini</span>
        </div>
        <button @click="isExpanded = false"
                class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <div class="i-material-symbols-close text-xl"></div>
        </button>
      </div>

      <!-- Main content -->
      <div class="p-6">
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
import { defineComponent } from 'vue'
import { getKeysHeader } from '~/utils/settings'
import { useTools } from '~/composables/useTools'
import { MultimodalLiveClient } from '~/utils/MultimodalLiveClient'
import { arrayBufferToBase64 } from '~/utils/multimodal-live'
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
const mediaStream = ref(null)
const audioContext = ref(null)
const audioStreamer = ref(null)
const { getTools, executeToolHandler } = useTools()

watch(() => isExpanded.value, (newValue) => {
  emit('update:expanded', newValue)
})

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

    // Get API key from settings
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
      }
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
