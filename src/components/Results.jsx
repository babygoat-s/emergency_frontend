import Icon from './Icon'
import ManualQuestions from './ManualQuestions'
import { formatTime, selectQuestions, selectManualResult } from '../lib/results'
import { formatManualSource, isResearchNotice, questionSources } from '../lib/manuals'

const urgencyLabels = { minimal: '최하', low: '하', moderate: '중', high: '상', critical: '최상' }
const speakerLabels = { caller: '신고자', operator: '접수 담당자', unknown: '화자 미확인' }

export function UrgencyScale() {
  return (
    <section className="urgency-scale" aria-labelledby="urgency-scale-title">
      <h3 id="urgency-scale-title">긴급도 5단계</h3>
      <ol aria-label="낮은 긴급도부터 높은 긴급도까지">
        {Object.entries(urgencyLabels).map(([level, label]) => (
          <li key={level} className={`badge urgency-${level}`}>
            {label}
          </li>
        ))}
      </ol>
      <p>최상에 가까울수록 더 긴급해요. 판단에 필요한 정보가 부족하면 ‘판단 보류’로 표시해요.</p>
    </section>
  )
}

export default function Results({ result, streamState, operation, symptomCount = 0 }) {
  const data = result || streamState.data
  const textOnly = data?.transcript?.provider === 'text' || operation === 'text'
  const busy = ['file', 'text', 'example', 'connecting', 'recording', 'finishing'].includes(operation)
  const analysis = data?.analysis
  const ragSummary = data?.rag?.summary_provider === 'llm' ? data.rag.summary : null
  const previousSummary = !result && !ragSummary ? streamState.lastSummary?.text : null
  const summary = data?.rag ? (ragSummary || previousSummary) : analysis?.summary
  const summaryUnavailable = ['unavailable', 'disabled'].includes(data?.rag?.summary_provider)
  const ragUrgency = data?.rag?.urgency
  const llmUrgency = ragUrgency?.origin === 'llm' ? ragUrgency : null
  const previousUrgency = !result && !data?.rag?.requires_immediate_operator_review &&
    !llmUrgency && streamState.lastUrgency
  const urgencyResult = data?.rag ? llmUrgency || previousUrgency : analysis?.urgency
  const pendingUrgencyReason = ragUrgency?.origin === 'unavailable' ? ragUrgency.reason : null
  const warnings = (data?.warnings || []).filter((warning) => !isResearchNotice(warning))
  const manualResult = selectManualResult(result, streamState)
  const latestSpeechSequence = streamState.localQuestionSequence || streamState.transcriptSequence
  const stale = !result && streamState.analysisSequence < latestSpeechSequence && analysis
  const urgencyLevel = urgencyResult?.level
  const urgencyClass = Object.hasOwn(urgencyLabels, urgencyLevel) ? urgencyLevel : 'unknown'
  const urgency = urgencyLabels[urgencyClass] || (
    urgencyResult ? '판단 보류' : data?.rag?.llm_status === 'unavailable' ||
      data?.rag?.llm_status === 'partial' || data?.rag?.llm_status === 'not_configured'
      ? '분석 미완료' : '분석 대기'
  )
  const symptoms = data?.symptoms || analysis?.symptoms || []
  const segments = data?.transcript?.segments || []
  const { local, questions } = selectQuestions(result, streamState)
  let symptomStatus = '발화가 인식되면 증상을 분류합니다.'
  if (data?.transcript?.text)
    symptomStatus = busy ? '전사된 내용을 분류하고 있습니다.' : '증상 분류 결과를 확인해 주세요.'
  if (data?.symptom_provider || analysis) symptomStatus = '현재 전사에서 감지된 증상이 없습니다.'
  if (data?.symptom_provider === 'koelectra' && symptomCount)
    symptomStatus = `현재 전사에서 분류 대상 ${symptomCount}종 중 감지된 증상이 없습니다.`
  if (!result && streamState.symptomError) symptomStatus = streamState.symptomError

  function downloadResult() {
    const text = [
      '119 긴급 음성 분석 결과',
      data.is_demo ? '[고정 예시 결과]' : '',
      '\n[변환된 텍스트]',
      data.transcript.text,
      '\n[상황 요약]',
      summary || 'LLM 요약을 아직 생성하지 못했습니다.',
      '\n[감지된 증상]',
      ...(symptoms.length
        ? symptoms.map((item) => `- ${item.label}${item.evidence ? `: ${item.evidence}` : ''}`)
        : [symptomStatus]),
      '\n[긴급도]',
      `${urgency}${urgencyResult?.reason ? `: ${urgencyResult.reason}` : ''}`,
      local ? '\n[기본 확인 질문]' : '\n[확인 질문]',
      ...(!data.rag ? questions.map((item) => `- ${item.question} (${item.purpose})`) : []),
      ...(data.rag
        ? [
            '\n[매뉴얼 근거 질문]',
            ...manualResult.questions.map(
              (item) =>
                `- ${item.question}\n${item.reason}\n${questionSources(item).map(formatManualSource).join('\n')}`,
            ),
            data.rag.message,
          ]
        : []),
      stale ? '\n※ 상황 분석은 이전 음성 구간의 결과입니다.' : '',
      streamState.analysisError && !result ? `\n※ 상황 분석 오류: ${streamState.analysisError.message}` : '',
      '\n[안내]',
      ...warnings,
      data.rag?.research_notice,
    ]
      .filter(Boolean)
      .join('\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `119-분석결과${data.is_demo ? '-예시' : ''}.txt`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const settledPhase = {
    completed: '분석 완료',
    unavailable: '결과 검토 필요',
    pending: '부분 결과',
    no_speech: '발화 대기',
  }[data?.status] || '입력 대기'
  const phase = busy
    ? operation === 'recording'
      ? '실시간 분석'
      : '분석 중'
    : settledPhase
  const processingTitle = {
    recording: '통화 음성을 수신하고 있습니다',
    connecting: '마이크 연결을 준비하고 있습니다',
    finishing: '마지막 발화를 처리하고 있습니다',
    text: '상담 내용을 확인하고 있습니다',
    example: '예시 결과를 불러오고 있습니다',
  }[operation] || '음성을 텍스트로 변환하고 있습니다'
  const urgencyIndex = Object.keys(urgencyLabels).indexOf(urgencyClass)

  return (
    <section
      className="results-section"
      id="analysis-results"
      aria-labelledby="results-title"
      aria-busy={busy}
    >
      <div className="results-toolbar">
        <div className="section-title">
          <h2 id="results-title">분석 결과</h2>
          <span className={`badge ${busy ? 'processing-badge' : data?.status === 'completed' ? 'complete-badge' : 'neutral-badge'}`}>
            <span className="status-dot" />
            {phase}
          </span>
        </div>
        <div className="result-actions">
          {data?.is_demo && <span className="badge demo-badge">고정 예시</span>}
          {!result && streamState.processingLagSeconds > 2 && (
            <span className="panel-meta">전사 대기 {Math.ceil(streamState.processingLagSeconds)}초</span>
          )}
          {data?.transcript?.text && (
            <button
              className="button secondary-button download-button"
              onClick={downloadResult}
              aria-label="분석 결과 텍스트 파일로 다운로드"
            >
              <Icon name="download" size={15} />
              결과 다운로드
            </button>
          )}
        </div>
      </div>
      <span className="sr-only" role="status">
        {result ? (result.is_demo ? '예시 분석 결과가 준비되었습니다.' : '분석 결과가 준비되었습니다.') : ''}
      </span>
      {data?.is_demo && (
        <p className="inline-note demo-note">
          <Icon name="info" size={15} />
          가상 신고를 바탕으로 준비한 고정 예시 결과입니다.
        </p>
      )}
      {streamState.analysisError && !result && (
        <p className="inline-note warning-note" role="status">
          <Icon name="alert" size={15} />
          {streamState.analysisError.message} 전사 내용과 확인 가능한 로컬 결과를 표시합니다.
        </p>
      )}
      {stale && (
        <p className="previous-result-note">
          상황 분석은 이전 발화 구간의 결과입니다.{' '}
          {busy ? '최신 발화를 처리하고 있습니다.' : '최신 구간의 상황 분석을 확인해 주세요.'}
        </p>
      )}
      <div className="results-grid">
        <section className="card transcript-panel" aria-labelledby="transcript-title">
          <div className="panel-heading">
            <div className="section-title">
              <Icon name="transcript" size={17} />
              <h3 id="transcript-title">{textOnly ? '상담 대화' : '화자별 통화 전사'}</h3>
              {segments.length > 0 && <span className="count">{segments.length}개 발화</span>}
            </div>
            <span className="panel-meta">
              {operation === 'recording' && (
                <span className="live-label">
                  <span className="record-dot" />
                  LIVE
                </span>
              )}
              {data?.transcript?.duration_seconds != null && formatTime(data.transcript.duration_seconds)}
            </span>
          </div>
          {data?.transcript?.text ? (
            <div className="transcript-box">
              {segments.length ? (
                segments.map((segment, index) => {
                  const speaker = data.transcript.diarization_available ? segment.speaker : 'unknown'
                  return (
                    <article
                      className={`transcript-segment speaker-${speaker || 'unknown'}`}
                      key={`${segment.start}-${index}`}
                    >
                      <span className="speaker-avatar" aria-hidden="true">
                        {speaker === 'operator' ? '접' : speaker === 'caller' ? '신' : '?'}
                      </span>
                      <div className="segment-content">
                        <div className="segment-heading">
                          <span className="speaker-label">
                            {speakerLabels[speaker] || speakerLabels.unknown}
                          </span>
                          <time className="segment-time">{formatTime(segment.start)}</time>
                        </div>
                        <p>{segment.text}</p>
                      </div>
                    </article>
                  )
                })
              ) : (
                <div className="transcript-plain">{data.transcript.text}</div>
              )}
              {busy && (
                <div className="transcript-listening">
                  <span className="status-dot" />
                  {operation === 'recording' ? '다음 발화를 기다리는 중' : '발화 내용을 처리하는 중'}
                </div>
              )}
            </div>
          ) : (
            <div className={`empty-transcript ${busy ? 'is-processing' : ''}`}>
              <span className="empty-icon">
                <Icon name={busy ? 'wave' : 'headphones'} size={25} />
              </span>
              <h4>
                {busy ? processingTitle : '통화 전사 대기'}
              </h4>
              <p>
                {busy
                  ? '준비된 결과부터 순차적으로 표시합니다.'
                  : '신고 음성을 입력하면 화자별 대화 내용이 이곳에 표시됩니다.'}
              </p>
              <div className="transcript-placeholder" aria-hidden="true">
                <div>
                  <i />
                  <span />
                  <span />
                </div>
                <div>
                  <i />
                  <span />
                  <span />
                </div>
                <div>
                  <i />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
          <div className="transcript-footer">
            <Icon name="info" size={13} />
            <span>
              {textOnly
                ? '입력된 상담 대화를 표시합니다.'
                : '전사와 화자 분류 결과는 원음과 함께 확인해 주세요.'}
            </span>
            {busy && <span className="processing-label">업데이트 중</span>}
          </div>
        </section>
        <div className="insights-column">
          <section className="card summary-card" aria-labelledby="summary-title">
            <div className="panel-heading">
              <div className="section-title">
                <Icon name="summary" size={17} />
                <h3 id="summary-title">상담 요약</h3>
              </div>
              <span className="panel-meta">
                {summary ? (previousSummary ? '이전 LLM 요약' : 'LLM 요약') : '요약 대기'}
              </span>
            </div>
            <div className="summary-body">
              <p className="summary-text">
                {summary || (summaryUnavailable
                  ? 'LLM 요약을 아직 생성하지 못했습니다. 대화 내용은 전사 영역에서 확인할 수 있습니다.'
                  : busy || data?.rag
                    ? 'LLM이 환자 상태와 신고 경과를 종합해 요약을 작성하고 있습니다.'
                    : '대화가 입력되면 LLM이 환자 상태와 신고 내용을 요약합니다.')}
              </p>
              {previousSummary && <p className="manual-note">최신 발화의 요약이 준비되면 갱신합니다.</p>}
            </div>
          </section>
          <section className={`card analysis-card urgency-${urgencyClass}`} aria-labelledby="urgency-title">
            <div className="panel-heading">
              <div className="section-title">
                <Icon name="pulse" size={17} />
                <h3 id="urgency-title">긴급도</h3>
              </div>
              <span className="panel-meta">
                {urgencyResult?.origin === 'llm' ? 'LLM 검토 제안' : '담당자 검토용'}
              </span>
            </div>
            <div className="urgency-body">
              <div className="urgency-value">긴급도 - {urgency}</div>
              {data?.rag?.requires_immediate_operator_review && (
                <p className="immediate-review">
                  <Icon name="alert" size={15} />
                  즉시 상담원 확인 필요
                </p>
              )}
              <ol className="urgency-meter" aria-label="긴급도 5단계">
                {Object.entries(urgencyLabels).map(([level, label], index) => (
                  <li
                    key={level}
                    className={urgencyIndex >= index ? `active urgency-${level}` : ''}
                    aria-current={urgencyClass === level ? 'step' : undefined}
                  >
                    <span />
                    <small>{label}</small>
                  </li>
                ))}
              </ol>
              <p className="urgency-reason">
                {urgencyResult?.reason || pendingUrgencyReason ||
                  (busy
                    ? '환자 상태와 상담 내용을 확인하고 있습니다.'
                    : 'LLM이 대화 내용을 분석하면 표시합니다.')}
              </p>
            </div>
          </section>
          {!textOnly && (
            <section className="card symptom-card" aria-labelledby="symptom-title">
              <div className="panel-heading">
                <div className="section-title">
                  <Icon name="list" size={17} />
                  <h3 id="symptom-title">증상 분류</h3>
                  <span className="count">{symptoms.length}</span>
                </div>
                <span className="panel-meta">다중 분류</span>
              </div>
              <div className="symptom-section">
                {symptoms.length ? (
                  <div className="symptom-list">
                    {symptoms.map((symptom) => (
                      <div className="symptom-item" key={symptom.code}>
                        <span className="symptom-tag">
                          <span className="status-dot" />
                          {symptom.label}
                        </span>
                        {symptom.evidence && <span className="symptom-evidence">“{symptom.evidence}”</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-insight">
                    <Icon name="pulse" size={18} />
                    <p>{symptomStatus}</p>
                  </div>
                )}
              </div>
            </section>
          )}
          <div className="card questions-card">
            {data?.rag ? (
              <ManualQuestions result={manualResult} />
            ) : (
              <section className="questions-section" aria-labelledby="questions-title">
                <div className="panel-heading">
                  <div className="section-title">
                    <Icon name="list" size={17} />
                    <h3 id="questions-title">{local ? '기본 확인 질문' : '후속 질문'}</h3>
                  </div>
                  {questions.length > 0 && <span className="count">{questions.length}</span>}
                </div>
                <div className="questions-body">
                  {questions.length > 0 ? (
                    <>
                      <ol className="question-list">
                        {questions.map((question, index) => (
                          <li key={question.question}>
                            <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
                            <div>
                              <p>{question.question}</p>
                              <span className="question-reason">{question.purpose}</span>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <p className="manual-note">
                        {local
                          ? '상황 분석을 기다리는 동안 사용할 수 있는 공통 질문입니다.'
                          : '담당자 검토용 질문이며 공식 응급 매뉴얼 근거를 확인해 주세요.'}
                      </p>
                    </>
                  ) : (
                    <div className="empty-insight">
                      <Icon name="list" size={18} />
                      <div>
                        <strong>{busy ? '확인 질문을 준비하고 있습니다' : '후속 질문 대기'}</strong>
                        <p>상담 내용과 확인된 상태를 바탕으로 질문을 표시합니다.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      {warnings.length > 0 && (
        <details className="result-details">
          <summary>
            <Icon name="info" size={14} />
            분석 참고사항 <span>{warnings.length}</span>
          </summary>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
