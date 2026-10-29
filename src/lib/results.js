export const EMPTY_STREAM = {
  data: null,
  transcriptSequence: 0,
  analysisSequence: 0,
  settledSequence: 0,
  symptomSequence: 0,
  analysisError: null,
}

// Audio and Gemini events can arrive out of order. Keep their cursors independent.
export function mergeStreamEvent(previous, event) {
  if (event.type !== 'update' || !event.data) return previous
  const { sequence, stage, data } = event
  const next = { ...previous, data: { ...(previous.data || data) } }
  if (sequence >= previous.transcriptSequence) {
    next.transcriptSequence = sequence
    for (const key of ['transcript', 'speakers', 'audio_signals', 'warnings', 'is_demo']) next.data[key] = data[key]
  }
  if (data.symptoms?.length && sequence >= previous.symptomSequence) {
    next.data.symptoms = data.symptoms
    next.symptomSequence = sequence
  }
  if (stage === 'analysis' && sequence >= previous.settledSequence) {
    next.settledSequence = sequence
    next.analysisError = event.error || null
    if (data.analysis) {
      next.data.analysis = data.analysis
      next.analysisSequence = sequence
      if (sequence >= next.symptomSequence) {
        next.data.symptoms = data.symptoms
        next.symptomSequence = sequence
      }
    }
  }
  if (sequence >= previous.transcriptSequence && (stage === 'analysis' || sequence > previous.settledSequence)) next.data.status = data.status
  return next
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
