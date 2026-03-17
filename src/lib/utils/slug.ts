/** MD 고유 slug 생성: "홍길동" → "hong-gildong-a1b2" 패턴 (한글은 랜덤 조합) */
export function generateSlug(name: string): string {
  const random = Math.random().toString(36).substring(2, 6);
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 10);
  return sanitized ? `${sanitized}-${random}` : `md-${random}`;
}

/** 예약번호 생성: "NF-A1B2" */
export function generateReservationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `NF-${code}`;
}
