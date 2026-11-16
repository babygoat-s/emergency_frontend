export const RESEARCH_NOTICE =
  '오래된 첨부 매뉴얼을 사용하는 연구용 의사결정 지원 프로토타입입니다. 의료 전문가 검증 전 실제 응급상황에 사용하지 마세요. 긴급·응급·비응급은 과거 원문의 연구용 분류입니다. 실제 출동 판단은 담당자 확인이 필요합니다.'

export function formatManualSource(source) {
  if (source.document_id === 'sop501') {
    return `재난현장 표준작전 절차 SOP 501 · ${source.printed_page ? `${source.printed_page}쪽` : `PDF ${source.pdf_page}쪽`}`
  }
  const name =
    source.document_id === 'manual'
      ? '119구급상황관리센터 상담 매뉴얼'
      : source.document_name.replace(/\.pdf$/i, '')
  return `${name} · PDF ${source.pdf_page}쪽`
}

export function questionSources(question) {
  return [...new Map(
    [question.source, ...(question.supporting_sources || [])].map((source) => [
      `${source.document_id}:${source.pdf_page}`, source,
    ]),
  ).values()]
}

export function isResearchNotice(text) {
  return /오래된.*매뉴얼|의료 전문가 검증 전|과거 원문의 연구용|연구용 의사결정 지원/.test(text)
}
