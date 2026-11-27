import test from 'node:test'
import assert from 'node:assert/strict'
import { startRealtime } from '../src/audio/realtime.js'
import { validateOperatorVoiceSample } from '../src/audio/realtime-socket.js'
import { setAuthToken } from '../src/api/session.js'

function setup(t, { permission, onSend, displayPermission, sampleError } = {}) {
  const state = { messages: [], errors: [], events: [], stoppedTracks: 0, closedContexts: 0 }
  class Socket {
    static OPEN = 1
    constructor(url, protocols) {
      this.url = url
      this.protocols = protocols
      this.readyState = 1
      this.bufferedAmount = 0
      state.socket = this
      queueMicrotask(() => this.onopen?.())
    }
    send(message) {
      state.messages.push(message)
      if (typeof message === 'string') {
        const event = JSON.parse(message)
        if (event.type === 'start') queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(
          event.operator_voice_sample
            ? { type: 'operator_voice_sample_required', max_frame_bytes: 32000 }
            : { type: 'ready' }) }))
        if (event.type === 'operator_voice_sample_end') queueMicrotask(() => {
          if (sampleError) this.onmessage?.({ data: JSON.stringify({ type: 'error', error: { code: sampleError, message: 'internal detail' } }) })
          else this.onmessage?.({ data: JSON.stringify({ type: 'ready' }) })
        })
        if (event.type === 'finish') queueMicrotask(() => {
          if (onSend) onSend(this)
          else this.onmessage?.({ data: JSON.stringify({ type: 'finished' }) })
        })
      }
    }
    close() {
      if (this.readyState === 3) return
      this.readyState = 3
      queueMicrotask(() => this.onclose?.())
    }
  }
  class Context {
    sampleRate = 16000
    state = 'running'
    destination = {}
    audioWorklet = { addModule: async () => {} }
    resume() { return Promise.resolve() }
    close() { this.state = 'closed'; state.closedContexts++; return Promise.resolve() }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    decodeAudioData() { return Promise.resolve({ duration: 10 }) }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() { state.started = true }, stop() {} }
      state.source = source
      return source
    }
  }
  class Worklet {
    constructor() {
      this.port = { postMessage: () => queueMicrotask(() => {
        this.port.onmessage({ data: new ArrayBuffer(100) })
        this.port.onmessage({ data: 'flushed' })
      }) }
      state.node = this
    }
    connect() {}
    disconnect() {}
  }
  const microphone = { getTracks: () => [{ stop: () => { state.stoppedTracks++ } }] }
  const replacements = {
    window: { isSecureContext: true, location: { origin: 'http://localhost:5173' }, AudioContext: Context },
    navigator: { mediaDevices: { getUserMedia: permission || (async () => microphone), getDisplayMedia: displayPermission } },
    WebSocket: Socket, AudioWorkletNode: Worklet,
  }
  for (const [name, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
    t.after(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name])
  }
  return { state, microphone }
}

test('realtime handshake, final PCM flush, finish event, and audio cleanup follow the backend protocol', async (t) => {
  const { state } = setup(t)
  const session = await startRealtime({ language: 'ja', onEvent: (event) => state.events.push(event), onError: (error) => state.errors.push(error), onLevel: () => {} })
  assert.deepEqual(JSON.parse(state.messages[0]), { type: 'start', encoding: 'pcm_s16le', sample_rate: 16000, channels: 1, language: 'ja' })
  assert.equal(state.socket.url, 'ws://localhost:5173/api/v1/analysis/realtime')
  await session.stop()
  assert.equal(state.messages[1].byteLength, 100)
  assert.equal(JSON.parse(state.messages[2]).type, 'finish')
  assert.equal(state.events[0].type, 'finished')
  assert.equal(state.stoppedTracks, 1)
  assert.equal(state.closedContexts, 1)
  assert.equal(state.socket.readyState, 3)
  assert.deepEqual(state.errors, [])
})

test('WebSocket authentication sends the token only in the handshake', async (t) => {
  const { state } = setup(t)
  setAuthToken('test.session.token')
  t.after(() => setAuthToken(''))
  const session = await startRealtime({ language: 'ko', onEvent() {}, onError() {}, onLevel() {} })
  assert.deepEqual(state.socket.protocols, ['emergency.v1', 'auth.test.session.token'])
  assert.equal(state.socket.url, 'ws://localhost:5173/api/v1/analysis/realtime')
  assert.equal(state.messages[0].includes('test.session.token'), false)
  await session.stop()
})

test('saved operator audio reaches the backend before the live PCM stream', async (t) => {
  const { state } = setup(t)
  const voice = new ArrayBuffer(128002)
  new Uint8Array(voice).fill(7)
  const session = await startRealtime({ language: 'ko', operatorVoiceSample: voice,
    onEvent() {}, onError() {}, onLevel() {} })
  assert.equal(JSON.parse(state.messages[0]).operator_voice_sample, true)
  assert.deepEqual(state.messages.slice(1, 6).map((frame) => frame.byteLength), [32000, 32000, 32000, 32000, 2])
  assert.ok(state.messages.slice(1, 6).every((frame) => new Uint8Array(frame).every((value) => value === 7)))
  assert.equal(JSON.parse(state.messages[6]).type, 'operator_voice_sample_end')
  await session.stop()
  assert.equal(state.messages[7].byteLength, 100)
  assert.equal(JSON.parse(state.messages[8]).type, 'finish')
})

test('sample validation sends enrollment only and rejects samples without enough speech', async (t) => {
  const { state } = setup(t, { sampleError: 'OPERATOR_VOICE_TOO_SHORT' })
  await assert.rejects(validateOperatorVoiceSample(new ArrayBuffer(128000)), { code: 'OPERATOR_VOICE_TOO_SHORT' })
  assert.equal(JSON.parse(state.messages.at(-1)).type, 'operator_voice_sample_end')
  assert.equal(state.node, undefined)
  assert.equal(state.socket.readyState, 3)
})

test('cancellation during a pending microphone request stops the microphone when permission resolves', async (t) => {
  let allowMicrophone
  const { state, microphone } = setup(t, { permission: () => new Promise((resolve) => { allowMicrophone = resolve }) })
  const controller = new AbortController()
  const pending = startRealtime({ language: 'ko', signal: controller.signal, onEvent: () => {}, onError: () => {}, onLevel: () => {} })
  await new Promise((resolve) => setImmediate(resolve))
  controller.abort()
  allowMicrophone(microphone)
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(state.stoppedTracks, 1)
  assert.equal(state.closedContexts, 1)
  assert.equal(state.socket, undefined)
})

test('a disconnect before the finished event reports one error instead of appearing successful', async (t) => {
  const { state } = setup(t, { onSend: (socket) => socket.close() })
  const session = await startRealtime({ language: 'ko', onEvent: (event) => state.events.push(event), onError: (error) => state.errors.push(error), onLevel: () => {} })
  await session.stop()
  assert.equal(state.errors.length, 1)
  assert.equal(state.errors[0].code, 'WS_CLOSED')
  assert.equal(state.events.length, 0)
  assert.equal(state.stoppedTracks, 1)
})

test('microphone permission denial returns an actionable message and releases the audio context', async (t) => {
  const { state } = setup(t, { permission: async () => { throw new DOMException('Denied', 'NotAllowedError') } })
  await assert.rejects(startRealtime({ language: 'ko', onEvent: () => {}, onError: () => {}, onLevel: () => {} }), { code: 'MIC_DENIED' })
  assert.equal(state.closedContexts, 1)
})

test('fatal WebSocket errors never expose upstream diagnostic messages', async (t) => {
  const { state } = setup(t)
  await startRealtime({ language: 'ko', onEvent: () => {}, onError: (error) => state.errors.push(error), onLevel: () => {} })
  state.socket.onmessage({ data: JSON.stringify({ type: 'error', error: {
    code: 'GEMINI_API_KEY_REJECTED',
    message: 'Gemini HTTP 400 INVALID_ARGUMENT .env secret-test',
  } }) })
  assert.equal(state.errors.length, 1)
  assert.equal(state.errors[0].message, '음성 분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')
  assert.equal(state.stoppedTracks, 1)
})

test('file input uses decoded digital audio and sends finish when it ends, without requesting a microphone', async (t) => {
  let requested = false
  const { state } = setup(t, { permission: async () => { requested = true; throw new Error('microphone') } })
  let ended = false
  await startRealtime({ language: 'ko', sourceType: 'file', file: new Blob(['test']),
    onSourceEnded: () => { ended = true }, onEvent: event => state.events.push(event),
    onError: error => state.errors.push(error), onLevel() {} })
  assert.equal(state.started, true)
  assert.equal(requested, false)
  state.source.onended()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(ended, true)
  assert.equal(state.events.at(-1).type, 'finished')
  assert.equal(JSON.parse(state.messages.at(-1)).type, 'finish')
  assert.equal(state.closedContexts, 1)
})

test('system capture sends audio only and releases audio and display tracks', async (t) => {
  let constraints
  let stopped = 0
  const track = { stop() { stopped++ }, addEventListener() {} }
  const { state } = setup(t, { displayPermission: async value => {
    constraints = value
    return { getAudioTracks: () => [track], getTracks: () => [track, track] }
  } })
  let preview
  const session = await startRealtime({ language: 'ko', sourceType: 'system', onEvent() {},
    onError() {}, onLevel() {}, onRecordingReady: blob => { preview = blob } })
  await session.stop()
  assert.equal(constraints.audio.echoCancellation, false)
  assert.equal(stopped, 2)
  assert.equal(preview.type, 'audio/wav')
  assert.equal(preview.size, 144)
  assert.equal(state.messages.filter(value => typeof value !== 'string').length, 1)
})

test('sharing without an audio track fails before opening a WebSocket', async (t) => {
  let stopped = false
  const { state } = setup(t, { displayPermission: async () => ({
    getAudioTracks: () => [], getTracks: () => [{ stop() { stopped = true } }],
  }) })
  await assert.rejects(startRealtime({ sourceType: 'system', language: 'ko', onError() {},
    onEvent() {}, onLevel() {} }), { code: 'MIC_UNAVAILABLE' })
  assert.equal(stopped, true)
  assert.equal(state.socket, undefined)
})

test('operator voice sample errors show fixed local messages and release the microphone', async (t) => {
  const { state } = setup(t, { sampleError: 'OPERATOR_VOICE_TOO_SHORT' })
  await assert.rejects(startRealtime({ language: 'ko', operatorVoiceSample: new ArrayBuffer(128000),
    onEvent() {}, onError() {}, onLevel() {} }), { code: 'OPERATOR_VOICE_TOO_SHORT', message: /4초 이상/ })
  assert.equal(state.stoppedTracks, 1)
  assert.equal(state.closedContexts, 1)
  assert.equal(state.node, undefined)
})

test('a file source never requests operator voice registration', async (t) => {
  const { state } = setup(t)
  const session = await startRealtime({ language: 'ko', sourceType: 'file', file: new Blob(['x']), operatorVoiceSample: new ArrayBuffer(128000),
    onEvent() {}, onError() {}, onLevel() {} })
  assert.equal('operator_voice_sample' in JSON.parse(state.messages[0]), false)
  await session.stop()
})
