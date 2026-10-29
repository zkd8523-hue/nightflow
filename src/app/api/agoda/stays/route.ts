import { NextRequest, NextResponse } from "next/server";
import { AGODA_CID } from "@/lib/affiliate/config";
import { HOTELS, koCityApi, walkMinutes } from "@/lib/affiliate/agoda";

// 아고다 Affiliate Lite API 프록시 — 큐레이션 숙소의 사진·그날 가격·평점을 가져온다.
// 문서: https://partners.agoda.com/Content/Documents/AffiliateLiteApi/Affiliate_Lite_API_V2.0.pdf
// - 키(AGODA_API_KEY)는 서버에만 둔다. 없으면 빈 목록을 돌려줘 화면이 사진 없이 그대로 동작한다.
// - 같은 지역·날짜 조합은 6시간 캐시(요청 수 절약, 가격이 하루 안에 크게 안 변한다).

export const runtime = "nodejs";

const ENDPOINT = "http://affiliateapi7643.agoda.com/affiliateservice/lt_v1";
const TTL_MS = 6 * 3600 * 1000;
const cache = new Map<string, { at: number; data: StayInfo[] }>();

export interface StayInfo {
  hid: number;
  name: string;
  image: string | null;
  price: number | null; // 1박 KRW
  rating: number | null; // 0-10
  reviews: number | null;
  stars: number | null;
  landingUrl: string | null; // 아고다가 준 파트너 링크(CID 포함)
  breakfast?: boolean;
}

function kstDate(offsetDays: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}
/** 체크인 기본값: 다음 토요일(없으면 7일 뒤) — 주말 가격이 클럽 손님 기준에 가깝다 */
function nextSaturday(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const add = ((6 - d.getUTCDay() + 7) % 7) || 7;
  return kstDate(add);
}
function isIso(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: NextRequest) {
  const key = process.env.AGODA_API_KEY;
  const sp = req.nextUrl.searchParams;
  const area = sp.get("area") ?? "";
  if (!key) return NextResponse.json({ hotels: [], reason: "no_key" });

  let checkIn = sp.get("checkIn");
  // 날짜를 안 주면 다음 토요일. 오늘을 주면 오늘 그대로 — 예전엔 내일 이전이면 다음 토요일로 바꿔서
  // 한국어 "오늘" 칩에 토요일 가격이 찍혔다(2026-10-30). 지난 날짜(새벽 영업일 기준 어제)는 오늘로 당긴다.
  if (!isIso(checkIn)) checkIn = nextSaturday();
  else if (checkIn < kstDate(0)) checkIn = kstDate(0);
  const nights = Math.min(Math.max(parseInt(sp.get("nights") ?? "1", 10) || 1, 1), 7);
  const adults = Math.min(Math.max(parseInt(sp.get("adults") ?? "2", 10) || 2, 1), 8);
  const d = new Date(`${checkIn}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + nights);
  const checkOut = d.toISOString().slice(0, 10);

  // 큐레이션 없는 도시(대구·인천 등) — Lite API 도시 검색으로 그날 빈방 있는 숙소를 받아온다(2026-10-30).
  // 예전엔 이런 도시에 서울 숙소를 띄우거나(인천·대구 페스티벌) 빈 칸이었다.
  const cityKey = sp.get("city");
  if (cityKey) {
    const c = koCityApi(cityKey);
    if (!c) return NextResponse.json({ hotels: [] });
    const cck = `city:${cityKey}|${checkIn}|${nights}|${adults}`;
    const chit = cache.get(cck);
    if (chit && Date.now() - chit.at < TTL_MS) return NextResponse.json({ hotels: chit.data, checkIn, nights });
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Encoding": "gzip,deflate", Authorization: `${AGODA_CID}:${key}` },
        body: JSON.stringify({
          criteria: {
            checkInDate: checkIn,
            checkOutDate: checkOut,
            cityId: c.cityId,
            additional: {
              currency: "KRW",
              language: "ko-kr",
              maxResult: 30,
              sortBy: "Recommended",
              minimumReviewScore: 7.5,
              minimumStarRating: 3,
              occupancy: { numberOfAdult: adults, numberOfChildren: 0 },
            },
          },
        }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!res.ok) return NextResponse.json({ hotels: [], reason: `http_${res.status}` });
      const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
      const rows = (json.results ?? [])
        // 호스텔·게스트하우스는 뺀다(한국어 숙소 광고 원칙), 리뷰 적은 곳도 뺀다
        .filter((r) => !/호스텔|hostel|게스트|guest/i.test(String(r.hotelName ?? "")) && Number(r.reviewCount ?? 0) >= 100)
        .map((r) => ({
          r,
          dist:
            c.center && typeof r.latitude === "number" && typeof r.longitude === "number"
              ? walkMinutes(c.center[0], c.center[1], r.latitude, r.longitude)
              : 0,
        }));
      // 기준점이 있으면(인천=송도) 가까운 순, 걸어서 3시간(≈12km) 넘는 곳은 뺀다
      const picked = (c.center ? rows.filter((x) => x.dist <= 180).sort((a, b) => a.dist - b.dist) : rows).slice(0, 10);
      const hotels: StayInfo[] = picked.map(({ r }) => ({
        hid: Number(r.hotelId),
        name: String(r.hotelName ?? ""),
        image: typeof r.imageURL === "string" ? r.imageURL.replace(/^http:/, "https:") : null,
        price: typeof r.dailyRate === "number" ? Math.round(r.dailyRate) : null,
        rating: typeof r.reviewScore === "number" ? r.reviewScore : null,
        reviews: typeof r.reviewCount === "number" ? r.reviewCount : null,
        stars: typeof r.starRating === "number" ? r.starRating : null,
        landingUrl: typeof r.landingURL === "string" ? r.landingURL : null,
      }));
      cache.set(cck, { at: Date.now(), data: hotels });
      return NextResponse.json({ hotels, checkIn, nights });
    } catch {
      return NextResponse.json({ hotels: [], reason: "fetch_failed" });
    }
  }

  const inArea = (a: string) => !area || (area === "seoul" ? ["hongdae", "itaewon", "gangnam"].includes(a) : a === area);
  const hids = HOTELS.filter((h) => h.hid && inArea(h.area)).map((h) => h.hid as number);
  if (hids.length === 0) return NextResponse.json({ hotels: [] });

  const ck = `${hids.join(",")}|${checkIn}|${nights}|${adults}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ hotels: hit.data, checkIn, nights });

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Encoding": "gzip,deflate", Authorization: `${AGODA_CID}:${key}` },
      body: JSON.stringify({
        criteria: {
          checkInDate: checkIn,
          checkOutDate: checkOut,
          hotelId: hids,
          additional: { currency: "KRW", language: "en-us", occupancy: { numberOfAdult: adults, numberOfChildren: 0 } },
        },
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ hotels: [], reason: `http_${res.status}` });
    const json = (await res.json()) as { results?: Array<Record<string, unknown>>; error?: unknown };
    const hotels: StayInfo[] = (json.results ?? []).map((r) => ({
      hid: Number(r.hotelId),
      name: String(r.hotelName ?? ""),
      image: typeof r.imageURL === "string" ? r.imageURL.replace(/^http:/, "https:") : null,
      price: typeof r.dailyRate === "number" ? Math.round(r.dailyRate) : null,
      rating: typeof r.reviewScore === "number" ? r.reviewScore : null,
      reviews: typeof r.reviewCount === "number" ? r.reviewCount : null,
      stars: typeof r.starRating === "number" ? r.starRating : null,
      landingUrl: typeof r.landingURL === "string" ? r.landingURL : null,
      breakfast: r.includeBreakfast === true,
    }));
    cache.set(ck, { at: Date.now(), data: hotels });
    return NextResponse.json({ hotels, checkIn, nights });
  } catch {
    return NextResponse.json({ hotels: [], reason: "fetch_failed" });
  }
}
