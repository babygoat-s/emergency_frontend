import { publicErrorMessage } from './error-messages.js'

export const EMPTY_STREAM = {
  data: null,
  transcriptSequence: 0,
  analysisSequence: 0,
  settledSequence: 0,
  symptomSequence: 0,
  localQuestionSequence: 0,
  ragSequence: 0,
  symptomError: null,
  analysisError: null,
  lastSummary: null,
  lastUrgency: null,
  lastManual: null,
  processingLagSeconds: 0,
}

// Audio, symptom and Gemini events can arrive out of order.
export function mergeStreamEvent(previous, event) {
  if (event.type !== 'update' || !event.data) return previous
  const { sequence, stage, data } = event
  const next = { ...previous, data: { ...(previous.data || data) } }
  // Audio and LLM have independent cursors: a newer audio window must not
  // discard an LLM summary that is newer than the last completed LLM work.
  if (data.rag?.summary_provider === 'llm' && data.rag.summary &&
      sequence >= (previous.lastSummary?.sequence || 0)) {
    next.lastSummary = { text: data.rag.summary, sequence }
  }
  if (data.rag?.urgency?.origin === 'llm' &&
      sequence >= (previous.lastUrgency?.sequence || 0)) {
    next.lastUrgency = { ...data.rag.urgency, sequence }
  }
  if (data.rag?.summary_provider === 'llm' &&
      sequence >= (previous.lastManual?.sequence || 0)) {
    next.lastManual = { result: data.rag, sequence }
  }
  if (data.rag && sequence >= (previous.ragSequence || 0)) {
    next.data.rag = data.rag
    next.data.manual_grounded = data.manual_grounded
    next.ragSequence = sequence
  }
  if (sequence >= previous.transcriptSequence) {
    next.processingLagSeconds = Math.max(0, event.processing_lag_seconds || 0)
    next.transcriptSequence = sequence
    for (const key of ['transcript', 'speakers', 'warnings', 'is_demo']) next.data[key] = data[key]
  }
  if ((stage === 'symptoms' || data.symptom_provider || data.symptoms?.length || data.analysis) && sequence >= previous.symptomSequence) {
    next.data.symptoms = data.symptoms
    next.data.symptom_provider = data.symptom_provider
    next.symptomSequence = sequence
    if (stage === 'symptoms' || data.symptom_provider) {
      next.symptomError = stage === 'symptoms' && event.error ? publicErrorMessage(event.error.code) : null
    }
  }
  if (data.local_questions?.length && sequence >= previous.localQuestionSequence) {
    next.data.local_questions = data.local_questions
    next.localQuestionSequence = sequence
  }
  if (stage === 'analysis' && sequence >= previous.settledSequence) {
    next.settledSequence = sequence
    next.analysisError = event.error ? {
      code: event.error.code,
      message: publicErrorMessage(event.error.code),
    } : null
    if (data.analysis) {
      next.data.analysis = data.analysis
      next.analysisSequence = sequence
    }
  }
  if (sequence >= previous.transcriptSequence && (stage === 'analysis' || sequence > previous.settledSequence)) next.data.status = data.status
  return next
}

export function selectQuestions(result, streamState) {
  const data = result || streamState.data
  const local = !result && Boolean(data?.local_questions?.length) &&
    (!data.analysis || streamState.localQuestionSequence > streamState.analysisSequence)
  return { local, questions: (local ? data.local_questions : data?.analysis?.recommended_questions) || [] }
}

export function selectManualResult(result, streamState) {
  const current = (result || streamState.data)?.rag
  const last = streamState.lastManual
  if (result || !current || !last || last.sequence >= streamState.ragSequence ||
      current.requires_immediate_operator_review) return current
  const latestFields = current.state?.fields || {}
  const olderFields = last.result.state?.fields || {}
  const changed = Object.entries(olderFields).some(([field, fact]) =>
    field !== 'chief_complaint' &&
    fact.status === 'confirmed' && latestFields[field]?.status === 'confirmed' &&
    fact.value !== latestFields[field].value)
  if (changed) return current
  const utterances = streamState.data?.transcript?.text || ''
  const previous = new Map((last.result.questions || []).map(q => [q.source.question_id, q]))
  let reused = false
  const questions = current.questions.filter(q => {
    const fact = olderFields[q.field]
    const breathingNeedsDetail = q.field === 'breathing' && fact?.value === 'present' &&
      /정상/.test(q.source_excerpt || q.question)
    return !(latestFields[q.field]?.status !== 'uncertain' && fact?.status === 'confirmed' &&
      !breathingNeedsDetail && fact.evidence && utterances.includes(fact.evidence))
  }).map(q => {
    const earlier = previous.get(q.source.question_id)
    if (!earlier || earlier.selection_origin !== 'llm_rewrite' ||
        latestFields[q.field]?.status === 'confirmed') return q
    reused = true
    return earlier
  })
  return { ...current, questions, using_previous_llm_questions: reused }
}

export function formatTime(seconds = 0) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function validateFile(file, config) {
  if (!file || file.size === 0) return '비어 있는 파일이에요. 다른 음성 파일을 선택해 주세요.'
  const extension = file.name.split('.').pop().toLowerCase()
  if (!config.supported_audio_formats.includes(extension)) return `지원하는 파일 형식은 ${config.supported_audio_formats.join(', ')}예요.`
  if (file.size > config.max_upload_mb * 1024 * 1024) return `${config.max_upload_mb} MB 이하의 파일을 선택해 주세요.`
  return null
}
