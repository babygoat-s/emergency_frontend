import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_STREAM, mergeStreamEvent, selectQuestions, validateFile, formatTime } from '../src/lib/results.js'

const payload = (text, analysis = null, symptoms = []) => ({
  transcript: { text, segments: [] }, analysis, symptoms,
  speakers: { available: false },
  status: analysis ? 'completed' : 'pending', warnings: [], is_demo: false,
})
const event = (sequence, stage, data, error) => ({ type: 'update', sequence, stage, data, error })

test('an unresolved audio revision clears previously grounded manual results too', () => {
  let state = mergeStreamEvent(EMPTY_STREAM, event(1, 'analysis', {
    ...payload('이전 발화'), rag: { questions: [{ question: '이전 질문' }] }, manual_grounded: true,
  }))
  const revised = { ...payload(''), transcript: { text: '', segments: [], revision: 1 }, rag: null }
  state = mergeStreamEvent(state, event(2, 'audio', revised))
  assert.equal(state.data.rag, null)
  assert.equal(state.data.manual_grounded, false)
})

test('audio revision discards old symptoms and rejects delayed results for the wrong transcript', () => {
  let state = mergeStreamEvent(EMPTY_STREAM, event(1, 'analysis', payload('잘못된 네',
    { summary: '이전 요약' }, [{ code: 'fever' }])))
  const corrected = payload('팔이 마비됐어요')
  corrected.transcript.revision = 2
  corrected.rag = { questions: [{ question: '발음이 정확한가요?' }] }
  state = mergeStreamEvent(state, event(3, 'audio', corrected))
  assert.equal(state.data.analysis, null)
  assert.deepEqual(state.data.symptoms, [])
  assert.equal(state.revisionSequence, 3)
  state = mergeStreamEvent(state, event(2, 'analysis', payload('잘못된 네',
    { summary: '지연된 요약' }, [{ code: 'fever' }])))
  assert.equal(state.data.transcript.text, '팔이 마비됐어요')
  assert.equal(state.data.analysis, null)
  assert.equal(state.data.rag.questions[0].question, '발음이 정확한가요?')
  const symptoms = [{ code: 'general_weakness' }]
  state = mergeStreamEvent(state, event(3, 'symptoms', { ...corrected, symptoms, symptom_provider: 'koelectra' }))
  assert.deepEqual(state.data.symptoms, symptoms)
})

test('late RAG analysis cannot replace manual questions for newer speech', () => {
  const newest = { questions: [{ question: '새 질문' }], status: 'ready' }
  let state = mergeStreamEvent(EMPTY_STREAM, event(2, 'audio', { ...payload('새 발화'), rag: newest, manual_grounded: true }))
  state = mergeStreamEvent(state, event(1, 'analysis', { ...payload('이전 발화'), rag: { questions: [{ question: '이전 질문' }] } }))
  assert.equal(state.data.rag, newest)
  assert.equal(state.ragSequence, 2)
  assert.equal(state.data.manual_grounded, true)
})

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

test('an empty local symptom result clears earlier detections while Gemini is pending', () => {
  const local = (text, symptoms) => ({ ...payload(text, null, symptoms), symptom_provider: 'koelectra' })
  let state = mergeStreamEvent(EMPTY_STREAM, event(1, 'symptoms', local('이전 음성', [{ code: 'fever' }])))
  state = mergeStreamEvent(state, event(2, 'audio', payload('새 누적 음성')))
  state = mergeStreamEvent(state, event(2, 'symptoms', local('새 누적 음성', [])))
  state = mergeStreamEvent(state, event(1, 'analysis', payload('이전 음성', { summary: '이전 분석' }, [{ code: 'fever' }])))
  assert.deepEqual(state.data.symptoms, [])
  assert.equal(state.symptomSequence, 2)
  assert.equal(state.data.symptom_provider, 'koelectra')
})

test('local questions survive 503 and Gemini replaces them for the matching speech', () => {
  const local = [{ question: '현재 어떤 증상이 있나요?' }]
  const gemini = [{ question: '어지러움은 언제 시작됐나요?' }]
  let state = mergeStreamEvent(EMPTY_STREAM, event(1, 'audio', { ...payload('첫 음성'), local_questions: local }))
  state = mergeStreamEvent(state, event(1, 'analysis', payload('첫 음성'), { code: 'GEMINI_OVERLOADED' }))
  assert.deepEqual(selectQuestions(null, state), { local: true, questions: local })
  state = mergeStreamEvent(state, event(2, 'audio', { ...payload('새 음성'), local_questions: local }))
  state = mergeStreamEvent(state, event(1, 'analysis', payload('첫 음성', { recommended_questions: gemini })))
  assert.deepEqual(selectQuestions(null, state), { local: true, questions: local })
  state = mergeStreamEvent(state, event(2, 'analysis', payload('새 음성', { recommended_questions: gemini })))
  state = mergeStreamEvent(state, event(3, 'audio', payload('새 음성')))
  assert.deepEqual(selectQuestions(null, state), { local: false, questions: gemini })
})

test('symptom failure is independent of successful question generation', () => {
  let state = mergeStreamEvent(EMPTY_STREAM, event(1, 'symptoms', payload('음성'), { code: 'SYMPTOM_MODEL_FAILED' }))
  state = mergeStreamEvent(state, event(1, 'analysis', payload('음성', { recommended_questions: [] })))
  assert.equal(state.analysisError, null)
  assert.equal(state.symptomError, '증상 분류를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')
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
