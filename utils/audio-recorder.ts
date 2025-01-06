import { EventEmitter } from "eventemitter3"
import AudioRecordingWorklet from "./audio-worklets/audio-processing"

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = ""
  var bytes = new Uint8Array(buffer)
  var len = bytes.byteLength
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined
  audioContext: AudioContext | undefined
  source: MediaStreamAudioSourceNode | undefined
  recording: boolean = false
  recordingWorklet: AudioWorkletNode | undefined
  vuWorklet: AudioWorkletNode | undefined
  private starting: Promise<void> | null = null

  constructor(public sampleRate = 16000) {
    super()
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Could not request user media")
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        this.audioContext = new AudioContext({ sampleRate: this.sampleRate })
        this.source = this.audioContext.createMediaStreamSource(this.stream)

        const workletName = "audio-recorder-worklet"
        const workletBlob = new Blob([AudioRecordingWorklet], { type: 'text/javascript' })
        const workletUrl = URL.createObjectURL(workletBlob)

        await this.audioContext.audioWorklet.addModule(workletUrl)
        URL.revokeObjectURL(workletUrl)

        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName,
        )

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          if (ev.data.event === "chunk") {
            const arrayBuffer = ev.data.data.int16arrayBuffer
            if (arrayBuffer) {
              const arrayBufferString = arrayBufferToBase64(arrayBuffer)
              this.emit("data", arrayBufferString)
            }
          }
        }

        this.source.connect(this.recordingWorklet)
        this.recording = true
        resolve()
      } catch (error) {
        reject(error)
      } finally {
        this.starting = null
      }
    })

    return this.starting
  }

  stop() {
    const handleStop = () => {
      this.source?.disconnect()
      this.stream?.getTracks().forEach((track) => track.stop())
      this.stream = undefined
      this.recordingWorklet = undefined
      this.recording = false
    }

    if (this.starting) {
      this.starting.then(handleStop)
      return
    }
    handleStop()
  }
}
