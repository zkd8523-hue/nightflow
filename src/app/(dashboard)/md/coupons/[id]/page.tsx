import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Clock, Users, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { benefitTypeLabel, couponDisplayName, formatDiscount, formatCouponCountdown } from "@/lib/utils/coupon";
import type { CouponIssue } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "쿠폰 현황 — NightFlow",
};

interface ClaimRow {
  id: string;
  user_id: string;
  claimed_at: string;
  redeemed_at: string | null;
  status: string;
  redeem_nonce: string | null;
}

export default async function MDCouponDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!userRow || (userRow.role !== "md" && userRow.role !== "admin")) redirect("/");

  const { data: couponRow } = await supabase
    .from("coupon_issues")
    .select("*, club:clubs(id, name, area, thumbnail_url)")
    .eq("id", id)
    .single();
  if (!couponRow) notFound();

  const coupon = couponRow as unknown as CouponIssue;
  // RLS가 본인 발행분만 읽게 해주지만, admin이 아닌 타 MD의 직접 접근을 명시적으로 막는다.
  if (coupon.md_id !== user.id && userRow.role !== "admin") notFound();

  const { label, emoji } = benefitTypeLabel(coupon.benefit_type);
  const display = couponDisplayName(coupon.benefit_type, coupon.benefit_detail);
  const discountLabel = formatDiscount(coupon.discount_type, coupon.discount_amount, coupon.min_spend, coupon.min_spend_unit);

  // 받아간 사람 목록. users 직접 조인은 533/537 RLS 락다운 때문에 빈 결과가 나오므로
  // public_user_profiles 뷰를 별도 조회해 합친다.
  const { data: claimRows } = await supabase
    .from("coupon_claims")
    .select("id, user_id, claimed_at, redeemed_at, status, redeem_nonce")
    .eq("issue_id", id)
    .order("claimed_at", { ascending: false });

  const claims = (claimRows ?? []) as ClaimRow[];
  const userIds = [...new Set(claims.map((c) => c.user_id))];

  const profileMap = new Map<string, { display_name: string | null; is_test: boolean }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_user_profiles")
      .select("id, display_name, is_test")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        display_name: p.display_name as string | null,
        is_test: Boolean(p.is_test),
      });
    }
  }

  // 통계는 테스트 계정을 제외한다 (get_md_coupon_stats와 동일한 기준)
  const realClaims = claims.filter((c) => !profileMap.get(c.user_id)?.is_test);
  const claimedCount = realClaims.filter((c) => c.status !== "revoked").length;
  const redeemedCount = realClaims.filter((c) => c.status === "redeemed").length;
  const rate = claimedCount > 0 ? Math.round((redeemedCount / claimedCount) * 100) : 0;

  const isLive = coupon.status === "active" || coupon.status === "sold_out";

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-4 py-5">
        <Link
          href="/md/coupons"
          className="inline-flex items-center gap-1 text-muted-foreground text-sm font-bold hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          쿠폰 목록
        </Link>

        {/* 쿠폰 요약 */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <p className="text-[18px] font-black text-foreground">
            <span className="mr-1">{display.emoji}</span>{display.name}
          </p>
          {discountLabel && (
            <p className="text-[14px] font-black text-brand-amber mt-0.5">{discountLabel}</p>
          )}
          <p className="text-[13px] text-muted-foreground mt-1">
            {coupon.club?.name}{coupon.club?.area ? ` · ${coupon.club.area}` : ""}
          </p>
          {coupon.conditions && (
            <p className="text-[12px] text-muted-foreground mt-2">사용 조건: {coupon.conditions}</p>
          )}
          <p className="text-[12px] font-bold text-muted-foreground inline-flex items-center gap-1 mt-2">
            <Clock className="w-3.5 h-3.5" />
            {isLive
              ? formatCouponCountdown(coupon.redeem_ends_at)
              : coupon.status === "cancelled" ? "취소됨" : "종료됨"}
          </p>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <StatBox icon={<Users className="w-4 h-4" />} label="받음" value={`${claimedCount}${coupon.total_count ? `/${coupon.total_count}` : ""}`} />
          <StatBox icon={<CheckCircle2 className="w-4 h-4" />} label="사용" value={String(redeemedCount)} />
          <StatBox label="사용률" value={`${rate}%`} highlight />
        </div>

        {/* 받아간 사람 */}
        <p className="text-[12px] font-bold text-muted-foreground px-1 mb-2">
          받아간 사람 {claims.length > 0 && `(${claims.length})`}
        </p>
        {claims.length === 0 ? (
          <p className="text-center text-[12px] text-muted-foreground py-8">
            아직 받아간 사람이 없어요
          </p>
        ) : (
          <div className="space-y-1.5">
            {claims.map((c) => {
              const profile = profileMap.get(c.user_id);
              const used = c.status === "redeemed";
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between bg-card border border-border rounded-xl px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-foreground truncate">
                      {profile?.display_name ?? "알 수 없음"}
                      {profile?.is_test && (
                        <span className="ml-1 text-[10px] text-muted-foreground font-medium">(테스트)</span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(c.claimed_at).toLocaleString("ko-KR", {
                        month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })} 받음
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {used ? (
                      <>
                        <span className="text-[11px] font-black text-green-400">사용 완료</span>
                        {/* 분쟁 시 유저 화면의 6자리 코드와 대조하는 용도 */}
                        {c.redeem_nonce && (
                          <p className="text-[10px] text-muted-foreground font-mono">{c.redeem_nonce}</p>
                        )}
                      </>
                    ) : c.status === "revoked" ? (
                      <span className="text-[11px] font-bold text-muted-foreground">무효</span>
                    ) : c.status === "expired" ? (
                      <span className="text-[11px] font-bold text-muted-foreground">만료</span>
                    ) : (
                      <span className="text-[11px] font-bold text-muted-foreground">미사용</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  highlight,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground text-[11px] font-bold">
        {icon}
        {label}
      </div>
      <p className={`text-[18px] font-black mt-0.5 ${highlight ? "text-brand-amber" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
