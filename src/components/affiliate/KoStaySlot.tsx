"use client";

// 한국어 페이지 숙소 광고(2026-10-30, 쿠팡 → 아고다 전면 교체). 페이지 문맥별 3가지:
// - night    클럽 상세·라인업·목록: 서울은 귀가 문제("새벽에 빈방 찾아 뺑뺑이 돌지 말고" 등), 원정은 자고 갈 이유 — 방문마다 3개 중 하나
// - event    공연 상세·아티스트: "공연 날 근처 방은 먼저 차요" — 공연 날짜로 미리 채움 + D-day
// - festival 페스티벌·며칠짜리·지방 공연: "가까워질수록 비싸져요" — 인원 고르면 인당 가격
// 큐레이션 숙소가 없는 도시(인천·대구 등)는 숙소 카드 대신 그 도시 아고다 페이지 버튼 하나.
// ⚠️ "남은 방 N개" 같은 거짓 희소성은 쓰지 않는다 — 실제 재고를 모른다. 일반적 사실과 D-day만.

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AD_LABEL, AGODA_DISCLOSURE, isSeoulArea, toAffArea } from "@/lib/affiliate/config";
import {
  AREA_LABEL,
  HOTELS,
  TIER_LABEL,
  agodaAreaUrl,
  agodaCityUrl,
  agodaHotelUrl,
  koCityStay,
  orderHotelsKo,
  walkMinutes,
  type CuratedHotel,
  type StayQuery,
} from "@/lib/affiliate/agoda";
import { AdBadge } from "./CoupangSlot";
import { trackAdClick, useAdImpression } from "./useAdTracking";
import { useCityStays, useLiveStays, type LiveStay } from "./useLiveStays";

export type KoStayVariant = "night" | "event" | "festival";

export interface KoStaySlotProps {
  variant: KoStayVariant;
  placement: string;
  /** 클럽 area 또는 공연 venue_area */
  area?: string | null;
  /** 클럽 상세면 이름·좌표 — 도보 시간과 정렬 기준 */
  club?: { name: string; lat?: number | null; lng?: number | null } | null;
  /** 공연 날짜(YYYY-MM-DD) — event·festival */
  date?: string | null;
  /** 목록 페이지용 한 줄 띠(쿠팡 band 자리 그대로) — 숙소 카드 줄은 목록 사이에서 너무 두껍다(2026-10-30 운영자) */
  compact?: boolean;
  className?: string;
}

const PEOPLE = [2, 4, 6, 8] as const;
/** 도보 꼬리표는 이만큼 가까울 때만 — 강남 Club Ace는 제일 가까운 숙소도 24분이라 "도보 24분"은 역효과였다 */
const WALK_BADGE_MAX = 15;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** 영업일 기준 오늘(KST, 새벽 6시 전이면 전날) — 새벽 2시에 보는 "오늘 밤"은 어젯밤부터 이어진 밤이다 */
function tonightKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - 6 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/**
 * 클럽 페이지 날짜 칩 — "오늘 밤"으로 못 박으면 내일·주말 갈 곳을 미리 보는 사람에겐 틀린 링크다(2026-10-30 운영자).
 * 오늘·내일 + 그 뒤 첫 토요일(내일이 토요일이면 생략).
 */
function nightDays(): { iso: string; label: string }[] {
  const today = tonightKst();
  const days = [
    { iso: today, label: "오늘" },
    { iso: addDaysIso(today, 1), label: "내일" },
  ];
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const toSat = (6 - dow + 7) % 7;
  if (toSat >= 2) {
    const sat = addDaysIso(today, toSat);
    const d = new Date(`${sat}T12:00:00Z`);
    days.push({ iso: sat, label: `토 ${d.getUTCMonth() + 1}/${d.getUTCDate()}` });
  }
  return days;
}
function dateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})`;
}
function dDay(iso: string): string | null {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const n = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (n < 0) return null;
  return n === 0 ? "D-DAY" : `D-${n}`;
}
const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

/**
 * 클럽·목록 문구 — 한 문구로 고정하면 광고 티가 나고 질린다(2026-10-30 운영자). 방문마다 돌리고 angle로 남긴다.
 * 서울 = 그날 밤 귀가 문제, 원정(부산·대구·대전·인천 등) = 멀리 왔으니 자고 가는 이유.
 */
const NIGHT_LINES_SEOUL = ["새벽에 빈방 찾아 뺑뺑이 돌지 말고", "첫차까지 버티지 말고, 근처에서 눕기", "끝나고 택시 전쟁 하지 말고"];
const nightLinesAway = (c: string) => [`${c}까지 왔으면 자고 가야지`, `${c} 원정, 막차 걱정 없이 놀기`, `당일치기는 아깝잖아, ${c}에서 하룻밤`];

/** 도시 검색 결과(LiveStay)를 카드가 쓰는 CuratedHotel 모양으로 — 성급으로 등급을 정한다 */
function fromLive(x: LiveStay): CuratedHotel {
  const stars = x.stars ?? 0;
  return {
    area: "seoul",
    name: { ko: x.name, en: x.name },
    tier: stars >= 5 ? "luxury" : stars >= 4 ? "upscale" : "mid",
    tags: { ko: stars ? `${stars}성` : "호텔", en: stars ? `${stars}-star` : "Hotel" },
    walkMin: null,
    hid: x.hid,
    image: x.image ?? undefined,
    rating: x.rating ?? undefined,
    reviews: x.reviews ?? undefined,
  };
}

export function KoStaySlot({ variant, placement, area, club, date, compact = false, className = "" }: KoStaySlotProps) {
  const affArea = toAffArea(area);
  // 큐레이션이 있는 곳: 홍대·이태원·강남·부산 + 서울 다른 동네(서울 숙소 섞어서)
  const listArea =
    affArea === "hongdae" || affArea === "itaewon" || affArea === "gangnam" || affArea === "busan"
      ? affArea
      : isSeoulArea(area)
        ? "seoul"
        : null;
  const city = listArea ? null : koCityStay(area);
  // 원정 손님(서울 밖) — 문구가 다르다
  const away = listArea === "busan" || !!city;

  const [people, setPeople] = useState<number>(4);
  const days = useMemo(() => nightDays(), []);
  const [dayIdx, setDayIdx] = useState(0);
  // 문구는 마운트 후 고른다(서버 렌더와 어긋나지 않게 처음엔 0번)
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => setLineIdx(Math.floor(Math.random() * 3)), []);
  const adults = variant === "festival" ? people : 2;
  const checkIn = variant === "night" ? days[dayIdx].iso : date ?? null;
  const stay: StayQuery = { checkIn, nights: 1, adults, rooms: variant === "festival" ? Math.ceil(people / 4) : 1 };

  // 큐레이션 없는 도시는 서버가 도시 검색으로 고른 숙소(가격 포함)를 카드로 쓴다
  const cityStays = useCityStays(city?.live ? city.key : "", stay, !!city?.live);

  const hasClubPos = club?.lat != null && club?.lng != null;
  const all = useMemo(() => {
    if (!listArea) return cityStays.map((x) => ({ h: fromLive(x), walk: null as number | null }));
    // 호스텔(도미토리·캡슐)은 뺀다 — 둘이 들어갈 방이 아니다(2026-10-30 운영자). 외국어 AgodaStrip은 그대로.
    const pool = HOTELS.filter(
      (h) =>
        h.image &&
        !/호스텔/.test(h.name.ko + h.tags.ko) &&
        (listArea === "seoul" ? ["hongdae", "itaewon", "gangnam"].includes(h.area) : h.area === listArea),
    );
    if (hasClubPos) {
      return pool
        .map((h) => ({ h, walk: h.lat != null && h.lng != null ? walkMinutes(club!.lat!, club!.lng!, h.lat, h.lng) : null }))
        .sort((a, b) => (a.walk ?? 999) - (b.walk ?? 999));
    }
    return orderHotelsKo(pool).map((h) => ({ h, walk: null }));
  }, [listArea, hasClubPos, club?.lat, club?.lng, cityStays]);


  const curatedLive = useLiveStays(listArea ?? "", stay, !!listArea);
  const live = useMemo(
    () => (listArea ? curatedLive : new Map(cityStays.map((x) => [x.hid, x] as const))),
    [listArea, curatedLive, cityStays],
  );
  const priceOf = (h: CuratedHotel) => (h.hid ? live.get(h.hid)?.price ?? null : null);
  // 가격은 보이는 카드 전부에 있을 때만 — 숫자와 "최저가" 문구가 섞이면 어색하다(AgodaStrip과 같은 규칙)
  const allPriced = (list: CuratedHotel[]) => list.length > 0 && list.every((h) => priceOf(h) != null);
  // 아고다는 빈방 있는 숙소만 가격을 준다 — 가격이 하나라도 왔으면 안 온 곳(그날 만실·미응답)은 뺀다.
  // 그래야 남은 카드 전부에 가격이 붙는다(가격 없는 카드는 아무도 안 누른다, 2026-10-30 운영자).
  // 정렬: 걸어서 WALK_BADGE_MAX분 안을 먼저, 그 안에선 싼 순 — "가까운 순"만 하면 클럽 옆 고급 호텔(30~60만)이
  // 앞을 다 차지했다(2026-10-30 운영자 "너무 비싸"). 가격이 없으면 원래 순서 유지.
  const visible = (() => {
    const avail = all.filter((x) => priceOf(x.h) != null);
    if (avail.length === 0) return all;
    const near = (x: { walk: number | null }) => (x.walk != null && x.walk > WALK_BADGE_MAX ? 1 : 0);
    return avail.slice().sort((a, b) => near(a) - near(b) || (priceOf(a.h) ?? 0) - (priceOf(b.h) ?? 0));
  })();
  const shown = visible;
  const hrefOf = (h: CuratedHotel) => (h.hid && live.get(h.hid)?.landingUrl) || agodaHotelUrl(h, stay, "ko");
  const imgOf = (h: CuratedHotel) => (h.hid && live.get(h.hid)?.image) || h.image || "";

  const trackBase = {
    ad_id: "aff_agoda",
    placement,
    area: affArea,
    items: all.length ? all.map((x) => x.h.hid ?? x.h.name.en).join(",") : city?.label ?? "",
    variant: `ko_${variant}`,
    angle: variant === "night" ? `${away ? "away" : "seoul"}${lineIdx}` : undefined,
  };
  const ref = useAdImpression<HTMLDivElement>(listArea || city ? trackBase : null);
  if (!listArea && !city) return null;
  if (listArea && all.length === 0) return null;

  const areaName = listArea === "seoul" ? "홍대·이태원·강남" : listArea ? AREA_LABEL[listArea].ko : city!.label;
  const dd = variant !== "night" && date ? dDay(date) : null;
  const when = checkIn ? dateLabel(checkIn) : "";

  const nightLine = (away ? nightLinesAway(areaName) : NIGHT_LINES_SEOUL)[lineIdx];
  const title =
    variant === "night"
      ? nightLine
      : variant === "event"
        ? "공연 날 근처 방은 먼저 차요"
        : "페스티벌 주말은 가까워질수록 비싸져요";
  const subtitle =
    variant === "night"
      ? club ? `${club.name} 근처 · 싼 순` : `${areaName} 근처 · 싼 순`
      : variant === "event"
        ? `${areaName} · ${when} 체크인 · 무료 취소 되는 방으로 미리`
        : "지금 잡고, 일정 바뀌면 무료 취소 되는 방으로";

  const areaHref = city ? agodaCityUrl(city.url, stay) : agodaAreaUrl(listArea === "seoul" ? "seoul" : affArea, stay, "ko");
  const clickArea = (target: string) => trackAdClick({ ...trackBase, item_id: city?.label ?? areaName, position: 0, target });

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[15px] font-extrabold leading-snug text-foreground">{title}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>
      </div>
      {dd && (
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-black text-black">{dd}</span>
      )}
    </div>
  );

  const peoplePicker = variant === "festival" && (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
      {PEOPLE.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setPeople(n)}
          className={`min-h-[36px] rounded-lg text-[12.5px] font-bold ${people === n ? "bg-white text-black" : "text-muted-foreground"}`}
        >
          {n}명
        </button>
      ))}
    </div>
  );

  const cta = (label: string, target: string) => (
    <a
      href={areaHref}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      onClick={() => clickArea(target)}
      className="flex min-h-[48px] items-center justify-center rounded-xl bg-white text-[14px] font-black text-black"
    >
      {label}
    </a>
  );

  let body: React.ReactNode;
  if (city && all.length === 0) {
    // 큐레이션 없는 도시인데 API 결과도 없을 때(키 없음·광주 등) — 엉뚱한 서울 숙소 대신 그 도시 페이지로
    body = (
      <div className="flex flex-col gap-3 p-3.5">
        {header}
        {peoplePicker}
        {cta(`${city.label} 숙소 최저가 확인하기`, "agoda_city")}
      </div>
    );
  } else if (variant === "night" && compact) {
    // 목록 페이지 — 쿠팡 band와 같은 높이 안에 숙소 사진·이름·가격을 가로로(2026-10-30 운영자: "가격 볼 수 있게, 이 크기에 딱").
    // 가격은 오늘 기준(라벨에 "오늘"), 링크는 날짜 없이 보내 손님이 아고다에서 날짜를 고른다.
    // 싼 순 — 목록 띠는 기준 클럽이 없으니 가격이 첫 번째 이유다
    const tiles = visible
      .slice()
      .sort((a, b) => (priceOf(a.h) ?? Infinity) - (priceOf(b.h) ?? Infinity))
      .slice(0, 8);
    const priced = allPriced(tiles.map((x) => x.h));
    return (
      <div ref={ref} className={className}>
        {/* 문구는 띠 위 한 줄 제목으로 — 띠 안엔 숙소만(2026-10-30 운영자: 글자 칸이 자리 먹는 게 싫다) */}
        <p className="mb-1.5 flex items-baseline gap-1.5 px-0.5">
          <span className="truncate text-[13px] font-extrabold text-foreground md:text-[14px]">{nightLine}</span>
          <span className="shrink-0 text-[11.5px] text-muted-foreground">{areaName}</span>
        </p>
        <div className="flex items-center gap-2.5 overflow-x-auto rounded-2xl border border-border bg-card px-3 py-2.5 scrollbar-hide md:gap-3 md:px-4 md:py-3">
          {tiles.map(({ h }, i) => {
            const p = priced ? priceOf(h) : null;
            return (
              <a
                key={h.hid ?? h.name.en}
                href={agodaHotelUrl(h, { adults: 2 }, "ko")}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                onClick={() => trackAdClick({ ...trackBase, item_id: String(h.hid ?? h.name.en), position: i + 1, target: "agoda_hotel" })}
                className="flex w-[150px] shrink-0 items-center gap-2 md:w-[180px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgOf(h)} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-[9px] object-cover md:h-12 md:w-12" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[12.5px] font-extrabold text-foreground md:text-[13.5px]">{h.name.ko}</span>
                  <span className="truncate text-[11.5px] font-bold text-foreground md:text-[12.5px]">
                    {p ? <>오늘 {won(p)}</> : <span className="text-muted-foreground">최저가 보기 ›</span>}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-muted-foreground/80">
          <span className="truncate">{AGODA_DISCLOSURE.ko}</span>
          <AdBadge label={AD_LABEL.ko} small />
        </p>
      </div>
    );
  } else if (variant === "night") {
    const nightPriced = allPriced(shown.map((x) => x.h));
    body = (
      <div className="pb-3.5 pt-3">
        <div className="px-3.5">{header}</div>
        <div className="mb-2.5 mt-2.5 flex gap-1.5 px-3.5">
          {days.map((d, i) => (
            <button
              key={d.iso}
              type="button"
              onClick={() => setDayIdx(i)}
              className={`min-h-[32px] rounded-full px-3 text-[12px] font-bold ${
                dayIdx === i ? "bg-white text-black" : "border border-border bg-muted text-foreground"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3.5 scrollbar-hide">
          {shown.map(({ h, walk }, i) => {
            const p = nightPriced ? priceOf(h) : null;
            return (
              <a
                key={h.hid ?? h.name.en}
                href={hrefOf(h)}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                onClick={() => trackAdClick({ ...trackBase, item_id: String(h.hid ?? h.name.en), position: i + 1, target: "agoda_hotel" })}
                className="w-[calc((100%-10px)/2)] shrink-0 snap-start md:w-[calc((100%-20px)/3)]"
              >
                <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgOf(h)} alt={h.name.ko} loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] font-extrabold text-white">
                    {/* 도보 시간은 기준점(클럽)이 있을 때만 — 기준 없는 "도보 N분"은 모호하다(2026-10-22) */}
                    {walk != null && walk <= WALK_BADGE_MAX && club ? `${club.name}에서 도보 ${walk}분` : h.tags.ko}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-[13.5px] font-extrabold text-foreground">{h.name.ko}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {h.rating ? (
                    <>
                      <span className="text-amber-400">★</span> {h.rating.toFixed(1)}
                      {h.reviews ? ` (${h.reviews.toLocaleString("en-US")})` : ""} · {TIER_LABEL[h.tier].ko}
                    </>
                  ) : (
                    TIER_LABEL[h.tier].ko
                  )}
                </p>
                <p className="mt-0.5 flex items-center text-[12.5px] font-extrabold text-foreground">
                  {p ? won(p) : "최저가 확인하기"}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </p>
              </a>
            );
          })}
        </div>
      </div>
    );
  } else if (variant === "event") {
    const top = visible.slice(0, 3);
    const topPriced = allPriced(top.map((x) => x.h));
    body = (
      <div className="flex flex-col gap-3 p-3.5">
        {header}
        <div className="grid grid-cols-3 gap-1.5">
          {[["체크인", when], ["기간", "1박"], ["인원", "2명"]].map(([k, v]) => (
            <div key={k} className="flex min-h-[48px] flex-col justify-center rounded-xl border border-border bg-muted px-2.5">
              <span className="text-[10.5px] text-muted-foreground">{k}</span>
              <span className="text-[13px] font-extrabold text-foreground">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          {top.map(({ h }, i) => {
            const p = topPriced ? priceOf(h) : null;
            return (
              <a
                key={h.hid ?? h.name.en}
                href={hrefOf(h)}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                onClick={() => trackAdClick({ ...trackBase, item_id: String(h.hid ?? h.name.en), position: i + 1, target: "agoda_hotel" })}
                className={`flex items-center gap-3 py-2.5 ${i < top.length - 1 ? "border-b border-border" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgOf(h)} alt={h.name.ko} loading="lazy" className="h-16 w-[84px] shrink-0 rounded-xl object-cover" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] font-extrabold text-foreground">{h.name.ko}</span>
                  <span className="truncate text-[11.5px] text-muted-foreground">
                    {h.rating ? (
                      <>
                        <span className="text-amber-400">★</span> {h.rating.toFixed(1)} · {h.tags.ko}
                      </>
                    ) : (
                      h.tags.ko
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center text-[12.5px] font-extrabold text-foreground">
                  {p ? won(p) : "최저가"}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </a>
            );
          })}
        </div>
        {cta(`${when} ${areaName} 최저가 확인하기`, "agoda_area")}
      </div>
    );
  } else {
    // festival — 레지던스를 앞에(일행이 한 방에)
    const ordered = [...visible.filter((x) => x.h.tier === "residence"), ...visible.filter((x) => x.h.tier !== "residence")];
    const [hero, ...rest] = ordered;
    const festPriced = allPriced([hero, ...rest.slice(0, 2)].map((x) => x.h));
    const perHead = (h: CuratedHotel) => {
      const p = festPriced ? priceOf(h) : null;
      return p ? `인당 ${won(Math.ceil(p / people / 1000) * 1000)}` : "인당 최저가 확인";
    };
    body = (
      <div className="flex flex-col gap-3 p-3.5">
        {header}
        {peoplePicker}
        <a
          href={hrefOf(hero.h)}
          target="_blank"
          rel="sponsored nofollow noopener noreferrer"
          onClick={() => trackAdClick({ ...trackBase, item_id: String(hero.h.hid ?? hero.h.name.en), position: 1, target: "agoda_hotel" })}
          className="block"
        >
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgOf(hero.h)} alt={hero.h.name.ko} loading="lazy" className="h-full w-full object-cover" />
            <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-extrabold text-white">
              {hero.h.tags.ko}
            </span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-2.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[14.5px] font-extrabold text-foreground">{hero.h.name.ko}</span>
              {hero.h.rating && (
                <span className="text-[11.5px] text-muted-foreground">
                  <span className="text-amber-400">★</span> {hero.h.rating.toFixed(1)}
                  {hero.h.reviews ? ` (${hero.h.reviews.toLocaleString("en-US")})` : ""} · {TIER_LABEL[hero.h.tier].ko}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center text-[12.5px] font-extrabold text-foreground">
              {perHead(hero.h)}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        </a>
        {rest.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {rest.slice(0, 2).map(({ h }, i) => (
              <a
                key={h.hid ?? h.name.en}
                href={hrefOf(h)}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                onClick={() => trackAdClick({ ...trackBase, item_id: String(h.hid ?? h.name.en), position: i + 2, target: "agoda_hotel" })}
                className="flex min-w-0 items-center gap-2 rounded-xl bg-muted p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgOf(h)} alt={h.name.ko} loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[12px] font-extrabold text-foreground">{h.name.ko}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{perHead(h)}</span>
                </span>
              </a>
            ))}
          </div>
        )}
        {cta(`${people}명 최저가 확인하기`, "agoda_area")}
      </div>
    );
  }

  return (
    <div ref={ref} className={className}>
      <div className="rounded-2xl border border-border bg-card">{body}</div>
      {/* Ad 배지는 고지 문구 옆에 작게(2026-10-22 운영자) */}
      <p className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-muted-foreground/80">
        <span className="truncate">{AGODA_DISCLOSURE.ko}</span>
        <AdBadge label={AD_LABEL.ko} small />
      </p>
    </div>
  );
}
