import { useEffect, useRef, useState } from 'react'
import {
  OPERATOR_VOICE_MAX_SECONDS, OPERATOR_VOICE_SENTENCES, startOperatorVoiceCapture,
} from '../audio/operator-voice.js'
import { validateOperatorVoiceSample } from '../audio/realtime-socket.js'
import { pcmWavBlob } from '../audio/wav.js'
import { saveOperatorVoice } from '../lib/operator-voice-storage.js'
import Icon from './Icon.jsx'

export default function OperatorVoiceDialog({ scope, onSaved, onClose }) {
  const dialog = useRef(null)
  const operation = useRef(null)
  const [phase, setPhase] = useState('idle')
  const [seconds, setSeconds] = useState(0)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal()
    return () => {
      clearTimeout(operation.current?.timer)
      operation.current?.controller.abort()
    }
  }, [])

  useEffect(() => {
    if (phase !== 'recording') return
    const started = operation.current?.started
    if (!started) return
    const timer = setInterval(() => {
      setSeconds(Math.min(OPERATOR_VOICE_MAX_SECONDS, Math.floor((Date.now() - started) / 1000)))
    }, 250)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => () => {
    if (draft) URL.revokeObjectURL(draft.url)
  }, [draft])

  async function finish() {
    const current = operation.current
    if (!current?.stop || current.finishing) return
    current.finishing = true
    clearTimeout(current.timer)
    setPhase('processing')
    try {
      const sample = await current.stop()
      if (!current.controller.signal.aborted) {
        setDraft({ sample, url: URL.createObjectURL(pcmWavBlob([sample])) })
      }
    } catch (failure) {
      if (!current.controller.signal.aborted) setError(failure.message)
    } finally {
      if (!current.controller.signal.aborted) {
        operation.current = null
        setPhase('idle')
      }
    }
  }

  async function record() {
    if (operation.current) return
    const current = { controller: new AbortController() }
    operation.current = current
    setDraft(null)
    setError('')
    setSeconds(0)
    setPhase('preparing')
    try {
      current.stop = await startOperatorVoiceCapture(current.controller.signal)
      if (current.controller.signal.aborted) return
      current.started = Date.now()
      current.timer = setTimeout(finish, OPERATOR_VOICE_MAX_SECONDS * 1000)
      setPhase('recording')
    } catch (failure) {
      if (current.controller.signal.aborted) return
      operation.current = null
      setPhase('idle')
      setError(failure.message || '상담원 음성 녹음을 시작하지 못했어요.')
    }
  }

  async function save() {
    if (!draft || operation.current) return
    const current = { controller: new AbortController() }
    const { signal } = current.controller
    operation.current = current
    setError('')
    setPhase('saving')
    try {
      await validateOperatorVoiceSample(draft.sample, signal)
      if (signal.aborted) return
      try {
        await saveOperatorVoice(scope, draft.sample)
      } catch {
        throw new Error('브라우저에 음성을 저장하지 못했어요. 사이트 데이터 설정을 확인해 주세요.')
      }
      onSaved(draft.sample)
    } catch (failure) {
      if (!signal.aborted) setError(failure.message)
    } finally {
      if (!signal.aborted) {
        operation.current = null
        setPhase('idle')
      }
    }
  }

  return (
    <dialog ref={dialog} className="guide-dialog operator-voice-dialog"
      aria-labelledby="operator-voice-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <div className="guide-heading">
        <h2 id="operator-voice-title">상담원 음성 등록</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="상담원 음성 등록 닫기">
          <Icon name="close" size={17} />
        </button>
      </div>
      <p>혼자 안내 문장 세 개를 읽어 주세요. 목소리가 들리는 부분은 최소 4초가 필요합니다.</p>
      <ol className="operator-voice-sentences">
        {OPERATOR_VOICE_SENTENCES.map((sentence) => <li key={sentence}>{sentence}</li>)}
      </ol>
      {draft && <audio controls preload="metadata" src={draft.url} aria-label="상담원 샘플 미리 듣기" />}
      <p role="status" className="operator-voice-status">
        {phase === 'preparing' ? '마이크에 연결하고 있어요.'
          : phase === 'recording' ? `샘플 녹음 중 · ${seconds}초 / ${OPERATOR_VOICE_MAX_SECONDS}초`
            : phase === 'processing' ? '녹음을 마무리하고 있어요.'
              : phase === 'saving' ? '화자 모델로 샘플을 확인하고 있어요.'
                : draft ? '샘플을 들어보고 저장할 수 있어요.'
                  : '저장한 음성은 이 브라우저에서 다음 실시간 분석에 사용됩니다.'}
      </p>
      {error && <p className="operator-voice-error" role="alert">{error}</p>}
      <div className="operator-voice-actions">
        {phase === 'recording' ? (
          <button type="button" className="button stop-button" onClick={finish}>
            <Icon name="stop" size={14} /> 샘플 녹음 종료
          </button>
        ) : (
          <button type="button" className={`button ${draft ? 'secondary-button' : 'primary-button'}`}
            disabled={phase !== 'idle'} onClick={record}>
            <Icon name="mic" size={15} /> {draft ? '다시 녹음' : '샘플 녹음 시작'}
          </button>
        )}
        {draft && <button type="button" className="button primary-button" disabled={phase !== 'idle'} onClick={save}>샘플 저장</button>}
      </div>
    </dialog>
  )
}
