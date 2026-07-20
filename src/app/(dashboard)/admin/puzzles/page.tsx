import { Fragment } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ProgressiveList } from "@/components/admin/ProgressiveList";
import { AdminPuzzleRefundButton } from "@/components/admin/AdminPuzzleRefundButton";
import { AdminPuzzleOffersDropdown } from "@/components/admin/AdminPuzzleOffersDropdown";
import { AdminCancelPuzzleButton } from "@/components/admin/AdminCancelPuzzleButton";
import { AdminDeletePuzzleButton } from "@/components/admin/AdminDeletePuzzleButton";
import { AdminDeleteOfferButton } from "@/components/admin/AdminDeleteOfferButton";
import { AdminDeletePuzzleReportButton } from "@/components/admin/AdminDeletePuzzleReportButton";
import { PuzzleCancellationSurveyView } from "@/components/admin/PuzzleCancellationSurveyView";
import { SurveyDateRangeFilter } from "@/components/admin/SurveyDateRangeFilter";
import { AlertTriangle, ChevronLeft, Flag, User } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    tab?: string; area?: string; status?: string; sort?: string; kind?: string;
    from?: string; to?: string; trigger?: string; category?: string; page?: string;
    chat?: string;
  }>;
}

type SortKey = "event" | "created" | "cancelled";

// 상대 시간 ("5일 전", "3시간 전")
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

const STATUS_FILTER_LABEL: Record<string, string> = {
  open: "제안 받는중",
  selecting: "선택 중",
  expired: "만료",
  accepted: "성사",
  matched: "마감",
  cancelled: "취소",
};
const STATUS_FILTER_ORDER = ["open", "selecting", "expired", "accepted", "matched", "cancelled"];

const STATUS_LABEL: Record<string, string> = {
  open: "제안 받는중",
  selecting: "선택 중",
  matched: "마감",
  accepted: "성사됨",
  cancelled: "취소됨",
  expired: "만료됨",
};

const STATUS_COLOR: Record<string, string> = {
  open: "bg-green-500/20 text-green-400",
  selecting: "bg-purple-500/20 text-purple-400",
  matched: "bg-amber-500/20 text-amber-400",
  accepted: "bg-amber-500/20 text-amber-400",
  cancelled: "bg-neutral-700 text-neutral-400",
  expired: "bg-red-500/20 text-red-400",
};

export default async function AdminPuzzlesPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    tab = "list", area: areaFilter, status: statusFilter, sort: sortParam, kind: kindFilter,
    from: fromParam, to: toParam, trigger: triggerParam, category: categoryParam, page: pageParam,
    chat: chatParam,
  } = await searchParams;
  // 제안받는중(open) 하위 대화 필터: 'waiting'(파트너 답장 대기) | 'active'(대화중)
  const chatFilter = chatParam === "waiting" ? "waiting" : chatParam === "active" ? "active" : null;
  const sortKey: SortKey = sortParam === "created" ? "created" : sortParam === "cancelled" ? "cancelled" : "event";
  const kindLabel = kindFilter === "share" ? "조각" : kindFilter === "flag" ? "깃발" : "게시물";

  // 미들웨어가 auth + role 체크를 완료하고 헤더로 전달
  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${m}/${day}(${days[d.getDay()]})`;
  };

  // 전체 깃발 탭 데이터 (sort 분기: 영업일순 vs 등록순) — list 탭일 때만 로드
  const isListTab = tab === "list";
  const baseQuery = supabase
    .from("puzzles")
    .select("id, area, event_date, status, target_count, current_count, notes, created_at, cancelled_at, leader_id, is_recruiting_party");
  const { data: allPuzzles } = !isListTab
    ? { data: null }
    : sortKey === "created"
    ? await baseQuery.order("created_at", { ascending: false })
    : sortKey === "cancelled"
    ? await baseQuery.order("cancelled_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
    : await baseQuery.order("event_date", { ascending: false }).order("created_at", { ascending: false });

  // 게시자(leader) 정보 별도 조회 후 매핑 (admin RLS — Migration 109)
  const leaderIds = [...new Set((allPuzzles || []).map((p) => p.leader_id).filter(Boolean))];
  const leaderMap = new Map<
    string,
    { id: string; name: string | null; display_name: string | null; instagram: string | null; phone: string | null; kakao_open_chat_url: string | null }
  >();
  if (leaderIds.length > 0) {
    const { data: leadersData } = await supabase
      .from("users")
      .select("id, name, display_name, instagram, phone, kakao_open_chat_url")
      .in("id", leaderIds);
    for (const l of leadersData || []) leaderMap.set(l.id, l);
  }

  const { data: allOffers } = !isListTab
    ? { data: null }
    : await supabase
    .from("puzzle_offers")
    .select(`
      id, puzzle_id, status, table_type, proposed_price, includes, comment, created_at,
      visit_result, visit_marked_at, strike_applied_at, leader_chat_started_at, md_id,
      club:clubs(name, area),
      md:public_user_profiles!puzzle_offers_md_id_fkey(id, display_name, md_deal_count, instagram, kakao_open_chat_url, phone)
    `)
    .order("created_at", { ascending: true });

  type OfferRow = NonNullable<typeof allOffers>[number];
  const offersByPuzzle = (allOffers || []).reduce<Record<string, OfferRow[]>>((acc, offer) => {
    if (!acc[offer.puzzle_id]) acc[offer.puzzle_id] = [];
    acc[offer.puzzle_id].push(offer);
    return acc;
  }, {});

  // 대화 시작된(leader_chat_started_at) 오퍼들의 메시지 집계 → 오퍼별 chat_meta
  // { leader: 방장 메시지수, md: 파트너 메시지수, last_by, last_at, replied: MD가 1건이라도 보냈나 }
  type ChatMeta = { leader: number; md: number; last_by: "leader" | "md" | null; last_at: string | null; replied: boolean };
  const chatMetaByOffer: Record<string, ChatMeta> = {};
  const chatOfferIds = (allOffers || []).filter((o) => o.leader_chat_started_at).map((o) => o.id);
  if (chatOfferIds.length > 0) {
    const mdIdByOffer: Record<string, string> = {};
    for (const o of allOffers || []) if (o.leader_chat_started_at) mdIdByOffer[o.id] = o.md_id;
    const { data: msgs } = await supabase
      .from("puzzle_offer_messages")
      .select("offer_id, sender_id, created_at")
      .in("offer_id", chatOfferIds)
      .order("created_at", { ascending: true });
    for (const m of msgs || []) {
      const meta = chatMetaByOffer[m.offer_id] ?? { leader: 0, md: 0, last_by: null, last_at: null, replied: false };
      const isMd = m.sender_id === mdIdByOffer[m.offer_id];
      if (isMd) { meta.md += 1; meta.replied = true; } else { meta.leader += 1; }
      meta.last_by = isMd ? "md" : "leader";
      meta.last_at = m.created_at;
      chatMetaByOffer[m.offer_id] = meta;
    }
  }
  // 깃발별 대화 상태: 채팅 시작된 오퍼 중 replied 하나라도 있으면 'active', 있는데 전부 미답장이면 'waiting', 없으면 null
  const chatStatusByPuzzle: Record<string, "active" | "waiting" | null> = {};
  for (const [pid, offers] of Object.entries(offersByPuzzle)) {
    const started = offers.filter((o) => o.leader_chat_started_at);
    if (started.length === 0) { chatStatusByPuzzle[pid] = null; continue; }
    chatStatusByPuzzle[pid] = started.some((o) => chatMetaByOffer[o.id]?.replied) ? "active" : "waiting";
  }

  // 깃발/조각 서브필터 (kind: flag | share | 없음=전체)
  const flagCountAll = (allPuzzles || []).filter((p) => !p.is_recruiting_party).length;
  const shareCountAll = (allPuzzles || []).filter((p) => p.is_recruiting_party).length;
  const puzzlesAfterKind =
    kindFilter === "flag"
      ? (allPuzzles || []).filter((p) => !p.is_recruiting_party)
      : kindFilter === "share"
      ? (allPuzzles || []).filter((p) => p.is_recruiting_party)
      : (allPuzzles || []);

  // 지역 목록 추출 (kind 필터 적용 후 — 칩이 선택 종류의 분포를 반영)
  const areaCountMap = puzzlesAfterKind.reduce<Record<string, number>>((acc, p) => {
    if (!p.area) return acc;
    acc[p.area] = (acc[p.area] || 0) + 1;
    return acc;
  }, {});
  const areaList = Object.entries(areaCountMap).sort((a, b) => b[1] - a[1]);

  // 상태별 카운트 (kind + 지역 필터 적용 후 집계 — 칩이 현재 보이는 범위의 분포를 반영)
  const puzzlesAfterArea = areaFilter
    ? puzzlesAfterKind.filter((p) => p.area === areaFilter)
    : puzzlesAfterKind;
  const statusCountMap = puzzlesAfterArea.reduce<Record<string, number>>((acc, p) => {
    if (!p.status) return acc;
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  // 지역 + 상태 필터 적용
  const statusFilteredPuzzles = statusFilter
    ? puzzlesAfterArea.filter((p) => p.status === statusFilter)
    : puzzlesAfterArea;
  // 제안받는중(open) 하위 대화 필터 적용
  const filteredPuzzles =
    statusFilter === "open" && chatFilter
      ? statusFilteredPuzzles.filter((p) => chatStatusByPuzzle[p.id] === chatFilter)
      : statusFilteredPuzzles;

  // 최신 제안 탭 데이터 — 해당 탭일 때만 로드 (list 탭에서 불필요한 조회 방지)
  const { data: recentOffersRaw, error: recentOffersError } = tab === "offers"
    ? await supabase
        .from("puzzle_offers")
        .select(`
          id, puzzle_id, status, table_type, proposed_price, includes, comment, created_at,
          club:clubs(name, area),
          md:public_user_profiles!puzzle_offers_md_id_fkey(id, display_name, instagram)
        `)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: null, error: null };

  if (recentOffersError) {
    console.error("[admin/puzzles] recentOffers error:", recentOffersError);
  }

  // puzzles 정보 별도 조회 후 매핑
  const recentPuzzleIds = [...new Set((recentOffersRaw || []).map((o) => o.puzzle_id))];
  const recentPuzzleMap = new Map<string, { notes: string | null; area: string; event_date: string; is_recruiting_party: boolean }>();
  if (recentPuzzleIds.length > 0) {
    const { data: recentPuzzlesData } = await supabase
      .from("puzzles")
      .select("id, notes, area, event_date, is_recruiting_party")
      .in("id", recentPuzzleIds);
    for (const p of recentPuzzlesData || []) {
      recentPuzzleMap.set(p.id, {
        notes: p.notes,
        area: p.area,
        event_date: p.event_date,
        is_recruiting_party: !!p.is_recruiting_party,
      });
    }
  }

  // 제안을 깃발/조각으로 분류 (조각 = is_recruiting_party, 전체 목록 탭과 동일 기준)
  const recentOffersAll = (recentOffersRaw || []).map((o) => {
    const puzzle = recentPuzzleMap.get(o.puzzle_id) || null;
    return { ...o, puzzle, kind: puzzle?.is_recruiting_party ? "share" : "flag" };
  });
  const offerFlagCount = recentOffersAll.filter((o) => o.kind === "flag").length;
  const offerShareCount = recentOffersAll.filter((o) => o.kind === "share").length;
  const recentOffers =
    kindFilter === "flag" || kindFilter === "share"
      ? recentOffersAll.filter((o) => o.kind === kindFilter)
      : recentOffersAll;

  const OFFER_STATUS_LABEL: Record<string, string> = {
    pending: "대기 중",
    accepted: "수락됨",
    rejected: "거절됨",
    withdrawn: "철회됨",
    expired: "만료됨",
  };
  const OFFER_STATUS_COLOR: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400",
    accepted: "bg-green-500/20 text-green-400",
    rejected: "bg-neutral-700 text-neutral-400",
    withdrawn: "bg-neutral-700 text-neutral-400",
    expired: "bg-neutral-700 text-neutral-400",
  };

  // 신고 탭 데이터 — 해당 탭일 때만 로드
  const { data: reports } = tab === "reports"
    ? await supabase
        .from("puzzle_reports")
        .select("id, reason, created_at, puzzle_id, reporter_md_id")
        .order("created_at", { ascending: false })
    : { data: null };

  const puzzleIds = [...new Set((reports || []).map((r) => r.puzzle_id))];
  const puzzleMap = new Map<string, { id: string; area: string; event_date: string; status: string }>();

  if (puzzleIds.length > 0) {
    const { data: reportedPuzzles } = await supabase
      .from("puzzles")
      .select("id, area, event_date, status")
      .in("id", puzzleIds);
    for (const p of reportedPuzzles || []) puzzleMap.set(p.id, p);
  }

  const reportsByPuzzle = (reports || []).reduce((acc, report) => {
    if (!acc[report.puzzle_id]) acc[report.puzzle_id] = [];
    acc[report.puzzle_id].push(report);
    return acc;
  }, {} as Record<string, typeof reports>);

  const puzzleEntries = Object.entries(reportsByPuzzle);
  const pendingReportCount = reports?.length || 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20">
      <div className="max-w-2xl mx-auto px-4">
        {/* 헤더 */}
        <div className="flex items-center gap-3 py-5">
          <Link href="/admin" className="text-white">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <Flag className="w-5 h-5 text-purple-400" />
          <h1 className="text-[20px] font-black text-white">깃발·조각 관리</h1>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          <Link href="?tab=list">
            <button
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                tab === "list"
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}
            >
              전체 목록 {allPuzzles ? `${allPuzzles.length}건` : ""}
            </button>
          </Link>
          <Link href="?tab=offers">
            <button
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                tab === "offers"
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}
            >
              최신 제안 {tab === "offers" ? `${recentOffersAll.length}건` : ""}
            </button>
          </Link>
          <Link href="?tab=reports">
            <button
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                tab === "reports"
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}
            >
              신고 관리{pendingReportCount > 0 ? ` (${pendingReportCount})` : ""}
            </button>
          </Link>
          <Link href="?tab=surveys">
            <button
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                tab === "surveys"
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}
            >
              취소 설문
            </button>
          </Link>
        </div>

        {/* 전체 깃발 탭 */}
        {tab === "list" && (() => {
          const buildHref = (overrides: { area?: string | null; status?: string | null; sort?: SortKey | null; kind?: string | null; chat?: string | null }) => {
            const params = new URLSearchParams();
            params.set("tab", "list");
            const nextArea = overrides.area === undefined ? areaFilter : overrides.area;
            const nextStatus = overrides.status === undefined ? statusFilter : overrides.status;
            const nextSort = overrides.sort === undefined ? sortKey : overrides.sort;
            const nextKind = overrides.kind === undefined ? kindFilter : overrides.kind;
            const nextChat = overrides.chat === undefined ? chatFilter : overrides.chat;
            if (nextKind) params.set("kind", nextKind);
            if (nextArea) params.set("area", nextArea);
            if (nextStatus) params.set("status", nextStatus);
            if (nextSort && nextSort !== "event") params.set("sort", nextSort);
            if (nextChat && nextStatus === "open") params.set("chat", nextChat);
            return `?${params.toString()}`;
          };
          return (
          <div className="space-y-4">
            {/* 깃발/조각 토글 (kind 변경 시 지역·상태 필터 초기화) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-500 font-bold mr-1">종류:</span>
              <Link href={buildHref({ kind: null, area: null, status: null })}>
                <button className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${!kindFilter ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 border border-neutral-700"}`}>
                  전체 {allPuzzles?.length || 0}
                </button>
              </Link>
              <Link href={buildHref({ kind: "flag", area: null, status: null })}>
                <button className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${kindFilter === "flag" ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 border border-neutral-700"}`}>
                  🚩 깃발 {flagCountAll}
                </button>
              </Link>
              <Link href={buildHref({ kind: "share", area: null, status: null })}>
                <button className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${kindFilter === "share" ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 border border-neutral-700"}`}>
                  🧩 조각 {shareCountAll}
                </button>
              </Link>
            </div>

            {/* 정렬 토글 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-500 font-bold mr-1">정렬:</span>
              <Link href={buildHref({ sort: "event" })}>
                <button
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                    sortKey === "event"
                      ? "bg-white text-black"
                      : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                  }`}
                >
                  영업일순
                </button>
              </Link>
              <Link href={buildHref({ sort: "created" })}>
                <button
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                    sortKey === "created"
                      ? "bg-white text-black"
                      : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                  }`}
                >
                  등록순
                </button>
              </Link>
            </div>

            {/* 상태 토글 */}
            <div className="flex flex-wrap gap-1.5">
              <Link href={buildHref({ status: null })}>
                <button
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                    !statusFilter
                      ? "bg-amber-500 text-black"
                      : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                  }`}
                >
                  전체 {puzzlesAfterArea.length}
                </button>
              </Link>
              {STATUS_FILTER_ORDER.map((s) => {
                const c = statusCountMap[s] || 0;
                if (c === 0 && statusFilter !== s) return null;
                const active = statusFilter === s;
                return (
                  <Link key={s} href={buildHref({ status: s })}>
                    <button
                      className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                        active
                          ? s === "expired"
                            ? "bg-red-500 text-white"
                            : "bg-amber-500 text-black"
                          : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                      }`}
                    >
                      {STATUS_FILTER_LABEL[s]} {c}
                    </button>
                  </Link>
                );
              })}
            </div>

            {/* 지역 토글 */}
            {areaList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1">
                <Link href={buildHref({ area: null })}>
                  <button
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                      !areaFilter
                        ? "bg-purple-500 text-white"
                        : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                    }`}
                  >
                    전체 {allPuzzles?.length || 0}
                  </button>
                </Link>
                {areaList.map(([area, count]) => (
                  <Link key={area} href={buildHref({ area })}>
                    <button
                      className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                        areaFilter === area
                          ? "bg-purple-500 text-white"
                          : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                      }`}
                    >
                      {area} {count}
                    </button>
                  </Link>
                ))}
              </div>
            )}

            {filteredPuzzles.length === 0 ? (
              <div className="text-center py-20 text-neutral-500">
                <Flag className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{areaFilter ? `${areaFilter} 지역에 ${kindLabel}이 없습니다` : `${kindLabel}이 없습니다`}</p>
              </div>
            ) : (
              (() => {
                const dateCountMap = filteredPuzzles.reduce<Record<string, number>>((acc, p) => {
                  acc[p.event_date] = (acc[p.event_date] || 0) + 1;
                  return acc;
                }, {});
                let lastDate: string | null = null;
                return (
                <>
                {/* 취소 필터일 때: 최근 취소순 정렬 토글 (날짜 헤더 위) */}
                {statusFilter === "cancelled" && (
                  <Link href={buildHref({ sort: sortKey === "cancelled" ? "event" : "cancelled" })} className="block">
                    <div className={`flex items-center justify-center gap-1.5 w-full py-2 mb-1 rounded-lg text-[12px] font-bold transition-all ${
                      sortKey === "cancelled"
                        ? "bg-amber-500 text-black"
                        : "bg-neutral-800 text-neutral-300 border border-neutral-700"
                    }`}>
                      🕐 {sortKey === "cancelled" ? "최근 취소순 (적용중)" : "최근에 취소된 순 정렬"}
                    </div>
                  </Link>
                )}
                {/* 제안받는중(open)일 때: 답장대기중 / 대화중 하위 필터 */}
                {statusFilter === "open" && (() => {
                  const waitCnt = statusFilteredPuzzles.filter((p) => chatStatusByPuzzle[p.id] === "waiting").length;
                  const activeCnt = statusFilteredPuzzles.filter((p) => chatStatusByPuzzle[p.id] === "active").length;
                  return (
                    <div className="flex items-center gap-1.5 mb-1">
                      <Link href={buildHref({ chat: chatFilter === "waiting" ? null : "waiting" })} className="flex-1">
                        <div className={`flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-bold transition-all ${
                          chatFilter === "waiting" ? "bg-amber-500 text-black" : "bg-neutral-800 text-neutral-300 border border-neutral-700"
                        }`}>
                          💬 답장대기중 {waitCnt}
                        </div>
                      </Link>
                      <Link href={buildHref({ chat: chatFilter === "active" ? null : "active" })} className="flex-1">
                        <div className={`flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-bold transition-all ${
                          chatFilter === "active" ? "bg-green-500 text-black" : "bg-neutral-800 text-neutral-300 border border-neutral-700"
                        }`}>
                          🗨️ 대화중 {activeCnt}
                        </div>
                      </Link>
                    </div>
                  );
                })()}
                <ProgressiveList initial={7} items={filteredPuzzles.map((puzzle) => {
                  const offers = offersByPuzzle[puzzle.id] || [];
                  const leader = puzzle.leader_id ? leaderMap.get(puzzle.leader_id) : null;
                  const leaderName = leader?.display_name || leader?.name || "-";

                  const acceptedOffer = offers.find((o) => o.status === "accepted");
                  const isPuzzleEnded = puzzle.status !== "open";
                  const acceptedMd = acceptedOffer?.md as { display_name?: string } | null;
                  const acceptedVisit = acceptedOffer
                    ? acceptedOffer.visit_result === "visited"
                      ? { label: "✅ 방문 완료", cls: "text-green-400" }
                      : acceptedOffer.visit_result === "noshow"
                      ? acceptedOffer.strike_applied_at
                        ? { label: "⚫ 노쇼 처리됨", cls: "text-neutral-300" }
                        : { label: "🔴 노쇼 신고", cls: "text-red-400" }
                      : { label: "🟡 결과 대기", cls: "text-yellow-400" }
                    : null;

                  const isFirstOfDate = puzzle.event_date !== lastDate;
                  if (isFirstOfDate) lastDate = puzzle.event_date;
                  const showDateHeader = sortKey === "event" && isFirstOfDate;

                  return (
                    <Fragment key={puzzle.id}>
                      {showDateHeader && (
                        <div className="flex items-center justify-between pt-2 pb-1 border-b border-neutral-800/60">
                          <h2 className="text-[14px] font-black text-white">
                            {formatDate(puzzle.event_date)}
                          </h2>
                          <span className="text-[11px] text-neutral-500 font-bold">
                            {dateCountMap[puzzle.event_date]}건
                          </span>
                        </div>
                      )}
                      <Card className="bg-[#1C1C1E] border-neutral-800 p-5 space-y-4 hover:border-neutral-600 transition-colors">
                        {/* 퍼즐 기본 정보 (깃발 상세로 링크) */}
                        <Link href={`/flags/${puzzle.id}`} className="block">
                          <div className="flex items-start justify-between">
                            <div>
                              {puzzle.notes && (
                                <p className="text-[15px] font-black text-white">{puzzle.notes}</p>
                              )}
                              <p className={`${puzzle.notes ? "text-[13px] text-neutral-400" : "text-[16px] font-black text-white"}`}>
                                {formatDate(puzzle.event_date)} {puzzle.area}
                              </p>
                              <p className="text-[12px] text-neutral-600 mt-0.5">
                                파티 {puzzle.current_count}/{puzzle.target_count}명
                              </p>
                              <p className="text-[11px] text-neutral-700 mt-0.5">
                                등록 {new Date(puzzle.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {!kindFilter && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${puzzle.is_recruiting_party ? "bg-green-500/15 text-green-400" : "bg-neutral-700 text-neutral-300"}`}>
                                  {puzzle.is_recruiting_party ? "🧩 조각" : "🚩 깃발"}
                                </span>
                              )}
                              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[puzzle.status] || "bg-neutral-700 text-neutral-400"}`}>
                                {STATUS_LABEL[puzzle.status] || puzzle.status}
                              </span>
                            </div>
                          </div>
                        </Link>

                        {/* 선택 결과 요약 (운영 종료된 깃발만) */}
                        {acceptedOffer ? (
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <p className="text-[12px] text-amber-300">
                                <span className="font-bold">✅ 선택:</span>{" "}
                                <span className="font-black text-white">
                                  {acceptedMd?.display_name || "파트너"}
                                </span>
                                <span className="text-amber-200/70 mx-1">·</span>
                                <span className="font-black text-green-300">
                                  {acceptedOffer.proposed_price.toLocaleString()}원
                                </span>
                              </p>
                              {acceptedVisit && (
                                <span className={`text-[10px] font-bold ${acceptedVisit.cls}`}>
                                  {acceptedVisit.label}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : isPuzzleEnded ? (
                          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2">
                            <p className="text-[12px] text-neutral-400">
                              <span className="font-bold">❌ 미선택</span>
                              <span className="mx-1">·</span>
                              {offers.length > 0 ? `제안 ${offers.length}건 받음` : "제안 없음"}
                            </p>
                          </div>
                        ) : null}

                        {/* 대화 상태 요약 (대화 시작된 오퍼별) — 오퍼 채팅방으로 이동 */}
                        {offers.filter((o) => o.leader_chat_started_at).map((o) => {
                          const cm = chatMetaByOffer[o.id];
                          const active = cm?.replied;
                          return (
                            <Link key={o.id} href={`/flags/${puzzle.id}`}
                              className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 mt-1 ${
                                active ? "bg-neutral-800 hover:bg-neutral-700" : "bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20"
                              }`}>
                              <span className={`text-[12px] font-bold ${active ? "text-neutral-100" : "text-amber-300"}`}>
                                🗨️ {active ? "대화중" : "파트너 답장 기다리는중"}
                                {(o.md as { display_name?: string } | null)?.display_name ? ` · ${(o.md as { display_name?: string }).display_name}` : ""}
                              </span>
                              {cm && (
                                <span className="text-[11px] text-neutral-400">
                                  방장 {cm.leader} · 파트너 {cm.md}
                                  {cm.last_at && <> · 마지막 {cm.last_by === "md" ? "파트너" : "방장"} {relTime(cm.last_at)}</>}
                                </span>
                              )}
                            </Link>
                          );
                        })}

                        {/* 게시자 정보 (admin 전용 — 이름 클릭 시 유저 상세) */}
                        <div className="border-t border-neutral-800 pt-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-[12px] text-neutral-300">
                            <User className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="font-bold">게시자</span>
                            {leader?.id ? (
                              <Link
                                href={`/admin/users?focus=${leader.id}`}
                                className="text-amber-400 hover:underline"
                              >
                                {leaderName}
                              </Link>
                            ) : (
                              <span className="text-neutral-400">{leaderName}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500 pl-5">
                            {leader?.instagram && <span>📷 @{leader.instagram}</span>}
                            {leader?.phone && <span>📞 {leader.phone}</span>}
                            {leader?.kakao_open_chat_url && <span>💬 카톡 오픈챗</span>}
                          </div>
                        </div>

                        {/* 깃발 취소 + 기록 삭제 */}
                        <div className="flex justify-end gap-2 border-t border-neutral-800 pt-3">
                          {!["cancelled", "expired"].includes(puzzle.status) && (
                            <AdminCancelPuzzleButton puzzleId={puzzle.id} />
                          )}
                          <AdminDeletePuzzleButton puzzleId={puzzle.id} />
                        </div>

                        {/* 오퍼 드롭다운 */}
                        <AdminPuzzleOffersDropdown
                          offers={offers.map((o) => ({
                            id: o.id,
                            status: o.status,
                            table_type: o.table_type,
                            proposed_price: o.proposed_price,
                            includes: (o.includes as string[]) || [],
                            comment: o.comment,
                            created_at: o.created_at,
                            visit_result: o.visit_result as "visited" | "noshow" | null,
                            visit_marked_at: o.visit_marked_at as string | null,
                            strike_applied_at: o.strike_applied_at as string | null,
                            club: o.club as { name?: string; area?: string } | null,
                            md: o.md as {
                              id?: string;
                              display_name?: string;
                              md_deal_count?: number;
                              instagram?: string | null;
                              kakao_open_chat_url?: string | null;
                              phone?: string | null;
                            } | null,
                          }))}
                        />
                      </Card>
                    </Fragment>
                  );
                })} />
                </>
                );
              })()
            )}
          </div>
          );
        })()}

        {/* 최신 제안 탭 */}
        {tab === "offers" && (
          <div className="space-y-3">
            {/* 깃발/조각 토글 (전체 목록 탭과 동일 기준) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-500 font-bold mr-1">종류:</span>
              <Link href="?tab=offers">
                <button className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${!kindFilter ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 border border-neutral-700"}`}>
                  전체 {recentOffersAll.length}
                </button>
              </Link>
              <Link href="?tab=offers&kind=flag">
                <button className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${kindFilter === "flag" ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 border border-neutral-700"}`}>
                  🚩 깃발 {offerFlagCount}
                </button>
              </Link>
              <Link href="?tab=offers&kind=share">
                <button className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${kindFilter === "share" ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 border border-neutral-700"}`}>
                  🧩 조각 {offerShareCount}
                </button>
              </Link>
            </div>

            {(recentOffers || []).length === 0 ? (
              <div className="text-center py-20 text-neutral-500">
                <p>제안이 없습니다</p>
              </div>
            ) : (
              (recentOffers || []).map((offer) => {
                const puzzle = offer.puzzle as { notes?: string; area?: string; event_date?: string } | null;
                const md = offer.md as { display_name?: string; instagram?: string | null } | null;
                const club = offer.club as { name?: string } | null;
                return (
                  <Card key={offer.id} className="bg-[#1C1C1E] border-neutral-800 p-4">
                    <Link href={`/flags/${offer.puzzle_id}`} className="block active:opacity-70 transition-opacity">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            offer.kind === "share"
                              ? "bg-purple-500/20 text-purple-300"
                              : "bg-blue-500/20 text-blue-300"
                          }`}>
                            {offer.kind === "share" ? "🧩 조각" : "🚩 깃발"}
                          </span>
                          <p className="text-[13px] font-black text-white truncate">
                            {puzzle?.notes || `${puzzle?.area} ${puzzle?.event_date ? formatDate(puzzle.event_date) : ""}`}
                          </p>
                        </div>
                        <p className="text-[12px] text-neutral-400">
                          {club?.name || "클럽 미정"} · {offer.table_type} · {offer.proposed_price.toLocaleString()}원
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          파트너: {md?.display_name || "-"}
                          {md?.instagram ? ` · @${md.instagram}` : ""}
                        </p>
                        <p className="text-[11px] text-neutral-700">
                          {new Date(offer.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${OFFER_STATUS_COLOR[offer.status] || "bg-neutral-700 text-neutral-400"}`}>
                        {OFFER_STATUS_LABEL[offer.status] || offer.status}
                      </span>
                    </div>
                    {offer.comment && (
                      <p className="text-[12px] text-neutral-400 mt-2 bg-neutral-900 rounded-lg px-3 py-2">
                        {offer.comment}
                      </p>
                    )}
                    </Link>
                    <div className="flex justify-end mt-2">
                      <AdminDeleteOfferButton offerId={offer.id} />
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* 신고 관리 탭 */}
        {tab === "reports" && (
          <div className="space-y-4">
            {puzzleEntries.length === 0 ? (
              <div className="text-center py-20 text-neutral-500">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>신고된 깃발이 없습니다</p>
              </div>
            ) : (
              puzzleEntries.map(([puzzleId, puzzleReports]) => {
                const puzzle = puzzleMap.get(puzzleId);
                const reportList = puzzleReports || [];
                const isCancelled = puzzle?.status === "cancelled";

                return (
                  <Card key={puzzleId} className="bg-[#1C1C1E] border-neutral-800 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        {puzzle ? (
                          <>
                            <p className="text-[15px] font-black text-white">
                              {formatDate(puzzle.event_date)} {puzzle.area}
                            </p>
                            <p className="text-[12px] text-neutral-500 mt-0.5">
                              ID: {puzzleId.slice(0, 8)}
                            </p>
                          </>
                        ) : (
                          <p className="text-[13px] text-neutral-400">깃발 ID: {puzzleId.slice(0, 8)}</p>
                        )}
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          isCancelled
                            ? "bg-neutral-700 text-neutral-400"
                            : puzzle?.status === "open"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {isCancelled ? "취소됨" : puzzle?.status || "unknown"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[12px] font-bold text-neutral-400">신고 {reportList.length}건</p>
                      {reportList.map((report) => (
                        <div
                          key={report!.id}
                          className="bg-neutral-900 rounded-lg px-3 py-2 text-[12px] text-neutral-300 flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-neutral-500 mr-2">
                              {new Date(report!.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
                            </span>
                            {report!.reason}
                          </div>
                          <AdminDeletePuzzleReportButton reportId={report!.id} />
                        </div>
                      ))}
                    </div>

                    {!isCancelled && <AdminPuzzleRefundButton puzzleId={puzzleId} />}
                  </Card>
                );
              })
            )}
          </div>
        )}
        {/* 취소 설문 탭 */}
        {tab === "surveys" && (() => {
          const today = new Date().toISOString().slice(0, 10);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const from = fromParam || thirtyDaysAgo;
          const to = toParam || today;
          const trigger = triggerParam || "";
          const category = categoryParam || "";
          const page = Math.max(1, parseInt(pageParam || "1", 10));

          const buildSurveyHref = (overrides: Record<string, string | null>) => {
            const params = new URLSearchParams({ tab: "surveys" });
            const vals: Record<string, string> = { from, to, trigger, category, page: "1" };
            Object.entries(overrides).forEach(([k, v]) => { if (v) vals[k] = v; else delete vals[k]; });
            Object.entries(vals).forEach(([k, v]) => { if (v) params.set(k, v); });
            return `?${params.toString()}`;
          };

          return (
            <div className="space-y-5">
              {/* 필터 바 */}
              <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-3">
                {/* 기간 */}
                <SurveyDateRangeFilter
                  from={from}
                  to={to}
                  preservedParams={{
                    ...(trigger ? { trigger } : {}),
                    ...(category ? { category } : {}),
                  }}
                />

                {/* 트리거 필터 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-neutral-500 font-bold w-8">구분</span>
                  {[
                    { value: "", label: "전체" },
                    { value: "self_cancelled", label: "직접 취소" },
                    { value: "selecting_expired", label: "선택 만료" },
                  ].map(({ value, label }) => (
                    <Link key={value} href={buildSurveyHref({ trigger: value || null })}>
                      <button
                        className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                          trigger === value
                            ? "bg-amber-500 text-black"
                            : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                        }`}
                      >
                        {label}
                      </button>
                    </Link>
                  ))}
                </div>

                {/* 사유 필터 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-neutral-500 font-bold w-8">사유</span>
                  {[
                    { value: "", label: "전체" },
                    { value: "schedule_change", label: "일정 변경" },
                    { value: "no_preferred_venue", label: "원하는 장소 없음" },
                    { value: "weak_offers", label: "오퍼 별로" },
                    { value: "mind_change", label: "변심" },
                    { value: "forgot_about_it", label: "잊어버림" },
                    { value: "other", label: "기타" },
                    { value: "no_answer", label: "이유 모름" },
                  ].map(({ value, label }) => (
                    <Link key={value} href={buildSurveyHref({ category: value || null })}>
                      <button
                        className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                          category === value
                            ? "bg-purple-500 text-white"
                            : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                        }`}
                      >
                        {label}
                      </button>
                    </Link>
                  ))}
                </div>
              </div>

              <PuzzleCancellationSurveyView
                from={from}
                to={to}
                trigger={trigger}
                category={category}
                page={page}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
