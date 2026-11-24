import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeFile, analyzeText, getExample, verifySession } from '../src/api/analysis.js'
import { setAuthToken } from '../src/api/session.js'
import { EMPTY_STREAM, mergeStreamEvent } from '../src/lib/results.js'
import { publicErrorMessage } from '../src/lib/error-messages.js'

const detail = 'Gemini HTTP 400 INVALID_ARGUMENT API_KEY_INVALID .env secret-test'

test('authenticated requests send the token as a header and keep the multipart body', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original; setAuthToken('') })
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return new Response(JSON.stringify({ status: 'ok' }))
  }
  await verifySession('test.login.token')
  setAuthToken('test.session.token')
  await analyzeFile(new File(['synthetic'], 'test.wav'), 'ko')
  assert.equal(requests[0].url, '/api/v1/auth/session')
  assert.equal(requests[0].options.headers.get('Authorization'), 'Bearer test.login.token')
  assert.equal(requests[1].options.headers.get('Authorization'), 'Bearer test.session.token')
  assert.equal(requests[1].options.headers.has('Content-Type'), false)
  assert.equal(requests[1].options.body.get('file').name, 'test.wav')
})

test('local text analysis requests no LLM and recognizes completed manual retrieval', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).use_llm, false)
    return new Response(JSON.stringify({ status: 'ready', llm_status: 'disabled', questions: [] }))
  }
  const result = await analyzeText('신고자: 가상 상담입니다.')
  assert.equal(result.status, 'completed')
})

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
