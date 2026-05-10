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

const TIER_EMOJI: Record<DealTier, string> = {
    silver: "🥈",
    gold: "🥇",
    diamond: "💎",
};

const SIZE_CONFIG = {
    sm: { emoji: "text-[14px]", text: "text-[10px]", padding: "px-1.5 py-0", gap: "gap-0.5", newPill: "text-[9px] px-1.5 py-0.5" },
    md: { emoji: "text-[16px]", text: "text-xs", padding: "px-2 py-0.5", gap: "gap-1", newPill: "text-[10px] px-2 py-0.5" },
    lg: { emoji: "text-[18px]", text: "text-sm", padding: "px-2.5 py-1", gap: "gap-1.5", newPill: "text-[11px] px-2.5 py-1" },
};

/**
 * 거래 등급 배지 — 이모지 기반.
 * - tier='silver'|'gold'|'diamond' → 해당 이모지 (등급 우선)
 * - tier=null + isNew=true → "신규" 라벨 (가입 2주 이내)
 * - tier=null + isNew=false → 아무것도 렌더하지 않음
 */
export function TrustBadge({ tier, size = "sm", showLabel = false, isNew = false, className = "" }: Props) {
    const sz = SIZE_CONFIG[size];

    // 등급 없을 때: 신규 회원이면 "신규가입" 라벨, 아니면 아무것도 안 보임
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

    const emoji = TIER_EMOJI[tier];

    if (!showLabel) {
        return (
            <span
                className={`inline-flex items-center justify-center leading-none ${sz.emoji} ${className}`}
                title={DEAL_TIER_LABEL[tier]}
            >
                {emoji}
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center rounded-full font-black bg-neutral-800/60 ${sz.padding} ${sz.text} ${sz.gap} ${className}`}
        >
            <span className={sz.emoji}>{emoji}</span>
            <span className="text-white">{DEAL_TIER_LABEL[tier]}</span>
        </span>
    );
}
