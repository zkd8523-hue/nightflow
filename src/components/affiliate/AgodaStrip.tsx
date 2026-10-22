"use client";

// 아고다 숙소 가로 스크롤(외국어 B안 확정 + 한국어 강남·부산·페스티벌).
// 큐레이션 숙소가 있으면 숙소 카드 + 가격대 칩, 없으면 지역 검색 카드 한 장으로 대체.
// 사진·가격은 Lite API 연결 후 채운다 — 지금은 이름·태그·도보 시간·"가격 보기".

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, BedDouble } from "lucide-react";
import { AD_LABEL, AGODA_DISCLOSURE, toAffArea, type AffLang } from "@/lib/affiliate/config";
import {
  HOTELS,
  TIER_LABEL,
  agodaHotelUrl,
  orderHotels,
  stayHeadline,
  STAY_ANGLES,
  type StayAngle,
  type HotelTier,
  type StayQuery,
} from "@/lib/affiliate/agoda";
import { AdBadge } from "./CoupangSlot";
import { trackAdClick, useAdImpression } from "./useAdTracking";

const COPY: Record<AffLang, { all: string; see: string }> = {
  ko: { all: "전체", see: "가격 보기"  },
  en: { all: "All", see: "See price"  },
  ja: { all: "すべて", see: "料金を見る"  },
  zh: { all: "全部", see: "查看价格"  },
  "zh-tw": { all: "全部", see: "查看價格"  },
};

const TIER_GRADIENT: Record<HotelTier, string> = {
  budget: "from-emerald-700 to-teal-900",
  mid: "from-sky-700 to-indigo-900",
  residence: "from-violet-700 to-purple-900",
  upscale: "from-amber-600 to-orange-900",
  luxury: "from-rose-700 to-fuchsia-950",
};

const FILTERS: { key: "all" | "budget" | "mid" | "high"; tiers: HotelTier[] }[] = [
  { key: "all", tiers: [] },
  { key: "budget", tiers: ["budget"] },
  { key: "mid", tiers: ["mid", "residence"] },
  { key: "high", tiers: ["upscale", "luxury"] },
];
const FILTER_LABEL: Record<AffLang, Record<"budget" | "mid" | "high", string>> = {
  ko: { budget: "가성비", mid: "중간", high: "고급" },
  en: { budget: "Budget", mid: "Mid", high: "Upscale" },
  ja: { budget: "格安", mid: "スタンダード", high: "高級" },
  zh: { budget: "经济", mid: "中档", high: "高档" },
  "zh-tw": { budget: "經濟", mid: "中價", high: "高檔" },
};

interface LiveStay {
  hid: number; name: string; image: string | null; price: number | null;
  rating: number | null; reviews: number | null; landingUrl: string | null;
}

export interface AgodaStripProps {
  lang: AffLang;
  placement: string;
  area?: string | null;
  /** 없으면 지역·언어별 기본 제목(stayHeadline) */
  title?: string;
  subtitle?: string;
  stay?: StayQuery;
  className?: string;
  /** 제목 각도. 없으면 방문마다 섞어 클릭률을 비교한다(이벤트에 angle이 찍힌다) */
  angle?: StayAngle;
  /** 가격대 필터 칩. 기준점이 없는 넓은 자리(홈·액티비티)에선 끈다 */
  showFilters?: boolean;
}

export function AgodaStrip({ lang, placement, area, title, subtitle, stay = {}, className = "", showFilters = true, angle: forcedAngle }: AgodaStripProps) {
  const affArea = toAffArea(area);
  const t = COPY[lang];
  // 각도는 마운트 후 정한다(서버 렌더와 어긋나지 않게 처음엔 taxi). 강제 지정이 없으면 세 가지를 섞는다.
  const [angle, setAngle] = useState<StayAngle>(forcedAngle ?? "taxi");
  useEffect(() => {
    setAngle(forcedAngle ?? STAY_ANGLES[Math.floor(Math.random() * STAY_ANGLES.length)]);
  }, [forcedAngle]);
  const scroller = useRef<HTMLDivElement | null>(null);
  const slide = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  // 사진이 없는 숙소는 숨긴다 — 색 카드로 대신하면 아무도 안 본다(2026-10-22 운영자). 사진은 Hotel Data File에서.
  // 지역을 못 정하는 페이지는 서울 전체(홍대·이태원·강남 섞어서)를 보여준다 — 홍대로 한정하지 않는다(2026-10-22). "All hotels near Seoul" 같은
  // 검색 카드는 눈에도 안 띄고 가치가 없어 쓰지 않는다(2026-10-22 운영자 결정).
  const listArea = affArea === "other" ? "seoul" : affArea;
  const all = useMemo(
    () =>
      orderHotels(
        listArea,
        HOTELS.filter((h) => h.image && (listArea === "seoul" ? ["hongdae", "itaewon", "gangnam"].includes(h.area) : h.area === listArea)),
      ),
    [listArea],
  );
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return f.tiers.length ? all.filter((h) => f.tiers.includes(h.tier)) : all;
  }, [all, filter]);

  // 사진·그날 가격·평점은 아고다 API(서버 프록시)에서. 키가 없거나 실패하면 비어 있어 카드는 사진 없이 그대로 동작.
  const [live, setLive] = useState<Map<number, LiveStay>>(new Map());
  const checkInKey = stay.checkIn ?? "";
  useEffect(() => {
    let off = false;
    const qs = new URLSearchParams({ area: listArea });
    if (stay.checkIn) qs.set("checkIn", stay.checkIn);
    if (stay.nights) qs.set("nights", String(stay.nights));
    if (stay.adults) qs.set("adults", String(stay.adults));
    fetch(`/api/agoda/stays?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { hotels?: LiveStay[] } | null) => {
        if (off || !j?.hotels?.length) return;
        setLive(new Map(j.hotels.map((x) => [x.hid, x])));
      })
      .catch(() => {});
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listArea, checkInKey, stay.nights, stay.adults]);

  const allPriced = shown.length > 0 && shown.every((h) => !!(h.hid && live.get(h.hid)?.price));

  const trackBase = {
    ad_id: "aff_agoda",
    placement,
    area: affArea,
    items: all.map((h) => h.hid ?? h.name.en).join(","),
    variant: "strip",
    angle,
  };
  const ref = useAdImpression<HTMLDivElement>(all.length ? trackBase : null);
  if (all.length === 0) return null;

  return (
    <div ref={ref} className={className}>
      <div className="rounded-2xl border border-border bg-card pb-3.5 pl-3.5 pt-0.5">
        <div className="flex min-h-[44px] items-center justify-between gap-2 pr-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-[15px] font-extrabold leading-snug text-foreground">{title ?? stayHeadline(lang, listArea, angle)}</span>
          </div>
        </div>
        {subtitle && <p className="-mt-1 mb-2 pr-3 text-[12.5px] text-muted-foreground">{subtitle}</p>}

            {showFilters && (
            <div className="mb-2.5 flex gap-1.5 pr-3">
              {FILTERS.filter((f) => f.key === "all" || all.some((h) => f.tiers.includes(h.tier))).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`min-h-[32px] rounded-full px-3 text-[12px] font-bold ${
                    filter === f.key ? "bg-white text-black" : "border border-border bg-muted text-foreground"
                  }`}
                >
                  {f.key === "all" ? `${t.all} ${all.length}` : FILTER_LABEL[lang][f.key]}
                </button>
              ))}
            </div>
            )}
            <div className="group relative">
            {/* 마우스 휠로는 가로 스크롤이 안 되니 넓은 화면엔 좌우 버튼을 둔다 */}
            <button type="button" aria-label="Previous" onClick={() => slide(-1)}
              className="absolute left-1 top-[34%] z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white md:flex">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next" onClick={() => slide(1)}
              className="absolute right-4 top-[34%] z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white md:flex">
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <div ref={scroller} className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pr-3.5 scrollbar-hide">
              {shown.map((h, i) => (
                <a
                  key={h.hid ?? h.name.en}
                  href={(h.hid && live.get(h.hid)?.landingUrl) || agodaHotelUrl(h, stay, lang)}
                  target="_blank"
                  rel="sponsored nofollow noopener noreferrer"
                  onClick={() =>
                    trackAdClick({ ...trackBase, item_id: String(h.hid ?? h.name.en), position: i + 1, target: "agoda_hotel" })
                  }
                  // 한 화면에 딱 떨어지게: 모바일 2장, 넓은 화면 3장 — 고정 폭이면 오른쪽 카드가 반쯤 잘려 보인다(2026-10-22)
                  className="w-[calc((100%-24px)/2)] shrink-0 snap-start md:w-[calc((100%-34px)/3)]"
                >
                  <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-muted">
                    {(h.hid && live.get(h.hid)?.image) || h.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={(h.hid && live.get(h.hid)?.image) || h.image || ""} alt={h.name[lang === "ko" ? "ko" : "en"]} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      // 사진이 오기 전 자리 — 종류별 색 + 숙소 이름으로 눈에 띄게(2026-10-22, 회색 아이콘은 광고가 죽어 보였다)
                      <div className={`flex h-full w-full flex-col justify-end bg-gradient-to-br p-2.5 ${TIER_GRADIENT[h.tier]}`}>
                        <BedDouble className="mb-auto h-6 w-6 text-white/70" aria-hidden="true" />
                        <p className="line-clamp-2 text-[15px] font-black leading-tight text-white drop-shadow">
                          {lang === "ko" ? h.name.ko : h.name.en}
                        </p>
                      </div>
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] font-extrabold text-white">
                      {lang === "ko" ? h.tags.ko : h.tags.en}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-[13.5px] font-extrabold text-foreground">
                    {lang === "ko" ? h.name.ko : h.name.en}
                  </p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {/* 도보 시간은 뺐다 — 어디서부터인지 모호하다(2026-10-22 운영자) */}
                    {h.rating ? (
                      <>
                        <span className="text-amber-400">★</span> {h.rating.toFixed(1)}
                        {h.reviews ? ` (${h.reviews.toLocaleString("en-US")})` : ""}
                      </>
                    ) : (
                      TIER_LABEL[h.tier][lang]
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center text-[12.5px] font-extrabold text-foreground">
                    {(() => {
                      const v = h.hid ? live.get(h.hid) : undefined;
                      // 숫자와 문구가 한 줄에 섞이면 어색하다 — 보이는 카드 전부에 가격이 있을 때만 가격을 쓴다
                      if (allPriced && v?.price) return <>₩{v.price.toLocaleString("ko-KR")}</>;
                      return t.see;
                    })()}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </p>
                </a>
              ))}
            </div>
            </div>
      </div>
      {/* Ad 배지는 제목 옆이 아니라 고지 문구 옆에 작게(2026-10-22 운영자) */}
      <p className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-muted-foreground/80">
        <span className="truncate">{AGODA_DISCLOSURE[lang]}</span>
        <AdBadge label={AD_LABEL[lang]} small />
      </p>
    </div>
  );
}
