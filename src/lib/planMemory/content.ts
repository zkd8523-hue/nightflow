// "Plan your Memory" — 외국인용 밤 코스 + 제휴 투어 묶음(2026-10-01).
//
// 사실 근거: ~/.claude/plans/club-travel/facts-nr-{busan,haeundae,hongdae,itaewon}-s.md
// (조사 원문, 출처·날짜 포함). 여기 문구는 그 범위 밖 사실·숫자를 쓰지 않는다.
// - 드론쇼: 부산시 공지(2026-07-29) — 토요일만, 10~2월 19·21시, 3~9월 20·22시, 무료
// - 막차 시각은 공식 시간표를 확인 못 해 숫자를 쓰지 않는다("당일 앱 확인")
// - 나이: 청소년보호법(19세가 되는 해 1월 1일) → 2026년 기준 2007년생 이하
// - 테이블 가격(US$369 / ₩500k, 보틀 포함)은 /en 홈 히어로와 같은 나플 표기
//
// 투어는 Viator 제휴 링크(campaign=페이지별). 가격은 2026-10-01 Viator 목록 표기를
// 천 원 단위로 반올림 — 상품 페이지 가격이 기준이라고 매번 밝힌다.
// 펍크롤·나이트라이프 투어는 클럽 예약과 겹쳐 넣지 않는다(사용자 결정 2026-10-01).

export const PLAN_BASE = "/en/plan-your-memory";

const VIATOR_QS = "pid=P00323015&mcid=42383&medium=link&campaign=";
const viator = (url: string, campaign: string) => `${url}?${VIATOR_QS}${campaign}`;

const IMG = {
  busanNight: "https://images.unsplash.com/photo-1625899139925-57f71ba783b4", // Wade Lee, Busan
  haeundae: "https://images.unsplash.com/photo-1701172189149-450eecf09863", // Sung Jin Cho, Haeundae Beach
  hongdae: "https://images.unsplash.com/photo-1694276971921-ff8f103752eb", // realfish, Hongik Univ. Station
  itaewon: "https://images.unsplash.com/photo-1652172176433-59032e5e1280", // Inkwon hwang, Namsan Tower area, Itaewon
  hanRiver: "https://images.unsplash.com/photo-1556513584-fc549ffb7577", // Ethan Brooke, Yeouido
  nTower: "https://images.unsplash.com/photo-1639905808227-4c987d4a71bd", // Riza Gabriela, Seoul
  seoulSunset: "https://images.unsplash.com/photo-1546874177-9e664107314e", // Yohan Cho, Seoul
  club: "https://images.unsplash.com/photo-1506485854521-3e13d857db0b", // Redd Francisco (illustrative)
};
export const img = (base: string, w = 1200) => `${base}?w=${w}&q=80&auto=format`;
export const PHOTO_CREDIT: Record<string, string> = {
  [IMG.busanNight]: "Wade Lee",
  [IMG.haeundae]: "Sung Jin Cho",
  [IMG.hongdae]: "realfish",
  [IMG.itaewon]: "Inkwon hwang",
};

export type Tour = {
  id: string;
  title: string;
  desc: string;
  badge: string;
  priceKrw: number;
  image: string;
  url: string; // Viator 상품 원 주소(제휴 쿼리는 링크 만들 때 붙임)
};

export const TOURS: Record<string, Tour> = {
  seoulSmallGroup: { id: "seoulSmallGroup", title: "Seoul city night view tour", desc: "Small-group evening tour of Seoul's lights.", badge: "Small group · max 8", priceKrw: 50000, image: IMG.seoulSunset, url: "https://www.viator.com/tours/Seoul/Seoul-City-Night-View-tour-Small-Group-8-Max/d973-361415P46" },
  hanCruise: { id: "hanCruise", title: "Han River night cruise + Gwangjang Market", desc: "River lights, then Seoul's famous food market.", badge: "Cruise · market", priceKrw: 65000, image: IMG.hanRiver, url: "https://www.viator.com/tours/Seoul/Seoul-Night-Han-River-Cruise-and-Gwangjang-Market-and-Hidden-Street/d973-361415P132" },
  seoulPrivate: { id: "seoulPrivate", title: "Private night tour: skyline & Han River", desc: "Your own guide and pace — good if you travel solo.", badge: "Private · your pace", priceKrw: 116000, image: IMG.hanRiver, url: "https://www.viator.com/tours/Seoul/Seoul-Private-Night-Tour-Skyline-Han-River-and-City-Lights/d973-117866P758" },
  nTowerWalk: { id: "nTowerWalk", title: "N Seoul Tower & Myeongdong night walk", desc: "City views from the tower, street food after.", badge: "Walking · N Seoul Tower", priceKrw: 136000, image: IMG.nTower, url: "https://www.viator.com/tours/Seoul/Seoul-N-Seoul-Tower-and-Myeongdong-Night-Walking-Tour/d973-5652208P5" },
  busanHike: { id: "busanHike", title: "Busan night view hike", desc: "Evening hike up Hwangnyeongsan with a local guide.", badge: "Small group · night hike", priceKrw: 35000, image: IMG.busanNight, url: "https://www.viator.com/tours/Busan/Busan-The-best-night-view-with-small-group-tour/d4615-408008P6" },
  busanByNight: { id: "busanByNight", title: "Busan by Night", desc: "Hwangnyeongsan lookout, Gwangalli, Cinema Center lights.", badge: "Coach · lookout + Gwangalli", priceKrw: 132000, image: IMG.busanNight, url: "https://www.viator.com/tours/Busan/Busan-by-Night/d4615-6630PUSK_6SIC" },
  skyCapsule: { id: "skyCapsule", title: "Haeundae Sky Capsule at sunset + night view", desc: "Seaside capsule ride, then Busan's night skyline.", badge: "Sunset · Sky Capsule", priceKrw: 78000, image: IMG.haeundae, url: "https://www.viator.com/tours/Busan/Sunset-Haeundae-Sky-Capsule-and-Busan-Night-view-Tour-from-Busan/d4615-48881P202" },
  busanNightView: { id: "busanNightView", title: "Busan Night-view Tour", desc: "Guided tour of Busan's night views.", badge: "Guided · night views", priceKrw: 99000, image: IMG.haeundae, url: "https://www.viator.com/tours/Busan/Busan-Night-view-Tour/d4615-48881P121" },
};

export const tourHref = (t: Tour, campaign: string) => viator(t.url, campaign);

export type Step = { time: string; title: string; body: string; pills?: string[]; bookLink?: boolean };

export type Route = {
  slug: string;
  campaign: string;
  /** 나플 예약 폼 area 값(한글) — 없으면 클럽 예약 없는 코스 */
  bookArea?: string;
  /** 클럽 목록을 DB에서 고를 때: 지역(한글) + 선택적으로 이름 고정 */
  clubArea?: string;
  clubNames?: string[];
  eyebrow: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  lead: string;
  hero: string;
  heroAlt: string;
  heroCaption: string;
  ctaLabel?: string;
  priceLine?: string;
  stepsTitle: string;
  steps: Step[];
  clubsTitle?: string;
  clubsNote?: string;
  tours: string[];
  toursTitle: string;
  /** 해운대처럼 예약 클럽이 없는 코스 → 다른 코스로 이어 주는 카드 */
  bridge?: { href: string; title: string; body: string; image: string };
  /** 목록 카드 */
  card: { title: string; line: string; meta: string };
  days?: boolean;
  footnote?: string;
};

export const ROUTES: Route[] = [
  {
    slug: "hongdae-night",
    campaign: "hongdae-night",
    bookArea: "홍대",
    clubArea: "홍대",
    eyebrow: "Seoul · Hongdae",
    title: "Seoul's easiest first night: Hongdae",
    metaTitle: "Hongdae Night Route 2026 — Street Music, Yeonnam & Club Street (Seoul)",
    metaDescription: "A first-night route in Seoul's Hongdae: street music, a park walk in Yeonnam, then the club street. Book a Hongdae club table in English — pay at the club.",
    lead: "Street music → a park walk → club street. All in one neighborhood.",
    hero: IMG.hongdae,
    heroAlt: "Hongdae street at night",
    heroCaption: "Near Hongik Univ. Station",
    ctaLabel: "Book a Hongdae club table",
    priceLine: "Tables from US$369 (₩500k, bottle included) · walk-in entry often ₩10–30K",
    stepsTitle: "Your night, step by step",
    steps: [
      { time: "Evening", title: "Street music (busking)", body: "Live street performers on Hongdae's walking street. Official busking hours 12:00–22:00 (Mapo-gu).", pills: ["Line 2 · Hongik Univ."] },
      { time: "Dinner", title: "Yeonnam & Gyeongui Line Forest Park", body: "Cafés and restaurants along a long park. Keep it quiet — people live here." },
      { time: "Late", title: "Club street", body: "Hip-hop, K-pop, EDM. Hours and entry differ by club.", bookLink: true },
    ],
    clubsTitle: "Popular in Hongdae",
    tours: ["seoulSmallGroup", "hanCruise"],
    toursTitle: "Before the club",
    card: { title: "Dance & meet people — Hongdae", line: "Street music → park → club street. Easiest first night.", meta: "Seoul · bookable clubs" },
  },
  {
    slug: "itaewon-night",
    campaign: "itaewon-night",
    bookArea: "이태원",
    clubArea: "이태원",
    eyebrow: "Seoul · Itaewon",
    title: "World food, a rooftop view, then the club",
    metaTitle: "Itaewon Night Route 2026 — World Food Street, Rooftops & Clubs (Seoul)",
    metaDescription: "Seoul's most international night: World Food Street, Haebangchon rooftops with a N Seoul Tower view, then Itaewon's clubs. Book a table in English, pay at the club.",
    lead: "Seoul's most international area — English-friendly from dinner to dance floor.",
    hero: IMG.itaewon,
    heroAlt: "N Seoul Tower seen from the Itaewon side",
    heroCaption: "N Seoul Tower from the Itaewon side",
    ctaLabel: "Book an Itaewon club table",
    priceLine: "Tables from US$369 (₩500k, bottle included)",
    stepsTitle: "Your night, step by step",
    steps: [
      { time: "Evening", title: "World Food Street", body: "Dinner from many countries, near Itaewon Station.", pills: ["Line 6 · Itaewon"] },
      { time: "Sunset", title: "Rooftop bars (Haebangchon)", body: "Uphill from Noksapyeong Station — guides recommend the N Seoul Tower view. It's a climb, give it time." },
      { time: "Late", title: "Main strip — clubs", body: "Busiest Fri–Sat — book ahead.", bookLink: true },
    ],
    clubsTitle: "Popular in Itaewon",
    tours: ["seoulPrivate", "nTowerWalk"],
    toursTitle: "Before the club",
    footnote: "Route based on travel guides, not an official course.",
    card: { title: "Global & English-friendly — Itaewon", line: "World food → rooftop view → clubs.", meta: "Seoul · bookable clubs" },
  },
  {
    slug: "busan-night",
    campaign: "busan-night",
    bookArea: "부산",
    clubArea: "부산",
    clubNames: ["Groove & Spot", "BELPOS", "Azit"],
    eyebrow: "Busan · Seomyeon clubs",
    title: "Busan clubs in Seomyeon — plus a free drone show on Saturdays",
    metaTitle: "Busan Nightlife 2026 — Gwangalli Drone Show & Seomyeon Clubs",
    metaDescription: "Seomyeon is Busan's club street. On Saturdays start with the free Gwangalli drone show (Oct–Feb 19:00 & 21:00). Book a Seomyeon club table in English.",
    lead: "Seomyeon is Busan's club street. On Saturdays, start with the drone show at Gwangalli Beach — same subway Line 2.",
    hero: IMG.busanNight,
    heroAlt: "Busan at night",
    heroCaption: "Busan at night",
    ctaLabel: "Book a Seomyeon club table",
    priceLine: "Tables from about ₩500,000",
    days: true,
    stepsTitle: "Saturday, step by step",
    steps: [
      { time: "19:00 · 21:00", title: "Gwangalli Beach — drone show", body: "Free, about 10–12 minutes, twice every Saturday (Oct–Feb 19:00 & 21:00; Mar–Sep 20:00 & 22:00). Weather can cancel it — check the official site that day.", pills: ["Line 2 · Gwangan", "Free"] },
      { time: "22:00~", title: "Seomyeon — eat, then clubs", body: "Busy downtown full of food and bars. Most clubs run Fri–Sat until early morning.", pills: ["Line 1·2 · Seomyeon"] },
      { time: "01:00~", title: "Late club — Azit", body: "Opens around 1 a.m., for after the first club." },
    ],
    clubsTitle: "Bookable in Seomyeon",
    clubsNote: "Days, entry and prices from NightFlow listings; may change.",
    tours: ["busanHike", "busanByNight"],
    toursTitle: "Before the club",
    card: { title: "A show, then the club — Busan", line: "Free drone show → Seomyeon club street.", meta: "Clubs Fri–Sat · drone show Sat" },
  },
  {
    slug: "haeundae-evening",
    campaign: "haeundae-night",
    eyebrow: "Busan · Haeundae",
    title: "A slow beach evening in Haeundae",
    metaTitle: "Haeundae at Night 2026 — Beach Train, Market & Marine City View (Busan)",
    metaDescription: "A slow evening in Haeundae, Busan: Blue Line Park beach train before sunset, the beach and market, then the Marine City skyline. Guided sunset tours included.",
    lead: "Seaside train before sunset, the beach, market food and the Marine City skyline.",
    hero: IMG.haeundae,
    heroAlt: "Haeundae Beach at dusk",
    heroCaption: "Haeundae Beach",
    stepsTitle: "Or do it yourself",
    steps: [
      { time: "Before sunset", title: "Blue Line Park beach train", body: "Coastal train, ₩8,000–10,000 a ride (official). Runs until about 19:30 in October — not a night train." },
      { time: "Evening", title: "Haeundae Beach & market", body: "Beach walk, then street food at Haeundae Market." },
      { time: "Night", title: "The Bay 101 & Marine City view", body: "Skyline across the water — best right after dark." },
    ],
    tours: ["skyCapsule", "busanNightView"],
    toursTitle: "See it with a guide",
    bridge: { href: `${PLAN_BASE}/busan-night`, title: "Still want to dance?", body: "Seomyeon club street is on the same Line 2 — clubs you can book (Fri–Sat).", image: IMG.busanNight },
    card: { title: "Slow beach evening — Haeundae", line: "Seaside train → beach → skyline.", meta: "Busan · tours" },
  },
];

export const routeBySlug = (slug: string) => ROUTES.find((r) => r.slug === slug);

export const HOME_CARDS = [
  { href: `${PLAN_BASE}/busan-night`, title: "A show, then the club", sub: "Busan · Saturdays", image: IMG.busanNight },
  { href: `${PLAN_BASE}/hongdae-night`, title: "Dance & meet people", sub: "Hongdae · Seoul", image: IMG.hongdae },
  { href: `${PLAN_BASE}/itaewon-night`, title: "Global, English-friendly", sub: "Itaewon · Seoul", image: IMG.itaewon },
  { href: `${PLAN_BASE}/tours`, title: "No club — views & tours", sub: "Cruises · night views", image: IMG.hanRiver },
  { href: `${PLAN_BASE}/getting-around`, title: "Getting home safely", sub: "Last train · taxi · 1330", image: IMG.seoulSunset },
];

export const BOOK_HREF = (area?: string) => `/flags/new?lang=en${area ? `&area=${encodeURIComponent(area)}` : ""}`;
