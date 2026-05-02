const KEY = "nightflow_client_id";

/**
 * 비로그인 익명 사용자 식별용 UUID
 * localStorage에 저장. 클리어하면 새로 생성됨.
 */
export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
