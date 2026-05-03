const KEY = "nightflow_client_id";

/**
 * crypto.randomUUID 폴백 (HTTP/구형 브라우저 대응)
 * RFC4122 v4 형식
 */
function fallbackUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 비로그인 익명 사용자 식별용 UUID
 * localStorage에 저장. 클리어하면 새로 생성됨.
 */
export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : fallbackUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
