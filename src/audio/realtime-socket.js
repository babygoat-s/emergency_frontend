import { ApiError, realtimeUrl } from '../api/analysis.js'
import { getAuthToken } from '../api/session.js'
import { publicErrorMessage } from '../lib/error-messages.js'

export function createRealtimeSocket() {
  const token = getAuthToken()
  return new WebSocket(realtimeUrl(), token ? ['emergency.v1', `auth.${token}`] : [])
}

export function readRealtimeEvent(data) {
  let event
  try { event = JSON.parse(data) } catch { /* Invalid wire response. */ }
  if (!event || typeof event.type !== 'string') {
    throw new ApiError('실시간 응답을 읽지 못했어요.', 'INVALID_RESPONSE')
  }
  if (event.type === 'error') {
    throw new ApiError(publicErrorMessage(event.error?.code), event.error?.code)
  }
  return event
}

export function waitForRealtimeReady(socket, { language = 'ko', signal, operatorVoiceSample }) {
  return new Promise((resolve, reject) => {
    let sampleSent = false
    const complete = (error) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      socket.onopen = socket.onerror = socket.onclose = socket.onmessage = null
      if (error) reject(error)
      else resolve()
    }
    const abort = () => complete(new DOMException('녹음 취소', 'AbortError'))
    const timer = setTimeout(() => complete(new ApiError(
      '실시간 서버 연결 시간이 초과됐어요.', 'WS_TIMEOUT',
    )), operatorVoiceSample ? 60000 : 10000)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }

    socket.onopen = () => socket.send(JSON.stringify({
      type: 'start', encoding: 'pcm_s16le', sample_rate: 16000, channels: 1, language,
      ...(operatorVoiceSample ? { operator_voice_sample: true } : {}),
    }))
    socket.onerror = () => complete(new ApiError('실시간 서버에 연결할 수 없어요.', 'WS_CONNECTION'))
    socket.onclose = () => complete(new ApiError('실시간 연결이 종료됐어요.', 'WS_CLOSED'))
    socket.onmessage = ({ data }) => {
      try {
        const event = readRealtimeEvent(data)
        if (event.type === 'operator_voice_sample_required') {
          const frameSize = Math.min(32000, event.max_frame_bytes)
          if (!operatorVoiceSample || sampleSent || !Number.isInteger(frameSize) || frameSize < 2 || frameSize % 2) {
            throw new ApiError('상담원 음성을 전송하지 못했어요.', 'INVALID_RESPONSE')
          }
          for (let offset = 0; offset < operatorVoiceSample.byteLength; offset += frameSize) {
            socket.send(operatorVoiceSample.slice(offset, offset + frameSize))
          }
          socket.send(JSON.stringify({ type: 'operator_voice_sample_end' }))
          sampleSent = true
        } else if (event.type === 'ready') {
          if (operatorVoiceSample && !sampleSent) {
            throw new ApiError(publicErrorMessage('OPERATOR_VOICE_UNAVAILABLE'), 'OPERATOR_VOICE_UNAVAILABLE')
          }
          complete()
        }
      } catch (error) {
        complete(error)
      }
    }
  })
}

export async function validateOperatorVoiceSample(sample, signal) {
  if (signal?.aborted) throw new DOMException('녹음 취소', 'AbortError')
  const socket = createRealtimeSocket()
  try {
    await waitForRealtimeReady(socket, { signal, operatorVoiceSample: sample })
  } finally {
    socket.close()
  }
}
