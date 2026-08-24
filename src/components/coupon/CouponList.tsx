"use client";

import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import { CouponCard } from "@/components/coupon/CouponCard";
import { COUPON_BENEFIT_PRESETS, isCouponUsableToday } from "@/lib/utils/coupon";
import { getClubEventDate, getClubEventDateFrom } from "@/lib/utils/date";
import type { CouponIssue, CouponBenefitType } from "@/types/database";

const AREA_FILTERS = ["전체", "강남", "홍대", "이태원"];

interface Props {
  coupons: CouponIssue[];
}

/** 남은 날짜 배지 — "내일", "토", "8/30" 등 예정 섹션 카드용 */
function futureDateLabel(redeemEndsAtISO: string, todayEventDate: string): string {
  const eventDate = getClubEventDateFrom(redeemEndsAtISO);
  const diffDays = Math.round(
    (new Date(eventDate).getTime() - new Date(todayEventDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 0) return "오늘";
  if (diffDays === 1) return "내일";
  const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(eventDate + "T00:00:00Z").getUTCDay()];
  return `${new Date(eventDate).getMonth() + 1}/${new Date(eventDate).getDate()}(${dow})`;
}

export function CouponList({ coupons }: Props) {
  const router = useRouter();
  const [areaFilter, setAreaFilter] = useState<string>("전체");
  const [benefitFilter, setBenefitFilter] = useState<CouponBenefitType | "전체">("전체");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    let list = coupons.slice();
    if (areaFilter !== "전체") list = list.filter((c) => c.club?.area === areaFilter);
    if (benefitFilter !== "전체") list = list.filter((c) => c.benefit_type === benefitFilter);
    list.sort((a, b) => new Date(a.redeem_ends_at).getTime() - new Date(b.redeem_ends_at).getTime());
    return list;
  }, [coupons, areaFilter, benefitFilter]);

  const todayEventDate = useMemo(() => getClubEventDate(), []);
  const todayList = filtered.filter((c) => isCouponUsableToday(c.redeem_ends_at, todayEventDate));
  const upcomingList = filtered.filter((c) => !isCouponUsableToday(c.redeem_ends_at, todayEventDate));

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-card -ml-2"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-1.5">
          <Ticket className="w-5 h-5 text-brand-amber" />
          <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">쿠폰</h1>
        </div>
      </header>

      {/* 지역 필터 */}
      <div data-no-pull-refresh className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 touch-pan-x touch-pan-y">
        {AREA_FILTERS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAreaFilter(a)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
              areaFilter === a
                ? "bg-inverse text-inverse-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* 혜택 종류 필터 */}
      <div data-no-pull-refresh className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 touch-pan-x touch-pan-y">
        <button
          type="button"
          onClick={() => setBenefitFilter("전체")}
          className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
            benefitFilter === "전체"
              ? "bg-amber-500 text-black"
              : "bg-muted text-muted-foreground hover:bg-muted"
          }`}
        >
          전체
        </button>
        {COUPON_BENEFIT_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setBenefitFilter(p.value)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
              benefitFilter === p.value
                ? "bg-amber-500 text-black"
                : "bg-muted text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-[14px] text-muted-foreground">받을 수 있는 쿠폰이 없어요</p>
          <p className="text-[11px] text-muted-foreground">조건을 바꿔보거나 잠시 후 다시 확인해주세요</p>
        </div>
      ) : (
        <>
          {todayList.length > 0 && (
            <section>
              <p className="text-[13px] font-black text-foreground mb-1 px-1">🎟 오늘 밤 쓸 수 있어요</p>
              <div className="divide-y divide-neutral-800/60">
                {todayList.map((c) => (
                  <CouponCard key={c.id} coupon={c} now={now} />
                ))}
              </div>
            </section>
          )}
          {upcomingList.length > 0 && (
            <section>
              <p className="text-[13px] font-black text-foreground mb-1 px-1 mt-4">📅 이번 주 예정</p>
              <div className="divide-y divide-neutral-800/60">
                {upcomingList.map((c) => (
                  <CouponCard
                    key={c.id}
                    coupon={c}
                    now={now}
                    dateLabel={futureDateLabel(c.redeem_ends_at, todayEventDate)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
