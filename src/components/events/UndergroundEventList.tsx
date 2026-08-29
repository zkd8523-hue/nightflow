"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { eventSlug } from "@/lib/events/slug";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Mic2, Search, X, ExternalLink, ChevronRight, ThumbsUp, CalendarDays, Heart } from "lucide-react";
import { splitLineupDate, isLineupToday, formatLineupDate } from "@/lib/lineups/formatDate";
import { AREA_OPTIONS } from "@/lib/clubs/tags";
import { LineupPageHeader } from "@/components/lineups/LineupPageHeader";
import { LineupReportSheet } from "@/components/lineups/LineupReportSheet";
import { useLineupLikes } from "@/hooks/useLineupLikes";
import { hypeTier, hypeBadgeClass, hypeBadgeIconClass } from "@/lib/lineups/hypeTier";
import { matchesQuery } from "@/lib/search/normalize";
import { clubMatchesQuery } from "@/lib/search/clubMatch";
import { useSearchMissLogger } from "@/lib/search/logMiss";
import { performerMatchesQuery } from "@/lib/search/performerMatch";
import { EventMonthCalendar } from "@/components/events/EventMonthCalendar";
import { useArtistFavoritesContext } from "@/components/providers";

export interface EventPerformer {
  id: string;
  display_name: string;
  instagram: string | null;
  /** 있으면 이름이 /artists/{slug}로 링크된다(공연 2건 미만은 페이지가 sitemap엔 없지만 라우트 자체는 살아있다) */
  slug: string | null;
  /** artist_aliases — 검색 전용(화면 미노출) */
  aliases?: string[];
}

/** 서버에서 정규화해 내려주는 공연 1건. */
export interface UndergroundEventRow {
  id: string;
  event_date: string;
  title: string | null;
  /** 등록 클럽이면 채워진다 — 있으면 클럽 상세로 링크 */
  club_id: string | null;
  club_thumbnail: string | null;
  /** 클럽 원문 표기(미등록 장소 포함). 화면에 항상 이 이름을 쓴다 */
  venue_name: string;
  venue_area: string | null;
  /** 인스타 원본 게시물 — 클럽 미등록일 때의 유일한 출처 */
  source_url: string | null;
  performers: EventPerformer[];
  /** 아티스트 마스터에 못 붙은 원문 이름(조인 실패분) — 텍스트로만 표시 */
  extra_names: string[];
  /** 클럽 정식명 — venue_name이 캡션 원문이라 빠질 수 있어 검색 전용으로 따로 받는다 */
  club_name: string | null;
  /** clubs.aliases — 검색 전용(화면 미노출) */
  club_aliases: string[];
}

function groupByDate(rows: UndergroundEventRow[]): Array<[string, UndergroundEventRow[]]> {
  const map = new Map<string, UndergroundEventRow[]>();
  for (const r of rows) {
    const list = map.get(r.event_date);
    if (list) list.push(r);
    else map.set(r.event_date, [r]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function UndergroundEventList({ rows }: { rows: UndergroundEventRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 👍 좋아요 (Migration 597) — DJ 라인업 목록과 같은 규칙이다.
  // 카드마다 조회하면 쿼리가 카드 수만큼 늘어나므로 목록 최상위에서 한 번만 부른다.
  // 목록은 숫자만 읽는다(누르는 건 상세) → 로그인 여부와 무관하게 카운트만 받아온다.
  const eventIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const { getLike } = useLineupLikes(eventIds, undefined, "event");

  // 찜한 아티스트 — 날짜 그룹 안에서 정렬 우선순위로 쓴다(필터 아님, Migration 608).
  const { isFavoritedArtist } = useArtistFavoritesContext();

  const [area, setArea] = useState<string | null>(() => searchParams.get("area"));
  // 검색어는 URL에 싣지 않는다(/lineups와 동일 규칙 — 타이핑마다 히스토리가 더러워진다)
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // 달력에서 고른 날짜. 지역과 달리 URL에 싣지 않는다 — 달력은 목록을 좁히는
  // 임시 조작이고, 날짜별 착지 URL은 /events/[date]가 따로 맡는다.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 달력은 기본이 닫힘이다. 예정 공연이 10일치뿐이라 항상 펼쳐두면 빈 격자가
  // 목록을 화면 밖으로 밀어낸다(/lineups의 날짜 칩과 같은 토글 규칙).
  const [calOpen, setCalOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (area) params.set("area", area);
    const qs = params.toString();
    router.replace(qs ? `/events?${qs}` : "/events", { scroll: false });
  }, [area, router]);

  // 데이터에 실제로 있는 지역만 칩으로 — 눌러도 빈 화면이 되는 칩을 만들지 않는다
  const availableAreas = useMemo(() => {
    const present = new Set(rows.map((r) => r.venue_area).filter(Boolean) as string[]);
    return AREA_OPTIONS.filter((a) => present.has(a));
  }, [rows]);

  // 달력 점·건수 — 지역 칩은 반영하고 검색어는 반영하지 않는다. 타이핑할 때마다
  // 격자가 깜빡이면 달력이 목록의 곁다리처럼 보인다.
  const countsByDate = useMemo(() => {
    const src = area ? rows.filter((r) => r.venue_area === area) : rows;
    const m = new Map<string, number>();
    for (const r of src) m.set(r.event_date, (m.get(r.event_date) ?? 0) + 1);
    return m;
  }, [rows, area]);

  const groups = useMemo(() => {
    let out = area ? rows.filter((r) => r.venue_area === area) : rows;
    if (selectedDate) out = out.filter((r) => r.event_date === selectedDate);
    if (query.trim()) {
      // 클럽은 별칭까지 본다 — "제제"로 JEJE 공연이, "볼레로"로 Bolero 공연이 나와야 한다.
      // club_id가 없는 미등록 장소는 붙일 별칭이 없어 캡션 원문(venue_name)으로만 걸린다.
      out = out.filter(
        (r) =>
          matchesQuery([r.title, r.venue_name, ...r.extra_names], query) ||
          (r.club_id !== null &&
            clubMatchesQuery(
              { id: r.club_id, name: r.club_name ?? r.venue_name, aliases: r.club_aliases },
              query
            )) ||
          r.performers.some((p) => performerMatchesQuery(p, query))
      );
    }
    // 날짜 그룹 안에서 찜한 아티스트가 나오는 공연을 위로. 그룹(날짜) 순서 자체는
    // 건드리지 않는다 — 날짜를 뒤섞으면 "언제 뭐가 있나"를 못 읽는다.
    return groupByDate(out).map(
      ([date, list]) =>
        [
          date,
          [...list].sort(
            (a, b) =>
              Number(b.performers.some((p) => isFavoritedArtist(p.id))) -
              Number(a.performers.some((p) => isFavoritedArtist(p.id)))
          ),
        ] as [string, UndergroundEventRow[]]
    );
  }, [rows, area, query, selectedDate, isFavoritedArtist]);

  // 검색 실패 로깅용 — 지역 칩을 빼고 "검색어만" 적용한 결과 수.
  const queryOnlyMatchCount = useMemo(() => {
    if (!query.trim()) return rows.length;
    return rows.filter(
      (r) =>
        matchesQuery([r.title, r.venue_name, ...r.extra_names], query) ||
        (r.club_id !== null &&
          clubMatchesQuery(
            { id: r.club_id, name: r.club_name ?? r.venue_name, aliases: r.club_aliases },
            query
          )) ||
        r.performers.some((p) => performerMatchesQuery(p, query))
    ).length;
  }, [rows, query]);

  useSearchMissLogger("events", query, queryOnlyMatchCount);

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <LineupPageHeader active="events" />

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

            {/* 달력 토글 — /lineups의 날짜 칩 버튼과 같은 규약(닫을 때 선택을 푼다.
                격자만 접히고 필터가 남으면 왜 걸러졌는지 안 보인다). */}
            <button
              onClick={() => {
                if (calOpen) setSelectedDate(null);
                setCalOpen(!calOpen);
              }}
              aria-pressed={calOpen}
              aria-label={calOpen ? "달력 닫기" : "달력 열기"}
              className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full transition-colors ${
                calOpen || selectedDate
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                // 닫을 때 검색어를 비운다 — 창만 사라지고 목록이 걸러진 채 남으면 원인을 못 찾는다
                if (searchOpen) setQuery("");
                setSearchOpen(!searchOpen);
              }}
              aria-label={searchOpen ? "검색 닫기" : "검색"}
              aria-expanded={searchOpen}
              className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full transition-colors ${
                searchOpen || query
                  ? "bg-[#38383c] text-foreground"
                  : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
              }`}
            >
              {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        )}

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
              placeholder="공연 · 아티스트 · 장소 검색"
              aria-label="공연, 아티스트 또는 장소 검색"
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

        {/* 달력 — 버튼으로 연 때만. 검색 중에는 감춘다(검색은 날짜를 가로지르는
            조작이라 격자와 같이 두면 무엇이 목록을 좁혔는지 알 수 없다). */}
        {calOpen && !query.trim() && rows.length > 0 && (
          <EventMonthCalendar
            countsByDate={countsByDate}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        )}

        {groups.length === 0 ? (
          <div className="bg-[#1C1C1E] rounded-2xl px-4 py-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {query.trim()
                ? `'${query.trim()}' 검색 결과가 없어요`
                : selectedDate
                  ? `${formatLineupDate(selectedDate)}에는 등록된 공연이 없어요`
                  : area
                    ? `${area}는 아직 등록된 공연이 없어요`
                    : "아직 등록된 공연이 없어요"}
            </p>
            {query.trim() ? (
              <button
                onClick={() => setQuery("")}
                className="text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                검색어 지우기 →
              </button>
            ) : selectedDate ? (
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
        ) : (
          <div className="space-y-5">
            {groups.map(([date, list]) => (
              <section key={date} className="space-y-2">
                <DateHeader date={date} />
                <div className="space-y-2">
                  {list.map((r) => (
                    <EventCard key={r.id} row={r} like={getLike(r.id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* 제보 진입점 — 라인업 탭과 같은 자리, 문구만 이 탭에 맞춘다 */}
        <button
          onClick={() => setReportOpen(true)}
          className="w-full py-4 text-center text-[11px] text-muted-foreground leading-relaxed"
        >
          빠진 공연이 있나요? <b className="text-amber-400 font-bold">제보하기 ›</b>
        </button>
      </div>

      <LineupReportSheet open={reportOpen} onOpenChange={setReportOpen} variant="event" />
    </div>
  );
}

function DateHeader({ date }: { date: string }) {
  const { label, dow } = splitLineupDate(date);
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-sm font-black text-foreground">{label}</h2>
      <span className="text-xs font-bold text-muted-foreground">{dow}</span>
      {isLineupToday(date) && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500 text-black">
          오늘
        </span>
      )}
    </div>
  );
}

function EventCard({
  row,
  like,
}: {
  row: UndergroundEventRow;
  like: { count: number; likedByMe: boolean };
}) {
  // 부모(UndergroundEventList)에서 내려받지 않고 여기서 다시 읽는다 — Context라
  // 추가 요청이 없고, prop으로 함수를 내리면 카드마다 시그니처가 늘어난다.
  const { isFavoritedArtist } = useArtistFavoritesContext();
  const total = row.performers.length + row.extra_names.length;

  const slug = eventSlug(row.title);
  const detailHref = slug ? `/events/${row.event_date}/${encodeURIComponent(slug)}` : null;

  return (
    // 카드 어디를 눌러도 상세로 간다(stretched link).
    // 카드 전체를 <a>로 감쌀 수 없다 — 안에 클럽·인스타·원본 링크가 있어 <a> 중첩이 된다.
    // 그래서 투명 링크를 카드 위에 깔고(absolute inset-0), 안쪽 링크만 z-10으로 올린다.
    <div className="relative bg-[#1C1C1E] rounded-2xl p-3 group/card">
      {detailHref && (
        <Link
          href={detailHref}
          className="absolute inset-0 z-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          aria-label={`${row.title ?? "공연"} 상세 보기`}
        />
      )}

      {/* 👍 좋아요 — 목록에서는 "읽기 전용 신호"다(누르는 건 상세).
          제목 줄 안에 두면 카드가 3줄인데 배지만 첫 줄에 붙어 떠 보인다 →
          화살표와 같이 세로 가운데에 고정한다(라인업 목록과 같은 자리).
          0건이면 아예 그리지 않는다 — 회색 0이 줄줄이 서 있으면 빈 서비스로 보인다. */}
      {like.count > 0 && (
        <span
          className={`absolute ${detailHref ? "right-12" : "right-3"} top-1/2 -translate-y-1/2 z-0 inline-flex items-center gap-1 ${hypeBadgeClass(hypeTier(like.count))}`}
          aria-label={`좋아요 ${like.count}`}
        >
          <ThumbsUp
            className={`w-4 h-4 fill-current ${hypeBadgeIconClass(hypeTier(like.count))}`}
            aria-hidden="true"
          />
          <span className="text-[12px] font-black tabular-nums">{like.count}</span>
        </span>
      )}

      {/* 오른쪽 고정 화살표 — 누를 수 있다는 신호. 링크는 위 전면 레이어가 받는다 */}
      {detailHref && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 z-0 w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground group-hover/card:text-amber-400 group-hover/card:bg-white/10 transition-colors"
          aria-hidden="true"
        >
          <ChevronRight className="w-4 h-4" />
        </span>
      )}

      <div className={`flex items-start gap-3 ${detailHref ? (like.count > 0 ? "pr-24" : "pr-9") : (like.count > 0 ? "pr-14" : "")}`}>
        {/* 썸네일 — 등록 클럽이면 사진, 아니면 마이크 아이콘.
            공연 포스터는 저작권 때문에 저장하지 않으므로(club_events는 원본 링크만
            보관) 미등록 장소는 채울 이미지가 없다. */}
        {/* 카드 전체가 이미 상세로 가는 stretched link다 — 썸네일·클럽명·출연자
            인스타를 각각 별도 링크로 두면 터치 타겟이 잘게 쪼개져 오히려 혼란스럽다
            (모바일 실측 피드백). 링크는 카드 하나만, 안쪽은 전부 텍스트로 통일. */}
        {row.club_thumbnail ? (
          <Image
            src={row.club_thumbnail}
            alt=""
            width={44}
            height={44}
            className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
          />
        ) : (
          <span className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <Mic2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          {row.title && (
            <p className="text-sm font-bold text-foreground leading-snug pr-1">
              {row.title}
            </p>
          )}

          <div className="flex items-center gap-1 flex-wrap mt-0.5 text-[11px]">
            <span className={row.club_id ? "font-bold text-green-500" : "text-muted-foreground"}>
              {row.venue_name}
            </span>
            {row.venue_area && <span className="text-neutral-600">· {row.venue_area}</span>}
          </div>

          {total > 0 && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-300 line-clamp-2">
              {row.performers.map((p, i) => {
                const fav = isFavoritedArtist(p.id);
                const label = (
                  <>
                    {fav && (
                      <Heart
                        className="inline w-3 h-3 mr-0.5 -mt-0.5 fill-red-500 text-red-500"
                        aria-label="찜한 아티스트"
                      />
                    )}
                    {p.display_name}
                  </>
                );
                return (
                  <span key={p.id}>
                    {i > 0 && <span className="text-neutral-600">, </span>}
                    {p.slug ? (
                      <Link
                        href={`/artists/${p.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`relative z-10 transition-colors ${
                          fav ? "text-foreground font-bold" : "hover:text-foreground"
                        }`}
                      >
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </span>
                );
              })}
              {row.extra_names.map((n, i) => (
                <span key={`x-${i}`}>
                  {(row.performers.length > 0 || i > 0) && <span className="text-neutral-600">, </span>}
                  {n}
                </span>
              ))}
            </p>
          )}

          {/* 원본 게시물은 항상 노출한다 — 자동 수집이라 오파싱 가능성이 있고,
              사용자가 실제 공지(시간·입장료·예약)를 확인할 곳이 여기뿐이다. */}
          {row.source_url && (
            <a
              href={row.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 mt-1.5 inline-flex items-center gap-1 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
              원본 게시물
            </a>
          )}
        </div>

      </div>
    </div>
  );
}
