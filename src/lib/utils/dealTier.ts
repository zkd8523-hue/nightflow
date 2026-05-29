import type { DealTier } from "@/types/database";

/**
 * 누적 거래 금액(`users.deal_amount_total`, 원화) → 등급 변환
 *
 * - President: 5,000만원+
 * - VVIP:      1,000만원+
 * - VIP:         100만원+
 * - 그 미만:   null (배지 표시 X)
 *
 * Migration 269 임계값과 동기화 유지.
 */
export function getDealTier(amount: number): DealTier | null {
    if (amount >= 50_000_000) return "president";
    if (amount >= 10_000_000) return "vvip";
    if (amount >= 1_000_000) return "vip";
    return null;
}

export const DEAL_TIER_LABEL: Record<DealTier, string> = {
    vip: "VIP",
    vvip: "VVIP",
    president: "President",
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
