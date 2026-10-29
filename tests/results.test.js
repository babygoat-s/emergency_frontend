import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_STREAM, mergeStreamEvent, validateFile, formatTime } from '../src/lib/results.js'

const payload = (text, analysis = null, symptoms = []) => ({
  transcript: { text, segments: [] }, analysis, symptoms,
  speakers: { available: false }, audio_signals: { available: false },
  status: analysis ? 'completed' : 'pending', warnings: [], is_demo: false,
})
const event = (sequence, stage, data, error) => ({ type: 'update', sequence, stage, data, error })

test('late analysis cannot replace the latest transcript or local symptoms', () => {
  const local = [{ code: 'bleeding', label: '출혈' }]
  let state = mergeStreamEvent(EMPTY_STREAM, event(1, 'audio', payload('첫 번째 음성')))
  state = mergeStreamEvent(state, event(2, 'audio', payload('첫 번째 음성. 새 음성.', null, local)))
  state = mergeStreamEvent(state, event(1, 'analysis', payload('첫 번째 음성', { summary: '이전 구간 분석' }, [{ code: 'collapse' }])))
  assert.equal(state.data.transcript.text, '첫 번째 음성. 새 음성.')
  assert.equal(state.data.analysis.summary, '이전 구간 분석')
  assert.deepEqual(state.data.symptoms, local)
  assert.equal(state.transcriptSequence, 2)
  assert.equal(state.analysisSequence, 1)
  assert.equal(EMPTY_STREAM.data, null)
})

test('an older Gemini result or error cannot overwrite a newer result', () => {
  let state = mergeStreamEvent(EMPTY_STREAM, event(3, 'analysis', payload('최신 음성', { summary: '최신 분석' })))
  state = mergeStreamEvent(state, event(2, 'analysis', payload('이전 음성', { summary: '이전 분석' })))
  state = mergeStreamEvent(state, event(1, 'analysis', payload('더 이전 음성'), { message: '이전 오류' }))
  assert.equal(state.data.analysis.summary, '최신 분석')
  assert.equal(state.data.transcript.text, '최신 음성')
  assert.equal(state.analysisError, null)
})

test('an unavailable analysis keeps transcript and previous analysis with separate cursors', () => {
  let state = mergeStreamEvent(EMPTY_STREAM, event(1, 'analysis', payload('첫 음성', { summary: '기존 분석' })))
  state = mergeStreamEvent(state, event(2, 'audio', payload('새 누적 음성')))
  state = mergeStreamEvent(state, event(2, 'analysis', { ...payload('새 누적 음성'), status: 'unavailable' }, { message: '분석 지연' }))
  assert.equal(state.data.transcript.text, '새 누적 음성')
  assert.equal(state.data.analysis.summary, '기존 분석')
  assert.equal(state.analysisError.message, '음성 분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')
  assert.equal(state.analysisSequence, 1)
  assert.equal(state.settledSequence, 2)
})

test('new completed analysis clears old symptoms and analysis errors', () => {
  let state = mergeStreamEvent(EMPTY_STREAM, event(1, 'analysis', payload('음성', { summary: '이전 분석' }, [{ code: 'collapse' }])))
  state = mergeStreamEvent(state, event(2, 'analysis', payload('새 음성'), { message: '지연' }))
  state = mergeStreamEvent(state, event(3, 'analysis', payload('새 음성 전체', { summary: '새 분석' }, [])))
  assert.deepEqual(state.data.symptoms, [])
  assert.equal(state.analysisError, null)
  assert.equal(state.data.analysis.summary, '새 분석')
})

test('file validation respects server configuration, empty files, and uppercase extensions', () => {
  const config = { supported_audio_formats: ['wav', 'mp3'], max_upload_mb: 1 }
  assert.equal(validateFile({ name: '신고.WAV', size: 1024 }, config), null)
  assert.ok(validateFile({ name: 'empty.wav', size: 0 }, config))
  assert.ok(validateFile({ name: 'image.png', size: 1024 }, config))
  assert.ok(validateFile({ name: 'large.mp3', size: 1048577 }, config))
  assert.equal(validateFile({ name: 'limit.mp3', size: 1048576 }, config), null)
})

test('an equal-sequence audio event cannot downgrade a completed analysis status', () => {
  let state = mergeStreamEvent(EMPTY_STREAM, event(2, 'analysis', payload('음성', { summary: '완료' })))
  state = mergeStreamEvent(state, event(2, 'audio', payload('음성')))
  assert.equal(state.data.status, 'completed')
  assert.equal(state.data.analysis.summary, '완료')
})

test('time formatting handles missing, fractional, and invalid metadata', () => {
  assert.equal(formatTime(61.9), '01:01')
  assert.equal(formatTime(600), '10:00')
  assert.equal(formatTime(Infinity), '00:00')
  assert.equal(formatTime(-3), '00:00')
})
