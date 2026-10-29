import test from 'node:test'
import assert from 'node:assert/strict'
import { startRealtime } from '../src/audio/realtime.js'

function setup(t, { permission, onSend } = {}) {
  const state = { messages: [], errors: [], events: [], stoppedTracks: 0, closedContexts: 0 }
  class Socket {
    static OPEN = 1
    constructor(url) {
      this.url = url
      this.readyState = 1
      this.bufferedAmount = 0
      state.socket = this
      queueMicrotask(() => this.onopen?.())
    }
    send(message) {
      state.messages.push(message)
      if (typeof message === 'string') {
        const event = JSON.parse(message)
        if (event.type === 'start') queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'ready' }) }))
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
    navigator: { mediaDevices: { getUserMedia: permission || (async () => microphone) } },
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
