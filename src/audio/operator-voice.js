import { ApiError } from '../api/analysis.js'
import { publicErrorMessage } from '../lib/error-messages.js'

export const OPERATOR_VOICE_SENTENCES = [
  '안녕하세요. 제 목소리가 잘 들리나요?',
  '천천히 말씀해 주시면 제가 듣고 확인하겠습니다.',
  '준비가 되면 이어서 말씀해 주세요.',
]

export const OPERATOR_VOICE_MAX_SECONDS = 20
const MIN_BYTES = 4 * 32000
const MAX_BYTES = OPERATOR_VOICE_MAX_SECONDS * 32000

export function isOperatorVoiceSample(sample) {
  return sample instanceof ArrayBuffer && sample.byteLength >= MIN_BYTES &&
    sample.byteLength <= MAX_BYTES && sample.byteLength % 2 === 0
}

export async function startOperatorVoiceCapture(signal) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new ApiError('마이크 녹음은 localhost 또는 HTTPS에서 사용할 수 있어요.', 'MIC_UNAVAILABLE')
  }
  let context, stream, source, node, flushResolve
  let bytes = 0
  const frames = []
  const cleanup = () => {
    signal?.removeEventListener('abort', cleanup)
    flushResolve?.()
    node?.disconnect()
    node = null
    source?.disconnect()
    source = null
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (context && context.state !== 'closed') context.close().catch(() => {})
  }
  const assertActive = () => {
    if (signal?.aborted) throw new DOMException('녹음 취소', 'AbortError')
  }
  signal?.addEventListener('abort', cleanup, { once: true })
  try {
    assertActive()
    const Context = window.AudioContext || window.webkitAudioContext
    if (!Context) throw new ApiError('이 브라우저는 마이크 녹음을 지원하지 않아요.', 'MIC_UNSUPPORTED')
    context = new Context({ sampleRate: 16000 })
    if (context.sampleRate !== 16000 || !context.audioWorklet) {
      throw new ApiError('이 브라우저는 마이크 녹음을 지원하지 않아요.', 'MIC_UNSUPPORTED')
    }
    await context.resume()
    assertActive()
    stream = await navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    } })
    assertActive()
    await context.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url))
    assertActive()
    source = context.createMediaStreamSource(stream)
    node = new AudioWorkletNode(context, 'emergency-pcm')
    node.port.onmessage = ({ data }) => {
      if (data === 'flushed') { flushResolve?.(); return }
      if (bytes === MAX_BYTES || signal?.aborted) return
      const frame = data.byteLength > MAX_BYTES - bytes ? data.slice(0, MAX_BYTES - bytes) : data
      frames.push(frame)
      bytes += frame.byteLength
    }
    source.connect(node)
    node.connect(context.destination)
    return async () => {
      let timer
      try {
        assertActive()
        await new Promise((resolve) => {
          flushResolve = resolve
          timer = setTimeout(resolve, 1500)
          node.port.postMessage('flush')
        })
        assertActive()
        const sample = await new Blob(frames).arrayBuffer()
        assertActive()
        if (!isOperatorVoiceSample(sample)) {
          const code = 'OPERATOR_VOICE_TOO_SHORT'
          throw new ApiError(publicErrorMessage(code), code)
        }
        return sample
      } finally {
        clearTimeout(timer)
        frames.length = 0
        cleanup()
      }
    }
  } catch (error) {
    cleanup()
    assertActive()
    if (error.name === 'NotAllowedError') throw new ApiError('브라우저에서 마이크 접근을 허용해 주세요.', 'MIC_DENIED')
    if (error.name === 'NotFoundError') throw new ApiError('연결된 마이크를 찾을 수 없어요.', 'MIC_NOT_FOUND')
    throw error
  }
}
