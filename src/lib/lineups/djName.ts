/**
 * DJ 표기 → 매칭 키 정규화.
 *
 * "BERMUDA DJ" / "DJ BERMUDA" / "bermuda"가 전부 같은 키로 모여야 dj_aliases의
 * UNIQUE(normalized)가 분열을 막을 수 있다. 이 로직은 Migration 557의
 * dj_aliases.normalized 규약과 반드시 일치해야 한다 — 여기를 바꾸면 마이그레이션
 * 주석도 함께 갱신할 것.
 *
 * 규칙: 소문자화 → 영숫자/한글만 남김 → 선행·후행 "dj" 제거.
 * 한글 "버뮤다"는 영문 "bermuda"와 자동으로는 매칭되지 않는다 — 운영자가
 * Admin DjPickerSheet에서 수동으로 별칭을 연결해야 한다.
 */
export function normalizeDjName(raw: string): string {
  const stripped = raw
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '');

  // 선행 "dj" 제거 (djbermuda → bermuda)
  const noLeadingDj = stripped.startsWith('dj') ? stripped.slice(2) : stripped;
  // 후행 "dj" 제거 (bermudadj → bermuda)
  const noTrailingDj = noLeadingDj.endsWith('dj') ? noLeadingDj.slice(0, -2) : noLeadingDj;

  // 제거 후 빈 문자열이면(예: 원문이 "DJ" 그 자체) 원래 stripped를 반환해 완전 소실을 막는다
  return noTrailingDj || stripped;
}
