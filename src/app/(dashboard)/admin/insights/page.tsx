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

// Migration 660 — 사람(anon_id) 단위 방문자 목록. 폼 이상 도달한 사람만.
interface ForeignVisitor {
  anon_id: string;
  lang: string;
  stage: number;
  stage_label: string;
  visits: number;
  events: number;
  first_seen: string;
  last_seen: string;
  utm_source: string | null;
  landing_path: string | null;
}

// Migration 663 — 게이트 통과 후 폼 내부 세부 단계. foreign_funnel_by_lang의
// gate_passed → submitted 사이가 텅 비어 있어서 "게이트 다음이 너무 약하다"는
// 지적이 나왔다. field는 date→club→menu→name→contact 순서로 온다(뷰에서 정렬).
interface FormFieldProgress {
  field: string;
  sessions: number;
}

// 제출을 시도했다가 handleSubmit의 검증에 걸려 못 낸 이유별 집계.
interface FormSubmitBlock {
  reason: string;
  blocks: number;
  sessions: number;
}

// Migration 667 — AI 어시스턴트 리퍼러(ChatGPT·Bing·Perplexity…). utm이 없어 '(direct)'에 묻히던 채널.
// ⚠️ 뷰 미적용 상태면 조회가 에러를 내는데, 페이지 전체가 죽지 않게 빈 배열로 흘린다.
interface AiReferralSource {
  month: string;
  source: string;
  session_count: number;
  unique_users: number;
  avg_duration_sec: number | null;
  p50_duration_sec: number | null;
  avg_events: number | null;
  booking_count: number;
  book_click_count: number;
  bounce_rate: number | null;
}
interface AiReferralLanding {
  month: string;
  source: string;
  landing_path: string;
  club_name: string | null;
  session_count: number;
}

// 기간 필터(Migration 668). 개선 전후를 나눠 보려면 시작일을 넘길 수 있어야 한다 —
// 오늘 고친 것들(광고 랜딩·날짜 UI·클럽 그리드)의 효과가 두 달치 과거에 묻혀서.
// ?since=YYYY-MM-DD 없으면 기존 동작(뷰의 기본 기간) 그대로.
const RANGES = [
  { key: "all", label: "전체 기간" },
  { key: "today", label: "오늘부터" },
  { key: "7d", label: "최근 7일" },
  { key: "30d", label: "최근 30일" },
] as const;

/** 표시용 KST 날짜(YYYY-MM-DD). UTC ISO를 그대로 자르면 KST 자정이 전날로 보인다. */
function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

function resolveSince(raw: string | undefined): { key: string; iso: string | null } {
  const key = RANGES.some((r) => r.key === raw) ? raw! : "all";
  if (key === "all") return { key, iso: null };
  const now = new Date();
  if (key === "today") {
    // KST 자정 기준 — 운영자가 보는 "오늘"과 맞춘다(서버는 UTC).
    const kst = new Date(now.getTime() + 9 * 3600_000);
    const midnightKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000;
    return { key, iso: new Date(midnightKst).toISOString() };
  }
  const days = key === "7d" ? 7 : 30;
  return { key, iso: new Date(now.getTime() - days * 86400_000).toISOString() };
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string }>;
}) {
  const { since: sinceRaw } = await searchParams;
  const { key: rangeKey, iso: sinceIso } = resolveSince(sinceRaw);
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

  // 9개 뷰 병렬 조회 (658: 외국인 퍼널 2개, 660: 방문자 목록, 663: 폼 세부 2개)
  const [
    hotspotsRes, funnelRes, acquisitionRes, langRes,
    fgFunnelRes, fgExitRes, fgVisitorRes, fieldProgressRes, submitBlocksRes,
    aiSourcesRes, aiLandingsRes,
  ] = await Promise.all([
    supabase.from("dropoff_hotspots").select("*").limit(10),
    supabase.from("signup_funnel").select("*").single(),
    supabase.from("acquisition_quality").select("*").limit(15),
    sinceIso
      ? supabase.rpc("dropoff_by_lang_since", { p_since: sinceIso })
      : supabase.from("dropoff_by_lang").select("*"),
    sinceIso
      ? supabase.rpc("foreign_funnel_by_lang_since", { p_since: sinceIso })
      : supabase.from("foreign_funnel_by_lang").select("*"),
    sinceIso
      ? supabase.rpc("foreign_exit_points_since", { p_since: sinceIso })
      : supabase.from("foreign_exit_points").select("*"),
    supabase.from("foreign_visitor_list").select("*"),
    sinceIso
      ? supabase.rpc("foreign_form_field_progress_since", { p_since: sinceIso })
      : supabase.from("foreign_form_field_progress").select("*"),
    sinceIso
      ? supabase.rpc("foreign_form_submit_blocks_since", { p_since: sinceIso })
      : supabase.from("foreign_form_submit_blocks").select("*"),
    supabase.from("ai_referral_sources").select("*"),
    supabase.from("ai_referral_landings").select("*"),
  ]);

  const hotspots: DropoffHotspot[] = (hotspotsRes.data as DropoffHotspot[]) || [];
  const funnel: SignupFunnel | null = (funnelRes.data as SignupFunnel) || null;
  const acquisition: AcquisitionQuality[] = (acquisitionRes.data as AcquisitionQuality[]) || [];
  const byLang: DropoffByLang[] = (langRes.data as DropoffByLang[]) || [];
  // 마이그레이션 미적용 환경에서도 페이지 전체가 죽지 않게 빈 배열로 폴백
  const foreignFunnel: ForeignFunnel[] = (fgFunnelRes.data as ForeignFunnel[]) || [];
  const foreignExits: ForeignExitPoint[] = (fgExitRes.data as ForeignExitPoint[]) || [];
  const foreignVisitors: ForeignVisitor[] = (fgVisitorRes.data as ForeignVisitor[]) || [];
  const formFieldProgress: FormFieldProgress[] = (fieldProgressRes.data as FormFieldProgress[]) || [];
  const aiSources: AiReferralSource[] = (aiSourcesRes.data as AiReferralSource[]) || [];
  const aiLandings: AiReferralLanding[] = (aiLandingsRes.data as AiReferralLanding[]) || [];
  const formSubmitBlocks: FormSubmitBlock[] = (submitBlocksRes.data as FormSubmitBlock[]) || [];

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

        {/* 기간 선택 — 개선 전후를 나눠 본다. 과거 데이터는 지우지 않고 기준선으로 남긴다. */}
        <div className="flex items-center gap-2 flex-wrap">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={r.key === "all" ? "/admin/insights" : `/admin/insights?since=${r.key}`}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                rangeKey === r.key
                  ? "bg-inverse text-inverse-foreground border-transparent"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {r.label}
            </Link>
          ))}
          {sinceIso && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {kstDate(sinceIso)} 이후 (KST) · 외국인 예약 전환·이탈 지점·언어별 이탈에 적용
            </span>
          )}
        </div>

        <InsightsClient
          rangeLabel={RANGES.find((r) => r.key === rangeKey)?.label ?? "최근 60일"}
          hotspots={hotspots}
          funnel={funnel}
          acquisition={acquisition}
          byLang={byLang}
          foreignFunnel={foreignFunnel}
          foreignExits={foreignExits}
          foreignVisitors={foreignVisitors}
          formFieldProgress={formFieldProgress}
          formSubmitBlocks={formSubmitBlocks}
          aiSources={aiSources}
          aiLandings={aiLandings}
        />
      </div>
    </div>
  );
}
