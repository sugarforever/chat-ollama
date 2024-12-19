<template>
  <div class="flex items-center justify-center">
    <div class="max-w-md w-full p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <h1 class="text-2xl font-bold mb-10 text-center dark:text-gray-100">Realtime WebRTC Connection</h1>

      <div class="space-y-6">
        <!-- Connection status and button combined -->
        <div class="flex flex-col items-center">
          <button
                  @click="handleConnectionToggle"
                  class="w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 relative"
                  :class="buttonStyles"
                  :disabled="connectionStatus === 'connecting'">
            <!-- Different icons based on status -->
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
</template>

<script setup>
import { getKeysHeader } from '~/utils/settings'

const connectionStatus = ref('disconnected')
const error = ref('')
const peerConnection = ref(null)
const dataChannel = ref(null)

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
  if (peerConnection.value) {
    peerConnection.value.close()
    peerConnection.value = null
  }
  if (dataChannel.value) {
    dataChannel.value.close()
    dataChannel.value = null
  }
  connectionStatus.value = 'disconnected'
}

async function initConnection() {
  try {
    connectionStatus.value = 'connecting'
    error.value = ''

    // Get ephemeral token from server with proper headers
    const tokenResponse = await fetch('/api/audio/session', {
      method: 'POST',
      headers: getKeysHeader()
    })
    const data = await tokenResponse.json()
    const EPHEMERAL_KEY = data.client_secret.value

    // Create peer connection
    peerConnection.value = new RTCPeerConnection()

    // Set up audio element for remote audio
    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    peerConnection.value.ontrack = e => audioEl.srcObject = e.streams[0]

    // Request microphone access and add local track
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    })
    peerConnection.value.addTrack(mediaStream.getTracks()[0])

    // Setup data channel
    dataChannel.value = peerConnection.value.createDataChannel('oai-events')
    dataChannel.value.addEventListener('message', (e) => {
      console.log('Received message:', e)
    })

    // Create and set local description
    const offer = await peerConnection.value.createOffer()
    await peerConnection.value.setLocalDescription(offer)

    // Connect to OpenAI realtime API
    const baseUrl = 'https://api.openai.com/v1/realtime'
    const model = 'gpt-4o-realtime-preview-2024-12-17'
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        'Content-Type': 'application/sdp'
      },
    })

    const answer = {
      type: 'answer',
      sdp: await sdpResponse.text(),
    }
    await peerConnection.value.setRemoteDescription(answer)

    // Update connection status
    connectionStatus.value = 'connected'

    // Handle connection state changes
    peerConnection.value.onconnectionstatechange = () => {
      if (peerConnection.value.connectionState === 'disconnected') {
        connectionStatus.value = 'disconnected'
      }
    }

  } catch (err) {
    console.error('Connection error:', err)
    error.value = `Failed to connect: ${err.message}`
    connectionStatus.value = 'disconnected'
  }
}
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

.animate-wave {
  animation: wave 1s ease-in-out infinite;
}
</style>
