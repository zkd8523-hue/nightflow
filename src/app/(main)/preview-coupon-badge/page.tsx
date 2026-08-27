"use client";

// 로컬 프리뷰 전용 — 쿠폰 홈 카드의 타임딜 뱃지 색(24시간 기준 빨강/파랑) 확인용.
// /preview-coupon-badge. 실제 DB 연동 없음 (목업). CouponHomeStrip.tsx의 카드 마크업을
// 그대로 복제해 남은 시간만 다르게 준다 — 실서비스엔 24시간 이내 쿠폰만 있어 파랑을
// 눈으로 볼 방법이 없었다.

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatCouponTimer, formatCouponRemaining, COUPON_LOW_STOCK_THRESHOLD } from "@/lib/utils/coupon";

const MOCK_CASES: { label: string; hoursLeft: number; left: number | null; club: string }[] = [
  { label: "30분 후 마감", hoursLeft: 0.5, left: 3, club: "그루브&스팟" },
  { label: "13.4시간 후 (지금 실서비스 상태)", hoursLeft: 13.4, left: 9, club: "그루브&스팟" },
  { label: "23시간 59분 후 (경계 직전)", hoursLeft: 23.983, left: 2, club: "클럽 에이스" },
  { label: "24시간 1분 후 (경계 직후)", hoursLeft: 24.017, left: 12, club: "클럽 에이스" },
  { label: "3일 후 마감", hoursLeft: 72, left: null, club: "버뮤다" },
  { label: "7일 후 마감", hoursLeft: 168, left: 30, club: "버뮤다" },
];

export default function PreviewCouponBadgePage() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (now === null) return null;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8">
      <h1 className="text-[18px] font-black mb-1">쿠폰 뱃지 색 프리뷰</h1>
      <p className="text-[13px] text-muted-foreground mb-6 max-w-[420px]">
        24시간 이내 = 빨강, 그 외 = 파랑. 실서비스 쿠폰이 전부 24시간 안쪽이라
        파랑을 볼 수 없어 남은 시간을 고정해 만든 목업입니다.
      </p>
      <div className="flex flex-wrap gap-3">
        {MOCK_CASES.map((c) => (
          <div key={c.label} className="flex flex-col items-start gap-1.5">
            <span className="text-[11px] text-muted-foreground font-bold">{c.label}</span>
            <MockCard hoursLeft={c.hoursLeft} left={c.left} club={c.club} now={now} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCard({
  hoursLeft,
  left,
  club,
  now,
}: {
  hoursLeft: number;
  left: number | null;
  club: string;
  now: number;
}) {
  const endsAtISO = new Date(now + hoursLeft * 3600 * 1000).toISOString();
  const msLeft = new Date(endsAtISO).getTime() - now;
  const urgent = msLeft > 0 && msLeft <= 24 * 60 * 60 * 1000;
  const lowStock = left !== null && left > 0 && left <= COUPON_LOW_STOCK_THRESHOLD;
  const claimed = 0;
  const total = left; // formatCouponRemaining(claimed, total) → left장 남음
  const stockLabel = formatCouponRemaining(claimed, total);

  return (
    <div className="shrink-0 w-40 rounded-xl overflow-hidden bg-card border border-border">
      <div className="relative w-full h-24 bg-muted flex items-center justify-center text-[24px]">
        🎟️
      </div>
      <div className="px-2.5 py-2 space-y-0.5">
        <p className="text-[15px] font-black leading-tight truncate">
          <span className="text-brand-amber">5만원</span>
          <span className="text-foreground ml-1">쿠폰</span>
        </p>
        <p className="text-[11px] font-bold text-muted-foreground truncate leading-tight min-h-[14px]">
          100만원 이상 구매 시
        </p>
        <p className="text-[11px] font-bold text-foreground truncate leading-tight">{club}</p>
        <div className="space-y-0.5">
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-white text-[10px] font-black tabular-nums leading-none ${
              urgent ? "bg-red-500" : "bg-blue-500"
            }`}
          >
            <Clock className="w-2.5 h-2.5 shrink-0" />
            {formatCouponTimer(endsAtISO, now)}
          </span>
          {stockLabel && (
            <p className={`truncate text-[10px] font-black ${lowStock ? "text-red-400" : "text-brand-amber"}`}>
              {stockLabel}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
