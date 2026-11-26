import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { formatManualSource, isResearchNotice, questionSources, RESEARCH_NOTICE } from '../src/lib/manuals.js'
import { EMPTY_STREAM, mergeStreamEvent, selectManualResult } from '../src/lib/results.js'

let server, Results, App, config
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  Results = (await server.ssrLoadModule('/src/components/Results.jsx')).default
  App = (await server.ssrLoadModule('/src/App.jsx')).default
  config = (await server.ssrLoadModule('/src/api/analysis.js')).DEFAULT_CONFIG
})
after(async () => { await server?.close() })

const source = {
  document_id: 'manual', document_name: '119구급상황관리센터 상담 매뉴얼.pdf',
  pdf_page: 13, printed_page: '6', protocol_id: 'P03',
  question_id: 'PRIVATE_QUESTION_ID', original_question_id: '99',
}

test('deferred AI hides summary while preserving symptoms and grounded questions', () => {
  const html = renderToStaticMarkup(createElement(Results, {
    llmEnabled: false, operation: 'idle', streamState: EMPTY_STREAM,
    result: { status: 'completed', transcript: { text: '팔이 마비됐어요', provider: 'local' },
      symptoms: [{ code: 'general_weakness', label: '전신쇠약', score: 0.6 }],
      rag: { questions: [{ question: '환자분의 얼굴이나 팔·다리에 마비가 있나요?', source,
        field: 'paralysis', priority: 1, related_symptom: '뇌졸중', supporting_sources: [] }],
      state: { fields: {} }, safety_alerts: [], classification_references: [], instruction_references: [] },
      warnings: [] },
  }))
  assert.doesNotMatch(html, /상담 요약|긴급도|요약 대기|상담 정보 확인 상태|원문 조건/)
  assert.match(html, /전신쇠약/)
  assert.match(html, /얼굴이나 팔·다리에 마비/)
})

test('source labels use SOP printed pages and manual physical PDF pages', () => {
  assert.equal(formatManualSource(source), '119구급상황관리센터 상담 매뉴얼 · PDF 13쪽')
  assert.equal(formatManualSource({ ...source, document_id: 'sop501', pdf_page: 2, printed_page: '128' }),
    '재난현장 표준작전 절차 SOP 501 · 128쪽')
  assert.equal(formatManualSource({ ...source, document_id: 'sop501', printed_page: null }),
    '재난현장 표준작전 절차 SOP 501 · PDF 13쪽')
  assert.equal(questionSources({ source, supporting_sources: [source] }).length, 1)
})

test('text RAG results show summary without clinical analysis and no PDF links or question IDs', () => {
  const rag = {
    summary: '환자가 두통과 구토를 호소합니다.', summary_provider: 'llm',
    questions: [{
      question: '두통이 있는 환자분은 지금 의식이 또렷한가요?',
      reason: '현재 의식 상태가 확인되지 않았습니다.',
      priority: 1, related_symptom: '두통', source, supporting_sources: [source],
    }],
    state: { fields: {} }, message: '원문 근거 질문입니다.',
    research_notice: RESEARCH_NOTICE, safety_alerts: [],
    classification_references: [], instruction_references: [],
  }
  const html = renderToStaticMarkup(createElement(Results, {
    result: {
      rag, analysis: null, transcript: { text: '머리가 아프고 토해요.', provider: 'text' },
      warnings: [RESEARCH_NOTICE, '화자 분류를 확인해 주세요.'],
    },
    streamState: EMPTY_STREAM, operation: 'idle',
  }))
  assert.match(html, /상담 요약/)
  assert.match(html, /LLM 요약/)
  assert.match(html, /환자가 두통과 구토를 호소합니다./)
  assert.doesNotMatch(html, /현재 의식 상태가 확인되지 않았습니다./)
  assert.doesNotMatch(html, /긴급도|LLM 검토 제안|상담 정보 확인 상태|원문 조건/)
  assert.match(html, /119구급상황관리센터 상담 매뉴얼 · PDF 13쪽/)
  assert.doesNotMatch(html, /href=|<iframe|<embed|<object|PRIVATE_QUESTION_ID|질문 ID|원문 번호|\.pdf/)
  assert.doesNotMatch(html, /오래된 첨부 매뉴얼|의료 전문가 검증 전/)
  assert.match(html, /화자 분류를 확인해 주세요./)
})

test('old manual notice occurs once at the bottom of the full page', () => {
  const previous = config.rag_enabled
  config.rag_enabled = true
  try {
    const html = renderToStaticMarkup(createElement(App))
    assert.equal(html.split('오래된 첨부 매뉴얼').length - 1, 1)
    const footer = html.match(/<footer class="page-footer">([\s\S]*?)<\/footer>/)?.[1]
    assert.match(footer, /오래된 첨부 매뉴얼/)
    assert.doesNotMatch(html.slice(0, html.indexOf('<footer class="page-footer">')), /의료 전문가 검증 전/)
  } finally {
    config.rag_enabled = previous
  }
})

test('raw utterances never substitute for an LLM summary when the model is unavailable', () => {
  const html = renderToStaticMarkup(createElement(Results, {
    result: {
      rag: {
        summary: null, summary_provider: 'unavailable',
        questions: [], state: { fields: {} }, safety_alerts: [],
        classification_references: [], instruction_references: [],
        message: '원문 질문 없음', llm_status: 'unavailable', llm_error_code: 'INVALID_REQUEST',
      },
      transcript: { text: '머리가 아파요.', provider: 'text' },
    },
    streamState: EMPTY_STREAM, operation: 'idle',
  }))
  assert.match(html, /LLM 요약을 아직 생성하지 못했습니다/)
  assert.doesNotMatch(html, /발화 발췌/)
  assert.equal(isResearchNotice(RESEARCH_NOTICE), true)
  assert.equal(isResearchNotice('화자 모델 미연결'), false)
})

test('late RAG summaries cannot replace a newer conversation summary', () => {
  const data = (summary) => ({
    transcript: { text: summary }, rag: { summary, summary_provider: 'llm' },
  })
  let state = mergeStreamEvent(EMPTY_STREAM, { type: 'update', stage: 'analysis', sequence: 2, data: data('최신 요약') })
  state = mergeStreamEvent(state, { type: 'update', stage: 'analysis', sequence: 1, data: data('이전 요약') })
  assert.equal(state.data.rag.summary, '최신 요약')
})

test('a temporary LLM failure retains the last summary without replacing it with utterances', () => {
  const base = { transcript: { text: '원본 발화' }, rag: {
    summary: '환자가 두통을 호소합니다.', summary_provider: 'llm',
  } }
  let state = mergeStreamEvent(EMPTY_STREAM, {
    type: 'update', stage: 'analysis', sequence: 1, data: base,
  })
  state = mergeStreamEvent(state, {
    type: 'update', stage: 'audio', sequence: 2, processing_lag_seconds: 3,
    data: { transcript: { text: '새 원본 발화' }, rag: {
      summary: null, summary_provider: 'pending',
    } },
  })
  assert.equal(state.lastSummary.text, '환자가 두통을 호소합니다.')
  assert.equal(state.lastSummary.sequence, 1)
  assert.equal(state.data.rag.summary, null)
  assert.equal(state.processingLagSeconds, 3)
})

test('a delayed LLM result updates its summary cursor while keeping the newest transcript and manual state', () => {
  const question = { field: 'breathing', source, question: '숨을 쉽니까?' }
  const current = {
    questions: [question], summary: null, summary_provider: 'pending', state: { fields: {} },
  }
  let state = mergeStreamEvent(EMPTY_STREAM, {
    type: 'update', stage: 'audio', sequence: 3,
    data: { transcript: { text: '최신 발화' }, rag: current },
  })
  const detailed = { ...question, question: '두통이 있는 환자분의 현재 호흡을 확인하겠습니다. 숨을 정상적으로 쉬고 있나요?',
    selection_origin: 'llm_rewrite' }
  state = mergeStreamEvent(state, {
    type: 'update', stage: 'analysis', sequence: 2, data: {
      transcript: { text: '이전 발화' },
      rag: {
        questions: [detailed], state: { fields: {} }, summary: '완성된 LLM 요약',
        summary_provider: 'llm',
      },
    },
  })
  assert.equal(state.data.transcript.text, '최신 발화')
  assert.equal(state.data.rag, current)
  assert.equal(state.lastSummary.text, '완성된 LLM 요약')
  const visible = selectManualResult(null, state)
  assert.equal(visible.questions[0], detailed)
  assert.equal(visible.using_previous_llm_questions, true)
})

test('previous LLM questions are not reused after a confirmed state change or immediate safety alert', () => {
  const question = { field: 'breathing', source, question: '현재 호흡 확인', selection_origin: 'llm_rewrite' }
  const current = {
    questions: [question], state: { fields: { breathing: { status: 'confirmed', value: 'absent' } } },
  }
  const state = { ...EMPTY_STREAM, ragSequence: 3, data: { rag: current }, lastManual: {
    sequence: 2, result: { questions: [question], state: {
      fields: { breathing: { status: 'confirmed', value: 'normal' } },
    } },
  } }
  assert.equal(selectManualResult(null, state), current)
  current.requires_immediate_operator_review = true
  assert.equal(selectManualResult(null, state), current)
})

test('a report that breathing is present does not answer a source question about normal breathing', () => {
  const question = { field: 'breathing', source, question: '호흡이 정상입니까?',
    source_excerpt: '호흡이 정상입니까?' }
  const fields = { breathing: { status: 'confirmed', value: 'present', evidence: '숨은 쉬어요' } }
  const current = { questions: [question], state: { fields } }
  const state = { ...EMPTY_STREAM, ragSequence: 3, data: {
    rag: current, transcript: { text: '숨은 쉬어요' },
  }, lastManual: {
    sequence: 2, result: { questions: [], state: { fields } },
  } }
  assert.equal(selectManualResult(null, state).questions.length, 1)
})

test('retired acoustic data is never rendered', () => {
  const html = renderToStaticMarkup(createElement(Results, {
    result: {
      rag: {
        summary: null, summary_provider: 'pending', llm_status: 'not_requested',
        questions: [], state: { fields: {} }, safety_alerts: [],
        classification_references: [], instruction_references: [], message: '근거 확인',
      },
      transcript: { text: '대화 입력', provider: 'text' },
      audio_signals: {
        available: true, crying_detected: true,
        speaking_rate_per_minute: 120, breathing_distress_detected: true,
      },
    },
    streamState: EMPTY_STREAM, operation: 'idle',
  }))
  assert.doesNotMatch(html, /음성 상태|말속도|울음 감지|긴급도/)
})
