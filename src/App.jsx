import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeFile, DEFAULT_CONFIG, getConfig, getExample, getHealth } from './api/analysis'
import { startRealtime } from './audio/realtime'
import { EMPTY_STREAM, formatTime, mergeStreamEvent, validateFile } from './lib/results'
import Icon from './components/Icon'
import Results, { UrgencyScale } from './components/Results'
import './App.css'

const languageNames = { ko: '한국어', en: '영어', ja: '일본어', auto: '자동 감지' }
const features = [
  { icon: 'pulse', title: '음성을 텍스트로', text: '신고 내용을 읽기 쉬운 텍스트로 변환해요.' },
  { icon: 'sparkles', title: '상황과 증상을 한눈에', text: '주요 증상과 긴급도를 분석해 중요한 정보를 정리해요.' },
  { icon: 'help', title: '다음 확인 질문까지', text: '상황을 더 정확하게 파악할 수 있도록 확인 질문을 제안해요.' },
]

async function readConnection(signal) {
  const [health, settings] = await Promise.allSettled([getHealth(signal), getConfig(signal)])
  return { health, settings, signal }
}

function Waveform({ level, active }) {
  return <div className={`waveform ${active ? 'active' : ''}`} aria-hidden="true">{Array.from({ length: 35 }, (_, index) => <span key={index} style={{ '--bar-height': `${8 + Math.sin(index * 1.7) ** 2 * (active ? 12 + level * 50 : 23)}px`, '--bar-delay': `${index * 37}ms` }} />)}</div>
}

function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [connection, setConnection] = useState('checking')
  const [geminiReady, setGeminiReady] = useState(null)
  const [mode, setMode] = useState('upload')
  const [language, setLanguage] = useState('ko')
  const [file, setFile] = useState(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [duration, setDuration] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [operation, setOperation] = useState('idle')
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
  const durationExceeded = duration != null && Number.isFinite(duration) && duration > config.max_audio_seconds

  const updateConnection = useCallback(({ health, settings, signal }) => {
    if (signal.aborted) return
    setConnection(health.status === 'fulfilled' ? 'online' : 'offline')
    setGeminiReady(health.status === 'fulfilled' ? health.value.gemini_configured : null)
    if (settings.status === 'fulfilled') setConfig({ ...DEFAULT_CONFIG, ...settings.value })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    connectionRequest.current = controller
    readConnection(controller.signal).then(updateConnection)
    return () => { controller.abort(); connectionRequest.current?.abort(); operationRef.current?.controller.abort(); operationRef.current?.session?.cancel() }
  }, [updateConnection])

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const timer = setTimeout(() => setAudioUrl(url), 0)
    return () => { clearTimeout(timer); URL.revokeObjectURL(url) }
  }, [file])

  useEffect(() => {
    if (guideOpen) guideDialog.current?.showModal()
    else if (guideDialog.current?.open) guideDialog.current.close()
  }, [guideOpen])

  useEffect(() => {
    if (result) document.getElementById('analysis-results')?.scrollIntoView({
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
    try { await current.session.stop() }
    catch (err) { if (!current.controller.signal.aborted) setError(err.message) }
    finally {
      if (operationRef.current === current) { operationRef.current = null; setOperation('idle') }
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
    if (kind === 'file') {
      const message = validateFile(file, config)
      if (message || durationExceeded) { setError(message || `음성은 ${Math.floor(config.max_audio_seconds / 60)}분 이내로 준비해 주세요.`); return }
    }
    const controller = new AbortController()
    const current = { controller, kind }
    operationRef.current = current
    setOperation(kind)
    setError(null)
    setResult(null)
    setStreamState(EMPTY_STREAM)
    try {
      const response = kind === 'example' ? await getExample(controller.signal) : await analyzeFile(file, language, controller.signal)
      if (controller.signal.aborted) return
      setResult(response)
      setConnection('online')
    } catch (err) {
      if (!controller.signal.aborted) { setError(err.message); if (err.code === 'NETWORK_ERROR') setConnection('offline') }
    } finally {
      if (operationRef.current === current) { operationRef.current = null; setOperation('idle') }
    }
  }

  async function beginRecording() {
    if (operationRef.current) return
    const controller = new AbortController()
    const current = { controller, kind: 'realtime', session: null }
    operationRef.current = current
    setOperation('connecting')
    setError(null)
    setResult(null)
    setStreamState(EMPTY_STREAM)
    setSeconds(0)
    try {
      const session = await startRealtime({
        language, signal: controller.signal,
        onLevel: (value) => { if (operationRef.current === current) setLevel(value) },
        onEvent: (event) => {
          if (operationRef.current !== current) return
          if (event.type === 'update') setStreamState((previous) => mergeStreamEvent(previous, event))
          if (event.type === 'finished') { operationRef.current = null; setOperation('idle'); setLevel(0) }
        },
        onError: (err) => {
          if (operationRef.current !== current) return
          setError(err.message)
          setOperation('idle')
          setLevel(0)
          operationRef.current = null
        },
      })
      if (controller.signal.aborted || operationRef.current !== current) { session.cancel(); return }
      current.session = session
      startedAt.current = Date.now()
      setOperation('recording')
      setConnection('online')
    } catch (err) {
      if (operationRef.current === current) {
        if (!controller.signal.aborted) setError(err.message || '녹음을 시작하지 못했어요. 마이크를 확인해 주세요.')
        operationRef.current = null
        setOperation('idle')
      }
    }
  }

  function openGuide(event) {
    guideTrigger.current = event.currentTarget
    setGuideOpen(true)
  }

  const progressText = { file: '음성 파일을 분석하고 있어요', example: '예시를 불러오고 있어요', connecting: '마이크와 서버를 연결하고 있어요', recording: '실시간으로 음성을 분석하고 있어요', finishing: '마지막 음성의 분석을 마무리하고 있어요' }[operation]

  return <>
    <a className="skip-link" href="#main-content">본문으로 바로가기</a>
    <header className="app-header">
      <a className="brand" href="#main-content" aria-label="긴급 음성 분석기 홈"><span className="brand-icon"><Icon name="pulse" size={31} /></span><span>긴급 음성 분석기<span className="brand-label">119 AI ASSISTANT</span></span></a>
      <span className="header-description">목소리 속 단서, 더 빠른 상황 파악</span>
      <div className={`connection-status ${connection}`}><span className="status-dot" /><span role="status">{connection === 'checking' ? '서버 연결 확인 중' : connection === 'online' ? '서버 연결됨' : '서버 연결 필요'}</span><button className="icon-button" onClick={refreshConnection} disabled={connection === 'checking'} title="서버 연결 다시 확인" aria-label="서버 연결 다시 확인"><Icon name="refresh" size={15} className={connection === 'checking' ? 'spin' : ''} /></button></div>
    </header>
    <div className="app-shell">
      <aside className="sidebar" aria-label="주 메뉴"><div className="sidebar-top"><span className="nav-label">WORKSPACE</span><nav><a className="nav-item selected" href="#main-content" aria-current="page" aria-label="음성 분석"><Icon name="home" size={20} /><span>음성 분석</span><span className="nav-selected-dot" /></a><button className="nav-item" onClick={openGuide} aria-label="사용 안내"><Icon name="book" size={20} /><span>사용 안내</span><Icon name="chevron" size={14} /></button></nav></div><div className="sidebar-bottom"><div className="sidebar-note"><span className="sidebar-note-icon"><Icon name="headphones" size={20} /></span><strong>중요한 순간을 위한<br />조금 더 빠른 이해</strong><p>음성에서 필요한 정보를 찾아<br />신고 접수를 도와드려요.</p><span className="sidebar-note-line" /></div><span className="sidebar-version"><Icon name="pulse" size={14} />119 음성 분석 워크스페이스</span></div></aside>
      <main id="main-content" className="main-content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />VOICE TO INSIGHT</div><h1>목소리를 듣고, 상황을 이해해요<span>.</span></h1><p>119 신고 음성을 텍스트로 바꾸고, 중요한 증상을 확인하세요.</p></div><span className="page-heading-icon"><Icon name="pulse" size={37} /></span></div>
        {connection === 'offline' && <div className="connection-notice" role="status"><Icon name="info" size={18} /><p>분석 서버와 연결되지 않았어요. 백엔드를 실행한 뒤 다시 연결해 주세요.</p><button onClick={refreshConnection}>다시 연결<Icon name="refresh" size={14} /></button></div>}
        {connection === 'online' && geminiReady === false && <div className="connection-notice" role="status"><Icon name="info" size={18} /><p>상황 요약과 맞춤 질문에는 Gemini 설정이 필요해요. 실시간 전사와 기본 확인 질문은 사용할 수 있어요.</p></div>}
        <div className="workspace-grid"><div className="analysis-column">
          <section className="card input-card" aria-labelledby="input-title">
            <div className="card-heading"><div className="section-title"><span className="step-number">01</span><h2 id="input-title">분석할 음성을 준비해 주세요</h2></div><span className="input-heading-icon"><Icon name="headphones" size={19} /></span></div>
            <div className="input-controls"><div className="mode-switch" role="group" aria-label="음성 입력 방식"><button className={mode === 'upload' ? 'active' : ''} aria-pressed={mode === 'upload'} disabled={busy} onClick={() => { setMode('upload'); setError(null) }}><Icon name="upload" size={17} />파일 업로드</button><button className={mode === 'record' ? 'active' : ''} aria-pressed={mode === 'record'} disabled={busy} onClick={() => { setMode('record'); setError(null) }}><Icon name="mic" size={17} />실시간 녹음</button></div><label className="language-select"><Icon name="globe" size={15} /><span className="sr-only">분석 언어</span><select value={language} disabled={busy} onChange={(event) => setLanguage(event.target.value)}>{config.languages.map((value) => <option key={value} value={value}>{languageNames[value] || value}</option>)}</select></label></div>
            {mode === 'upload' ? <>
              <input ref={fileInput} className="sr-only" type="file" tabIndex={-1} accept={config.supported_audio_formats.map((value) => `.${value}`).join(',')} onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = '' }} disabled={busy} aria-label="분석할 음성 파일 선택" />
              <div className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''} ${busy ? 'disabled' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }} onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length > 1) setError('한 번에 하나의 음성 파일을 선택해 주세요.'); else selectFile(event.dataTransfer.files[0]) }}>
                {file ? <div className="selected-file"><span className="upload-symbol file-symbol"><Icon name="file" size={28} /></span><strong title={file.name}>{file.name}</strong><span className="file-meta">{(file.size / (1024 * 1024)).toFixed(2)} MB{duration != null && Number.isFinite(duration) ? ` · ${formatTime(duration)}` : ''}<span className="file-ready"><Icon name="checkCircle" size={13} />선택 완료</span></span>{audioUrl && <audio key={audioUrl} src={audioUrl} controls preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} aria-label="선택한 음성 미리 듣기" />}<button className="text-button" disabled={busy} onClick={() => fileInput.current?.click()}>다른 파일 선택<Icon name="refresh" size={13} /></button></div> : <><span className="upload-symbol"><Icon name="upload" size={36} /><span className="upload-symbol-dot" /></span><h3>음성 파일을 이곳에 놓아주세요</h3><p>또는 아래 버튼으로 파일을 선택하세요</p><button className="button upload-button" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="upload" size={17} />파일 선택하기</button><span className="dropzone-formats">{config.supported_audio_formats.slice(0, 3).map((item) => item.toUpperCase()).join(', ')} 등 · 최대 {config.max_upload_mb} MB</span></>}
              </div>
              {durationExceeded && <p className="validation-note" role="alert"><Icon name="alert" size={15} />최대 {Math.floor(config.max_audio_seconds / 60)}분까지 분석할 수 있어요. 더 짧은 파일을 선택해 주세요.</p>}
              <div className="input-bottom"><span className="input-hint"><Icon name="clock" size={15} />최대 {Math.floor(config.max_audio_seconds / 60)}분의 음성</span>{operation === 'file' ? <button className="button secondary-button" onClick={cancelOperation}>분석 취소<Icon name="close" size={16} /></button> : <button className="button primary-button" disabled={!file || busy || durationExceeded} onClick={() => runAnalysis('file')}><Icon name="sparkles" size={17} />음성 분석하기<Icon name="arrow" size={17} /></button>}</div>
            </> : <><div className={`record-zone ${recording ? 'recording' : ''}`}><span className={`record-mic ${recording ? 'recording' : ''}`}><Icon name="mic" size={30} /></span><h3>{recording ? '편안하게 말씀해 주세요' : operation === 'connecting' ? '마이크를 준비하고 있어요' : operation === 'finishing' ? '마지막 내용을 분석하고 있어요' : '마이크로 바로 시작하세요'}</h3><p>{recording ? '녹음하는 동안 전사와 분석 결과가 아래에 표시돼요.' : '마이크 접근을 허용한 뒤 신고 음성을 녹음해 주세요.'}</p><Waveform level={level} active={recording} /><div className="record-timer"><span className={recording ? 'record-dot' : 'timer-dot'} />{formatTime(seconds)}<span>/ {formatTime(config.max_audio_seconds)}</span></div></div><div className="input-bottom"><span className="input-hint"><Icon name="pulse" size={15} />최대 {config.realtime_window_seconds}초씩 전사</span>{recording ? <button className="button stop-button" onClick={stopRecording}><Icon name="stop" size={16} />녹음 종료</button> : ['connecting', 'finishing'].includes(operation) ? <button className="button secondary-button" onClick={cancelOperation}>취소<Icon name="close" size={16} /></button> : <button className="button primary-button" onClick={beginRecording} disabled={busy}><Icon name="mic" size={17} />녹음 시작하기</button>}</div></>}
            {busy && <div className="operation-status" role="status"><span className={recording ? 'record-dot' : 'loading-spinner'} /><p>{progressText}<span>{operation === 'file' ? '음성 길이와 모델 상태에 따라 시간이 걸릴 수 있어요.' : operation === 'recording' ? '분석 결과의 도착 시간은 서버 상태에 따라 달라져요.' : operation === 'connecting' ? '브라우저에서 마이크 권한을 허용해 주세요.' : '잠시만 기다려 주세요.'}</span></p>{operation === 'example' && <button className="text-button" onClick={cancelOperation}>취소</button>}</div>}
            {error && <div className="error-message" role="alert"><Icon name="alert" size={18} /><p>{error}</p><button className="icon-button" onClick={() => setError(null)} aria-label="오류 메시지 닫기"><Icon name="close" size={16} /></button></div>}
          </section>
          <Results result={result} streamState={streamState} operation={operation} symptomCount={config.koelectra_symptom_labels.length} />
          <p className="session-note"><Icon name="shield" size={14} />분석 기록은 저장되지 않아요. 현재 결과는 페이지를 새로고침하면 사라집니다.</p>
        </div>
        <aside className="support-column" aria-label="기능 안내와 분석 예시">
          <section className="card features-card"><div className="aside-heading"><h2>이렇게 도와드려요</h2><span className="small-caps">HOW IT WORKS</span></div><div className="feature-list">{features.map((feature, index) => <div className="feature-item" key={feature.title}><span className={`feature-icon feature-icon-${index}`}><Icon name={feature.icon} size={24} /></span><div><h3>{feature.title}</h3><p>{feature.text}</p></div></div>)}</div><div className="feature-footnote"><span className="status-dot" />업로드부터 결과 확인까지, 한 화면에서</div></section>
          {config.koelectra_symptom_labels.length > 0 && <section className="card features-card symptom-catalog" aria-labelledby="symptom-catalog-title">
            <div className="aside-heading"><h2 id="symptom-catalog-title">분류할 수 있는 증상</h2><span className="small-caps">{config.koelectra_symptom_labels.length}종</span></div>
            <ul>{config.koelectra_symptom_labels.map((label) => <li key={label}>{label}</li>)}</ul>
            <UrgencyScale />
          </section>}
          <section className="card example-card">
            <div className="example-card-heading"><span className="badge example-label"><Icon name="sparkles" size={12} />미리 체험하기</span><Icon name="sparkles" size={22} /></div>
            <h2>어떤 결과가 나올까요?</h2>
            <p className="example-description">음성 파일이 없어도 괜찮아요.<br />준비된 예시로 분석 화면을 살펴보세요.</p>
            {config.example_preview && <>
              <div className="example-quote"><span className="quote-mark">“</span><p>{config.example_preview.quote}</p><span className="quote-caption"><span />신고 내용 예시</span></div>
              <div className="example-tags">{config.example_preview.symptom_labels.map((label) => <span key={label}>{label}</span>)}</div>
            </>}
            <button className="button example-button" disabled={busy} onClick={() => runAnalysis('example')}>{operation === 'example' ? <><span className="loading-spinner" />예시 불러오는 중</> : <>예시 결과 살펴보기<Icon name="arrow" size={17} /></>}</button>
            <span className="example-disclaimer">가상 신고를 바탕으로 준비한 고정 예시예요.</span>
          </section>
          <div className="help-card"><span className="help-card-icon"><Icon name="help" size={22} /></span><div><strong>처음 사용하시나요?</strong><button onClick={openGuide}>간단한 사용 안내 보기<Icon name="arrow" size={14} /></button></div></div>
        </aside></div>
        <footer className="page-footer"><Icon name="info" size={15} /><p>AI 분석은 신고 접수를 돕는 참고 정보입니다. 최종 판단은 담당자가 확인해 주세요.</p><span>119 VOICE ASSISTANT</span></footer>
      </main>
    </div>
    <dialog ref={guideDialog} className="guide-dialog" onCancel={() => setGuideOpen(false)} onClose={() => { setGuideOpen(false); guideTrigger.current?.focus() }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setGuideOpen(false) } }} aria-labelledby="guide-title"><div className="guide-heading"><span className="feature-icon"><Icon name="book" size={25} /></span><button className="icon-button" onClick={() => setGuideOpen(false)} aria-label="사용 안내 닫기"><Icon name="close" /></button></div><h2 id="guide-title">세 단계면 충분해요</h2><p className="muted">음성 준비부터 결과 확인까지 간편하게.</p><ol className="guide-steps"><li><span>01</span><div><h3>음성을 준비해 주세요</h3><p>음성 파일을 선택하거나 ‘실시간 녹음’에서 마이크를 켜세요. 분석할 음성의 언어도 선택할 수 있어요.</p></div></li><li><span>02</span><div><h3>분석을 시작해 주세요</h3><p>파일은 ‘음성 분석하기’를 누르세요. 실시간 녹음은 시작과 함께 분석되며 ‘녹음 종료’를 누르면 마지막 결과까지 받아요.</p></div></li><li><span>03</span><div><h3>핵심 정보를 확인하세요</h3><p>변환된 텍스트, 상황 요약, 증상과 확인 질문을 살펴보세요. 결과의 다운로드 버튼으로 텍스트를 보관할 수 있어요.</p></div></li></ol><div className="guide-info"><Icon name="info" size={17} /><p>분석 기록은 별도로 저장하지 않아요. 새로고침 전에 필요한 결과를 다운로드해 주세요. 실시간 분석은 localhost 또는 HTTPS에서 이용할 수 있어요.</p></div><button className="button primary-button guide-done" onClick={() => setGuideOpen(false)}>확인했어요<Icon name="check" size={17} /></button></dialog>
  </>
}

export default App

