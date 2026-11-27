import { ApiError } from '../api/analysis.js'
import { createRealtimeSocket, readRealtimeEvent, waitForRealtimeReady } from './realtime-socket.js'
import { pcmWavBlob } from './wav.js'

export async function startRealtime({ language, signal, onEvent, onError, onLevel,
  sourceType = 'microphone', file = null, maxDurationSeconds = 600, onSourceEnded, onRecordingReady,
  operatorVoiceSample }) {
  if (!window.isSecureContext || (sourceType === 'microphone' && !navigator.mediaDevices?.getUserMedia)) {
    throw new ApiError('녹음은 localhost 또는 HTTPS 환경에서 사용할 수 있어요.', 'MIC_UNAVAILABLE')
  }

  let context, stream, source, node, socket, flushResolve, finishResolve
  let decodedFile
  const capturedFrames = []
  let capturedBytes = 0
  let stopped = false
  let finished = false
  let stopping = false
  let failed = false
  let finishTimer
  const finishedPromise = new Promise((resolve) => { finishResolve = resolve })

  const cleanupAudio = () => {
    stopped = true
    capturedFrames.length = 0
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (source) source.onended = null
    if (sourceType === 'file') { try { source?.stop() } catch { /* already ended */ } }
    source?.disconnect()
    source = null
    node?.disconnect()
    node = null
    if (context && context.state !== 'closed') context.close().catch(() => {})
  }
  const cancel = () => {
    cleanupAudio()
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
    if (sourceType === 'file') {
      if (!file) throw new ApiError('실시간으로 분석할 음성 파일을 먼저 선택해 주세요.', 'EMPTY_FILE')
      decodedFile = await context.decodeAudioData(await file.arrayBuffer())
      if (decodedFile.duration > maxDurationSeconds)
        throw new ApiError('허용된 음성 길이를 초과했습니다.', 'AUDIO_TOO_LONG')
    } else if (sourceType === 'system') {
      if (!navigator.mediaDevices?.getDisplayMedia)
        throw new ApiError('통화 오디오 공유를 지원하지 않아요. 파일 업로드를 사용해 주세요.', 'MIC_UNSUPPORTED')
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      } })
      if (!stream.getAudioTracks().length)
        throw new ApiError('공유할 탭이나 화면에서 오디오 공유를 선택해 주세요.', 'MIC_UNAVAILABLE')
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      } })
    }
    assertActive()
    await context.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url))
    assertActive()

    socket = createRealtimeSocket()
    await waitForRealtimeReady(socket, {
      language, signal, operatorVoiceSample: sourceType === 'file' ? null : operatorVoiceSample,
    })
    assertActive()
    socket.onclose = () => {
      if (!finished && !stopped) fail(new ApiError('음성 연결이 끊겼어요. 다시 녹음해 주세요.', 'WS_CLOSED'))
      else if (!finished && stopping) fail(new ApiError('최종 분석을 받기 전에 연결이 종료됐어요.', 'WS_CLOSED'))
      cleanupAudio()
      clearTimeout(finishTimer)
      finishResolve()
    }
    socket.onmessage = ({ data }) => {
      let event
      try { event = readRealtimeEvent(data) } catch (error) { fail(error); return }
      if (event.type === 'finished') {
        finished = true
        onEvent(event)
        cancel()
        return
      }
      onEvent(event)
    }
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
      if (onRecordingReady && sourceType !== 'file' && capturedBytes + data.byteLength <= maxDurationSeconds * 32000) {
        capturedFrames.push(data)
        capturedBytes += data.byteLength
      }
      let energy = 0
      for (const sample of pcm) energy += (sample / 32768) ** 2
      onLevel(Math.min(1, Math.sqrt(energy / pcm.length) * 5))
      socket.send(data)
    }
    source = decodedFile ? context.createBufferSource() : context.createMediaStreamSource(stream)
    if (decodedFile) source.buffer = decodedFile
    source.connect(node)
    node.connect(context.destination) // The processor outputs silence, avoiding microphone feedback.

    const session = {
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
        if (capturedFrames.length) onRecordingReady?.(pcmWavBlob(capturedFrames))
        cleanupAudio()
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'finish' }))
          finishTimer = setTimeout(() => fail(new ApiError('최종 분석 응답이 지연되고 있어요. 다시 시도해 주세요.', 'TIMEOUT')), 120000)
        } else finishResolve()
        return finishedPromise
      },
    }
    if (decodedFile) {
      source.onended = () => {
        if (stopped || stopping || finished) return
        onSourceEnded?.()
        session.stop().catch(fail)
      }
      source.start()
    } else if (sourceType === 'system') {
      for (const track of stream.getTracks()) track.addEventListener('ended', () => {
        if (stopped || stopping || finished) return
        onSourceEnded?.()
        session.stop().catch(fail)
      }, { once: true })
    }
    return session
  } catch (error) {
    cancel()
    if (signal?.aborted) throw new DOMException('녹음 취소', 'AbortError')
    if (error.name === 'NotAllowedError') throw new ApiError(sourceType === 'system'
      ? '통화 오디오 공유가 취소되었거나 허용되지 않았습니다. 오디오 공유를 선택해 주세요.'
      : '마이크 접근을 허용해 주세요. 브라우저 주소창의 권한 설정에서 변경할 수 있어요.', 'MIC_DENIED')
    if (error.name === 'NotFoundError') throw new ApiError('연결된 마이크를 찾을 수 없어요. 마이크 연결을 확인해 주세요.', 'MIC_NOT_FOUND')
    throw error
  }
}
