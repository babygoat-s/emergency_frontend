const messages = {
  AUTH_REQUIRED: 'Google 계정으로 다시 로그인해 주세요.',
  AUTH_FORBIDDEN: '이 Google 계정으로는 로그인할 수 없어요. 다른 계정으로 다시 시도해 주세요.',
  AUTH_UNAVAILABLE: '로그인 확인이 지연되고 있어요. 잠시 후 다시 시도해 주세요.',
  LLM_PRIVACY_BLOCKED: '외부 AI 전송이 차단되어 있어요. 로컬 AI 연결 상태를 확인해 주세요.',
  FILE_TOO_LARGE: '파일 용량이 너무 커요. 안내된 용량 이하의 파일을 선택해 주세요.',
  AUDIO_TOO_LONG: '음성 길이가 너무 길어요. 더 짧은 파일을 선택해 주세요.',
  UNSUPPORTED_AUDIO: '지원하지 않는 파일 형식이에요. 다른 음성 파일을 선택해 주세요.',
  EMPTY_FILE: '비어 있는 파일이에요. 다른 음성 파일을 선택해 주세요.',
  EMPTY_AUDIO: '파일에 음성이 없어요. 다른 음성 파일을 선택해 주세요.',
  INVALID_AUDIO: '음성 파일을 읽지 못했어요. 다른 파일을 선택해 주세요.',
  NO_SPEECH: '인식할 수 있는 음성이 없어요. 파일이나 마이크 상태를 확인해 주세요.',
  VALIDATION_ERROR: '입력 내용을 확인하고 다시 시도해 주세요.',
  GEMINI_RATE_LIMITED: '현재 요청이 많아요. 잠시 후 다시 시도해 주세요.',
  GEMINI_OVERLOADED: 'Gemini가 일시적으로 혼잡해 상황 분석이 지연되고 있어요.',
  SERVER_BUSY: '현재 요청이 많아요. 잠시 후 다시 시도해 주세요.',
  SYMPTOM_MODEL_NOT_INSTALLED: '증상 분류 모델을 사용할 수 없어요. 서버 설정을 확인해 주세요.',
  SYMPTOM_MODEL_UNAVAILABLE: '증상 분류 모델을 불러오지 못했어요. 서버 설정을 확인해 주세요.',
  SYMPTOM_MODEL_FAILED: '증상 분류를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
  STREAM_BACKPRESSURE: '음성 처리가 지연되어 녹음을 중단했어요. 잠시 후 다시 시도해 주세요.',
  STREAM_LIMIT: '녹음 가능한 시간을 초과했어요. 새 녹음을 시작해 주세요.',
  TRANSCRIPT_TOO_LONG: '분석할 내용이 너무 길어요. 더 짧은 음성으로 다시 시도해 주세요.',
  FRAME_TOO_LARGE: '음성 전송 중 문제가 발생했어요. 다시 녹음해 주세요.',
  INVALID_PCM: '음성 전송 중 문제가 발생했어요. 다시 녹음해 주세요.',
  INVALID_STREAM_MESSAGE: '음성 연결 중 문제가 발생했어요. 다시 녹음해 주세요.',
}

// Only fixed local text reaches the screen; never render a server's message.
export function publicErrorMessage(code) {
  if (typeof code === 'string' && code.includes('TIMEOUT')) {
    return '분석 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.'
  }
  return Object.hasOwn(messages, code) ? messages[code] : '음성 분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'
}
