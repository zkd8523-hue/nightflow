"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { benefitTypeLabel, couponDisplayName, formatCouponTimer, formatCouponRemaining, COUPON_LOW_STOCK_THRESHOLD, splitDiscount, formatMinSpend, parseBottleItems, excludeTestClubCoupons } from "@/lib/utils/coupon";
import { hideTestData } from "@/lib/utils/testData";
import type { CouponIssue } from "@/types/database";

const MAX_CARDS = 8;

/**
 * 홈 쿠폰 스트립 — 게스트 간판(ClubBenefitSection) 바로 아래.
 * daily_hotdeals의 HotdealHomeSection이 폐기된 자리에 새로 노출되는 카드형 가로 스크롤.
 * 활성 쿠폰이 0건이면 섹션 자체를 렌더하지 않는다.
 */
export function CouponHomeStrip() {
  const supabase = useMemo(() => createClient(), []);
  const [coupons, setCoupons] = useState<CouponIssue[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await hideTestData(
        supabase
          .from("coupon_issues")
          .select("*, club:clubs(id, name, area, thumbnail_url)")
          .in("status", ["active", "sold_out"])
          .gt("redeem_ends_at", new Date().toISOString())
          .order("redeem_ends_at", { ascending: true })
          .limit(MAX_CARDS * 3),
        "clubs"
      );
      const filtered = excludeTestClubCoupons((data ?? []) as unknown as CouponIssue[]).slice(0, MAX_CARDS);
      if (!cancelled) setCoupons(filtered);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // 초 단위 갱신 — 카운트다운의 초가 실제로 줄어들어야 마감 압박이 전달된다
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  if (coupons === null || coupons.length === 0) return null;

  return (
    <section className="space-y-2">
      <Link href="/coupons" className="flex items-baseline justify-between px-1">
        <h2 className="text-[18px] font-black text-foreground flex items-center gap-1.5 tracking-tight">
          <span className="text-[18px]">🎟️</span>
          오늘의 쿠폰
        </h2>
        <span className="text-[11px] text-muted-foreground hover:text-foreground font-bold inline-flex items-center gap-0.5">
          더보기
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </Link>

      <div
        data-no-pull-refresh
        className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-4 px-4 snap-x snap-proximity touch-pan-x touch-pan-y"
      >
        {coupons.map((c) => (
          <CouponHomeCard key={c.id} coupon={c} now={now} />
        ))}
      </div>
    </section>
  );
}

function CouponHomeCard({ coupon, now }: { coupon: CouponIssue; now: number }) {
  const { label, emoji } = benefitTypeLabel(coupon.benefit_type);
  const display = couponDisplayName(coupon.benefit_type, coupon.benefit_detail);
  const bottleItems = coupon.benefit_type === "service_bottle" ? parseBottleItems(coupon.benefit_detail) : [];
  const [thumbError, setThumbError] = useState(false);
  const thumb = !thumbError && (coupon.thumbnail_url || coupon.club?.thumbnail_url || null);
  const soldOut = coupon.status === "sold_out";
  const discount = splitDiscount(coupon.discount_type, coupon.discount_amount, coupon.min_spend, coupon.min_spend_unit);
  // 재고와 마감은 서로 다른 압박이라 택일하지 않고 같이 보여준다.
  // (기존엔 마감이 임박하면 재고가 가려져, 정작 급할 때 "몇 장 남았는지"를 알 수 없었다)
  const left =
    coupon.total_count == null ? null : Math.max(0, coupon.total_count - coupon.claimed_count);
  const lowStock = left !== null && left > 0 && left <= COUPON_LOW_STOCK_THRESHOLD;
  // 넉넉히 남았을 땐 빈 문자열 → 렌더 생략 (숫자가 오히려 여유 신호가 된다)
  const stockLabel = formatCouponRemaining(coupon.claimed_count, coupon.total_count);
  // 마감 24시간 이내 = 빨강(오늘 안에 끝), 그 외 = 파랑.
  // 항상 빨간 뱃지는 "급하다"는 신호가 아니라 그냥 배경색이 된다.
  const msLeft = new Date(coupon.redeem_ends_at).getTime() - now;
  const urgent = msLeft > 0 && msLeft <= 24 * 60 * 60 * 1000;

  return (
    <Link
      href={`/coupons/${coupon.id}`}
      className="shrink-0 w-40 snap-start rounded-xl overflow-hidden bg-card border border-border active:opacity-70 transition-opacity"
    >
      <div className="relative w-full h-24 bg-muted">
        {thumb ? (
          <Image
            src={thumb}
            alt={coupon.club?.name ?? label}
            fill
            sizes="160px"
            className="object-cover"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[24px]">{emoji}</div>
        )}
      </div>
      <div className="px-2.5 py-2 space-y-0.5">
        {/* 1줄: 할인 금액 또는 혜택명. 서비스 바틀은 "이름"만 앰버, 숫자·"쿠폰"은 흰색 —
            다른 카드의 "2만원"(앰버)+"쿠폰"(흰색) 위계와 맞춘다. */}
        {discount ? (
          <p className="text-[15px] font-black leading-tight truncate">
            <span className="text-brand-amber">{discount.value}</span>
            <span className="text-foreground ml-1">{discount.unit}</span>
          </p>
        ) : bottleItems.length > 0 ? (
          <p className="text-[15px] font-black leading-tight truncate">
            <span className="text-brand-amber">
              {bottleItems.map((b, i) => (
                <span key={i}>
                  {i > 0 && " + "}
                  {b.name} {b.qty}
                </span>
              ))}
            </span>
            <span className="text-foreground ml-1">쿠폰</span>
          </p>
        ) : coupon.benefit_type === "tequila_shot" ? (
          <p className="text-[15px] font-black leading-tight truncate">
            <span className="text-brand-amber">{display.name.replace(/\s*쿠폰$/, "")}</span>
            <span className="text-foreground ml-1">쿠폰</span>
          </p>
        ) : (
          <p className="text-[15px] font-black text-brand-amber leading-tight truncate">
            {display.name}
          </p>
        )}

        {/* 2줄: 부가 설명. 할인 조건 → 최소구매 조건(서비스 바틀 등) → 지역 순으로 우선순위를 둔다.
            없어도 자리를 비워 높이를 맞춘다 */}
        <p className="text-[11px] font-bold text-muted-foreground truncate leading-tight min-h-[14px]">
          {discount
            ? (discount.condition ?? display.name)
            : coupon.min_spend != null
              ? `${formatMinSpend(coupon.min_spend, coupon.min_spend_unit)} 이상 구매시`
              : (coupon.club?.area ?? "")}
        </p>

        {/* 3줄: 클럽명 — 항상 같은 자리, 같은 색 */}
        <p className="text-[11px] font-bold text-foreground truncate leading-tight">
          {coupon.club?.name ?? ""}
        </p>

        {/* 4줄: 남은 수량 + 마감 타이머 */}
        {soldOut ? (
          <div className="flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground">
            <span className="truncate">소진됨</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* 타임딜 뱃지 — 초까지 흐르는 카운트다운 */}
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-white text-[10px] font-black tabular-nums leading-none ${
                urgent ? "bg-red-500" : "bg-blue-500"
              }`}
            >
              {formatCouponTimer(coupon.redeem_ends_at, now)}
            </span>
            {stockLabel && (
              <p
                className={`truncate text-[10px] font-black ${lowStock ? "text-red-400" : "text-brand-amber"}`}
              >
                {stockLabel}
              </p>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
