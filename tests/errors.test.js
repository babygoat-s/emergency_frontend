import test from 'node:test'
import assert from 'node:assert/strict'
import { getExample } from '../src/api/analysis.js'
import { EMPTY_STREAM, mergeStreamEvent } from '../src/lib/results.js'
import { publicErrorMessage } from '../src/lib/error-messages.js'

const detail = 'Gemini HTTP 400 INVALID_ARGUMENT API_KEY_INVALID .env secret-test'

test('REST errors retain machine codes but never display upstream diagnostic text', async (t) => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'GEMINI_INVALID_REQUEST', message: detail } }), { status: 502 })
  t.after(() => { globalThis.fetch = original })
  await assert.rejects(getExample(), (error) => {
    assert.equal(error.code, 'GEMINI_INVALID_REQUEST')
    assert.equal(error.message, publicErrorMessage(error.code))
    assert.equal(error.message.includes('Gemini'), false)
    return true
  })
})

test('stream analysis errors are sanitized before rendering and downloading', () => {
  const state = mergeStreamEvent(EMPTY_STREAM, {
    type: 'update', stage: 'analysis', sequence: 1,
    data: { status: 'unavailable', transcript: { text: '예시' } },
    error: { code: 'GEMINI_INVALID_REQUEST', message: detail },
  })
  assert.equal(state.analysisError.message, publicErrorMessage('GEMINI_INVALID_REQUEST'))
  assert.equal(state.analysisError.message.includes('INVALID_ARGUMENT'), false)
})

test('known input errors remain actionable and unknown errors use safe text', () => {
  assert.match(publicErrorMessage('NO_SPEECH'), /음성/)
  assert.match(publicErrorMessage('GEMINI_UPSTREAM_TIMEOUT'), /시간이 초과/)
  assert.equal(publicErrorMessage('UNKNOWN_SECRET'), publicErrorMessage(undefined))
  assert.equal(publicErrorMessage('constructor'), publicErrorMessage(undefined))
})
