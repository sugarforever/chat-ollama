export class AudioStreamer {
    public audioQueue: Float32Array[] = [];
    private isPlaying: boolean = false;
    private sampleRate: number = 24000;
    private bufferSize: number = 7680;
    private processingBuffer: Float32Array = new Float32Array(0);
    private scheduledTime: number = 0;
    public gainNode: GainNode
    private isStreamComplete: boolean = false;
    private checkInterval: number | null = null;
    private initialBufferTime: number = 0.1;

    public onComplete = () => { };

    constructor(public context: AudioContext) {
        this.gainNode = this.context.createGain()
        this.gainNode.connect(this.context.destination)
        this.addPCM16 = this.addPCM16.bind(this)
    }

    addPCM16(chunk: Uint8Array) {
        const float32Array = new Float32Array(chunk.length / 2)
        const dataView = new DataView(chunk.buffer)

        for (let i = 0; i < chunk.length / 2; i++) {
            try {
                const int16 = dataView.getInt16(i * 2, true)
                float32Array[i] = int16 / 32768
            } catch (e) {
                console.error(e)
            }
        }

        const newBuffer = new Float32Array(
            this.processingBuffer.length + float32Array.length,
        )
        newBuffer.set(this.processingBuffer)
        newBuffer.set(float32Array, this.processingBuffer.length)
        this.processingBuffer = newBuffer

        while (this.processingBuffer.length >= this.bufferSize) {
            const buffer = this.processingBuffer.slice(0, this.bufferSize)
            this.audioQueue.push(buffer)
            this.processingBuffer = this.processingBuffer.slice(this.bufferSize)
        }

        if (!this.isPlaying) {
            this.isPlaying = true
            this.scheduledTime = this.context.currentTime + this.initialBufferTime
            this.scheduleNextBuffer()
        }
    }

    private createAudioBuffer(audioData: Float32Array): AudioBuffer {
        const audioBuffer = this.context.createBuffer(
            1,
            audioData.length,
            this.sampleRate,
        )
        audioBuffer.getChannelData(0).set(audioData)
        return audioBuffer
    }

    private scheduleNextBuffer() {
        const SCHEDULE_AHEAD_TIME = 0.2

        while (
            this.audioQueue.length > 0 &&
            this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME
        ) {
            const audioData = this.audioQueue.shift()!
            const audioBuffer = this.createAudioBuffer(audioData)
            const source = this.context.createBufferSource()
            source.buffer = audioBuffer
            source.connect(this.gainNode)

            const startTime = Math.max(this.scheduledTime, this.context.currentTime)
            source.start(startTime)

            this.scheduledTime = startTime + audioBuffer.duration
        }

        if (this.audioQueue.length === 0 && this.processingBuffer.length === 0) {
            if (this.isStreamComplete) {
                this.isPlaying = false
                if (this.checkInterval) {
                    clearInterval(this.checkInterval)
                    this.checkInterval = null
                }
            } else {
                if (!this.checkInterval) {
                    this.checkInterval = window.setInterval(() => {
                        if (
                            this.audioQueue.length > 0 ||
                            this.processingBuffer.length >= this.bufferSize
                        ) {
                            this.scheduleNextBuffer()
                        }
                    }, 100) as unknown as number
                }
            }
        } else {
            const nextCheckTime =
                (this.scheduledTime - this.context.currentTime) * 1000
            setTimeout(
                () => this.scheduleNextBuffer(),
                Math.max(0, nextCheckTime - 50),
            )
        }
    }

    stop() {
        this.isPlaying = false
        this.isStreamComplete = true
        this.audioQueue = []
        this.processingBuffer = new Float32Array(0)
        this.scheduledTime = this.context.currentTime

        if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
        }

        this.gainNode.gain.linearRampToValueAtTime(
            0,
            this.context.currentTime + 0.1,
        )

        setTimeout(() => {
            this.gainNode.disconnect()
            this.gainNode = this.context.createGain()
            this.gainNode.connect(this.context.destination)
        }, 200)
    }

    async resume() {
        if (this.context.state === "suspended") {
            await this.context.resume()
        }
        this.isStreamComplete = false
        this.scheduledTime = this.context.currentTime + this.initialBufferTime
        this.gainNode.gain.setValueAtTime(1, this.context.currentTime)
    }

    complete() {
        this.isStreamComplete = true
        if (this.processingBuffer.length > 0) {
            this.audioQueue.push(this.processingBuffer)
            this.processingBuffer = new Float32Array(0)
            if (this.isPlaying) {
                this.scheduleNextBuffer()
            }
        } else {
            this.onComplete()
        }
    }
}
