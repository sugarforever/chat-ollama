<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Realtime WebRTC Connection</h1>

    <div class="space-y-4">
      <!-- Status indicators -->
      <div class="flex items-center space-x-2">
        <div
             class="w-3 h-3 rounded-full"
             :class="connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'"></div>
        <span>Connection Status: {{ connectionStatus }}</span>
      </div>

      <!-- Connection button -->
      <button
              @click="initConnection"
              class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              :disabled="connectionStatus === 'connecting'">
        {{ connectionButtonText }}
      </button>

      <!-- Error message -->
      <div v-if="error" class="text-red-500">
        {{ error }}
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

const connectionButtonText = computed(() => {
  switch (connectionStatus.value) {
    case 'connecting':
      return 'Connecting...'
    case 'connected':
      return 'Connected'
    default:
      return 'Connect'
  }
})

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
