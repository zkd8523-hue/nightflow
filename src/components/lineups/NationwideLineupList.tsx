"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Disc3, ThumbsUp, Heart, Search, X, CalendarDays, ChevronRight } from "lucide-react";
import { formatBusinessMin } from "@/lib/lineups/time";
import { splitLineupDate, isLineupToday, formatLineupDate } from "@/lib/lineups/formatDate";
import { AREA_OPTIONS } from "@/lib/clubs/tags";
import { LineupPageHeader } from "@/components/lineups/LineupPageHeader";
import { clubMatchesQuery } from "@/lib/search/clubMatch";
import { useSearchMissLogger } from "@/lib/search/logMiss";
import { performerMatchesQuery } from "@/lib/search/performerMatch";
import { useFavoritesContext, useDjFavoritesContext } from "@/components/providers";
import { DjFavoriteButton } from "@/components/djs/DjFavoriteButton";
import { DjProfileSheet, type DjProfileTarget } from "@/components/djs/DjProfileSheet";
import { LineupReportSheet } from "@/components/lineups/LineupReportSheet";
import { useLineupLikes } from "@/hooks/useLineupLikes";
import { hypeTier, hypeBadgeClass, hypeBadgeIconClass } from "@/lib/lineups/hypeTier";

export interface LineupSetRef {
  // 캡션에서 수집한 라인업은 시간이 없다(순서만 있음) — Migration 573
  start_min: number | null;
  end_min: number | null;
  sort_order: number;
  dj: {
    id: string;
    slug: string;
    display_name: string;
    instagram: string | null;
    /** dj_aliases의 다른 표기들 — 검색에만 쓰고 화면에는 안 뿌린다 */
    aliases: string[];
  } | null;
}

/** 서버에서 정규화해 내려주는 라인업 1건(= 클럽 × 날짜). */
export interface LineupClubRow {
  /** club_lineups.id — 날짜별 좋아요(lineup_likes)가 매달리는 키 (Migration 596) */
  id: string;
  event_date: string;
  club_id: string;
  club_name: string;
  club_area: string | null;
  /** clubs.aliases — 검색에만 쓰고 화면에는 안 뿌린다(dj.aliases와 같은 규약) */
  club_aliases: string[];
  club_thumbnail: string | null;
  door_open_min: number | null;
  event_title: string | null;
  sets: LineupSetRef[];
}

/** DJ별 탭의 행 — 셋 1개가 1행이 된다(클럽 정보를 얹어 평탄화). */
interface DjRow {
  event_date: string;
  start_min: number | null;
  sort_order: number;
  dj: NonNullable<LineupSetRef["dj"]>;
  club_id: string;
  club_name: string;
  club_area: string | null;
}

type Tab = "club" | "dj";

/**
 * 클럽이 검색어에 걸리는지 — 클럽명 + 지역 + DB 별칭(clubs.aliases) + 정적 별칭(aliases.ts).
 * 매칭 규칙은 lib/search가 단독으로 쥔다(/clubs·/events와 동일).
 */
function clubMatches(row: LineupClubRow, q: string): boolean {
  return clubMatchesQuery(
    { id: row.club_id, name: row.club_name, area: row.club_area, aliases: row.club_aliases },
    q
  );
}

/** 날짜 그룹을 순서 그대로 유지하며 묶는다(입력이 event_date 오름차순 정렬 상태). */
function groupByDate<T extends { event_date: string }>(rows: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.event_date);
    if (list) list.push(r);
    else map.set(r.event_date, [r]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function NationwideLineupList({ rows }: { rows: LineupClubRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [area, setArea] = useState<string | null>(() => searchParams.get("area"));
  const [tab, setTab] = useState<Tab>(() => (searchParams.get("tab") === "dj" ? "dj" : "club"));
  const [reportOpen, setReportOpen] = useState(false);
  // 검색어는 URL에 싣지 않는다 — 타이핑마다 router.replace가 돌면 히스토리가 더러워지고,
  // 검색 결과 URL은 SEO로도 색인시킬 이유가 없다(지역·탭만 공유 가치가 있음).
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  // 행 안의 하트는 "정렬 우선순위", 이 상단 하트는 "찜한 것만 보기" 필터로 별개다.
  const [favOnly, setFavOnly] = useState(false);
  // 날짜 필터 — 달력 아이콘으로 칩 줄을 펴고 하루를 고른다.
  const [dateOpen, setDateOpen] = useState(false);
  // 프로필 시트에 띄울 DJ (null이면 닫힘)
  const [profileDj, setProfileDj] = useState<DjProfileTarget | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 찜은 "필터"가 아니라 "정렬 우선순위"다 — 하트한 것이 날짜 그룹 안에서 위로 올라올 뿐,
  // 하트 안 한 항목도 전부 그대로 남는다. 날짜 순서 자체는 절대 안 바뀐다.
  const { isFavorited } = useFavoritesContext();
  const { isFavoritedDj } = useDjFavoritesContext();

  // 🔥 그날 DJ셋 좋아요 (Migration 596) — 클럽 찜(하트)과는 다른 축이다.
  //   찜 = "나 여기 단골"(나만 보는 북마크, 정렬·필터용)
  //   🔥 = "오늘 이 셋 좋다"(남에게 보이는 숫자, 그날 한정)
  // 카드마다 조회하면 쿼리가 카드 수만큼 늘어나므로 목록 최상위에서 한 번만 부른다.
  // 목록은 숫자만 읽는다(누르는 건 상세) → 로그인 여부와 무관하게 카운트만 받아온다.
  const lineupIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const { getLike } = useLineupLikes(lineupIds, undefined);

  useEffect(() => {
    const params = new URLSearchParams();
    if (area) params.set("area", area);
    if (tab === "dj") params.set("tab", "dj");
    const qs = params.toString();
    router.replace(qs ? `/lineups?${qs}` : "/lineups", { scroll: false });
  }, [area, tab, router]);

  // 데이터에 실제로 존재하는 지역만 칩으로 낸다 — 라인업이 4개 지역뿐인데
  // 7개 칩을 다 보여주면 눌러도 빈 화면만 나온다.
  const availableAreas = useMemo(() => {
    const present = new Set(rows.map((r) => r.club_area).filter(Boolean) as string[]);
    return AREA_OPTIONS.filter((a) => present.has(a));
  }, [rows]);

  // 날짜 칩 목록 — 라인업이 실제로 있는 날짜만. 지역을 고르면 그 지역에 있는 날짜만 남는다
  // (지역 홍대인데 라인업 없는 날짜를 칩으로 내면 눌러도 빈 화면).
  const availableDates = useMemo(() => {
    const inArea = area ? rows.filter((r) => r.club_area === area) : rows;
    return [...new Set(inArea.map((r) => r.event_date))].sort();
  }, [rows, area]);

  // 달력 버튼 노출 여부는 지역과 무관하게 "전체 날짜 수"로 판단한다.
  // availableDates로 판단하면 지역을 골라 그 지역 날짜가 1개가 되는 순간 버튼이
  // 통째로 사라져, 지역을 누른 뒤엔 날짜를 아예 못 고르게 된다.
  const totalDateCount = useMemo(
    () => new Set(rows.map((r) => r.event_date)).size,
    [rows]
  );

  // 지역이 바뀌어 선택한 날짜가 그 지역에 없으면 날짜 선택을 무시한다 — 안 그러면
  // 결과가 0건인데 원인이 지역인지 날짜인지 알 수 없다.
  // effect로 되돌리지 않고 렌더 중 파생값으로 처리해 한 프레임 빈 화면이 뜨지 않게 한다.
  const activeDate =
    selectedDate && availableDates.includes(selectedDate) ? selectedDate : null;

  const filtered = useMemo(() => {
    let out = area ? rows.filter((r) => r.club_area === area) : rows;
    if (activeDate) out = out.filter((r) => r.event_date === activeDate);
    return out;
  }, [rows, area, activeDate]);

  const clubGroups = useMemo(() => {
    // 클럽별 탭에서도 같은 검색창이 동작한다. 클럽명뿐 아니라 그 라인업에 있는 DJ로도
    // 찾히게 한다 — "ZESTURE 어디서 틀지"를 클럽별 탭에서 검색해도 결과가 나와야 한다.
    const q = query;
    let searched = q
      ? filtered.filter(
          (r) => clubMatches(r, q) || r.sets.some((s) => s.dj && performerMatchesQuery(s.dj, q))
        )
      : filtered;

    // "찜한 것만 보기"는 찜한 클럽뿐 아니라 찜한 DJ가 뛰는 클럽도 잡는다 —
    // 클럽 탭에서 이 버튼을 누르는 사람은 "내가 관심있는 것"을 걸러보려는 것이지
    // 클럽만으로 좁힐 이유가 없다(정렬에서도 DJ 기준을 2순위로 쓰는 것과 같은 원칙).
    if (favOnly)
      searched = searched.filter(
        (r) => isFavorited(r.club_id) || r.sets.some((s) => s.dj && isFavoritedDj(s.dj.id))
      );

    return groupByDate(searched).map(([date, list]) => [
      date,
      // 찜한 클럽이 이 날짜 그룹 안에서 위로. 동순위는 기존 기준(클럽명)을 유지해
      // 로그인 전후로 순서가 요동치지 않게 한다.
      [...list].sort((a, b) => {
        const fav = Number(isFavorited(b.club_id)) - Number(isFavorited(a.club_id));
        if (fav !== 0) return fav;
        // 찜한 클럽 다음은 "찜한 DJ가 오늘 트는 클럽". 클럽을 안 찜했어도
        // 따라다니는 DJ가 있으면 그 클럽을 먼저 봐야 한다.
        const hasFavDj = (r: LineupClubRow) => r.sets.some((x) => x.dj && isFavoritedDj(x.dj.id));
        const dj = Number(hasFavDj(b)) - Number(hasFavDj(a));
        if (dj !== 0) return dj;
        return a.club_name.localeCompare(b.club_name);
      }),
    ]) as Array<[string, LineupClubRow[]]>;
  }, [filtered, isFavorited, isFavoritedDj, query, favOnly]);

  // 검색 실패 로깅용 — 지역·날짜·찜 칩을 빼고 "검색어만" 적용한 결과 수.
  // 탭별로 세지 않고 클럽·DJ 양쪽을 합산한다: DJ 탭에서 클럽명을 쳐서 0건인 건
  // 별칭 부족이 아니라 탭을 잘못 고른 것이라, 미스로 기록하면 큐가 오염된다.
  const queryOnlyMatchCount = useMemo(() => {
    if (!query.trim()) return rows.length;
    return rows.filter(
      (r) =>
        clubMatches(r, query) ||
        r.sets.some((s) => s.dj && performerMatchesQuery(s.dj, query))
    ).length;
  }, [rows, query]);

  useSearchMissLogger("lineups", query, queryOnlyMatchCount);

  const djGroups = useMemo(() => {
    // DJ 검색은 performerMatchesQuery가 담당 — 표기명 + 인스타 핸들 + dj_aliases의 다른 표기.
    const q = query;
    const flat: DjRow[] = [];
    for (const r of filtered) {
      for (const s of r.sets) {
        if (!s.dj) continue; // DJ 미지정 셋은 DJ별 탭에 낼 것이 없다
        if (favOnly && !isFavoritedDj(s.dj.id)) continue;
        // DJ 본인(이름·핸들·별칭)으로만 검색한다.
        // 클럽명으로도 걸리게 하면 "그 클럽 소속 DJ"처럼 읽히는데, DJ는 여러 클럽에서
        // 뛰므로 사실과 다른 인상을 준다. 클럽으로 찾는 건 클럽별 탭의 역할.
        if (!performerMatchesQuery(s.dj, q)) continue;
        flat.push({
          event_date: r.event_date,
          start_min: s.start_min,
          sort_order: s.sort_order,
          dj: s.dj,
          club_id: r.club_id,
          club_name: r.club_name,
          club_area: r.club_area,
        });
      }
    }
    return groupByDate(flat).map(([date, list]) => [
      date,
      [...list].sort((a, b) => {
        const fav = Number(isFavoritedDj(b.dj.id)) - Number(isFavoritedDj(a.dj.id));
        if (fav !== 0) return fav;
        // 시간이 있으면 시간순, 없으면 캡션에 적힌 순서
        if (a.start_min !== null && b.start_min !== null) return a.start_min - b.start_min;
        if (a.start_min !== null) return -1; // 시간 있는 셋을 먼저
        if (b.start_min !== null) return 1;
        return a.sort_order - b.sort_order;
      }),
    ]) as Array<[string, DjRow[]]>;
  }, [filtered, isFavoritedDj, query, favOnly]);

  const groupCount = tab === "club" ? clubGroups.length : djGroups.length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-lg lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
        <LineupPageHeader active="lineups" />

        {/* 지역 칩 + 하트 필터 — 탭 전환과 무관하게 유지된다.
            칩은 가로 스크롤이고 하트는 그 바깥에 고정 — 지역이 늘어나도 하트가
            스크롤에 밀려 사라지지 않게 한다. */}
        {availableAreas.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 flex-1 min-w-0">
              <button
                onClick={() => setArea(null)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                  area === null
                    ? "bg-amber-500 text-black"
                    : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
                }`}
              >
                전체
              </button>
              {availableAreas.map((a) => (
                <button
                  key={a}
                  onClick={() => setArea(a)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                    area === a
                      ? "bg-amber-500 text-black"
                      : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>

            {/* 날짜 필터 — 달력 아이콘으로 아래 날짜 칩 줄을 편다.
                날짜가 1개뿐이면 고를 게 없으므로 버튼 자체를 숨긴다. */}
            {totalDateCount > 1 && (
              <button
                onClick={() => {
                  // 닫을 때 선택을 푼다 — 칩만 접히고 필터가 남으면 왜 걸러졌는지 안 보인다.
                  if (dateOpen) setSelectedDate(null);
                  setDateOpen(!dateOpen);
                }}
                aria-pressed={dateOpen}
                aria-label={dateOpen ? "날짜 필터 닫기" : "날짜 선택"}
                className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full transition-colors ${
                  dateOpen || activeDate
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarDays className="w-4 h-4" />
              </button>
            )}

            {/* 하트 필터 — 행 안의 하트(정렬 우선순위)와 달리 이건 "찜한 것만 보기"다.
                켜면 현재 탭 기준으로 찜한 클럽/DJ만 남는다. */}
            <button
              onClick={() => setFavOnly(!favOnly)}
              aria-pressed={favOnly}
              aria-label={favOnly ? "찜한 것만 보기 해제" : "찜한 것만 보기"}
              title={tab === "dj" ? "찜한 DJ만 보기" : "찜한 클럽만 보기"}
              className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full transition-colors ${
                favOnly ? "bg-red-500/15" : "bg-[#1C1C1E] hover:bg-[#232326]"
              }`}
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  favOnly ? "text-red-500 fill-red-500" : "text-muted-foreground"
                }`}
              />
            </button>
          </div>
        )}

        {/* 날짜 칩 — 달력 버튼을 눌렀을 때만. 지역 칩과 같은 톤이되 라인업 날짜 칩의
            amber 규칙을 그대로 따른다(클럽 상세 날짜 칩과 동일). */}
        {dateOpen && availableDates.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
            <button
              onClick={() => setSelectedDate(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                selectedDate === null
                  ? "bg-amber-500 text-black"
                  : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
              }`}
            >
              전체
            </button>
            {availableDates.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                  selectedDate === d
                    ? "bg-amber-500 text-black"
                    : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
                }`}
              >
                {formatLineupDate(d)}
              </button>
            ))}
          </div>
        )}

        {/* 세그먼트 토글 + 검색 돋보기 — 검색창은 평소 접혀 있고 돋보기로 편다.
            라인업이 몇 개뿐일 땐 검색창이 자리만 차지하므로 필요할 때만 꺼낸다. */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 bg-[#1C1C1E] rounded-lg p-[3px]" role="tablist">
            {(["club", "dj"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  tab === t ? "bg-[#38383c] text-foreground" : "text-muted-foreground"
                }`}
              >
                {t === "dj" ? "DJ" : "클럽"}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              // 닫을 때 검색어를 비운다 — 안 그러면 창만 사라지고 목록은 계속
              // 걸러진 상태로 남아 "왜 안 보이지"가 된다.
              if (searchOpen) setQuery("");
              setSearchOpen(!searchOpen);
            }}
            aria-label={searchOpen ? "검색 닫기" : "검색"}
            aria-expanded={searchOpen}
            className={`shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg transition-colors ${
              searchOpen || query
                ? "bg-[#38383c] text-foreground"
                : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
            }`}
          >
            {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </button>
        </div>

        {searchOpen && (
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "dj" ? "DJ 이름 검색" : "클럽 · DJ 검색"}
              aria-label={tab === "dj" ? "DJ 이름 검색" : "클럽 또는 DJ 검색"}
              className="w-full bg-[#1C1C1E] rounded-lg pl-9 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-amber-500/60"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-white/5"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {groupCount === 0 ? (
          <div className="bg-[#1C1C1E] rounded-2xl px-4 py-10 text-center space-y-3">
            {/* 검색 결과 0건과 "이 지역에 라인업이 없음"은 원인이 다르므로 문구도 다르다 —
                검색어를 지우면 되는 상황에 "라인업이 없다"고 하면 오해한다. */}
            <p className="text-sm text-muted-foreground">
              {query.trim()
                ? `'${query.trim()}' 검색 결과가 없어요`
                : favOnly
                  ? tab === "dj"
                    ? "찜한 DJ의 예정된 라인업이 없어요"
                    : "찜한 클럽의 예정된 라인업이 없어요"
                  : activeDate
                    ? `${formatLineupDate(activeDate)}에 등록된 라인업이 없어요`
                    : area
                      ? `${area}는 아직 등록된 라인업이 없어요`
                      : "아직 등록된 라인업이 없어요"}
            </p>
            {query.trim() ? (
              <button
                onClick={() => setQuery("")}
                className="text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                검색어 지우기 →
              </button>
            ) : favOnly ? (
              <button
                onClick={() => setFavOnly(false)}
                className="text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                전체 보기 →
              </button>
            ) : activeDate ? (
              <button
                onClick={() => setSelectedDate(null)}
                className="text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                전체 날짜 보기 →
              </button>
            ) : (
              area && (
                <button
                  onClick={() => setArea(null)}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300"
                >
                  전체 보기 →
                </button>
              )
            )}
          </div>
        ) : tab === "club" ? (
          <div className="space-y-5">
            {clubGroups.map(([date, list]) => (
              <section key={date} className="space-y-2">
                <DateHeader date={date} />
                {/* 데스크톱은 2열 — 카드가 독립적이라 그리드로 쪼개도 안전하다.
                    (DJ 탭은 한 덩어리 안에서 구분선으로 이어지는 리스트라 그대로 1열 유지) */}
                <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-2">
                  {list.map((r) => (
                    <ClubLineupRow
                      key={`${r.club_id}-${r.event_date}`}
                      row={r}
                      like={getLike(r.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {djGroups.map(([date, list]) => (
              <section key={date} className="space-y-2">
                <DateHeader date={date} />
                <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden">
                  {list.map((r, i) => (
                    <DjLineupRow
                      key={`${r.dj.id}-${r.club_id}-${r.start_min ?? r.sort_order}-${i}`}
                      row={r}
                      onOpenProfile={setProfileDj}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* 제보 진입점 — 목록 맨 아래 한 줄.
            상단(칩·캘린더·찜·검색)은 이미 차 있고, 첫 화면은 라인업을 보러 온
            사람의 것이라 제보가 자리를 차지하면 안 된다. 다 보고 "없네"라고
            느낀 순간에만 눈에 들어오는 자리다. */}
        <button
          onClick={() => setReportOpen(true)}
          className="w-full py-4 text-center text-[11px] text-muted-foreground leading-relaxed"
        >
          빠진 타임라인이 있나요? <b className="text-amber-400 font-bold">제보하기 ›</b>
        </button>
      </div>

      <DjProfileSheet dj={profileDj} onClose={() => setProfileDj(null)} />
      <LineupReportSheet open={reportOpen} onOpenChange={setReportOpen} variant="lineup" />
    </div>
  );
}

function DateHeader({ date }: { date: string }) {
  const { label, dow } = splitLineupDate(date);
  const today = isLineupToday(date);
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-sm font-black text-foreground">{label}</h2>
      <span className="text-xs font-bold text-muted-foreground">{dow}</span>
      {today && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500 text-black">
          오늘
        </span>
      )}
    </div>
  );
}

/** 클럽별 탭 행 — 라인업 1건. 탭하면 그 날짜의 전체 타임테이블로. */
function ClubLineupRow({
  row,
  like,
}: {
  row: LineupClubRow;
  like: { count: number; likedByMe: boolean };
}) {
  const { isFavorited, toggleFavorite } = useFavoritesContext();
  const { isFavoritedDj } = useDjFavoritesContext();
  const favorited = isFavorited(row.club_id);
  // 찜한 DJ는 이 클럽이 왜 위로 올라왔는지를 설명하는 근거다 — 하트 + 다른 색으로
  // 표시해 나머지 이름과 구분한다(문자열 join이었던 걸 노드 배열로 바꾼다).
  const previewDjs = row.sets.map((s) => s.dj).filter(Boolean) as NonNullable<
    LineupClubRow["sets"][number]["dj"]
  >[];

  return (
    <Link
      href={`/clubs/${row.club_id}/lineup/${row.event_date}`}
      className="flex items-center gap-3 bg-[#1C1C1E] rounded-2xl p-3 hover:bg-[#232326] transition-colors"
    >
      {/* 클럽 찜 하트는 썸네일 위에 얹는다 — "이 클럽을 찜"이라는 대상이 그림으로 명백해지고,
          오른쪽에는 그날 셋 좋아요(🔥)가 들어와 둘이 헷갈리지 않는다. */}
      <span className="relative w-12 h-12 flex-shrink-0">
        {row.club_thumbnail ? (
          <Image
            src={row.club_thumbnail}
            alt=""
            width={48}
            height={48}
            className="w-12 h-12 rounded-xl object-cover"
          />
        ) : (
          <span className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
            <Disc3 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
        {/* 행 전체가 링크라 기본 동작을 막아야 상세로 안 넘어간다 */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFavorite(row.club_id);
          }}
          aria-label={`${row.club_name} ${favorited ? "찜 해제" : "찜하기"}`}
          className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-black/85 ring-1 ring-white/25 transition-transform active:scale-90"
        >
          <Heart
            className={`w-[11px] h-[11px] transition-colors ${
              favorited ? "text-red-500 fill-red-500" : "text-white"
            }`}
          />
        </button>
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-foreground truncate">{row.club_name}</span>
          {row.club_area && (
            <span className="text-[11px] text-muted-foreground flex-shrink-0">{row.club_area}</span>
          )}
        </div>
        {previewDjs.length > 0 && (
          <p className="text-[11px] font-mono text-[#39ff6a]/80 truncate mt-0.5">
            {previewDjs.map((dj, i) => {
              const fav = isFavoritedDj(dj.id);
              return (
                <span key={dj.id} className={fav ? "text-red-400 font-bold" : ""}>
                  {i > 0 && <span className="text-[#39ff6a]/50"> · </span>}
                  {fav && (
                    <Heart
                      className="inline w-2.5 h-2.5 mr-0.5 -mt-0.5 fill-red-400 text-red-400"
                      aria-label="찜한 DJ"
                    />
                  )}
                  {dj.display_name}
                </span>
              );
            })}
          </p>
        )}
      </div>


      {/* 🔥 그날 DJ셋 좋아요 — 목록에서는 "읽기 전용 신호"다.
          누르는 건 상세 페이지에서 한다. 카드마다 회색 불이 줄줄이 서 있으면
          커뮤니티가 아니라 "아무도 안 쓰는 서비스"로 보이므로, 0건이면 아예 그리지 않는다. */}
      {like.count > 0 && (
        <span
          className={`shrink-0 inline-flex items-center gap-1 ${hypeBadgeClass(hypeTier(like.count))}`}
          aria-label={`좋아요 ${like.count}`}
        >
          <ThumbsUp
            className={`w-4 h-4 fill-current ${hypeBadgeIconClass(hypeTier(like.count))}`}
            aria-hidden="true"
          />
          <span className="text-[12px] font-black tabular-nums">
            {like.count}
          </span>
        </span>
      )}

      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
    </Link>
  );
}

/** DJ별 탭 행 — 셋 1개. 이름을 누르면 프로필 시트가 뜬다. */
function DjLineupRow({
  row,
  onOpenProfile,
}: {
  row: DjRow;
  onOpenProfile: (dj: DjProfileTarget) => void;
}) {
  const openProfile = () =>
    onOpenProfile({
      id: row.dj.id,
      display_name: row.dj.display_name,
      instagram: row.dj.instagram,
      slug: row.dj.slug,
    });

  return (
    /* 이니셜 원은 두지 않는다 — DJ는 프로필 사진이 없는 운영자 등록 데이터라
       첫 글자만 반복해 보여줄 뿐 정보를 더하지 않는다(프로필 시트와 같은 규칙).
       행 전체가 프로필 시트를 연다 — 클럽명은 더 이상 별도 링크가 아니다(눌러도
       이동하지 않음). 인스타 아이콘은 모바일에서 터치 타겟이 너무 작아 빼고,
       인스타 링크는 프로필 시트 안(DjProfileSheet)에서만 제공한다 — 찜 버튼만
       stopPropagation으로 자기 동작 유지. */
    <button
      type="button"
      onClick={openProfile}
      className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0 text-left hover:bg-white/[0.03] transition-colors"
    >
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-bold text-foreground block">{row.dj.display_name}</span>
        <p className="text-[11px] text-muted-foreground truncate">
          {row.club_name}
          {row.club_area ? ` · ${row.club_area}` : ""}
        </p>
      </div>

      {row.start_min !== null && (
        <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">
          {formatBusinessMin(row.start_min)}
        </span>
      )}

      <span onClick={(e) => e.stopPropagation()}>
        <DjFavoriteButton djId={row.dj.id} djName={row.dj.display_name} />
      </span>
    </button>
  );
}
