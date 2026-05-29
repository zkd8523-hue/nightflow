import type { DealTier } from "@/types/database";
import { DEAL_TIER_LABEL } from "@/lib/utils/dealTier";

interface Props {
    tier: DealTier | null | undefined;
    size?: "sm" | "md" | "lg";
    showLabel?: boolean;
    /** 가입 2주 이내 신규 회원 여부. tier가 없으면 "신규" 라벨로 노출. */
    isNew?: boolean;
    className?: string;
}

const TIER_PILL: Record<DealTier, string> = {
    vip: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    vvip: "bg-cyan-500/15 text-cyan-300 border border-cyan-400/40",
    president: "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-black border border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.4)]",
};

const SIZE_CONFIG = {
    sm: { pill: "text-[10px] px-1.5 py-0.5", newPill: "text-[9px] px-1.5 py-0.5" },
    md: { pill: "text-xs px-2 py-0.5", newPill: "text-[10px] px-2 py-0.5" },
    lg: { pill: "text-sm px-2.5 py-1", newPill: "text-[11px] px-2.5 py-1" },
};

/**
 * 거래 등급 배지 — 텍스트 필(pill) 기반.
 * - tier='vip'|'vvip'|'president' → 라벨 + 등급별 색상 (VIP 앰버 / VVIP 시안 / President 골드 그라데이션)
 * - tier=null + isNew=true → "신규가입" 라벨
 * - tier=null + isNew=false → 렌더하지 않음
 *
 * showLabel prop은 더 이상 시각적으로 구분하지 않음 (메달 이모지 제거됨).
 * 호환성 위해 prop은 유지하되 무시함.
 */
export function TrustBadge({ tier, size = "sm", isNew = false, className = "" }: Props) {
    const sz = SIZE_CONFIG[size];

    if (!tier) {
        if (!isNew) return null;
        return (
            <span
                className={`inline-flex items-center rounded-full font-black bg-cyan-500/15 text-cyan-400 leading-none ${sz.newPill} ${className}`}
                title="가입 2주 이내 신규 회원"
            >
                신규가입
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center rounded-full font-black leading-none ${TIER_PILL[tier]} ${sz.pill} ${className}`}
            title={DEAL_TIER_LABEL[tier]}
        >
            {DEAL_TIER_LABEL[tier]}
        </span>
    );
}
