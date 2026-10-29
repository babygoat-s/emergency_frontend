// AudioWorklet runs on the audio thread. The backend requires raw 16 kHz mono PCM16.
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.reset()
    this.stopped = false
    this.port.onmessage = ({ data }) => {
      if (data === 'flush') {
        if (this.offset) this.emit()
        this.stopped = true
        this.port.postMessage('flushed')
      }
    }
  }

  reset() {
    this.buffer = new ArrayBuffer(3200)
    this.view = new DataView(this.buffer)
    this.offset = 0
  }

  emit() {
    const frame = this.buffer.slice(0, this.offset * 2)
    this.port.postMessage(frame, [frame])
    this.reset()
  }

  process(inputs) {
    if (this.stopped) return false
    const channels = inputs[0]
    if (!channels?.length) return true
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0
      for (const channel of channels) sample += channel[i] / channels.length
      sample = Math.max(-1, Math.min(1, sample))
      this.view.setInt16(this.offset++ * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
      if (this.offset === 1600) this.emit()
    }
    return true
  }
}

registerProcessor('emergency-pcm', PCMProcessor)
