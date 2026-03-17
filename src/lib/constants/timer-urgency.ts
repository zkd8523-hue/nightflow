import type { UrgencyLevel } from "@/hooks/useCountdown";

/** 긴박감 레벨별 시각적 스타일 (카드형: AuctionTimer, AuctionCard) */
export const URGENCY_STYLES: Record<UrgencyLevel, {
  bg: string;
  border: string;
  text: string;
  glow: string;
}> = {
  normal: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    glow: '',
  },
  warning: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    glow: '',
  },
  critical: {
    bg: 'bg-red-500/20',
    border: 'border-red-500/40',
    text: 'text-red-300',
    glow: 'shadow-[0_0_15px_rgba(239,68,68,0.3)]',
  },
};

/** 컴팩트 배지형 스타일 (InlineTimer용) - normal만 투명 */
export const URGENCY_STYLES_COMPACT: Record<UrgencyLevel, {
  bg: string;
  border: string;
  text: string;
  glow: string;
}> = {
  ...URGENCY_STYLES,
  normal: {
    bg: 'bg-transparent',
    border: 'border-transparent',
    text: 'text-neutral-400',
    glow: '',
  },
};

/** 레벨별 라벨 텍스트 */
export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  normal: 'LIVE',
  warning: 'LIVE',
  critical: '곧 종료!',
};

/** InlineTimer 레벨별 폰트 크기 */
export const URGENCY_FONT_SIZES: Record<UrgencyLevel, string> = {
  normal: 'text-[13px]',
  warning: 'text-[16px]',
  critical: 'text-[20px]',
};
