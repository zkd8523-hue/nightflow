import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, ChevronRight, AlertCircle } from "lucide-react";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/server";
import { CouponClaimButton } from "@/components/coupon/CouponClaimButton";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { splitDiscount, benefitTypeLabel, couponDisplayName, formatCouponRemaining, formatCouponCountdown, formatMinSpend, parseBottleItems } from "@/lib/utils/coupon";
import type { CouponIssue } from "@/types/database";

export const revalidate = 30;

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

async function loadCoupon(id: string) {
  const supabase = createAnonClient();
  const { data } = await supabase
    .from("coupon_issues")
    .select(`*, club:clubs(id, name, area, thumbnail_url)`)
    .eq("id", id)
    .maybeSingle();
  return data as unknown as CouponIssue | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const coupon = await loadCoupon(id);
  if (!coupon) return { title: "쿠폰을 찾을 수 없어요" };
  const { label } = benefitTypeLabel(coupon.benefit_type);
  const title = `${coupon.club?.name ?? ""} ${label} 쿠폰`;
  return {
    title,
    description: `${coupon.club?.area ?? ""} ${coupon.club?.name ?? ""}의 ${label} 쿠폰. 나플에서 선착순으로 받아 현장에서 사용하세요.`,
    alternates: { canonical: `https://nightflow.kr/coupons/${id}` },
  };
}

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coupon = await loadCoupon(id);
  if (!coupon) notFound();

  // 로그인 유저가 이미 받은 쿠폰인지 확인 (버튼 상태 결정용)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let existingClaimId: string | null = null;
  if (user) {
    const { data: claim } = await supabase
      .from("coupon_claims")
      .select("id")
      .eq("issue_id", id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    existingClaimId = claim?.id ?? null;
  }

  const { label, emoji } = benefitTypeLabel(coupon.benefit_type);
  const display = couponDisplayName(coupon.benefit_type, coupon.benefit_detail);
  const discount = splitDiscount(coupon.discount_type, coupon.discount_amount, coupon.min_spend, coupon.min_spend_unit);
  const bottleItems = coupon.benefit_type === "service_bottle" ? parseBottleItems(coupon.benefit_detail) : [];
  // benefit_detail이 이미 제목(display.name)에 녹아든 타입(etc/service_bottle)은
  // 아래 별도 문단에서 같은 텍스트를 또 보여주면 중복이라 생략한다.
  const showBenefitDetailParagraph =
    coupon.benefit_detail && coupon.benefit_type !== "etc" && coupon.benefit_type !== "service_bottle";
  // discount가 없어도(서비스 바틀 등) min_spend가 있으면 "N병/N만원 이상 구매시" 조건은 보여줘야 한다.
  const minSpendCondition =
    !discount && coupon.min_spend != null
      ? `${formatMinSpend(coupon.min_spend, coupon.min_spend_unit)} 이상 구매시`
      : null;
  const isEnded = coupon.status === "expired" || coupon.status === "cancelled" || new Date(coupon.redeem_ends_at) <= new Date();
  const isSoldOut = coupon.status === "sold_out";
  const thumb = coupon.thumbnail_url || coupon.club?.thumbnail_url || null;

  return (
    <div className="container mx-auto max-w-lg px-4 pt-4 pb-28">
      <Link
        href="/coupons"
        className="inline-flex items-center gap-1 text-muted-foreground text-sm font-bold hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="w-4 h-4" />
        쿠폰 목록
      </Link>

      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-muted mb-4">
        {thumb ? (
          <Image src={thumb} alt={coupon.club?.name ?? label} fill sizes="480px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[48px] font-black text-foreground/30">
            {emoji}
          </div>
        )}
        {coupon.club?.id && (
          <div className="absolute top-3 right-3">
            <FavoriteButton clubId={coupon.club.id} variant="overlay" />
          </div>
        )}
      </div>

      <div className="space-y-1 mb-4">
        <h1 className="text-2xl font-black text-foreground tracking-tight">
          <span className="mr-1">{display.emoji}</span>
          {bottleItems.length > 0 ? (
            <>
              <span className="text-brand-amber">
                {bottleItems.map((b, i) => (
                  <span key={i}>
                    {i > 0 && " + "}
                    {b.name} {b.qty}
                  </span>
                ))}
              </span>
              <span className="ml-1">쿠폰</span>
            </>
          ) : coupon.benefit_type === "tequila_shot" ? (
            <>
              <span className="text-brand-amber">{display.name.replace(/\s*쿠폰$/, "")}</span>
              <span className="ml-1">쿠폰</span>
            </>
          ) : (
            display.name
          )}
        </h1>
        {discount && (
          <p className="text-[17px] font-black leading-tight">
            <span className="text-brand-amber">{discount.value}</span>
            <span className="text-foreground ml-1">{discount.unit}</span>
            {discount.condition && (
              <span className="block text-[13px] font-bold text-muted-foreground mt-0.5">
                {discount.condition}
              </span>
            )}
          </p>
        )}
        {minSpendCondition && (
          <p className="text-[13px] font-bold text-muted-foreground">{minSpendCondition}</p>
        )}
        {coupon.club?.id ? (
          <Link
            href={`/clubs/${coupon.club.id}`}
            className="inline-flex items-center gap-0.5 text-foreground/80 text-[14px] font-bold hover:text-foreground active:opacity-70 transition-colors"
          >
            {coupon.club.name}
            {coupon.club.area && <span className="text-muted-foreground font-medium"> · {coupon.club.area}</span>}
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </Link>
        ) : null}
      </div>

      {coupon.benefit_tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {coupon.benefit_tags.map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-full bg-brand-amber/10 border border-brand-amber/25 text-[11px] font-bold text-brand-amber"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {showBenefitDetailParagraph && (
        <p className="text-[13px] text-foreground/90 mb-3 leading-relaxed">{coupon.benefit_detail}</p>
      )}
      {coupon.conditions && (
        <div className="flex gap-2 mb-4 rounded-xl border border-brand-amber/30 bg-brand-amber/[0.07] px-3.5 py-3">
          <AlertCircle className="w-4 h-4 text-brand-amber shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-black text-brand-amber mb-0.5">사용 조건</p>
            <p className="text-[13px] font-bold text-foreground leading-snug">{coupon.conditions}</p>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 mb-6 space-y-2">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">남은 수량</span>
          <span className="font-bold text-foreground">{formatCouponRemaining(coupon.claimed_count, coupon.total_count)}</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            사용 마감
          </span>
          <span className="font-bold text-foreground">
            {formatCouponCountdown(coupon.redeem_ends_at)}
          </span>
        </div>
      </div>

      <CouponClaimButton
        issueId={coupon.id}
        disabled={isEnded || isSoldOut}
        disabledLabel={isEnded ? "종료된 쿠폰이에요" : "모두 소진됐어요"}
        existingClaimId={existingClaimId}
      />
    </div>
  );
}
