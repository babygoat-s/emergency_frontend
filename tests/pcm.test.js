import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

test('worklet emits 100 ms little-endian PCM16 mono frames and flushes remaining audio before acknowledgement', async () => {
  let Processor
  const messages = []
  const source = await readFile(new URL('../src/audio/pcm-worklet.js', import.meta.url), 'utf8')
  vm.runInNewContext(source, {
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (data) => messages.push(data) } } },
    registerProcessor: (_name, value) => { Processor = value },
    ArrayBuffer, DataView, Math,
  })
  const processor = new Processor()
  const loud = new Float32Array(1600).fill(1)
  const silent = new Float32Array(1600)
  assert.equal(processor.process([[loud, silent]]), true)
  assert.equal(messages[0].byteLength, 3200)
  const frame = new DataView(messages[0])
  assert.equal(frame.getInt16(0, true), 16384)
  processor.process([[new Float32Array([-1, 0, 1, -2, 2])]])
  processor.port.onmessage({ data: 'flush' })
  assert.equal(messages[1].byteLength, 10)
  const tail = new DataView(messages[1])
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => tail.getInt16(i * 2, true)), [-32768, 0, 32767, -32768, 32767])
  assert.equal(messages[2], 'flushed')
  assert.equal(processor.process([[loud]]), false)
})
