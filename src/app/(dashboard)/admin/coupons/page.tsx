import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CouponStatsClient } from "./CouponStatsClient";
import type {
  CouponOverview,
  CouponFunnelRow,
  CouponDailyRow,
  CouponClaimRow,
} from "./types";

// Migration 549의 뷰 3종(admin_coupon_overview / _funnel / _daily)을 서버에서 병렬 조회.
// security_invoker 뷰라 RLS가 그대로 상속된다.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCouponsPage() {
  const supabase = await createClient();

  // Auth + admin 체크 — 항상 서버에서 직접 검증 (헤더 스푸핑 방지).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: ud } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (ud?.role !== "admin") redirect("/");

  const [overviewRes, funnelRes, dailyRes] = await Promise.all([
    supabase.from("admin_coupon_overview").select("*").maybeSingle(),
    supabase.from("admin_coupon_funnel").select("*").limit(200),
    supabase.from("admin_coupon_daily").select("*").limit(60),
  ]);

  const overview = (overviewRes.data as CouponOverview | null) ?? null;
  const funnel = (funnelRes.data as CouponFunnelRow[]) ?? [];
  const daily = (dailyRes.data as CouponDailyRow[]) ?? [];

  // "누가 받았나" — 발행물 행을 펼쳤을 때 보여줄 클레임 목록.
  // users 직접 조인은 RLS 락다운(Migration 533/537)으로 빈 결과가 나오므로
  // public_user_profiles 뷰를 따로 조회해 합친다. (md/coupons/[id] 와 동일 방식)
  const { data: claimRows } = await supabase
    .from("coupon_claims")
    .select("id, issue_id, user_id, claimed_at, redeemed_at, status, redeem_nonce, admin_voided_at")
    .order("claimed_at", { ascending: false })
    .limit(1000);

  const rawClaims = (claimRows ?? []) as Array<{
    id: string;
    issue_id: string;
    user_id: string;
    claimed_at: string;
    redeemed_at: string | null;
    status: string;
    redeem_nonce: string | null;
    admin_voided_at: string | null;
  }>;

  const userIds = [...new Set(rawClaims.map((c) => c.user_id))];
  const profileMap = new Map<string, { display_name: string | null; is_test: boolean }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_user_profiles")
      .select("id, display_name, is_test")
      .in("id", userIds);
    for (const pr of profiles ?? []) {
      profileMap.set(pr.id as string, {
        display_name: (pr.display_name as string | null) ?? null,
        is_test: Boolean(pr.is_test),
      });
    }
  }

  const claims: CouponClaimRow[] = rawClaims.map((c) => ({
    ...c,
    display_name: profileMap.get(c.user_id)?.display_name ?? null,
    is_test: profileMap.get(c.user_id)?.is_test ?? false,
  }));

  // 뷰 미적용(마이그레이션 549 미실행) 시 페이지가 통째로 죽지 않도록 안내로 대체
  const viewMissing = !overview && overviewRes.error;

  return (
    <div className="min-h-screen bg-background text-foreground pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        <header className="flex items-center gap-3">
          <Link
            href="/admin"
            className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border hover:opacity-80 transition-opacity"
            aria-label="관리자 홈으로"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Ticket className="w-6 h-6 text-amber-500" />
              쿠폰 통계
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              발행 → 받음 → 사용 퍼널. 테스트 유저 제외.
            </p>
          </div>
        </header>

        {viewMissing ? (
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-foreground font-bold mb-2">통계 뷰가 아직 적용되지 않았습니다</p>
            <p className="text-sm text-muted-foreground">
              Supabase 대시보드에서{" "}
              <code className="text-amber-500">549_admin_coupon_stats_views.sql</code> 를
              먼저 실행해주세요.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {overviewRes.error?.message}
            </p>
          </div>
        ) : (
          <CouponStatsClient
            overview={overview}
            funnel={funnel}
            daily={daily}
            claims={claims}
          />
        )}
      </div>
    </div>
  );
}
