import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, TrendingDown, BarChart3, Target, Globe2 } from "lucide-react";
import Link from "next/link";
import { InsightsClient } from "./InsightsClient";

// Migration 414의 4개 뷰(dropoff_hotspots, signup_funnel, acquisition_quality, dropoff_by_lang)를
// 서버에서 병렬 조회 후 클라이언트에 전달. RLS로 admin만 SELECT 가능.

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface DropoffHotspot {
  last_event: string;
  session_count: number;
  unique_users: number;
  pct: number;
  avg_duration_sec: number;
  avg_event_count: number;
}

interface SignupFunnel {
  step1_start: number;
  step2_agree: number;
  step3_completed: number;
  agree_rate: number | null;
  complete_rate: number | null;
  overall_rate: number | null;
}

interface AcquisitionQuality {
  source: string;
  session_count: number;
  unique_users: number;
  avg_duration_sec: number;
  avg_events: number;
  login_count: number;
  flag_count: number;
  login_rate: number | null;
  flag_rate: number | null;
  bounce_rate: number | null;
}

interface DropoffByLang {
  lang: string;
  last_event: string;
  session_count: number;
  total_sessions: number;
  pct: number;
}

// Migration 658 — 외국인 전환 대시보드.
// 비율은 전부 "랜딩 대비"다. 단계 간 비율로 계산하면 안 된다 —
// 폼 도달의 69%가 CTA를 안 거쳐서(실측) form_rate > cta_rate가 정상적으로 나온다.
interface ForeignFunnel {
  lang: string;
  landed: number;
  cta_clicked: number;
  form_viewed: number;
  gate_passed: number;
  submitted: number;
  cta_rate: number | null;
  form_rate: number | null;
  gate_rate: number | null;
  submit_rate: number | null;
}

interface ForeignExitPoint {
  path: string;
  lang: string;
  page_kind: string | null;
  exits: number;
  avg_scroll_depth: number | null;
  avg_time_sec: number | null;
}

export default async function InsightsPage() {
  const supabase = await createClient();

  // Auth + admin 체크 — 항상 서버에서 직접 검증 (헤더 스푸핑 방지).
  // 미들웨어가 이미 /admin/*을 admin role만 통과시키지만, 이중 방어.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: ud } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (ud?.role !== "admin") redirect("/");

  // 6개 뷰 병렬 조회 (Migration 658로 외국인 퍼널 2개 추가)
  const [hotspotsRes, funnelRes, acquisitionRes, langRes, fgFunnelRes, fgExitRes] =
    await Promise.all([
      supabase.from("dropoff_hotspots").select("*").limit(10),
      supabase.from("signup_funnel").select("*").single(),
      supabase.from("acquisition_quality").select("*").limit(15),
      supabase.from("dropoff_by_lang").select("*"),
      supabase.from("foreign_funnel_by_lang").select("*"),
      supabase.from("foreign_exit_points").select("*"),
    ]);

  const hotspots: DropoffHotspot[] = (hotspotsRes.data as DropoffHotspot[]) || [];
  const funnel: SignupFunnel | null = (funnelRes.data as SignupFunnel) || null;
  const acquisition: AcquisitionQuality[] = (acquisitionRes.data as AcquisitionQuality[]) || [];
  const byLang: DropoffByLang[] = (langRes.data as DropoffByLang[]) || [];
  // 마이그레이션 미적용 환경에서도 페이지 전체가 죽지 않게 빈 배열로 폴백
  const foreignFunnel: ForeignFunnel[] = (fgFunnelRes.data as ForeignFunnel[]) || [];
  const foreignExits: ForeignExitPoint[] = (fgExitRes.data as ForeignExitPoint[]) || [];

  return (
    <div className="min-h-screen bg-background text-foreground pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border hover:border-border transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-muted-foreground" />
              </Link>
              <div className="flex items-center gap-2 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">
                <BarChart3 className="w-3.5 h-3.5" />
                Funnel Insights
              </div>
            </div>
            <h1 className="text-4xl font-black tracking-tighter">이탈·전환 인사이트</h1>
            <p className="text-muted-foreground font-medium">최근 7일 기준 · user_events 집계</p>
          </div>
        </header>

        {/* Section Icons Legend */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">이탈 지점</p>
              <p className="text-sm font-bold text-foreground">TOP 10</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <Target className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">회원가입</p>
              <p className="text-sm font-bold text-foreground">4단계 퍼널</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">유입 채널</p>
              <p className="text-sm font-bold text-foreground">UTM 품질</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <Globe2 className="w-5 h-5 text-brand-amber" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">언어별</p>
              <p className="text-sm font-bold text-foreground">외국인 트랙</p>
            </div>
          </div>
        </div>

        <InsightsClient
          hotspots={hotspots}
          funnel={funnel}
          acquisition={acquisition}
          byLang={byLang}
          foreignFunnel={foreignFunnel}
          foreignExits={foreignExits}
        />
      </div>
    </div>
  );
}
