"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { Search, X, Plus, Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { findClubIdsByAlias } from "@/lib/clubs/aliases";
import { recommendCompare } from "@/lib/clubs/foreignSort";
import { MAIN_AREAS } from "@/lib/constants/areas";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ForeignClubDetailPanel, type ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";
import type { ClubLite, PreferredClubItem } from "@/types/database";

const MAX_DEFAULT = 3;
const SEOUL_AREAS = ["강남", "홍대", "이태원"];
const BROWSE_STEP = 10;
// 이태원 추천순 상위 고정 큐레이션 — ForeignRequestForm과 동일(구글 리뷰수 기준 알고리즘이 장소 오매칭 등으로
// 신뢰 못 할 값을 낼 때가 있어, 검증된 클럽 3곳을 고정 후보로 두고 노출 순서만 섞음).
const ITAEWON_RECOMMEND_CURATED = ["Dawn", "BADASS", "Day&night"];

// 외국인 트랙(ForeignRequestForm) 클럽 카드 캐러셀 + 상세시트를 그대로 포팅 — 한국어 고정, 최대 3개.
// ForeignClubDetail을 그대로 써서 ForeignClubDetailPanel(외국인 상세 UI)을 재사용한다.
type ClubStat = ForeignClubDetail;
type SortKey = "recommend" | "reviews" | "rating";
const SORT_TABS: { key: SortKey; label: string }[] = [
  { key: "recommend", label: "추천순" },
  { key: "reviews", label: "리뷰 많은순" },
  { key: "rating", label: "평점순" },
];

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Supabase 스토리지 공개 URL → 렌더 변환(작은 이미지). next/image 옵티마이저를 건너뛰고
 * CDN에서 바로 작은 파일(수 KB)을 받아 로딩이 빠르고 균일해진다.
 */
function thumb(url: string | null, size = 144): string | null {
  if (!url) return null;
  if (url.includes("/storage/v1/object/public/")) {
    const render = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
    const sep = render.includes("?") ? "&" : "?";
    return `${render}${sep}width=${size}&height=${size}&resize=cover&quality=60`;
  }
  return url;
}

interface Props {
  value: PreferredClubItem[];
  onChange: (items: PreferredClubItem[]) => void;
  max?: number;
  /** 상위(PuzzleForm)의 지역 선택 — 지정되면 그 지역 클럽만 캐러셀에 노출. "서울 어디든"/미선택은 서울 3권역. */
  area?: string;
  /** 검색창 옆(좌우 분할)에 얹을 액션 — 예: "상관없어요" 버튼 */
  footerAction?: React.ReactNode;
}

/**
 * 클럽 피커 — 순수 UI 컴포넌트, 저장 방식은 모름(컨트롤드, 상위가 결정).
 *  - 검색/카드에서 DB에 있는 클럽 선택 → { kind:"club" }
 *  - 검색 결과 없으면 "'입력값' 추가 요청" → { kind:"wish" } (미등록 클럽 = 영업 리드)
 * 현재 유일한 사용처: PuzzleForm의 "제안받고 싶은 클럽"(깃발 한정, puzzles.preferred_club_ids) —
 * 프로필의 "자주가는 클럽"(user_pinned_clubs, 영구)과는 다른 개념이니 재사용 시 주의.
 */
export function PreferredClubsPicker({ value, onChange, max = MAX_DEFAULT, area, footerAction }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClubLite[]>([]);
  const [searching, setSearching] = useState(false);

  // 서울 클럽 둘러보기 (정렬 탭: 추천순/리뷰 많은순/평점순 + 10개씩 추가로딩)
  const [browse, setBrowse] = useState<ClubStat[]>([]);
  const [browseVisible, setBrowseVisible] = useState(BROWSE_STEP);
  const [sortKey, setSortKey] = useState<SortKey>("recommend");

  const atMax = value.length >= max;

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      // MAIN_AREAS 전체(서울 3권역 + 수원/부산/대구)를 한 번만 가져와서 지역 선택은 클라이언트에서 필터.
      // 상세시트(ForeignClubDetailPanel)에 필요한 전체 필드까지 함께 조회.
      const { data } = await supabase
        .from("clubs")
        .select(
          "id, name, name_en, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram, dresscode, tags, google_reviews, club_partners(md_id)",
        )
        .in("area", MAIN_AREAS as unknown as string[])
        .is("deleted_at", null)
        .not("thumbnail_url", "is", null)
        // 반얀트리 풀파티 등 비-클럽 venue는 가이드/추천 브라우징에서 제외 (조각/깃발 자체는 정상)
        .not("hidden_from_guide", "is", true)
        .order("google_review_count", { ascending: false, nullsFirst: false })
        .limit(200);
      if (!alive || !data) return;
      const arr = (data as unknown as (ClubStat & { club_partners: { md_id: string }[] | null })[]).map(
        (c) => ({ ...c, has_md: (c.club_partners?.length ?? 0) > 0 }),
      );
      setBrowse(arr);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 지역 필터 — 상위(PuzzleForm) 지역 선택과 연동. 특정 지역이면 그 지역만, 미선택/"서울 어디든"이면 서울 3권역.
  const areaScoped = useMemo(() => {
    if (area && (MAIN_AREAS as readonly string[]).includes(area)) {
      return browse.filter((c) => c.area === area);
    }
    return browse.filter((c) => SEOUL_AREAS.includes(c.area));
  }, [browse, area]);

  // 이태원 큐레이션 후보 — 매 로드마다 서로 순서만 섞음(노출 다양성). 하이드레이션 안전을 위해
  // 초기값은 미셔플(서버와 동일), 마운트 후 useEffect에서만 섞음 (ForeignRequestForm과 동일 패턴).
  const curatedItaewon = useMemo(
    () =>
      ITAEWON_RECOMMEND_CURATED
        .map((name) => browse.find((c) => c.area === "이태원" && c.name === name))
        .filter((c): c is ClubStat => Boolean(c)),
    [browse],
  );
  const [shuffledCurated, setShuffledCurated] = useState(curatedItaewon);
  useEffect(() => {
    const arr = [...curatedItaewon];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setShuffledCurated(arr);
  }, [curatedItaewon]);

  // 정렬: 추천순(담당 MD 우선+리뷰순, 이태원 큐레이션 고정 상단) / 리뷰 많은순 / 평점순 — foreignSort.ts와 동일 규칙.
  // 큐레이션은 추천순에만 적용(리뷰/평점순은 순수 정렬 유지), areaScoped에 포함된 것만(지역 필터 존중).
  const sortedBrowse = useMemo(() => {
    if (sortKey === "recommend") {
      const areaScopedIds = new Set(areaScoped.map((c) => c.id));
      const curated = shuffledCurated.filter((c) => areaScopedIds.has(c.id));
      const curatedIds = new Set(curated.map((c) => c.id));
      const rest = areaScoped.filter((c) => !curatedIds.has(c.id)).sort(recommendCompare);
      return [...curated, ...rest];
    }
    const arr = [...areaScoped];
    arr.sort((a, b) =>
      sortKey === "rating"
        ? (b.google_rating ?? 0) - (a.google_rating ?? 0)
        : (b.google_review_count ?? 0) - (a.google_review_count ?? 0),
    );
    return arr;
  }, [areaScoped, sortKey, shuffledCurated]);

  // 지역 바뀌면 더보기 진행도도 초기화
  useEffect(() => {
    setBrowseVisible(BROWSE_STEP);
  }, [area]);

  // 정렬 탭 바뀌면 더보기 진행도 초기화
  useEffect(() => {
    setBrowseVisible(BROWSE_STEP);
  }, [sortKey]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      const q = query.trim();
      const supabase = createClient();
      const aliasIds = findClubIdsByAlias(q);
      const sel = "id, name, area, thumbnail_url";

      const [nameRes, aliasRes] = await Promise.all([
        supabase.from("clubs").select(sel).ilike("name", `%${q}%`).is("deleted_at", null).limit(8),
        aliasIds.length > 0
          ? supabase.from("clubs").select(sel).in("id", aliasIds).is("deleted_at", null)
          : Promise.resolve({ data: [] as ClubLite[] }),
      ]);

      const seen = new Set<string>();
      const merged: ClubLite[] = [];
      for (const c of [...((nameRes.data ?? []) as ClubLite[]), ...((aliasRes.data ?? []) as ClubLite[])]) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        merged.push(c);
        if (merged.length >= 8) break;
      }
      setResults(merged);
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const isSelected = (id: string) => value.some((v) => v.kind === "club" && v.club.id === id);

  // 선택/해제 토글 — 카드·검색결과·상세시트 공용 단일 진입점. 선택된 클럽은 목록에서 사라지지 않고
  // 계속 보이며(체크 표시로 상태만 바뀜), 최대치를 채워도 목록/검색은 안 닫힘(토스트로만 안내).
  function toggleClub(club: ClubLite) {
    if (isSelected(club.id)) {
      onChange(value.filter((v) => !(v.kind === "club" && v.club.id === club.id)));
      return;
    }
    if (atMax) {
      toast(`최대 ${max}개까지 선택할 수 있어요`);
      return;
    }
    onChange([...value, { kind: "club", club }]);
    toast.success("선택됐어요");
    setQuery("");
    setResults([]);
  }

  function addWish(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (atMax) return;
    const n = norm(trimmed);
    // 이미 선택된 클럽/위시와 이름 중복 방지
    const dup = value.some(
      (v) => (v.kind === "wish" && norm(v.name) === n) || (v.kind === "club" && norm(v.club.name) === n),
    );
    if (dup) return;
    onChange([...value, { kind: "wish", name: trimmed, area: null }]);
    setQuery("");
    setResults([]);
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  // 클럽 상세 시트 (ForeignClubDetailPanel 그대로 재사용) — 카드 탭하면 오픈, 같은 목록 안에서
  // "다음" 버튼 또는 좌우 스와이프로 옆 클럽으로 이동. ForeignRequestForm의 Browse 상세와 동일 UX.
  const detailTouchStartXRef = useRef<number | null>(null);
  const [detailList, setDetailList] = useState<ClubStat[]>([]);
  const [detailIndex, setDetailIndex] = useState(0);
  const detailClub = detailList[detailIndex] ?? null;
  const openDetail = (list: ClubStat[], club: ClubStat) => {
    const idx = list.findIndex((c) => c.id === club.id);
    setDetailList(list);
    setDetailIndex(idx >= 0 ? idx : 0);
  };
  const closeDetail = () => setDetailList([]);
  const hasNextDetail = detailIndex < detailList.length - 1;
  const goPrevDetail = () => setDetailIndex((i) => Math.max(i - 1, 0));
  const goNextDetail = () => setDetailIndex((i) => Math.min(i + 1, detailList.length - 1));

  const q = query.trim();
  // 이미 결과에 정확히 있는 이름이면 "추가 요청" 버튼 숨김
  const exactInResults = results.some((c) => norm(c.name) === norm(q));
  const alreadySelected = value.some(
    (v) => (v.kind === "wish" && norm(v.name) === norm(q)) || (v.kind === "club" && norm(v.club.name) === norm(q)),
  );
  const showAddWish = q.length > 0 && !searching && !exactInResults && !alreadySelected && !atMax;

  return (
    <div>
      {/* 선택된 항목 — ForeignRequestForm과 동일한 amber 필칩 (이미지 없음) */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {value.map((item, idx) => (
            <span
              key={idx}
              className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-brand-amber text-[13px] font-bold"
            >
              {item.kind === "club" ? item.club.name : item.name}
              {item.kind === "wish" && <span className="text-[10px] font-bold opacity-70">(요청)</span>}
              <button type="button" onClick={() => removeAt(idx)} aria-label="삭제">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 정렬 탭 + 클럽 카드 캐러셀 (외국인 트랙 ForeignRequestForm 포팅 — 한국어 고정, 최대 3개).
          선택해도 목록에서 안 사라짐(체크 표시로만 상태 반영), 3개 다 차도 안 닫힘(더 못 담을 때만 토스트). */}
      {(sortedBrowse.length > 0 || sortKey !== "recommend") && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            {SORT_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSortKey(tab.key)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                  sortKey === tab.key ? "bg-inverse text-inverse-foreground" : "bg-muted text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* key: 정렬/지역 바뀌면 DOM 리마운트 → scrollLeft 리셋 (안 그러면 리스트만 바뀌고 스크롤 위치는
              브라우저가 그대로 들고 있어서 처음 몇 개가 화면 밖으로 밀려남, ForeignRequestForm과 동일 이슈) */}
          <div key={`${sortKey}-${area}`} className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 snap-x">
            {sortedBrowse.slice(0, browseVisible).map((c) => {
              const selected = isSelected(c.id);
              return (
              // 썸네일 탭 = 상세시트, 우상단 체크 버튼 탭 = 선택/해제 (ForeignRequestForm ClubCard와 동일)
              <div key={c.id} className="shrink-0 w-[100px] snap-start select-none">
                <div className={`relative w-[100px] h-[100px] rounded-2xl overflow-hidden bg-card border-2 ${selected ? "border-amber-500" : "border-border"}`}>
                  <button
                    type="button"
                    onClick={() => openDetail(sortedBrowse, c)}
                    aria-label={`${c.name} — 상세정보`}
                    className="block w-full h-full text-left active:opacity-70 transition-opacity"
                  >
                    {c.thumbnail_url ? (
                      <Image
                        src={thumb(c.thumbnail_url, 144)!}
                        alt={c.name}
                        fill
                        sizes="100px"
                        unoptimized
                        loading="eager"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-foreground/40 text-lg font-black">
                        {c.name.charAt(0)}
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleClub(c)}
                    aria-label={selected ? "선택 해제" : "선택"}
                    aria-pressed={selected}
                    className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                      selected ? "bg-amber-500" : "bg-black/45 border border-white/50 hover:bg-black/65"
                    }`}
                  >
                    {selected ? <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} /> : <Plus className="w-3.5 h-3.5 text-white" />}
                  </button>
                </div>
                <p className="text-[13px] font-bold text-foreground mt-1.5 truncate">{c.name}</p>
                {c.google_review_count != null && (
                  <p className="text-[11px] text-muted-foreground">{c.google_review_count.toLocaleString()} 리뷰</p>
                )}
              </div>
              );
            })}
            {browseVisible < sortedBrowse.length && (
              <button
                onClick={() => setBrowseVisible((v) => v + BROWSE_STEP)}
                className="shrink-0 w-[100px] h-[100px] rounded-2xl border border-dashed border-border flex items-center justify-center text-[12px] font-bold text-muted-foreground hover:bg-card"
              >
                더보기
              </button>
            )}
          </div>
        </div>
      )}

      {/* 검색 — footerAction 있으면 좌우 분할(검색 / 상관없어요 등). 최대치 채워도 안 숨김(토글로 해제 가능해야 함) */}
      <div>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={40}
                placeholder="클럽 이름으로 검색"
                className="w-full h-11 bg-background border border-border rounded-xl pl-9 pr-3 text-[14px] text-foreground placeholder-neutral-600 focus:outline-none focus:border-border"
              />
            </div>
            {footerAction}
          </div>

          {searching && <p className="mt-2 text-[12px] text-muted-foreground">검색 중...</p>}

          {!searching && results.length > 0 && (
            <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleClub(c)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-card text-left"
                >
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-card shrink-0">
                    {c.thumbnail_url ? (
                      <Image src={thumb(c.thumbnail_url, 96)!} alt={c.name} fill sizes="40px" unoptimized className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-foreground/40 text-sm font-black">
                        {c.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-foreground truncate">{c.name}</div>
                    <div className="text-[12px] text-muted-foreground">{c.area}</div>
                  </div>
                  {isSelected(c.id) && <Check className="w-4 h-4 text-brand-amber shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* 미등록 클럽 자유입력 (영업 리드) */}
          {showAddWish && (
            <button
              onClick={() => addWish(q)}
              className="mt-2 w-full flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 text-left"
            >
              <span className="text-[13px] text-brand-amber flex-1">
                <span className="font-bold">&lsquo;{q}&rsquo;</span>가 안보이나요? 추가요청하기
              </span>
              <Plus className="w-4 h-4 text-brand-amber shrink-0" />
            </button>
          )}
      </div>

      {/* 클럽 상세 (카드 탭해서 오픈) — ForeignRequestForm과 동일한 상세 UI를 그대로 재사용.
          같은 목록(detailList) 안에서 "다음" 버튼 또는 좌우 스와이프로 옆 클럽으로 이동. */}
      <Sheet open={!!detailClub} onOpenChange={(o) => !o && closeDetail()}>
        <SheetContent
          side="bottom"
          className="bg-card border-border rounded-t-3xl max-h-[88vh] overflow-y-auto p-0"
          onTouchStart={(e) => {
            detailTouchStartXRef.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const startX = detailTouchStartXRef.current;
            detailTouchStartXRef.current = null;
            if (startX == null) return;
            const deltaX = e.changedTouches[0].clientX - startX;
            const SWIPE_THRESHOLD = 60;
            if (deltaX > SWIPE_THRESHOLD) goPrevDetail();
            else if (deltaX < -SWIPE_THRESHOLD) goNextDetail();
          }}
        >
          {detailClub && (
            <>
              <SheetTitle className="sr-only">{detailClub.name}</SheetTitle>
              <ForeignClubDetailPanel
                club={detailClub}
                lang="ko"
                showSave={false}
                cta={
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        toggleClub(detailClub);
                        closeDetail();
                      }}
                      className={`flex-[7] flex items-center justify-center gap-1.5 py-3.5 rounded-xl font-black text-[15px] transition-colors ${
                        isSelected(detailClub.id)
                          ? "bg-muted text-foreground/80 hover:bg-muted"
                          : "bg-amber-500 text-black hover:bg-amber-400"
                      }`}
                    >
                      {isSelected(detailClub.id) ? (
                        <>
                          <Check className="w-4 h-4" /> 선택 해제
                        </>
                      ) : (
                        "이 클럽 선택하기"
                      )}
                    </button>
                    {hasNextDetail && (
                      <button
                        type="button"
                        onClick={goNextDetail}
                        className="flex-[3] flex items-center justify-center gap-1 py-3.5 rounded-xl font-black text-[15px] bg-card border border-border text-foreground hover:bg-muted transition-colors"
                      >
                        다음
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                }
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
