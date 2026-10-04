// 예약 취소 사유 선택지 — 손님 확인서(BookingPass), /api/booking-cancel, 관리자
// 예약 요청 화면이 같이 쓴다. 코드는 DB(cancel_reason, Migration 686)에 그대로
// 저장되니 바꾸지 말고 추가만 할 것.

export const GUEST_CANCEL_REASONS = [
  { code: "schedule", ko: "일정이 바뀌었어요", en: "My plans changed" },
  { code: "party", ko: "같이 갈 사람이 바뀌었어요", en: "My group changed" },
  { code: "price", ko: "가격이 부담돼요", en: "Too expensive" },
  { code: "elsewhere", ko: "다른 곳으로 가기로 했어요", en: "Going somewhere else" },
  { code: "slow", ko: "확정까지 너무 오래 걸렸어요", en: "Confirmation took too long" },
  { code: "other", ko: "기타", en: "Other" },
] as const;

export type GuestCancelReason = (typeof GUEST_CANCEL_REASONS)[number]["code"];

export function isGuestCancelReason(v: unknown): v is GuestCancelReason {
  return GUEST_CANCEL_REASONS.some((r) => r.code === v);
}

export function cancelReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "md") return "파트너 사정";
  return GUEST_CANCEL_REASONS.find((r) => r.code === code)?.ko ?? code;
}
