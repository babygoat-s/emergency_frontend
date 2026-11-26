// 개발 전용 목업 API. `npm run dev:mock` 일 때만 Vite 개발 서버에 붙는다.
// 백엔드 없이 결과 화면을 확인하기 위한 용도이며 앱 코드는 건드리지 않는다.
//
// 시나리오 전환 (상황별 화면 확인, 긴급도는 화면에서 제거됨)
//   방법 1) 주소 뒤에 붙이기:  http://localhost:5173/?scenario=critical
//   방법 2) 고정 전환:         http://localhost:5173/__mock/scenario?name=critical
//   시나리오: low | moderate(기본) | high | critical | empty
//   바꾼 뒤 분석을 다시 실행해야 새 결과가 보인다.

const SCENARIOS = ['low', 'moderate', 'high', 'critical', 'empty']
let current = 'moderate'

const source = (qid) => ({
  document_id: 'manual', document_name: '구급상황관리센터 응급처치 지도 매뉴얼(목업)',
  sha256: 'mock', pdf_page: 12, printed_page: '12', protocol_id: 'P-MOCK', question_id: qid,
})

const seg = (start, end, text, speaker) => ({
  start, end, text, speaker, speaker_id: speaker === 'operator' ? 'speaker_0' : 'speaker_1',
  recognition_status: 'recognized',
})

const question = (n, q, reason, symptom, field, excerpt) => ({
  question: q, reason, related_symptom: symptom, priority: n, source: source(`q${n}`),
  source_excerpt: excerpt, field, condition_text: null, supporting_sources: [], selection_origin: 'developer_rule',
})

const DATA = {
  low: {
    segments: [
      seg(0, 2, '119입니다. 어떤 증상이 있나요?', 'operator'),
      seg(2, 7, '어제부터 머리가 조금 아프고 열이 37도 8부 정도 나요.', 'caller'),
      seg(7, 10, '의식과 호흡은 괜찮으신가요?', 'operator'),
      seg(10, 13, '네, 대화도 잘 하시고 숨도 편하게 쉬세요.', 'caller'),
    ],
    symptoms: [
      { code: 'headache', label: '두통', evidence: '머리가 조금 아프고', score: 0.9 },
      { code: 'fever', label: '고열', evidence: '열이 37도 8부', score: 0.52 },
    ],
    summary: '[목업] 신고자가 어제부터 시작된 경미한 두통과 미열을 호소하며, 의식과 호흡은 정상입니다.',
    questions: [
      question(1, '증상이 점점 심해지고 있나요?', '악화 여부 확인', '두통', 'progress', '증상 경과를 확인한다.'),
      question(2, '복용한 약이 있나요?', '복용 약 확인', '두통', 'medication', '복용 약 여부를 확인한다.'),
    ],
    alerts: [], immediate: false,
  },
  moderate: {
    segments: [
      seg(0, 2, '119입니다. 어떤 증상이 있나요?', 'operator'),
      seg(2, 7, '열이 39도이고 토하고 머리가 아파요.', 'caller'),
      seg(7, 10, '의식은 있으신가요?', 'operator'),
      seg(10, 14, '네, 말은 하는데 많이 어지러워하세요.', 'caller'),
    ],
    symptoms: [
      { code: 'fever', label: '고열', evidence: '열이 39도이고', score: 0.93 },
      { code: 'nausea_vomiting', label: '구토·오심', evidence: '토하고', score: 0.88 },
      { code: 'headache', label: '두통', evidence: '머리가 아파요', score: 0.81 },
      { code: 'dizziness', label: '어지러움', evidence: '많이 어지러워하세요', score: 0.46 },
    ],
    summary: '[목업] 신고자가 39도 발열과 구토, 두통을 호소했고 의식은 있으나 어지러움을 보입니다.',
    questions: [
      question(1, '열과 두통은 언제부터 시작됐나요?', '증상 시작 시각 확인', '고열', 'onset', '발열 시작 시점을 확인한다.'),
      question(2, '숨쉬기 힘들어하지는 않나요?', '호흡 상태 확인', '고열', 'breathing', '호흡곤란 여부를 확인한다.'),
      question(3, '지금까지 몇 번 토했나요?', '구토 횟수 확인', '구토·오심', 'vomiting_count', '구토 횟수를 확인한다.'),
    ],
    alerts: [], immediate: false,
  },
  high: {
    segments: [
      seg(0, 2, '119입니다. 어떤 증상이 있나요?', 'operator'),
      seg(2, 8, '아버지가 가슴이 쥐어짜듯 아프시고 숨쉬기가 너무 힘들어하세요.', 'caller'),
      seg(8, 11, '식은땀이 나거나 얼굴색이 변했나요?', 'operator'),
      seg(11, 15, '네, 식은땀을 많이 흘리고 얼굴이 창백해요.', 'caller'),
    ],
    symptoms: [
      { code: 'chest_pain', label: '가슴 통증', evidence: '가슴이 쥐어짜듯 아프시고', score: 0.95 },
      { code: 'breathing_difficulty', label: '호흡 곤란', evidence: '숨쉬기가 너무 힘들어하세요', score: 0.91 },
    ],
    summary: '[목업] 신고자가 아버지의 가슴 통증과 호흡 곤란을 호소하며 식은땀과 창백함이 동반됩니다.',
    questions: [
      question(1, '환자가 지금 앉아 있나요, 누워 있나요?', '자세 확인', '가슴 통증', 'position', '환자 자세를 확인한다.'),
      question(2, '이전에 심장 질환을 진단받은 적이 있나요?', '병력 확인', '가슴 통증', 'history', '심장 병력을 확인한다.'),
      question(3, '통증이 시작된 지 얼마나 됐나요?', '발생 시각 확인', '가슴 통증', 'onset', '통증 시작 시점을 확인한다.'),
    ],
    alerts: ['가슴 통증과 호흡 곤란이 함께 있습니다. 즉시 출동 여부를 검토하세요.'], immediate: false,
  },
  critical: {
    segments: [
      seg(0, 2, '119입니다. 어떤 증상이 있나요?', 'operator'),
      seg(2, 8, '아버지가 갑자기 쓰러지셨는데 숨을 안 쉬는 것 같아요. 불러도 대답이 없어요.', 'caller'),
      seg(8, 11, '가슴이 오르내리는지 봐 주세요.', 'operator'),
      seg(11, 14, '움직임이 없어요. 어떡해요!', 'caller'),
    ],
    symptoms: [
      { code: 'collapse', label: '쓰러짐', evidence: '갑자기 쓰러지셨는데', score: 0.97 },
      { code: 'suspected_no_breathing', label: '호흡 없음 의심', evidence: '숨을 안 쉬는 것 같아요', score: 0.94 },
      { code: 'altered_consciousness', label: '의식 저하', evidence: '불러도 대답이 없어요', score: 0.92 },
    ],
    summary: '[목업] 신고자가 아버지가 갑자기 쓰러져 호흡이 없는 것 같고 부름에 반응이 없다고 신고했습니다.',
    questions: [
      question(1, '환자의 가슴이 오르내리는지 10초간 확인해 주세요.', '호흡 유무 확인', '호흡 없음 의심', 'breathing', '호흡 유무를 확인한다.'),
      question(2, '주변에 자동제세동기(AED)가 있나요?', 'AED 확보', '쓰러짐', 'aed', 'AED 위치를 확인한다.'),
    ],
    alerts: ['호흡 없음이 의심됩니다. 즉시 심폐소생술 안내와 출동을 우선 검토하세요.'], immediate: true,
  },
  empty: {
    segments: [
      seg(0, 2, '119입니다. 어떤 증상이 있나요?', 'operator'),
      seg(2, 5, '저기... 잠시만요.', 'caller'),
    ],
    symptoms: [],
    summary: null,
    questions: [],
    alerts: [], immediate: false,
  },
}

function build(name) {
  const d = DATA[name]
  const text = d.segments.map((s) => s.text).join(' ')
  const hasSummary = Boolean(d.summary)
  const rag = {
    status: d.questions.length ? 'ready' : 'insufficient_evidence',
    state: {
      fields: {
        chief_complaint: d.symptoms.length
          ? { status: 'confirmed', value: d.symptoms.map((s) => s.label).join(', '), evidence: d.symptoms[0].evidence, turn_id: '1', origin: 'dialogue_rule' }
          : { status: 'unknown', value: null, evidence: null, turn_id: null, origin: 'dialogue_rule' },
        breathing: { status: 'unknown', value: null, evidence: null, turn_id: null, origin: 'dialogue_rule' },
        onset: { status: 'unknown', value: null, evidence: null, turn_id: null, origin: 'dialogue_rule' },
      },
      protocol_ids: ['P-MOCK'], asked_question_ids: [],
    },
    questions: d.questions,
    safety_alerts: d.alerts.map((t) => ({ text: t, source: source('s1') })),
    classification_references: [],
    instruction_references: [],
    requires_immediate_operator_review: d.immediate,
    message: d.questions.length ? `[목업] 매뉴얼 근거 질문 ${d.questions.length}개를 찾았어요.` : '[목업] 근거가 부족해 추천할 질문이 없어요.',
    research_notice: '목업 데이터입니다. 실제 분석 결과가 아닙니다.',
    retrieval: {}, review_count: 0, llm_status: hasSummary ? 'completed' : 'not_requested', llm_error_code: null,
    summary: d.summary,
    summary_provider: hasSummary ? 'llm' : 'unavailable',
    retry_after_seconds: 0, llm_model: hasSummary ? 'mock' : null,
  }
  const localQuestions = d.questions.map((q) => ({ question: q.question, purpose: q.reason }))
  return {
    rag,
    analysis: {
      status: 'completed', is_demo: true,
      transcript: { text, language: 'ko', duration_seconds: d.segments.at(-1).end, segments: d.segments,
        provider: 'mock', diarization_available: true, warnings: [], revision: 0 },
      analysis: hasSummary
        ? { summary: d.summary, symptoms: d.symptoms, recommended_questions: localQuestions }
        : null,
      speakers: { available: true, provider: 'mock', segments: d.segments.map((s) => ({ start: s.start, end: s.end, speaker_id: s.speaker_id, role: s.speaker })) },
      symptoms: d.symptoms, local_questions: localQuestions, symptom_provider: 'mock', analysis_provider: 'mock',
      rag, manual_grounded: d.questions.length > 0, requires_operator_review: true,
      warnings: [`목업 데이터입니다(시나리오: ${name}). 실제 AI 분석 결과가 아닙니다.`],
    },
  }
}

const config = {
  llm_privacy_mode: 'local_only', llm_external_enabled: false, llm_local_configured: true, llm_features_enabled: true,
  supported_audio_formats: ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'mp4'], max_upload_mb: 50, max_audio_seconds: 600,
  languages: ['ko', 'en', 'ja', 'auto'], transcriber: 'mock', diarizer: 'mock', symptom_classifier: 'mock',
  koelectra_symptom_labels: ['쓰러짐', '호흡 곤란', '호흡 없음 의심', '의식 저하', '가슴 통증', '고열', '구토·오심', '두통'],
  example_preview: { quote: '열이 39도이고 토하고 머리가 아파요.', symptom_labels: ['고열', '구토·오심', '두통'] },
  situation_analyzer: 'manual-rag', history_enabled: false, manual_grounded: true, streaming_mode: 'pcm_s16le',
  realtime_window_seconds: 6, realtime_analysis_timeout_seconds: 30, realtime_analysis_min_interval_seconds: 3,
  realtime_sample_rate: 16000, realtime_channels: 1, rag_enabled: true,
}

function scenarioOf(req) {
  try {
    const ref = req.headers.referer && new URL(req.headers.referer).searchParams.get('scenario')
    if (ref && SCENARIOS.includes(ref)) return ref
  } catch { /* 무시 */ }
  return current
}

export default function mockApi() {
  return {
    name: 'mock-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        if (url.pathname === '/__mock/scenario') {
          const name = url.searchParams.get('name')
          if (SCENARIOS.includes(name)) current = name
          res.statusCode = 302
          res.setHeader('Location', '/')
          return res.end()
        }
        const key = `${req.method} ${url.pathname}`
        const scenario = scenarioOf(req)
        const routes = {
          'GET /api/v1/health': () => ({ status: 'ok', gemini_configured: false, storage: 'none' }),
          'GET /api/v1/analysis/config': () => config,
          'GET /api/v1/analysis/example': () => build(scenario).analysis,
          'POST /api/v1/analysis/file': () => build(scenario).analysis,
          'POST /api/v1/rag/recommend': () => build(scenario).rag,
          'GET /api/v1/rag/status': () => ({ available: true, enabled_for_audio: true }),
        }
        const handler = routes[key]
        if (!handler) return next()
        // 실제 서버처럼 약간의 지연을 줘서 로딩 화면도 볼 수 있게 한다.
        setTimeout(() => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(handler()))
        }, key.includes('analysis/file') ? 1200 : 150)
      })
    },
  }
}
