"use client";

import { COUPON_BENEFIT_PRESETS } from "@/lib/utils/coupon";
import type { CouponBenefitType } from "@/types/database";

/**
 * 쿠폰 혜택 종류 선택 — 6종 중 정확히 1개 (필터·통계·이름 생성용).
 *
 * 추가 태그(benefit_tags)는 제거했다. '기타'를 고르면 설명란이 곧 쿠폰 이름이
 * 되는데 태그까지 있으면 이름 역할이 둘로 갈리고, 태그는 화면에서 부속 칩으로만
 * 떠서 실질적 의미가 없었다. "여성 한정" 같은 조건은 '사용 조건' 칸을 쓴다.
 */
interface Props {
  benefitType: CouponBenefitType | "";
  onBenefitTypeChange: (type: CouponBenefitType) => void;
  disabled?: boolean;
}

export function CouponBenefitPicker({
  benefitType,
  onBenefitTypeChange,
  disabled = false,
}: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {COUPON_BENEFIT_PRESETS.map((p) => {
        const active = benefitType === p.value;
        return (
          <button
            key={p.value}
            type="button"
            disabled={disabled}
            onClick={() => onBenefitTypeChange(p.value)}
            className={`h-8 px-3 rounded-full text-[12px] font-bold transition-colors disabled:opacity-50 ${
              active
                ? "bg-green-500 text-black"
                : "bg-card text-muted-foreground border border-border hover:border-border"
            }`}
          >
            {p.emoji} {p.label}
          </button>
        );
      })}
    </div>
  );
}
