import test from 'node:test'
import assert from 'node:assert/strict'
import { pcmWavBlob } from '../src/audio/wav.js'

test('local preview has a playable PCM16 mono header and preserves every sample', async () => {
  const frames = [new Int16Array([-32000, 123]).buffer, new Int16Array([0, 24000]).buffer]
  const buffer = await pcmWavBlob(frames).arrayBuffer()
  const data = new DataView(buffer)
  assert.equal(new TextDecoder().decode(buffer.slice(0, 4)), 'RIFF')
  assert.equal(data.getUint32(24, true), 16000)
  assert.equal(data.getUint16(22, true), 1)
  assert.equal(data.getUint16(34, true), 16)
  assert.equal(data.getUint32(40, true), 8)
  assert.deepEqual([...new Int16Array(buffer.slice(44))], [-32000, 123, 0, 24000])
})
