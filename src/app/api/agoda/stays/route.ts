import { NextRequest, NextResponse } from "next/server";
import { AGODA_CID } from "@/lib/affiliate/config";
import { HOTELS } from "@/lib/affiliate/agoda";

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
  if (!isIso(checkIn) || checkIn < kstDate(1)) checkIn = nextSaturday();
  const nights = Math.min(Math.max(parseInt(sp.get("nights") ?? "1", 10) || 1, 1), 7);
  const adults = Math.min(Math.max(parseInt(sp.get("adults") ?? "2", 10) || 2, 1), 8);
  const d = new Date(`${checkIn}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + nights);
  const checkOut = d.toISOString().slice(0, 10);

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
