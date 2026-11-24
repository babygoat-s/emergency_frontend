import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeFile, analyzeText, DEFAULT_CONFIG, getConfig, getExample, getHealth } from './api/analysis'
import { startRealtime } from './audio/realtime'
import { EMPTY_STREAM, formatTime, mergeStreamEvent, validateFile } from './lib/results'
import { RESEARCH_NOTICE } from './lib/manuals'
import Icon from './components/Icon'
import Results, { UrgencyScale } from './components/Results'
import AudioPlayer from './components/AudioPlayer'
import ThemeSwitch from './components/ThemeSwitch'
import './App.css'

const languageNames = { ko: '한국어', en: '영어', ja: '일본어', auto: '자동 감지' }
async function readConnection(signal) {
  const [health, settings] = await Promise.allSettled([getHealth(signal), getConfig(signal)])
  return { health, settings, signal }
}

function Waveform({ level, active }) {
  return (
    <div className={`waveform ${active ? 'active' : ''}`} aria-hidden="true">
      {Array.from({ length: 35 }, (_, index) => (
        <span
          key={index}
          style={{
            '--bar-height': `${8 + Math.sin(index * 1.7) ** 2 * (active ? 12 + level * 50 : 23)}px`,
            '--bar-delay': `${index * 37}ms`,
          }}
        />
      ))}
    </div>
  )
}

function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [connection, setConnection] = useState('checking')
  const [mode, setMode] = useState('upload')
  const [language, setLanguage] = useState('ko')
  const [conversation, setConversation] = useState('')
  const [file, setFile] = useState(null)
  const [recordingSource, setRecordingSource] = useState('microphone')
  const [audioUrl, setAudioUrl] = useState('')
  const [duration, setDuration] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [operation, setOperation] = useState('idle')
  const [reviewingAudio, setReviewingAudio] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [streamState, setStreamState] = useState(EMPTY_STREAM)
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [guideOpen, setGuideOpen] = useState(false)
  const fileInput = useRef(null)
  const operationRef = useRef(null)
  const startedAt = useRef(0)
  const connectionRequest = useRef(null)
  const guideDialog = useRef(null)
  const guideTrigger = useRef(null)
  const busy = operation !== 'idle'
  const recording = operation === 'recording'
  const durationExceeded =
    duration != null && Number.isFinite(duration) && duration > config.max_audio_seconds

  const updateConnection = useCallback(({ health, settings, signal }) => {
    if (signal.aborted) return
    setConnection(health.status === 'fulfilled' ? 'online' : 'offline')
    if (settings.status === 'fulfilled') setConfig({ ...DEFAULT_CONFIG, ...settings.value })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    connectionRequest.current = controller
    readConnection(controller.signal).then(updateConnection)
    return () => {
      controller.abort()
      connectionRequest.current?.abort()
      operationRef.current?.controller.abort()
      operationRef.current?.session?.cancel()
    }
  }, [updateConnection])

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const timer = setTimeout(() => setAudioUrl(url), 0)
    return () => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
    }
  }, [file])

  useEffect(() => {
    if (guideOpen) guideDialog.current?.showModal()
    else if (guideDialog.current?.open) guideDialog.current.close()
  }, [guideOpen])

  useEffect(() => {
    if (result)
      document.getElementById('analysis-results')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      })
  }, [result])

  const stopRecording = useCallback(async () => {
    const current = operationRef.current
    if (!current?.session || current.stopping) return
    current.stopping = true
    setOperation('finishing')
    setLevel(0)
    try {
      await current.session.stop()
    } catch (err) {
      if (!current.controller.signal.aborted) setError(err.message)
    } finally {
      if (operationRef.current === current) {
        operationRef.current = null
        setOperation('idle')
      }
    }
  }, [])

  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000)
      setSeconds(Math.min(elapsed, config.max_audio_seconds))
      if (elapsed >= config.max_audio_seconds) stopRecording()
    }, 250)
    return () => clearInterval(timer)
  }, [recording, config.max_audio_seconds, stopRecording])

  function refreshConnection() {
    connectionRequest.current?.abort()
    const controller = new AbortController()
    connectionRequest.current = controller
    setConnection('checking')
    readConnection(controller.signal).then(updateConnection)
  }

  function selectFile(selected) {
    if (busy || !selected) return
    const message = validateFile(selected, config)
    setDragging(false)
    setError(message)
    if (message) return
    setFile(selected)
    setAudioUrl('')
    setDuration(null)
    setResult(null)
    setStreamState(EMPTY_STREAM)
  }

  function cancelOperation() {
    operationRef.current?.controller.abort()
    operationRef.current?.session?.cancel()
    operationRef.current = null
    setOperation('idle')
    setLevel(0)
  }

  async function runAnalysis(kind) {
    if (operationRef.current) return
    if (kind !== 'example' && !['local_only', 'redacted_cloud'].includes(config.llm_privacy_mode)) {
      setError('서버의 개인정보 보호 설정을 확인하지 못해 전송을 차단했습니다. 백엔드를 재시작해 주세요.')
      return
    }
    if (kind === 'file') {
      const message = validateFile(file, config)
      if (message || durationExceeded) {
        setError(message || `음성은 ${Math.floor(config.max_audio_seconds / 60)}분 이내로 준비해 주세요.`)
        return
      }
    }
    const controller = new AbortController()
    const current = { controller, kind }
    operationRef.current = current
    setOperation(kind)
    setError(null)
    setResult(null)
    setStreamState(EMPTY_STREAM)
    try {
      let response
      if (kind === 'example') response = await getExample(controller.signal)
      else if (kind === 'text') response = await analyzeText(conversation, controller.signal, config.llm_features_enabled)
      else response = await analyzeFile(file, language, controller.signal)
      if (controller.signal.aborted) return
      setResult(response)
      setConnection('online')
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message)
        if (err.code === 'NETWORK_ERROR') setConnection('offline')
      }
    } finally {
      if (operationRef.current === current) {
        operationRef.current = null
        setOperation('idle')
      }
    }
  }

  async function beginRecording(sourceType = recordingSource) {
    if (!['local_only', 'redacted_cloud'].includes(config.llm_privacy_mode)) {
      setError('서버의 개인정보 보호 설정을 확인하지 못해 전송을 차단했습니다. 백엔드를 재시작해 주세요.')
      return
    }
    if (operationRef.current) return
    const controller = new AbortController()
    const current = { controller, kind: 'realtime', session: null }
    operationRef.current = current
    setOperation('connecting')
    setReviewingAudio(false)
    setError(null)
    setResult(null)
    setStreamState(EMPTY_STREAM)
    setSeconds(0)
    try {
      const session = await startRealtime({
        language,
        sourceType,
        file: sourceType === 'file' ? file : null,
        maxDurationSeconds: config.max_audio_seconds,
        onRecordingReady: (blob) => {
          if (operationRef.current !== current) return
          setFile(new File([blob], '통화 녹음.wav', { type: 'audio/wav' }))
          setAudioUrl('')
          setDuration((blob.size - 44) / 32000)
        },
        onSourceEnded: () => {
          if (operationRef.current === current) setOperation('finishing')
        },
        signal: controller.signal,
        onLevel: (value) => {
          if (operationRef.current === current) setLevel(value)
        },
        onEvent: (event) => {
          if (operationRef.current !== current) return
          if (event.type === 'reviewing') setReviewingAudio(true)
          if (event.type === 'update') setReviewingAudio(false)
          if (event.type === 'update') setStreamState((previous) => mergeStreamEvent(previous, event))
          if (event.type === 'finished') {
            operationRef.current = null
            setOperation('idle')
            setLevel(0)
          }
        },
        onError: (err) => {
          if (operationRef.current !== current) return
          setError(err.message)
          setOperation('idle')
          setLevel(0)
          operationRef.current = null
        },
      })
      if (controller.signal.aborted || operationRef.current !== current) {
        session.cancel()
        return
      }
      current.session = session
      startedAt.current = Date.now()
      setOperation('recording')
      setConnection('online')
    } catch (err) {
      if (operationRef.current === current) {
        if (!controller.signal.aborted)
          setError(err.message || '녹음을 시작하지 못했어요. 마이크를 확인해 주세요.')
        operationRef.current = null
        setOperation('idle')
      }
    }
  }

  function openGuide(event) {
    guideTrigger.current = event.currentTarget
    setGuideOpen(true)
  }

  const progressText = {
    text: '매뉴얼에서 다음 질문을 찾고 있어요',
    file: '음성 파일을 분석하고 있어요',
    example: '예시를 불러오고 있어요',
    connecting: '음성 입력과 서버를 연결하고 있어요',
    recording: '실시간으로 음성을 분석하고 있어요',
    finishing: reviewingAudio ? '반복 응답 구간의 원음을 다시 인식하고 있어요' : '마지막 음성의 분석을 마무리하고 있어요',
  }[operation]

  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <div className="app-shell">
        <aside className="sidebar" aria-label="주 메뉴">
          <a className="brand" href="#main-content" aria-label="119 신고접수 지원 홈">
            <span className="brand-mark">119</span>
            <span>
              신고접수 지원<small>OPERATIONS WORKSPACE</small>
            </span>
          </a>
          <div className="workspace-label">
            <span className="workspace-avatar">
              <Icon name="headphones" size={16} />
            </span>
            <span>
              구급 상황관리<small>상담 워크스페이스</small>
            </span>
          </div>
          <nav className="primary-nav">
            <span className="nav-label">워크스페이스</span>
            <a className="nav-item selected" href="#main-content" aria-current="page">
              <Icon name="home" />
              <span>신고 분석</span>
              <span className="nav-selected-dot" />
            </a>
            <a className="nav-item" href="#classification-guide">
              <Icon name="book" />
              <span>분류 기준 안내</span>
            </a>
            <button className="nav-item" onClick={openGuide}>
              <Icon name="help" />
              <span>사용 안내</span>
            </button>
          </nav>
          <div className="sidebar-workflow">
            <span className="nav-label">상담 분석 절차</span>
            <div>
              <span>01</span>음성 또는 대화 입력
            </div>
            <div>
              <span>02</span>전사 및 증상 확인
            </div>
            <div>
              <span>03</span>후속 질문 검토
            </div>
          </div>
          <div className="sidebar-bottom">
            <span className="environment-label">
              <span className="status-dot" />
              연구용 프로토타입
            </span>
            <p>
              분석 결과와 매뉴얼 근거는
              <br />
              담당자의 검토가 필요합니다.
            </p>
            <ThemeSwitch />
            <span className="sidebar-version">119 상담 의사결정 지원</span>
          </div>
        </aside>
        <div className="workspace-shell">
          <header className="app-header">
            <div className="breadcrumb">
              <Icon name="headphones" size={16} />
              <span>119 상황관리</span>
              <Icon name="chevron" size={12} />
              <strong>신고 분석</strong>
            </div>
            <div className={`connection-status ${connection}`}>
              <span className="status-dot" />
              <span role="status">
                {connection === 'checking'
                  ? '연결 확인 중'
                  : connection === 'online'
                    ? '서버 연결됨'
                    : '서버 연결 필요'}
              </span>
              <button
                className="icon-button"
                onClick={refreshConnection}
                disabled={connection === 'checking'}
                title="서버 연결 다시 확인"
                aria-label="서버 연결 다시 확인"
              >
                <Icon name="refresh" size={14} className={connection === 'checking' ? 'spin' : ''} />
              </button>
            </div>
          </header>
          <main id="main-content" className="main-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">CALL ANALYSIS</div>
                <h1>신고 음성 분석</h1>
                <p>통화 전사와 환자 상태를 확인하고, 다음 상담 질문을 검토합니다.</p>
              </div>
              <div className="page-actions">
                <button
                  className="button secondary-button"
                  disabled={busy}
                  onClick={() => runAnalysis('example')}
                >
                  <Icon name="play" size={15} />
                  예시 불러오기
                </button>
                <button className="icon-button guide-trigger" onClick={openGuide} aria-label="사용 안내">
                  <Icon name="help" />
                </button>
              </div>
            </div>
            {connection === 'offline' && (
              <div className="connection-notice" role="status">
                <Icon name="info" />
                <p>분석 서버에 연결할 수 없습니다. 백엔드 실행 상태를 확인해 주세요.</p>
                <button className="text-button" onClick={refreshConnection}>
                  다시 연결
                  <Icon name="refresh" size={14} />
                </button>
              </div>
            )}
            <section className="card input-card" aria-labelledby="input-title">
              <div className="card-heading">
                <div className="section-title">
                  <Icon name="wave" size={17} />
                  <h2 id="input-title">상담 입력</h2>
                </div>
                <span className={`badge ${recording ? 'recording-badge' : 'neutral-badge'}`}>
                  {recording
                    ? '녹음 중'
                    : busy
                      ? '처리 중'
                      : file && mode === 'upload'
                        ? '파일 준비됨'
                        : '입력 대기'}
                </span>
              </div>
              <div className="input-controls">
                <div className="mode-switch" role="group" aria-label="상담 입력 방식">
                  <button
                    className={mode === 'upload' ? 'active' : ''}
                    aria-pressed={mode === 'upload'}
                    disabled={busy}
                    onClick={() => {
                      setMode('upload')
                      setError(null)
                    }}
                  >
                    <Icon name="upload" size={16} />
                    파일 업로드
                  </button>
                  <button
                    className={mode === 'record' ? 'active' : ''}
                    aria-pressed={mode === 'record'}
                    disabled={busy}
                    onClick={() => {
                      setMode('record')
                      setError(null)
                    }}
                  >
                    <Icon name="mic" size={16} />
                    실시간 녹음
                  </button>
                  <button
                    className={mode === 'text' ? 'active' : ''}
                    aria-pressed={mode === 'text'}
                    disabled={busy}
                    onClick={() => {
                      setMode('text')
                      setError(null)
                    }}
                  >
                    <Icon name="fileText" size={16} />
                    대화 입력
                  </button>
                </div>
                <label className="language-select">
                  <Icon name="globe" size={14} />
                  <span className="sr-only">분석 언어</span>
                  <select
                    value={language}
                    disabled={busy}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    {config.languages.map((value) => (
                      <option key={value} value={value}>
                        {languageNames[value] || value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {mode === 'text' ? (
                <div className="manual-text-input">
                  <label htmlFor="conversation-text">지금까지의 상담 대화</label>
                  <textarea
                    id="conversation-text"
                    value={conversation}
                    onChange={(event) => setConversation(event.target.value)}
                    maxLength={20000}
                    disabled={busy}
                    placeholder={
                      '신고자: 어머니가 머리가 아프고 토한다고 해요.\n상담원: 의식이 있습니까?\n신고자: 네, 의식은 또렷해요.'
                    }
                  />
                  <div className="input-bottom">
                    <span className="input-hint">
                      화자를 구분해 입력한 뒤, 대화가 추가되면 다시 추천받을 수 있습니다.
                    </span>
                    {busy ? (
                      <button className="button secondary-button" onClick={cancelOperation}>
                        취소
                        <Icon name="close" size={15} />
                      </button>
                    ) : (
                      <button
                        className="button primary-button"
                        disabled={!conversation.trim()}
                        onClick={() => runAnalysis('text')}
                      >
                        후속 질문 추천
                        <Icon name="arrow" size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ) : mode === 'upload' ? (
                <>
                  <input
                    ref={fileInput}
                    className="sr-only"
                    type="file"
                    tabIndex={-1}
                    accept={config.supported_audio_formats.map((value) => `.${value}`).join(',')}
                    onChange={(event) => {
                      selectFile(event.target.files?.[0])
                      event.target.value = ''
                    }}
                    disabled={busy}
                    aria-label="분석할 음성 파일 선택"
                  />
                  <div
                    className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''} ${busy ? 'disabled' : ''}`}
                    onDragOver={(event) => {
                      event.preventDefault()
                      if (!busy) setDragging(true)
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragging(false)
                      if (event.dataTransfer.files.length > 1)
                        setError('한 번에 하나의 음성 파일을 선택해 주세요.')
                      else selectFile(event.dataTransfer.files[0])
                    }}
                  >
                    {file ? (
                      <div className="selected-file">
                        <div className="file-row">
                          <span className="file-icon">
                            <Icon name="file" size={23} />
                          </span>
                          <div className="file-description">
                            <strong title={file.name}>{file.name}</strong>
                            <span>
                              {(file.size / (1024 * 1024)).toFixed(2)} MB
                              {duration != null && Number.isFinite(duration)
                                ? ` · ${formatTime(duration)}`
                                : ''}
                            </span>
                          </div>
                          <span className="file-ready">
                            <Icon name="checkCircle" size={14} />
                            준비됨
                          </span>
                          <button
                            className="button secondary-button"
                            disabled={busy}
                            onClick={() => fileInput.current?.click()}
                          >
                            파일 변경
                          </button>
                        </div>
                        {audioUrl && <AudioPlayer key={audioUrl} src={audioUrl} onDuration={setDuration} />}
                      </div>
                    ) : (
                      <div className="upload-content">
                        <span className="upload-symbol">
                          <Icon name="upload" size={24} />
                        </span>
                        <div>
                          <h3>신고 통화 파일을 여기에 놓으세요</h3>
                          <p>
                            {config.supported_audio_formats.map((item) => item.toUpperCase()).join(', ')} ·
                            최대 {config.max_upload_mb} MB
                          </p>
                        </div>
                        <button
                          className="button secondary-button"
                          disabled={busy}
                          onClick={() => fileInput.current?.click()}
                        >
                          파일 선택
                          <Icon name="chevron" size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  {durationExceeded && (
                    <p className="validation-note" role="alert">
                      <Icon name="alert" size={15} />
                      최대 {Math.floor(config.max_audio_seconds / 60)}분까지 분석할 수 있습니다. 파일 길이를
                      확인해 주세요.
                    </p>
                  )}
                  <div className="input-bottom">
                    <span className="input-hint">
                      <Icon name="shield" size={14} />
                      최대 {Math.floor(config.max_audio_seconds / 60)}분 · 분석 기록 자동 저장 없음
                    </span>
                    {busy ? (
                      <button className="button secondary-button" onClick={cancelOperation}>
                        분석 취소
                        <Icon name="close" size={15} />
                      </button>
                    ) : (
                      <button
                        className="button primary-button"
                        disabled={!file || durationExceeded}
                        onClick={() => runAnalysis('file')}
                      >
                        음성 분석 시작
                        <Icon name="arrow" size={15} />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className={`record-zone ${recording ? 'recording' : ''}`}>
                    <span className="record-mic">
                      <Icon name="mic" size={24} />
                    </span>
                    <div className="record-description">
                      <h3>
                        {recording
                          ? '신고 통화 녹음 중'
                          : operation === 'connecting'
                            ? '음성 입력 연결 중'
                            : operation === 'finishing'
                              ? '마지막 발화 처리 중'
                              : '실시간 통화 분석'}
                      </h3>
                      <p>
                        {recording
                          ? '발화가 인식되면 전사와 분석 결과가 순차적으로 표시됩니다.'
                          : recordingSource === 'file'
                            ? '선택한 파일을 마이크 재녹음 없이 직접 분석합니다.'
                            : recordingSource === 'system'
                              ? '선택한 PC 소리만 입력합니다. 오디오 공유를 선택하세요. 화면 영상은 전송하지 않습니다.'
                              : '현장 대화는 마이크로, PC 통화는 통화 오디오 또는 파일 직접 입력으로 분석해 주세요.'}
                      </p>
                    </div>
                    <Waveform level={level} active={recording} />
                    <div className="record-timer">
                      <span className={recording ? 'record-dot' : 'timer-dot'} />
                      {formatTime(seconds)}
                      <small>/ {formatTime(config.max_audio_seconds)}</small>
                    </div>
                  </div>
                  <div className="input-bottom">
                    <span className="input-hint">
                      <Icon name="radio" size={14} />
                      <select aria-label="실시간 음성 입력" value={recordingSource}
                        disabled={busy} onChange={(event) => setRecordingSource(event.target.value)}>
                        <option value="microphone">마이크</option>
                        <option value="system">PC·통화 오디오</option>
                        <option value="file" disabled={!file}>선택한 파일 직접 입력</option>
                      </select>
                    </span>
                    {recording ? (
                      <button className="button stop-button" onClick={stopRecording}>
                        <Icon name="stop" size={14} />
                        녹음 종료
                      </button>
                    ) : ['connecting', 'finishing'].includes(operation) ? (
                      <button className="button secondary-button" onClick={cancelOperation}>
                        취소
                        <Icon name="close" size={15} />
                      </button>
                    ) : (
                      <button className="button primary-button" onClick={() => beginRecording()}
                        disabled={busy || (recordingSource === 'file' && (!file || durationExceeded))}>
                        <Icon name="mic" size={15} />
                        실시간 분석 시작
                      </button>
                    )}
                  </div>
                  {audioUrl && !busy && <AudioPlayer key={audioUrl} src={audioUrl} onDuration={setDuration} />}
                </>
              )}
              <div className="privacy-status" role="note">
                <Icon name="shield" size={14} />
                {!['local_only', 'redacted_cloud'].includes(config.llm_privacy_mode)
                  ? '개인정보 보호 설정을 확인한 뒤 분석할 수 있습니다.'
                  : config.llm_external_enabled
                    ? '식별정보 가림 적용 · 외부 AI 사용'
                    : `외부 AI 전송 차단 · 서버 내부에서 분석${config.llm_features_enabled ? '' : ' · 요약·긴급도 AI 보류'}`}
              </div>
              {busy && (
                <div className="operation-status" role="status">
                  <Icon
                    name={recording ? 'radio' : 'refresh'}
                    size={15}
                    className={recording ? '' : 'spin'}
                  />
                  <div>
                    <strong>{progressText}</strong>
                    <span>
                      {operation === 'file'
                        ? '처리 시간은 음성 길이와 서버 상태에 따라 달라집니다.'
                        : operation === 'connecting'
                          ? '브라우저의 마이크 권한을 확인해 주세요.'
                          : '전사와 확인 질문을 순차적으로 업데이트합니다.'}
                    </span>
                  </div>
                  {operation === 'example' && (
                    <button className="text-button" onClick={cancelOperation}>
                      취소
                    </button>
                  )}
                </div>
              )}
              {error && (
                <div className="error-message" role="alert">
                  <Icon name="alert" size={17} />
                  <p>{error}</p>
                  <button
                    className="icon-button"
                    onClick={() => setError(null)}
                    aria-label="오류 메시지 닫기"
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
              )}
            </section>
            <Results
              result={result}
              streamState={streamState}
              operation={operation}
              symptomCount={config.koelectra_symptom_labels.length}
              llmEnabled={config.llm_features_enabled}
            />
            <aside className="support-column" aria-label="기능 안내와 분석 예시">
              <section className="card features-card">
                <div className="aside-heading">
                  <Icon name="list" size={16} />
                  <h2>이렇게 도와드려요</h2>
                </div>
                <div className="feature-list">
                  <div>
                    <span>01</span>
                    <p>
                      <strong>통화 전사</strong>발화와 화자별 대화 내용을 확인합니다.
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <p>
                      <strong>환자 상태 파악</strong>분류된 증상과 확인 정보를 검토합니다.
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <p>
                      <strong>후속 질문 검토</strong>추천 질문과 매뉴얼 근거를 확인합니다.
                    </p>
                  </div>
                </div>
              </section>
              <section
                className="card symptom-catalog"
                id="classification-guide"
                aria-labelledby="symptom-catalog-title"
              >
                <div className="aside-heading">
                  <Icon name="pulse" size={16} />
                  <h2 id="symptom-catalog-title">분류할 수 있는 증상</h2>
                  <span className="count">{config.koelectra_symptom_labels.length}종</span>
                </div>
                {config.koelectra_symptom_labels.length ? (
                  <ul>
                    {config.koelectra_symptom_labels.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">서버 연결 후 분류 대상을 표시합니다.</p>
                )}
                {config.llm_features_enabled && <UrgencyScale />}
              </section>
              <section className="card example-card">
                <div className="aside-heading">
                  <Icon name="fileText" size={16} />
                  <h2>미리 체험하기</h2>
                  <span className="badge neutral-badge">고정 예시</span>
                </div>
                <p className="example-description">준비된 가상 신고로 분석 결과를 확인합니다.</p>
                {config.example_preview && (
                  <>
                    <blockquote className="example-quote">{config.example_preview.quote}</blockquote>
                    <div className="example-tags">
                      {config.example_preview.symptom_labels.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                  </>
                )}
                <button
                  className="button secondary-button example-button"
                  disabled={busy}
                  onClick={() => runAnalysis('example')}
                >
                  {operation === 'example' ? '불러오는 중' : '예시 결과 열기'}
                  <Icon name="arrow" size={14} />
                </button>
                <small className="example-disclaimer">화면 확인을 위한 가상 신고입니다.</small>
              </section>
            </aside>
            <footer className="page-footer">
              <Icon name="shield" size={14} />
              <p>
                {(result || streamState.data)?.rag?.research_notice ||
                  (config.rag_enabled
                    ? RESEARCH_NOTICE
                    : '분석 결과는 상담원의 판단을 돕는 참고 정보입니다. 최종 판단은 담당자가 확인해 주세요.')}
              </p>
              <span>자동 저장 없음 · 새로고침 전 결과 다운로드</span>
            </footer>
          </main>
        </div>
      </div>

      <dialog
        ref={guideDialog}
        className="guide-dialog"
        onCancel={() => setGuideOpen(false)}
        onClose={() => {
          setGuideOpen(false)
          guideTrigger.current?.focus()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect()
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              setGuideOpen(false)
          }
        }}
        aria-labelledby="guide-title"
      >
        <div className="guide-heading">
          <span className="feature-icon">
            <Icon name="book" size={25} />
          </span>
          <button className="icon-button" onClick={() => setGuideOpen(false)} aria-label="사용 안내 닫기">
            <Icon name="close" />
          </button>
        </div>
        <h2 id="guide-title">상담 분석 사용 안내</h2>
        <p className="muted">입력부터 결과 검토까지의 기본 절차입니다.</p>
        <ol className="guide-steps">
          <li>
            <span>01</span>
            <div>
              <h3>음성을 준비해 주세요</h3>
              <p>
                음성 파일을 선택하거나 ‘실시간 녹음’에서 마이크를 켜세요. 분석할 음성의 언어도 선택할 수
                있어요.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>분석을 시작해 주세요</h3>
              <p>
                파일은 ‘음성 분석 시작’를 누르세요. 실시간 녹음은 시작과 함께 분석되며 ‘녹음 종료’를 누르면
                마지막 결과까지 받아요.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>핵심 정보를 확인하세요</h3>
              <p>
                변환된 텍스트, 증상과 매뉴얼 질문을 살펴보세요. 결과의 다운로드 버튼으로 텍스트를
                보관할 수 있어요.
              </p>
            </div>
          </li>
        </ol>
        <div className="guide-info">
          <Icon name="info" size={17} />
          <p>
            분석 기록은 별도로 저장하지 않아요. 새로고침 전에 필요한 결과를 다운로드해 주세요. 실시간 분석은
            localhost 또는 HTTPS에서 이용할 수 있어요.
          </p>
        </div>
        <button className="button primary-button guide-done" onClick={() => setGuideOpen(false)}>
          확인했어요
          <Icon name="check" size={17} />
        </button>
      </dialog>
    </>
  )
}

export default App
