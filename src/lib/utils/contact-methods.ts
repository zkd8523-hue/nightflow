import type { ContactMethodType } from "@/types/database";

interface MDContactInfo {
  instagram?: string | null;
  phone?: string | null;
  kakao_open_chat_url?: string | null;
  preferred_contact_methods?: ContactMethodType[] | null;
}

/**
 * MD가 선택한 연락 수단 중, 실제 값이 있는 것만 반환.
 * preferred가 null/빈배열이면 모든 가용 수단 반환 (하위 호환).
 */
export function getVisibleContactMethods(md: MDContactInfo | null): ContactMethodType[] {
  if (!md) return [];

  const available: ContactMethodType[] = [];
  if (md.instagram) available.push("dm");
  if (md.kakao_open_chat_url) available.push("kakao");
  if (md.phone) available.push("phone");

  if (!md.preferred_contact_methods || md.preferred_contact_methods.length === 0) {
    return available;
  }

  return md.preferred_contact_methods.filter((m) => available.includes(m));
}
