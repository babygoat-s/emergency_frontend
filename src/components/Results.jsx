import Icon from './Icon'
import { formatTime } from '../lib/results'

const urgencyLabels = { critical: ['긴급', 'critical'], high: ['높음', 'high'], moderate: ['보통', 'moderate'], low: ['낮음', 'low'], unknown: ['판단 보류', 'unknown'] }
const speakerLabels = { caller: '신고자', operator: '접수 담당자', unknown: '음성' }

export default function Results({ result, streamState, operation }) {
  const data = result || streamState.data
  const busy = ['file', 'connecting', 'recording', 'finishing'].includes(operation)
  const analysis = data?.analysis
  const stale = !result && streamState.analysisSequence < streamState.transcriptSequence && analysis
  const [urgency, urgencyClass] = urgencyLabels[analysis?.urgency?.level] || urgencyLabels.unknown
  const symptoms = data?.symptoms || analysis?.symptoms || []
  const segments = data?.transcript?.segments || []

  function downloadResult() {
    const text = [
      '119 긴급 음성 분석 결과', data.is_demo ? '[고정 예시 결과]' : '',
      '\n[변환된 텍스트]', data.transcript.text,
      '\n[상황 요약]', analysis?.summary || '분석 결과 없음',
      '\n[감지된 증상]', ...symptoms.map((item) => `- ${item.label}${item.evidence ? `: ${item.evidence}` : ''}`),
      '\n[긴급도]', `${urgency}${analysis?.urgency?.reason ? `: ${analysis.urgency.reason}` : ''}`,
      '\n[확인 질문]', ...(analysis?.recommended_questions || []).map((item) => `- ${item.question} (${item.purpose})`),
      stale ? '\n※ 상황 분석은 이전 음성 구간의 결과입니다.' : '',
      streamState.analysisError && !result ? `\n※ 상황 분석 오류: ${streamState.analysisError.message}` : '',
      '\n[안내]', ...(data.warnings || []),
    ].filter(Boolean).join('\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `119-분석결과${data.is_demo ? '-예시' : ''}.txt`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="card results-card" id="analysis-results" aria-labelledby="results-title" aria-busy={busy}>
    <div className="card-heading">
      <div className="section-title"><span className="step-number">02</span><h2 id="results-title">분석 결과</h2></div>
      <div className="result-actions">
        {data?.is_demo && <span className="badge demo-badge">예시 결과</span>}
        {data?.transcript?.text && <button className="icon-button" onClick={downloadResult} title="분석 결과 다운로드" aria-label="분석 결과 텍스트 파일로 다운로드"><Icon name="download" size={18} /></button>}
        {!data && <span className="badge neutral-badge">{busy ? '분석 중' : '분석 대기'}</span>}
      </div>
    </div>
    <span className="sr-only" role="status">{result ? result.is_demo ? '예시 분석 결과가 준비되었습니다.' : '음성 분석 결과가 준비되었습니다.' : ''}</span>
    {!data ? <div className={`empty-result ${busy ? 'is-processing' : ''}`}>
      <div className="empty-illustration"><div className="illustration-ring" /><Icon name={busy ? 'pulse' : 'file'} size={30} /><span className="mini-spark"><Icon name="sparkles" size={14} /></span></div>
      <h3>{busy ? operation === 'recording' ? '음성을 듣고 있어요' : '음성을 분석하고 있어요' : '음성 속 중요한 정보를 한눈에'}</h3>
      <p>{busy ? '분석이 완료되면 이곳에 결과가 표시됩니다.' : '음성을 업로드하거나 녹음하면 분석 결과가 여기에 나타나요.'}</p>
      <div className="result-preview-tags"><span><Icon name="file" size={14} />음성 텍스트</span><span><Icon name="pulse" size={14} />감지된 증상</span><span><Icon name="help" size={14} />확인 질문</span></div>
    </div> : <div className="result-content">
      {data.is_demo && <p className="inline-note demo-note"><Icon name="info" size={16} />화면을 체험하기 위한 고정 예시입니다. 실제 음성을 분석한 결과가 아니에요.</p>}
      {streamState.analysisError && !result && <p className="inline-note warning-note" role="status"><Icon name="alert" size={16} />{streamState.analysisError.message} 전사 내용은 계속 확인할 수 있어요.</p>}
      {stale && <p className="previous-result-note">상황 분석은 이전 구간의 결과입니다. {busy ? '새 음성을 분석하고 있어요.' : '최신 구간의 상황 분석은 완료되지 않았어요.'}</p>}
      <div className="transcript-section">
        <div className="subheading"><h3><Icon name="file" size={17} />변환된 텍스트</h3><span>{data.transcript?.duration_seconds != null && formatTime(data.transcript.duration_seconds)}{operation === 'recording' && <span className="live-label">실시간</span>}</span></div>
        <div className="transcript-box">
          {segments.length ? segments.map((segment, index) => <div className="transcript-segment" key={`${segment.start}-${index}`}><span className="segment-time">{formatTime(segment.start)}</span><div>{data.transcript.diarization_available && <span className="speaker-label">{speakerLabels[segment.speaker] || '음성'}</span>}<p>{segment.text}</p></div></div>) : <p>{data.transcript?.text || (data.status === 'no_speech' ? '아직 인식된 발화가 없어요. 마이크에 가까이 말해 주세요.' : '전사 결과를 기다리고 있어요.')}</p>}
        </div>
      </div>
      {analysis ? <>
        <div className="summary-section"><div className="subheading"><h3><Icon name="sparkles" size={17} />상황 요약</h3><span className={`badge urgency-${urgencyClass}`}><span className="status-dot" />긴급도 · {urgency}</span></div><p className="summary-text">{analysis.summary}</p><p className="urgency-reason">{analysis.urgency.reason}</p></div>
        <div className="symptom-section"><h3>감지된 증상 <span className="count">{symptoms.length}</span></h3>{symptoms.length ? <div className="symptom-list">{symptoms.map((symptom) => <div className="symptom-item" key={symptom.code}><span className="symptom-tag">{symptom.label}</span>{symptom.evidence && <span className="symptom-evidence">“{symptom.evidence}”</span>}</div>)}</div> : <p className="muted small">텍스트에서 추출된 증상이 없어요.</p>}</div>
        <div className="questions-section"><h3><Icon name="help" size={17} />이어서 확인해 보세요</h3><ol className="question-list">{analysis.recommended_questions.map((question, index) => <li key={question.question}><span className="question-number">{index + 1}</span><div><p>{question.question}</p><span>{question.purpose}</span></div></li>)}</ol><p className="manual-note">담당자 검토용 질문이며 공식 응급 매뉴얼에 근거한 질문은 아닙니다.</p></div>
      </> : <><div className="analysis-pending"><Icon name={streamState.analysisError ? 'info' : 'sparkles'} size={19} /><p>{data.status === 'no_speech' ? busy ? '음성이 인식되면 증상과 상황을 분석합니다.' : '인식된 발화가 없어요. 마이크를 확인한 뒤 다시 녹음해 주세요.' : streamState.analysisError ? '상황 분석을 완료하지 못했어요. 위 전사 내용을 확인해 주세요.' : busy ? '전사된 내용을 바탕으로 상황과 증상을 분석하고 있어요.' : '상황 분석 결과가 없어요. 음성을 다시 분석해 주세요.'}</p></div>{symptoms.length > 0 && <div className="symptom-section"><h3>감지된 증상 <span className="count">{symptoms.length}</span></h3><div className="symptom-list">{symptoms.map((symptom) => <div className="symptom-item" key={symptom.code}><span className="symptom-tag">{symptom.label}</span>{symptom.evidence && <span className="symptom-evidence">“{symptom.evidence}”</span>}</div>)}</div></div>}</>}
      {data.audio_signals?.available && <div className="audio-signals"><h3>음성 상태</h3><div className="signal-tags">{data.audio_signals.speaking_rate_per_minute != null && <span>말속도 {Math.round(data.audio_signals.speaking_rate_per_minute)} /분</span>}{data.audio_signals.crying_detected != null && <span>울음 {data.audio_signals.crying_detected ? '감지' : '미감지'}</span>}{data.audio_signals.breathing_distress_detected != null && <span>호흡 곤란 {data.audio_signals.breathing_distress_detected ? '감지' : '미감지'}</span>}</div></div>}
      {data.warnings?.length > 0 && <details className="result-details"><summary><Icon name="info" size={15} />분석 시 참고할 점 <span>{data.warnings.length}</span></summary><ul>{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
    </div>}
  </section>
}
