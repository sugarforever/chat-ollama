import type { Content, GenerativeContentBlob, Part } from "@google/generative-ai"
import { EventEmitter } from "eventemitter3"
import { difference } from "lodash"
import {
  type ClientContentMessage,
  isInterrupted,
  isModelTurn,
  isServerContentMessage,
  isSetupCompleteMessage,
  isToolCallCancellationMessage,
  isToolCallMessage,
  isTurnComplete,
  type LiveIncomingMessage,
  type ModelTurn,
  type RealtimeInputMessage,
  type ServerContent,
  type SetupMessage,
  type StreamingLog,
  type ToolCall,
  type ToolCallCancellation,
  type ToolResponseMessage,
  type LiveConfig,
} from "~/types/multimodal-live-types"
import { blobToJSON, base64ToArrayBuffer } from "./multimodal-live"

/**
 * the events that this client will emit
 */
interface MultimodalLiveClientEventTypes {
  open: () => void
  log: (log: StreamingLog) => void
  close: (event: CloseEvent) => void
  audio: (data: ArrayBuffer) => void
  content: (data: ServerContent) => void
  interrupted: () => void
  setupcomplete: () => void
  turncomplete: () => void
  toolcall: (toolCall: ToolCall) => void
  toolcallcancellation: (toolcallCancellation: ToolCallCancellation) => void
}

export type MultimodalLiveAPIClientConnection = {
  url?: string
  apiKey: string
}

/**
 * A event-emitting class that manages the connection to the websocket and emits
 * events to the rest of the application.
 */
export class MultimodalLiveClient extends EventEmitter<MultimodalLiveClientEventTypes> {
  public ws: WebSocket | null = null
  protected config: LiveConfig | null = null
  public url: string = ""

  public getConfig() {
    return { ...this.config }
  }

  constructor({ url, apiKey }: MultimodalLiveAPIClientConnection) {
    super()
    url =
      url ||
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`
    url += `?key=${apiKey}`
    this.url = url
    this.send = this.send.bind(this)
  }

  log(type: string, message: StreamingLog["message"]) {
    const log: StreamingLog = {
      date: new Date(),
      type,
      message,
    }
    this.emit("log", log)
  }

  connect(config: LiveConfig): Promise<boolean> {
    this.config = config

    const ws = new WebSocket(this.url)

    ws.addEventListener("message", async (evt: MessageEvent) => {
      console.warn('Received message:', evt)
      if (evt.data instanceof Blob) {
        this.receive(evt.data)
      } else {
        console.log("non blob message", evt)
      }
    })
    return new Promise((resolve, reject) => {
      const onError = (ev: Event) => {
        this.disconnect(ws)
        const message = `Could not connect to "${this.url}"`
        this.log(`server.${ev.type}`, message)
        reject(new Error(message))
      }
      ws.addEventListener("error", onError)
      ws.addEventListener("open", (ev: Event) => {
        if (!this.config) {
          reject("Invalid config sent to `connect(config)`")
          return
        }
        this.log(`client.${ev.type}`, `connected to socket`)
        this.emit("open")

        this.ws = ws

        const setupMessage: SetupMessage = {
          setup: this.config,
        }
        this._sendDirect(setupMessage)
        this.log("client.send", "setup")

        ws.removeEventListener("error", onError)
        ws.addEventListener("close", (ev: CloseEvent) => {
          console.log(ev)
          this.disconnect(ws)
          let reason = ev.reason || ""
          if (reason.toLowerCase().includes("error")) {
            const prelude = "ERROR]"
            const preludeIndex = reason.indexOf(prelude)
            if (preludeIndex > 0) {
              reason = reason.slice(
                preludeIndex + prelude.length + 1,
                Infinity,
              )
            }
          }
          this.log(
            `server.${ev.type}`,
            `disconnected ${reason ? `with reason: ${reason}` : ``}`,
          )
          this.emit("close", ev)
        })
        resolve(true)
      })
    })
  }

  disconnect(ws?: WebSocket) {
    if ((!ws || this.ws === ws) && this.ws) {
      this.ws.close()
      this.ws = null
      this.log("client.close", `Disconnected`)
      return true
    }
    return false
  }

  protected async receive(blob: Blob) {
    const response: LiveIncomingMessage = (await blobToJSON(
      blob,
    )) as LiveIncomingMessage
    console.warn('Received message:', response)
    if (isToolCallMessage(response)) {
      this.log("server.toolCall", response)
      this.emit("toolcall", response.toolCall!)
      return
    }
    if (isToolCallCancellationMessage(response)) {
      this.log("receive.toolCallCancellation", response)
      this.emit("toolcallcancellation", response.toolCallCancellation!)
      return
    }

    if (isSetupCompleteMessage(response)) {
      this.log("server.send", "setupComplete")
      this.emit("setupcomplete")
      return
    }

    if (isServerContentMessage(response)) {
      const { serverContent } = response
      if (serverContent && isInterrupted(serverContent)) {
        this.log("receive.serverContent", "interrupted")
        this.emit("interrupted")
        return
      }
      if (serverContent && isTurnComplete(serverContent)) {
        this.log("server.send", "turnComplete")
        this.emit("turncomplete")
      }

      if (serverContent && isModelTurn(serverContent)) {
        let parts: Part[] = serverContent.modelTurn!.parts

        const audioParts = parts.filter(
          (p) => p.inlineData && p.inlineData.mimeType.startsWith("audio/pcm"),
        )
        const base64s = audioParts.map((p) => p.inlineData?.data)

        const otherParts = difference(parts, audioParts)

        base64s.forEach((b64) => {
          if (b64) {
            const data = base64ToArrayBuffer(b64)
            this.emit("audio", data)
            this.log(`server.audio`, `buffer (${data.byteLength})`)
          }
        })
        if (!otherParts.length) {
          return
        }

        parts = otherParts

        const content: ModelTurn = { modelTurn: { parts } }
        this.emit("content", content)
        this.log(`server.content`, response)
      }
    } else {
      console.log("received unmatched message", response)
    }
  }

  sendRealtimeInput(chunks: GenerativeContentBlob[]) {
    let hasAudio = false
    let hasVideo = false
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i]
      if (ch.mimeType.includes("audio")) {
        hasAudio = true
      }
      if (ch.mimeType.includes("image")) {
        hasVideo = true
      }
      if (hasAudio && hasVideo) {
        break
      }
    }
    const message =
      hasAudio && hasVideo
        ? "audio + video"
        : hasAudio
          ? "audio"
          : hasVideo
            ? "video"
            : "unknown"

    const data: RealtimeInputMessage = {
      realtimeInput: {
        mediaChunks: chunks,
      },
    }
    this._sendDirect(data)
    this.log(`client.realtimeInput`, message)
  }

  sendToolResponse(toolResponse: ToolResponseMessage["toolResponse"]) {
    const message: ToolResponseMessage = {
      toolResponse,
    }

    this._sendDirect(message)
    this.log(`client.toolResponse`, message)
  }

  send(parts: Part | Part[], turnComplete: boolean = true) {
    parts = Array.isArray(parts) ? parts : [parts]
    const content: Content = {
      role: "user",
      parts,
    }

    const clientContentRequest: ClientContentMessage = {
      clientContent: {
        turns: [content],
        turnComplete,
      },
    }

    this._sendDirect(clientContentRequest)
    this.log(`client.send`, clientContentRequest)
  }

  _sendDirect(request: object) {
    if (!this.ws) {
      throw new Error("WebSocket is not connected")
    }
    const str = JSON.stringify(request)
    console.log('Sending message:', str)
    this.ws.send(str)
  }
}
