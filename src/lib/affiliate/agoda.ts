// 아고다 숙소 카드 데이터와 링크.
//
// - 큐레이션 숙소(HOTELS)는 지역당 8~10곳(가이드 2장 배분표). 후보 조사 결과:
//   ~/Desktop/나플_광고제안/아고다_숙소후보.json — 검토 후 여기로 옮긴다.
// - 사진·가격·평점은 아고다 Affiliate Lite API(hotelId 목록 검색)로 받을 예정.
//   API 키가 생기기 전까지는 이름·태그·거리만 보여주고 "가격 보기"로 보낸다.
// - 링크는 hid가 있으면 파트너 검색 링크(Lite API 문서 형식), 없으면 숙소 페이지 URL에 cid.

import { AGODA_CID, type AffArea, type AffLang } from "./config";

export type HotelTier = "budget" | "mid" | "residence" | "upscale" | "luxury";

export interface CuratedHotel {
  area: Exclude<AffArea, "other">;
  name: { ko: string; en: string };
  tier: HotelTier;
  tags: { ko: string; en: string };
  walkMin: number | null;
  /** 아고다 숙소 ID — 파트너 센터 검색으로 확인한 것만 */
  hid?: number;
  /** 아고다 숙소 페이지 URL(hid가 없을 때) */
  agodaUrl?: string;
  image?: string;
  /** 아고다 Hotel Data File의 평점(0-10)·리뷰 수 — 정적 값(2026-10-22 기준), API가 열리면 실시간 값이 덮어쓴다 */
  rating?: number;
  reviews?: number;
}

/**
 * 큐레이션 숙소(2026-10-22 조사, 아고다 숙소 페이지 확인된 곳만). 출처: 아고다_숙소후보.json
 * 모텔형(보보호텔)·아고다 페이지 미확인(누베르·임피리얼팰리스·신라스테이 해운대)은 뺐다.
 * 비어 있는 지역은 지역 검색 카드로 대체된다.
 */
export const HOTELS: CuratedHotel[] = [
  { area: "hongdae", name: { ko: "나비호스텔 홍대", en: "Nabi Hostel Hongdae" }, tier: "budget", tags: { ko: "가성비 호스텔", en: "Budget hostel" }, walkMin: 14, hid: 1403676, image: "https://pix4.agoda.net/hotelimages/140/1403676/1403676_17031707400051593496.jpg?s=640x", rating: 8.9, reviews: 6222, agodaUrl: "https://www.agoda.com/nabi-hostel-hongdae/hotel/seoul-kr.html" },
  { area: "hongdae", name: { ko: "더원호스텔 홍대", en: "The ONE Hostel Hongdae" }, tier: "budget", tags: { ko: "클럽거리 바로 앞", en: "Next to club street" }, walkMin: 2, hid: 914423, image: "https://pix5.agoda.net/hotelimages/914423/0/6f3fb04851f572d889280a8ceb1aa0fd.png?s=640x&ce=0", rating: 7.9, reviews: 1360, agodaUrl: "https://www.agoda.com/the-one-hostel-hongdae/hotel/seoul-kr.html" },
  { area: "hongdae", name: { ko: "나인브릭호텔", en: "Nine Brick Hotel" }, tier: "mid", tags: { ko: "부티크 3성", en: "3-star boutique" }, walkMin: 6, hid: 2325361, image: "https://pix5.agoda.net/hotelimages/2325361/-1/10d9fbfe2eb456715e0371b39a1310b0.jpg?s=640x", rating: 8.9, reviews: 8156, agodaUrl: "https://www.agoda.com/nine-brick-hotel/hotel/seoul-kr.html" },
  { area: "hongdae", name: { ko: "홀리데이 인 익스프레스 서울 홍대", en: "Holiday Inn Express Seoul Hongdae" }, tier: "mid", tags: { ko: "체인 3.5성", en: "3.5-star chain" }, walkMin: 14, hid: 5056661, image: "https://pix2.agoda.net/hotelimages/7546217/0/a6ffa0b54cc506655af586c997a8cd69.jpeg?s=640x&ce=0", rating: 9.1, reviews: 11527, agodaUrl: "https://www.agoda.com/holiday-inn-express-seoul-hongdae/hotel/seoul-kr.html" },
  { area: "hongdae", name: { ko: "엔조이레지던스서울", en: "NJoy Residence Seoul" }, tier: "residence", tags: { ko: "레지던스형", en: "Residence-style" }, walkMin: 11, hid: 445681, agodaUrl: "https://www.agoda.com/njoy-residence-seoul/hotel/seoul-kr.html" },
  { area: "hongdae", name: { ko: "OPEN1 홍대·합정역 (6인, 방 2개)", en: "OPEN1-Hongdae, Hapjeong Station (6 people, 2 rooms)" }, tier: "residence", tags: { ko: "아파트형", en: "Apartment" }, walkMin: null, hid: 86692079, agodaUrl: "https://www.agoda.com/open-1-2-2-3/hotel/seoul-kr.html" },
  { area: "hongdae", name: { ko: "머큐어 앰배서더 서울 홍대", en: "Mercure Ambassador Seoul Hongdae" }, tier: "upscale", tags: { ko: "4성", en: "4-star" }, walkMin: 8, hid: 14654970, image: "https://pix2.agoda.net/hotelimages/14654970/-1/7f862aa5eec7d4ec4074b6d24bca6e60.jpg?s=640x", rating: 9.3, reviews: 6570, agodaUrl: "https://www.agoda.com/mercure-ambassador-seoul-hongdae/hotel/seoul-kr.html" },
  { area: "hongdae", name: { ko: "라이즈 오토그래프 컬렉션", en: "RYSE, Autograph Collection" }, tier: "luxury", tags: { ko: "럭셔리 라이프스타일", en: "Luxury lifestyle" }, walkMin: 7, hid: 4120283, image: "https://pix2.agoda.net/hotelimages/4120283/-1/180765cbf9d48fcec47d8e8b73def346.jpg?s=640x", rating: 9.3, reviews: 4115, agodaUrl: "https://www.agoda.com/ryse-autograph-collection_2/hotel/seoul-kr.html" },
  { area: "itaewon", name: { ko: "서울큐브 이태원", en: "Seoul Cube Itaewon" }, tier: "budget", tags: { ko: "캡슐 호스텔", en: "Capsule hostel" }, walkMin: 2, hid: 9643411, image: "https://pix4.agoda.net/hotelimages/9643411/-1/8baaac8702100d87fff254e33fa7b94b.jpg?s=640x&ce=0", rating: 8.7, reviews: 1297, agodaUrl: "https://www.agoda.com/seoul-cube-itaewon/hotel/seoul-kr.html" },
  { area: "itaewon", name: { ko: "해밀톤호텔", en: "Hamilton Hotel Itaewon" }, tier: "mid", tags: { ko: "이태원역 바로 앞", en: "Right at Itaewon Stn" }, walkMin: 2, hid: 9440, image: "https://pix1.agoda.net/hotelimages/944/9440/9440_15061708180029727336.jpg?s=640x", rating: 8.5, reviews: 6916, agodaUrl: "https://www.agoda.com/hamilton-hotel-itaewon/hotel/seoul-kr.html" },
  { area: "itaewon", name: { ko: "에이원호텔 이태원", en: "Itaewon A-One Hotel" }, tier: "mid", tags: { ko: "클럽거리 도보권", en: "Walk to club street" }, walkMin: 4, hid: 1637972, image: "https://pix3.agoda.net/hotelimages/1637972/0/c8f601b60e65f05c1a146b4d8cbac78e.jpg?s=640x&ce=3", rating: 8.1, reviews: 452, agodaUrl: "https://www.agoda.com/itaewon-a-one-hotel/hotel/seoul-kr.html" },
  { area: "itaewon", name: { ko: "이태원 프리덤 2베드룸 하우스", en: "Itaewon Freedom - 2 Bedroom House" }, tier: "residence", tags: { ko: "단독 하우스", en: "Entire house" }, walkMin: null, hid: 2070290, agodaUrl: "https://www.agoda.com/itaewon-freedom-2-bedroom-house/hotel/seoul-kr.html" },
  { area: "itaewon", name: { ko: "이태원 남산 하우스", en: "Itaewon Namsan House" }, tier: "residence", tags: { ko: "아파트형", en: "Entire apartment" }, walkMin: null, hid: 79451643, agodaUrl: "https://www.agoda.com/h79451643/hotel/seoul-kr.html" },
  { area: "itaewon", name: { ko: "몬드리안 서울이태원", en: "Mondrian Seoul Itaewon" }, tier: "upscale", tags: { ko: "디자인 호텔", en: "Design hotel" }, walkMin: 11, hid: 16366477, image: "https://pix4.agoda.net/hotelimages/16366477/-1/97558b64b9acdcb0cbf53c88245e229f.jpg?s=640x", rating: 8.9, reviews: 2816, agodaUrl: "https://www.agoda.com/mondrian-seoul-itaewon/hotel/seoul-kr.html" },
  { area: "itaewon", name: { ko: "그랜드 하얏트 서울", en: "Grand Hyatt Seoul" }, tier: "luxury", tags: { ko: "5성", en: "5-star" }, walkMin: 10, hid: 6922, image: "https://pix5.agoda.net/hotelimages/6922/-1/5d38c09a83c0f918f019566ddf4f9d1c.jpg?s=640x", rating: 8.9, reviews: 3693, agodaUrl: "https://www.agoda.com/grand-hyatt-seoul/hotel/seoul-kr.html" },
  { area: "gangnam", name: { ko: "호텔카푸치노", en: "Hotel Cappuccino Seoul" }, tier: "mid", tags: { ko: "부티크", en: "Boutique" }, walkMin: 14, hid: 1197062, image: "https://pix2.agoda.net/hotelimages/119/1197062/1197062_16050611230042104342.jpg?s=640x", rating: 8.5, reviews: 4008, agodaUrl: "https://www.agoda.com/hotel-cappuccino-seoul/hotel/seoul-kr.html" },
  { area: "gangnam", name: { ko: "유에이치스위트 더강남", en: "UH Suite The Gangnam" }, tier: "residence", tags: { ko: "레지던스형 스위트", en: "Residence suites" }, walkMin: 7, hid: 59585140, agodaUrl: "https://www.agoda.com/uh-suite-the-gangnam/hotel/seoul-kr.html" },
  { area: "gangnam", name: { ko: "강남(역삼) 아르누보씨티", en: "Yeoksam Artnouveau City Hotel and Residence" }, tier: "residence", tags: { ko: "레지던스", en: "Residence" }, walkMin: 8, hid: 29493750, image: "https://pix2.agoda.net/hotelimages/294/29493750/29493750_211228074300110271460.jpg?s=640x", rating: 7.4, reviews: 4578, agodaUrl: "https://www.agoda.com/yeoksam-artnouveau-city-h29493750/hotel/seoul-kr.html" },
  { area: "gangnam", name: { ko: "보코 서울 강남", en: "voco Seoul Gangnam" }, tier: "upscale", tags: { ko: "IHG 4성", en: "IHG 4-star" }, walkMin: 13, hid: 31348120, agodaUrl: "https://www.agoda.com/voco-seoul-gangnam/hotel/seoul-kr.html" },
  { area: "gangnam", name: { ko: "AC 호텔 바이 메리어트 서울 강남", en: "AC Hotel by Marriott Seoul Gangnam" }, tier: "upscale", tags: { ko: "메리어트 4성", en: "Marriott 4-star" }, walkMin: 13, hid: 335567, image: "https://pix5.agoda.net/hotelimages/335567/-1/1a55fbfda899850b358f5f9f5e915919.jpg?s=640x", rating: 9.1, reviews: 473, agodaUrl: "https://www.agoda.com/ac-hotel-seoul-gangnam/hotel/seoul-kr.html" },
  { area: "gangnam", name: { ko: "노보텔 앰배서더 서울 강남", en: "Novotel Ambassador Seoul Gangnam" }, tier: "upscale", tags: { ko: "아코르 4성", en: "Accor 4-star" }, walkMin: 13, hid: 1372, image: "https://pix3.agoda.net/hotelimages/1372/0/c09f76f8b2b8b7f4bfa7226cd4b3959d.jpg?s=640x&ce=3", rating: 8.6, reviews: 2842, agodaUrl: "https://www.agoda.com/novotel-ambassador-seoul-gangnam/hotel/seoul-kr.html" },
  { area: "gangnam", name: { ko: "조선 팰리스 서울 강남", en: "Josun Palace, a Luxury Collection Hotel, Seoul Gangnam" }, tier: "luxury", tags: { ko: "5성", en: "5-star" }, walkMin: 22, hid: 24180119, image: "https://pix2.agoda.net/hotelimages/24180119/-1/c02a4e425c89f06d21f4d61a8a37eb8d.jpg?s=640x", rating: 9.4, reviews: 840, agodaUrl: "https://www.agoda.com/josun-palace-a-luxury-collection-hotel-seoul-gangnam/hotel/seoul-kr.html" },
  { area: "gangnam", name: { ko: "안다즈 서울 강남", en: "Andaz Seoul Gangnam" }, tier: "luxury", tags: { ko: "5성 라이프스타일", en: "5-star lifestyle" }, walkMin: 27, hid: 8776202, image: "https://pix2.agoda.net/hotelimages/8776202/-1/e4a438849c51cabf8858ccf8cefac064.jpg?s=640x", rating: 9.2, reviews: 689, agodaUrl: "https://www.agoda.com/andaz-seoul-gangnam/hotel/seoul-kr.html" },
  { area: "gangnam", name: { ko: "JW 메리어트 호텔 서울", en: "JW Marriott Hotel Seoul" }, tier: "luxury", tags: { ko: "5성", en: "5-star" }, walkMin: 29, hid: 49141, image: "https://pix5.agoda.net/hotelimages/49141/0/b53a4b0b99cbf8b6b91ab201183ded5e.jpg?s=640x&ce=0", rating: 9.1, reviews: 1020, agodaUrl: "https://www.agoda.com/jw-marriott-hotel-seoul/hotel/seoul-kr.html" },
  { area: "busan", name: { ko: "캘리호스텔 서면점", en: "Calli Hostel Seomyeon" }, tier: "budget", tags: { ko: "소셜 호스텔", en: "Social hostel" }, walkMin: 5, hid: 670637, image: "https://pix5.agoda.net/hotelimages/670/670637/670637_16051315580042309250.jpg?s=640x", rating: 7.7, reviews: 513, agodaUrl: "https://www.agoda.com/calli-hostel/hotel/busan-kr.html" },
  { area: "busan", name: { ko: "이비스 앰배서더 부산 시티센터", en: "ibis Ambassador Busan City Centre" }, tier: "mid", tags: { ko: "체인 3성", en: "3-star chain" }, walkMin: 8, hid: 1634075, agodaUrl: "https://www.agoda.com/ibis-ambassador-busan-city-centre/hotel/busan-kr.html" },
  { area: "busan", name: { ko: "베스트웨스턴 해운대호텔", en: "Best Western Haeundae Hotel" }, tier: "mid", tags: { ko: "해운대역 인접", en: "Near Haeundae Stn" }, walkMin: 3, hid: 1095091, image: "https://pix5.agoda.net/hotelimages/1095091/-1/693295d4bc073f993d09806ce0eed7df.jpg?s=640x", rating: 8.8, reviews: 10508, agodaUrl: "https://www.agoda.com/best-western-haeundae-hotel/hotel/busan-kr.html" },
  { area: "busan", name: { ko: "이비스 앰배서더 부산 해운대", en: "ibis Ambassador Busan Haeundae" }, tier: "mid", tags: { ko: "체인 3.5성", en: "3.5-star chain" }, walkMin: 4, hid: 1254424, agodaUrl: "https://www.agoda.com/ibis-ambassador-busan-haeundae/hotel/busan-kr.html" },
  { area: "busan", name: { ko: "어반스테이 서면", en: "Urbanstay Seomyeon" }, tier: "residence", tags: { ko: "레지던스(오피스텔형)", en: "Residence (officetel)" }, walkMin: 4, hid: 19856898, image: "https://pix1.agoda.net/hotelimages/19856898/-1/9a03ea66a84e2977ecae427bb478f3aa.jpg?s=640x&ce=0", rating: 8.9, reviews: 6862, agodaUrl: "https://www.agoda.com/urbanstay-seomyeon/hotel/busan-kr.html" },
  { area: "busan", name: { ko: "해운대 씨클라우드 호텔 레지던스", en: "Haeundae Seacloud Hotel Residence" }, tier: "residence", tags: { ko: "레지던스", en: "Residence" }, walkMin: 4, hid: 14695336, image: "https://pix3.agoda.net/hotelimages/14695336/0/908fe77dbd80fee0e8f215e9c19a230c.jpg?s=640x&ce=3", rating: 8.4, reviews: 9526, agodaUrl: "https://www.agoda.com/haeundae-seacloud-hotel-residence/hotel/busan-kr.html" },
  { area: "busan", name: { ko: "L7 해운대 바이 롯데", en: "L7 HAEUNDAE by LOTTE" }, tier: "upscale", tags: { ko: "4성", en: "4-star" }, walkMin: 3, hid: 52027642, agodaUrl: "https://www.agoda.com/l7-haeundae/hotel/busan-kr.html" },
  { area: "busan", name: { ko: "롯데호텔 부산", en: "Lotte Hotel Busan" }, tier: "luxury", tags: { ko: "5성", en: "5-star" }, walkMin: 4, hid: 42958, image: "https://pix4.agoda.net/hotelimages/42958/-1/4591e6c1349743676fb0fe79cff45771.jpg?s=640x&ce=0", rating: 9.2, reviews: 12099, agodaUrl: "https://www.agoda.com/lotte-hotel-busan/hotel/busan-kr.html" },
];

/**
 * 지역 검색 링크. ⚠️ 형식 미검증 — 파트너 센터 Tools > Text Links에서
 * 지역 링크를 만들어 이 값을 바꿔 넣는 게 가장 확실하다(cid가 붙은 URL).
 */
export const AGODA_AREA_URL: Record<Exclude<AffArea, "other"> | "seoul", string> = {
  seoul: "https://www.agoda.com/city/seoul-kr.html",
  hongdae: "https://www.agoda.com/city/seoul-kr.html",
  itaewon: "https://www.agoda.com/city/seoul-kr.html",
  gangnam: "https://www.agoda.com/city/seoul-kr.html",
  busan: "https://www.agoda.com/city/busan-kr.html",
};

const AGODA_LOCALE: Record<AffLang, string> = { ko: "ko-kr", en: "en-us", ja: "ja-jp", zh: "zh-cn", "zh-tw": "zh-tw" };

export interface StayQuery {
  checkIn?: string | null; // YYYY-MM-DD
  nights?: number;
  adults?: number;
  rooms?: number;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function withParams(base: string, params: Record<string, string | number | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  return u.toString();
}

export function agodaHotelUrl(h: CuratedHotel, q: StayQuery, lang: AffLang): string {
  const nights = Math.max(1, q.nights ?? 1);
  const checkout = q.checkIn ? addDays(q.checkIn, nights) : undefined;
  if (h.hid) {
    // Affiliate Lite API 문서의 landingURL 형식
    return withParams("https://www.agoda.com/partners/partnersearch.aspx", {
      cid: AGODA_CID,
      hid: h.hid,
      checkin: q.checkIn ?? undefined,
      checkout,
      NumberofAdults: q.adults ?? 2,
      NumberofChildren: 0,
      Rooms: q.rooms ?? 1,
    });
  }
  const base = h.agodaUrl || AGODA_AREA_URL[h.area];
  return withParams(base, { cid: AGODA_CID, locale: AGODA_LOCALE[lang], checkIn: q.checkIn ?? undefined, los: nights, adults: q.adults });
}

export function agodaAreaUrl(area: AffArea, q: StayQuery, lang: AffLang): string {
  const base = area === "other" ? AGODA_AREA_URL.seoul : AGODA_AREA_URL[area];
  return withParams(base, { cid: AGODA_CID, locale: AGODA_LOCALE[lang], checkIn: q.checkIn ?? undefined, los: q.nights, adults: q.adults });
}

/** 노출 순서: 가격대를 섞되 강남은 고급을 앞에. */
export function orderHotels(area: AffArea, list: CuratedHotel[]): CuratedHotel[] {
  const pattern: HotelTier[] =
    area === "gangnam"
      ? ["luxury", "upscale", "residence", "luxury", "upscale", "mid", "luxury", "upscale", "residence"]
      : ["mid", "residence", "upscale", "budget", "luxury", "mid", "residence", "upscale", "budget", "mid"];
  const buckets = new Map<HotelTier, CuratedHotel[]>();
  for (const h of list) buckets.set(h.tier, [...(buckets.get(h.tier) ?? []), h]);
  const out: CuratedHotel[] = [];
  for (const t of pattern) { const h = buckets.get(t)?.shift(); if (h) out.push(h); }
  for (const rest of buckets.values()) out.push(...rest);
  return out;
}

export const TIER_LABEL: Record<HotelTier, Record<AffLang, string>> = {
  budget: { ko: "가성비", en: "Budget", ja: "格安", zh: "经济", "zh-tw": "經濟" },
  mid: { ko: "중간", en: "Mid", ja: "スタンダード", zh: "中档", "zh-tw": "中價" },
  residence: { ko: "레지던스", en: "Residence", ja: "レジデンス", zh: "公寓式", "zh-tw": "公寓式" },
  upscale: { ko: "고급", en: "Upscale", ja: "高級", zh: "高档", "zh-tw": "高檔" },
  luxury: { ko: "최고급", en: "Luxury", ja: "ラグジュアリー", zh: "豪华", "zh-tw": "豪華" },
};

export const AREA_LABEL: Record<AffArea, Record<AffLang, string>> = {
  hongdae: { ko: "홍대", en: "Hongdae", ja: "弘大", zh: "弘大", "zh-tw": "弘大" },
  itaewon: { ko: "이태원", en: "Itaewon", ja: "梨泰院", zh: "梨泰院", "zh-tw": "梨泰院" },
  gangnam: { ko: "강남", en: "Gangnam", ja: "江南", zh: "江南", "zh-tw": "江南" },
  busan: { ko: "부산", en: "Busan", ja: "釜山", zh: "釜山", "zh-tw": "釜山" },
  seoul: { ko: "서울", en: "Seoul", ja: "ソウル", zh: "首尔", "zh-tw": "首爾" },
  other: { ko: "서울", en: "Seoul", ja: "ソウル", zh: "首尔", "zh-tw": "首爾" },
};

/**
 * 숙소 줄 제목 — 각도 3가지(2026-10-22 운영자: 가성비 / 미리 예약 FOMO / 택시 회피).
 * - taxi: 새벽 귀가 문제를 푼다(기본). value: 가격대가 다양하다. early: 주말·시즌 방이 먼저 찬다.
 * ⚠️ "남은 방 N개" 같은 거짓 희소성은 쓰지 않는다 — 실제 재고를 모른다. 일반적 사실("주말 방이 먼저 찬다")만.
 */
export type StayAngle = "taxi" | "value" | "early";
export const STAY_ANGLES: StayAngle[] = ["taxi", "value", "early"];

export function stayHeadline(lang: AffLang, area: AffArea, angle: StayAngle = "taxi"): string {
  const a = AREA_LABEL[area][lang];
  const T: Record<AffLang, Record<StayAngle, string>> = {
    en: {
      taxi: `Skip the 5 AM taxi line — sleep in ${a}`,
      value: `${a} stays from budget to 5-star — pick your price`,
      early: `Weekend rooms near ${a} go first — lock yours now`,
    },
    ko: {
      taxi: `${a}에서 놀고 바로 체크인`,
      value: `${a} 숙소, 가성비부터 5성까지 골라 보세요`,
      early: `주말 방은 먼저 찹니다 — ${a} 숙소 미리 잡아 두세요`,
    },
    ja: {
      taxi: `朝5時のタクシー待ちはやめよう — ${a}に泊まる`,
      value: `${a}の宿、格安から5つ星まで — 予算で選ぶ`,
      early: `週末の部屋は先に埋まる — ${a}の宿を今のうちに`,
    },
    zh: {
      taxi: `不用排早上5点的打车长队——住在${a}`,
      value: `${a}住宿，从经济到五星——按预算选`,
      early: `周末房间先满——提前订好${a}住宿`,
    },
    "zh-tw": {
      taxi: `不用排凌晨5點的叫車長隊——住在${a}`,
      value: `${a}住宿，從經濟到五星——依預算選`,
      early: `週末房間先滿——提早訂好${a}住宿`,
    },
  };
  return T[lang][angle];
}
