import { ApiError, realtimeUrl } from '../api/analysis.js'
import { publicErrorMessage } from '../lib/error-messages.js'

export async function startRealtime({ language, signal, onEvent, onError, onLevel }) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new ApiError('녹음은 localhost 또는 HTTPS 환경에서 사용할 수 있어요.', 'MIC_UNAVAILABLE')
  }

  let context, stream, source, node, socket, flushResolve, finishResolve
  let stopped = false
  let finished = false
  let stopping = false
  let failed = false
  let finishTimer
  let openTimer
  const finishedPromise = new Promise((resolve) => { finishResolve = resolve })

  const cleanupAudio = () => {
    stopped = true
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    source?.disconnect()
    source = null
    node?.disconnect()
    node = null
    if (context && context.state !== 'closed') context.close().catch(() => {})
  }
  const cancel = () => {
    cleanupAudio()
    clearTimeout(openTimer)
    clearTimeout(finishTimer)
    signal?.removeEventListener('abort', cancel)
    socket?.close()
    finishResolve()
  }
  const fail = (error) => {
    if (failed || finished) return
    failed = true
    if (!signal?.aborted) onError(error)
    cancel()
  }
  signal?.addEventListener('abort', cancel, { once: true })
  const assertActive = () => {
    if (signal?.aborted || stopped) throw new DOMException('녹음 취소', 'AbortError')
  }

  try {
    assertActive()
    const Context = window.AudioContext || window.webkitAudioContext
    context = new Context({ sampleRate: 16000 })
    if (context.sampleRate !== 16000 || !context.audioWorklet) {
      throw new ApiError('이 브라우저는 실시간 녹음을 지원하지 않아요. 음성 파일을 업로드해 주세요.', 'MIC_UNSUPPORTED')
    }
    await context.resume()
    stream = await navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    } })
    assertActive()
    await context.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url))
    assertActive()

    socket = new WebSocket(realtimeUrl())
    await new Promise((resolve, reject) => {
      openTimer = setTimeout(() => reject(new ApiError('실시간 서버 연결 시간이 초과됐어요.', 'WS_TIMEOUT')), 10000)
      socket.onopen = () => socket.send(JSON.stringify({ type: 'start', encoding: 'pcm_s16le', sample_rate: 16000, channels: 1, language }))
      socket.onerror = () => reject(new ApiError('실시간 서버에 연결할 수 없어요.', 'WS_CONNECTION'))
      socket.onclose = () => {
        reject(new ApiError('실시간 연결이 종료됐어요.', 'WS_CLOSED'))
        if (!finished && !stopped) fail(new ApiError('음성 연결이 끊겼어요. 다시 녹음해 주세요.', 'WS_CLOSED'))
        else if (!finished && stopping) fail(new ApiError('최종 분석을 받기 전에 연결이 종료됐어요.', 'WS_CLOSED'))
        cleanupAudio()
        clearTimeout(finishTimer)
        finishResolve()
      }
      socket.onmessage = ({ data }) => {
        let event
        try { event = JSON.parse(data) }
        catch { fail(new ApiError('실시간 응답을 읽지 못했어요.', 'INVALID_RESPONSE')); return }
        if (event.type === 'ready') { clearTimeout(openTimer); resolve(); return }
        if (event.type === 'error') {
          const error = new ApiError(publicErrorMessage(event.error?.code), event.error?.code)
          reject(error)
          fail(error)
          return
        }
        if (event.type === 'finished') {
          finished = true
          onEvent(event)
          cancel()
          return
        }
        onEvent(event)
      }
    })
    assertActive()
    socket.onerror = () => fail(new ApiError('음성 전송 중 연결 오류가 발생했어요.', 'WS_CONNECTION'))
    node = new AudioWorkletNode(context, 'emergency-pcm')
    node.port.onmessage = ({ data }) => {
      if (data === 'flushed') { flushResolve?.(); return }
      if (stopped || socket.readyState !== WebSocket.OPEN) return
      if (socket.bufferedAmount > 320000) {
        fail(new ApiError('음성 전송이 지연되어 녹음을 중단했어요. 연결 상태를 확인해 주세요.', 'STREAM_BACKPRESSURE'))
        return
      }
      const pcm = new Int16Array(data)
      let energy = 0
      for (const sample of pcm) energy += (sample / 32768) ** 2
      onLevel(Math.min(1, Math.sqrt(energy / pcm.length) * 5))
      socket.send(data)
    }
    source = context.createMediaStreamSource(stream)
    source.connect(node)
    node.connect(context.destination) // The processor outputs silence, avoiding microphone feedback.

    return {
      cancel,
      async stop() {
        if (stopping || stopped) return finishedPromise
        stopping = true
        let flushTimer
        await new Promise((resolve) => {
          flushResolve = resolve
          flushTimer = setTimeout(resolve, 1500)
          node.port.postMessage('flush')
        })
        clearTimeout(flushTimer)
        cleanupAudio()
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'finish' }))
          finishTimer = setTimeout(() => fail(new ApiError('최종 분석 응답이 지연되고 있어요. 다시 시도해 주세요.', 'TIMEOUT')), 120000)
        } else finishResolve()
        return finishedPromise
      },
    }
  } catch (error) {
    cancel()
    if (signal?.aborted) throw new DOMException('녹음 취소', 'AbortError')
    if (error.name === 'NotAllowedError') throw new ApiError('마이크 접근을 허용해 주세요. 브라우저 주소창의 권한 설정에서 변경할 수 있어요.', 'MIC_DENIED')
    if (error.name === 'NotFoundError') throw new ApiError('연결된 마이크를 찾을 수 없어요. 마이크 연결을 확인해 주세요.', 'MIC_NOT_FOUND')
    throw error
  }
}
