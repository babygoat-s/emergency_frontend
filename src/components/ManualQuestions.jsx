import { formatManualSource, questionSources } from '../lib/manuals'
import Icon from './Icon'

const priorities = { 1: '위험 조건 확인', 2: '필수 정보', 3: '주증상 핵심 질문', 4: '추가 확인' }
function Citation({ source }) {
  return (
    <div className="manual-citation">
      <span>{formatManualSource(source)}</span>
    </div>
  )
}

export default function ManualQuestions({ result }) {
  return (
    <section className="questions-section manual-questions" aria-labelledby="manual-questions-title">
      <div className="panel-heading">
        <div className="section-title">
          <Icon name="list" size={17} />
          <h3 id="manual-questions-title">후속 질문</h3>
          <span className="count">{result.questions.length}</span>
        </div>
        <span className={`badge ${result.questions.length ? 'source-badge' : 'neutral-badge'}`}>
          <Icon name="book" size={12} />
          {result.questions.length ? '매뉴얼 근거' : '추천 근거 없음'}
        </span>
      </div>
      <div className="questions-body">
        {result.using_previous_llm_questions && (
          <p className="manual-note">
            이전 발화의 LLM 질문 중 현재도 미확인인 항목을 표시합니다. 최신 대화를 반영하고 있습니다.
          </p>
        )}
        <div
          className={result.requires_immediate_operator_review ? 'manual-safety-alert' : 'manual-message'}
          role={result.requires_immediate_operator_review ? 'alert' : 'status'}
        >
          <p>{result.message}</p>
          {result.safety_alerts.map((item, index) => (
            <div key={index}>
              <blockquote>{item.text}</blockquote>
              <Citation source={item.source} />
            </div>
          ))}
        </div>
        {result.questions.length > 0 && (
          <ol className="question-list">
            {result.questions.map((question, index) => (
              <li key={question.source.question_id}>
                <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <span className="manual-priority">
                    {priorities[question.priority]} · {question.related_symptom}
                    {question.selection_origin !== 'llm_rewrite' &&
                      (question.source_excerpt === question.question ? ' · 원문 질문' : ' · 매뉴얼 기반 질문')}
                  </span>
                  <p>{question.question}</p>
                  {questionSources(question).map((source) => (
                    <Citation key={`${source.document_id}:${source.pdf_page}`} source={source} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
        {result.instruction_references.length > 0 && (
          <details className="manual-details">
            <summary>도착 전 안내 관련 원문</summary>
            {result.instruction_references.map((item, index) => (
              <div className="manual-reference" key={index}>
                <blockquote>{item.text}</blockquote>
                <Citation source={item.source} />
              </div>
            ))}
          </details>
        )}
        {['unavailable', 'cooldown', 'partial', 'not_configured'].includes(result.llm_status) && (
          <p className="manual-note">
            LLM 보조 분석을 완료하지 못했습니다. 현재 확인 가능한 매뉴얼 원문 질문을 표시합니다.
            {result.llm_error_code?.startsWith('API_KEY_') && ' 서버의 API 키 설정을 확인해 주세요.'}
            {result.llm_error_code === 'INVALID_REQUEST' && ' 서버의 모델 및 요청 형식을 확인해 주세요.'}
          </p>
        )}
      </div>
    </section>
  )
}
