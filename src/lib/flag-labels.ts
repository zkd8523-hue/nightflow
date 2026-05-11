// Phase 1: 깃발 → 퍼즐 리네이밍
// - noun/verb_create: 퍼즐로 변경 (메뉴/탭 등 신규 등록 맥락)
// - 깃발(flag) 라벨은 인원 확정 상태(is_recruiting_party=false) 표시용으로만 보존
export const FLAG_LABELS = {
  noun: "퍼즐",
  verb_create: "파티원 모집하기",
  verb_join: "파티원 합류하기",
  party: "파티원",
  party_toggle: "파티원도 모으기",
  empty_hint: "퍼즐을 올리면 MD 시크릿 오퍼가 쏟아져요",
  list_section: "올라와 있는 퍼즐",
  detail_title: "퍼즐 상세",
  cancel: "퍼즐 내리기",
  headcount_fixed: "인원 확정",
  party_recruiting: "파티원 모집 중",
  // 깃발(flag) 상태용 라벨 — 인원 확정 퍼즐 카드에 표시
  flag_badge: "🚩 깃발",
  flag_hint: "인원 확정 · MD 오퍼 대기 중",
} as const;
