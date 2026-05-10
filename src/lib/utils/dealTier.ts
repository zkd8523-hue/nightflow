import type { DealTier } from "@/types/database";

/**
 * 누적 거래 카운트(`users.deal_count_total`) → 등급 변환
 *
 * - Diamond: 10건+
 * - Gold:    3~9건
 * - Silver:  1~2건
 * - 0건:     null (배지 표시 X)
 *
 * Migration 146 임계값과 동기화 유지.
 */
export function getDealTier(count: number): DealTier | null {
    if (count >= 10) return "diamond";
    if (count >= 3) return "gold";
    if (count >= 1) return "silver";
    return null;
}

export const DEAL_TIER_LABEL: Record<DealTier, string> = {
    silver: "Silver",
    gold: "Gold",
    diamond: "Diamond",
};

/** 가입 후 14일 이내면 "신규" 회원으로 간주 */
const NEW_USER_DAYS = 14;

export function isNewUser(createdAt: string | null | undefined): boolean {
    if (!createdAt) return false;
    const created = new Date(createdAt).getTime();
    if (Number.isNaN(created)) return false;
    const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
    return ageDays < NEW_USER_DAYS;
}
