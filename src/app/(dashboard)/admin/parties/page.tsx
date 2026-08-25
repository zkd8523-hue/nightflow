import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, PartyPopper } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PartyStatsClient } from "./PartyStatsClient";
import type { PartyOverview, PartyWeeklyRow, PartyByClubRow, PartyOfferRow } from "./types";

// Migration 550의 뷰 4종을 서버에서 병렬 조회. security_invoker 뷰라 RLS 상속.
// 개별 건 관리(취소/삭제/신고)는 /admin/puzzles 담당 — 여기는 읽기 전용 집계.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPartiesPage() {
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

  const [overviewRes, weeklyRes, byClubRes, offerRes] = await Promise.all([
    supabase.from("admin_party_overview").select("*").maybeSingle(),
    supabase.from("admin_party_weekly").select("*").limit(20),
    supabase.from("admin_party_by_club").select("*").limit(100),
    supabase.from("admin_party_offer_funnel").select("*").limit(20),
  ]);

  const overview = (overviewRes.data as PartyOverview | null) ?? null;
  const weekly = (weeklyRes.data as PartyWeeklyRow[]) ?? [];
  const byClub = (byClubRes.data as PartyByClubRow[]) ?? [];
  const offers = (offerRes.data as PartyOfferRow[]) ?? [];

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
          <div className="flex-1">
            <h1 className="text-2xl font-black flex items-center gap-2">
              <PartyPopper className="w-6 h-6 text-amber-500" />
              파티 통계
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              발행 → 참여 → 성사 퍼널. 개별 건 관리는{" "}
              <Link href="/admin/puzzles" className="text-amber-500 hover:underline">
                깃발·파티 관리
              </Link>
              에서.
            </p>
          </div>
        </header>

        {viewMissing ? (
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-foreground font-bold mb-2">통계 뷰가 아직 적용되지 않았습니다</p>
            <p className="text-sm text-muted-foreground">
              Supabase 대시보드에서{" "}
              <code className="text-amber-500">550_admin_party_stats_views.sql</code> 를
              먼저 실행해주세요.
            </p>
            <p className="text-xs text-muted-foreground mt-2">{overviewRes.error?.message}</p>
          </div>
        ) : (
          <PartyStatsClient
            overview={overview}
            weekly={weekly}
            byClub={byClub}
            offers={offers}
          />
        )}
      </div>
    </div>
  );
}
