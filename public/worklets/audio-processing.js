class AudioRecordingProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.buffer = new Float32Array()
        this.bufferSize = 1024
        this.bytesPerSample = 2
        this.maxValue = 32767 // Max value for 16-bit integer
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0][0]
        if (!input) return true

        // Append new data to buffer
        const newBuffer = new Float32Array(this.buffer.length + input.length)
        newBuffer.set(this.buffer)
        newBuffer.set(input, this.buffer.length)
        this.buffer = newBuffer

        // Process buffer when we have enough samples
        while (this.buffer.length >= this.bufferSize) {
            const chunk = this.buffer.slice(0, this.bufferSize)
            this.buffer = this.buffer.slice(this.bufferSize)

            // Convert to 16-bit PCM
            const int16Array = new Int16Array(chunk.length)
            for (let i = 0; i < chunk.length; i++) {
                const s = Math.max(-1, Math.min(1, chunk[i]))
                int16Array[i] = s < 0 ? s * this.maxValue : s * (this.maxValue - 1)
            }

            // Send the buffer to the main thread
            this.port.postMessage({
                data: {
                    int16arrayBuffer: int16Array.buffer
                }
            }, [int16Array.buffer])
        }

        return true
    }
}

registerProcessor('audio-recorder-worklet', AudioRecordingProcessor)
