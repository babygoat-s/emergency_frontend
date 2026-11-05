import { publicErrorMessage } from '../lib/error-messages.js'

const configuredBase = (import.meta.env?.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

export const API_BASE = configuredBase
export const DEFAULT_CONFIG = {
  supported_audio_formats: ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'mp4'],
  max_upload_mb: 50,
  max_audio_seconds: 600,
  languages: ['ko', 'en', 'ja', 'auto'],
  realtime_window_seconds: 6,
  koelectra_symptom_labels: [],
  example_preview: null,
}

export class ApiError extends Error {
  constructor(message, code = 'NETWORK_ERROR') {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function request(path, { signal, timeout = 15000, ...options } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeout)
  try {
    const response = await fetch(`${API_BASE}/api/v1${path}`, {
      ...options,
      signal: controller.signal,
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const code = body?.error?.code || `HTTP_${response.status}`
      throw new ApiError(publicErrorMessage(code), code)
    }
    if (!body) throw new ApiError('서버 응답을 읽지 못했어요.', 'INVALID_RESPONSE')
    return body
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error
    if (controller.signal.aborted) throw new ApiError('응답 대기 시간이 초과됐어요. 다시 시도해 주세요.', 'TIMEOUT')
    throw new ApiError('분석 서버에 연결할 수 없어요. 백엔드 실행 상태를 확인해 주세요.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export const getHealth = (signal) => request('/health', { signal, timeout: 6000 })
export const getConfig = (signal) => request('/analysis/config', { signal, timeout: 6000 })
export const getExample = (signal) => request('/analysis/example', { signal })

export function analyzeFile(file, language, signal) {
  const body = new FormData()
  body.append('file', file)
  body.append('language', language)
  return request('/analysis/file', { method: 'POST', body, signal, timeout: 300000 })
}

export function realtimeUrl() {
  const base = new URL(API_BASE || window.location.origin, window.location.origin)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  base.pathname = `${base.pathname.replace(/\/$/, '')}/api/v1/analysis/realtime`
  base.search = ''
  base.hash = ''
  return base.toString()
}
