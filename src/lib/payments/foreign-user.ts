// 외국인 사용자 식별 — 외국인 Escrow 결제 조건 트리거.
//
// 식별 기준: users.lang ∈ {en, zh, ja}
// (Migration 334_users_lang 기반. 회원가입 시점 또는 사용자 변경 시 설정됨)
//
// 클라이언트/서버 양쪽 사용 가능 (순수 함수).

export type SeoLang = "ko" | "en" | "zh" | "ja";

const FOREIGN_LANGS: ReadonlySet<string> = new Set(["en", "zh", "ja"]);

export function isForeignLang(lang: string | null | undefined): boolean {
  return !!lang && FOREIGN_LANGS.has(lang);
}

export function isForeignUser(user: { lang?: string | null } | null | undefined): boolean {
  return isForeignLang(user?.lang);
}

// 외국인 깃발 여부 (puzzle.leader.lang 기반)
export function isForeignPuzzle(
  puzzle: { leader?: { lang?: string | null } | null } | null | undefined
): boolean {
  return isForeignLang(puzzle?.leader?.lang);
}

// 외국인 사용자가 결제 진입 가능한지 검증 (UI 가드)
export function canForeignUserPay(user: {
  lang?: string | null;
  country_code?: string | null;
}): { ok: boolean; reason?: string } {
  if (!isForeignLang(user.lang)) {
    return { ok: false, reason: "korean_user_uses_direct_md" };
  }
  return { ok: true };
}
