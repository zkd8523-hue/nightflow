// 전화번호 형식 정규화·검증 (SMS OTP 인증은 더 이상 사용하지 않음)

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function isValidKoreanPhone(phone: string): boolean {
  return /^01[016789]\d{7,8}$/.test(normalizePhone(phone));
}
