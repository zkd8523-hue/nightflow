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
  gwangan: "https://images.unsplash.com/photo-1728694884774-f2bfea5a3a24", // Shibin Joseph, Gwangalli Beach (Gwangan Bridge at night)
  marineCity: "https://images.unsplash.com/photo-1641730146205-f6e594f7a619", // Wonder KIM, Busan (Marine City at night)
  seoulSkyline: "https://images.unsplash.com/photo-1782889699347-ec87acfe5b79", // yeojin yun, Seongdong-gu, Seoul (Gangnam skyline)
  suwon: "https://images.unsplash.com/photo-1694994719977-edead6092a70", // Fukuro 0wl, Suwon (Hwaseong at night)
  gyeongju: "https://images.unsplash.com/photo-1669764372822-3cb8476d4f47", // john ko, Donggung Palace & Wolji Pond
  // 2026-10-01 추가 상품용 — 사진 페이지 위치 확인(viator-night-products-2.json)
  bbqGrill: "https://images.unsplash.com/photo-1548959466-3a93a7b224e8", // Hanbyul Jeong, Jeju (BBQ grill — 서울 사진 못 찾음)
  myeongdongNight: "https://images.unsplash.com/photo-1590437084089-9f5ae1500176", // Mike Swigunski, Seoul
  hongdaeStreet: "https://images.unsplash.com/photo-1765375783706-05aeeaf59e5f", // Jinhan Moon, Hongik Univ. Station
  naksanPath: "https://images.unsplash.com/photo-1777113310407-251c72227184", // note thanun, Seoul
  myeongdongStore: "https://images.unsplash.com/photo-1760020954071-13a2c86076ff", // Jin-Woo Lee, Myeongdong
  gwanghwamun: "https://images.unsplash.com/photo-1755985567147-863404bc0824", // Adrian O, Gwanghwamun Square
  lotteTower: "https://images.unsplash.com/photo-1703838078830-c639058d9522", // Andrea De Santis, Seoul
  kkangtong: "https://images.unsplash.com/photo-1748838316813-ca91d01294d8", // Cecelia Chang, Busan
  busanHill: "https://images.unsplash.com/photo-1704544993415-9c6b80c359ed", // Lucas Schneider, Busan
  gwanganBridge: "https://images.unsplash.com/photo-1702741274890-5160282e53bb", // Ryoo Geon Uk, korea (Gwangan Bridge)
  marineReflect: "https://images.unsplash.com/photo-1702741306031-457e46c673a1", // Ryoo Geon Uk, korea (Marine City)
  busanLights: "https://images.unsplash.com/photo-1686232344073-f1b7dd22ca6b", // Nichika Sakurai, Busan
};
export const img = (base: string, w = 1200) => `${base}?w=${w}&q=80&auto=format`;
export const PHOTO_CREDIT: Record<string, string> = {
  [IMG.busanNight]: "Wade Lee",
  [IMG.haeundae]: "Sung Jin Cho",
  [IMG.hongdae]: "realfish",
  [IMG.itaewon]: "Inkwon hwang",
};

export const TOUR_REGIONS = ["Seoul", "Busan", "Suwon", "Gyeongju"] as const;
export type TourRegion = (typeof TOUR_REGIONS)[number];

export type Tour = {
  id: string;
  /** 투어 페이지 지역 필터 값 */
  region: TourRegion;
  title: string;
  desc: string;
  badge: string;
  /** Viator 원화 표기에서 반올림. 원화 표기를 못 본 상품은 priceUsd(검색 스니펫 표기) 또는 가격 없이 */
  priceKrw?: number;
  priceUsd?: number;
  image: string;
  url: string; // Viator 상품 원 주소(제휴 쿼리는 링크 만들 때 붙임)
};

export const TOURS: Record<string, Tour> = {
  seoulSmallGroup: { id: "seoulSmallGroup", region: "Seoul", title: "Seoul city night view tour", desc: "Small-group evening tour of Seoul's lights.", badge: "Small group · max 8", priceKrw: 50000, image: IMG.seoulSunset, url: "https://www.viator.com/tours/Seoul/Seoul-City-Night-View-tour-Small-Group-8-Max/d973-361415P46" },
  hanCruise: { id: "hanCruise", region: "Seoul", title: "Han River night cruise + Gwangjang Market", desc: "River lights, then Seoul's famous food market.", badge: "Cruise · market", priceKrw: 65000, image: IMG.hanRiver, url: "https://www.viator.com/tours/Seoul/Seoul-Night-Han-River-Cruise-and-Gwangjang-Market-and-Hidden-Street/d973-361415P132" },
  seoulPrivate: { id: "seoulPrivate", region: "Seoul", title: "Private night tour: skyline & Han River", desc: "Your own guide and pace — good if you travel solo.", badge: "Private · your pace", priceKrw: 116000, image: IMG.seoulSkyline, url: "https://www.viator.com/tours/Seoul/Seoul-Private-Night-Tour-Skyline-Han-River-and-City-Lights/d973-117866P758" },
  nTowerWalk: { id: "nTowerWalk", region: "Seoul", title: "N Seoul Tower & Myeongdong night walk", desc: "City views from the tower, street food after.", badge: "Walking · N Seoul Tower", priceKrw: 136000, image: IMG.nTower, url: "https://www.viator.com/tours/Seoul/Seoul-N-Seoul-Tower-and-Myeongdong-Night-Walking-Tour/d973-5652208P5" },
  busanHike: { id: "busanHike", region: "Busan", title: "Busan night view hike", desc: "Evening hike up Hwangnyeongsan with a local guide.", badge: "Small group · night hike", priceKrw: 35000, image: IMG.busanNight, url: "https://www.viator.com/tours/Busan/Busan-The-best-night-view-with-small-group-tour/d4615-408008P6" },
  busanByNight: { id: "busanByNight", region: "Busan", title: "Busan by Night", desc: "Hwangnyeongsan lookout, Gwangalli, Cinema Center lights.", badge: "Coach · lookout + Gwangalli", priceKrw: 132000, image: IMG.gwangan, url: "https://www.viator.com/tours/Busan/Busan-by-Night/d4615-6630PUSK_6SIC" },
  skyCapsule: { id: "skyCapsule", region: "Busan", title: "Haeundae Sky Capsule at sunset + night view", desc: "Seaside capsule ride, then Busan's night skyline.", badge: "Sunset · Sky Capsule", priceKrw: 78000, image: IMG.haeundae, url: "https://www.viator.com/tours/Busan/Sunset-Haeundae-Sky-Capsule-and-Busan-Night-view-Tour-from-Busan/d4615-48881P202" },
  // 수원·경주(2026-10-01): viator.com이 403이라 검색 스니펫으로만 확인 — 야간 포함 문구 있는 상품만.
  suwonFortress: { id: "suwonFortress", region: "Suwon", title: "Suwon Hwaseong Fortress at night", desc: "From Seoul, about 5 hours — the fortress gates lit up after dark.", badge: "From Seoul · night fortress", priceUsd: 69, image: IMG.suwon, url: "https://www.viator.com/tours/Seoul/Night-Tour-of-Suwon-Hwaseong-Fortress/d973-14882P42" },
  gyeongjuDay: { id: "gyeongjuDay", region: "Gyeongju", title: "Gyeongju day tour, ending at lit-up Wolji Pond", desc: "From Busan, about 11 hours — runs into the evening for Donggung Palace lights.", badge: "From Busan · day into night", image: IMG.gyeongju, url: "https://www.viator.com/tours/Busan/Gyeongju-UNESCO-World-Heritage-One-Day-Tour/d4615-48881P43" },
  busanNightView: { id: "busanNightView", region: "Busan", title: "Busan Night-view Tour", desc: "Guided tour of Busan's night views.", badge: "Guided · night views", priceKrw: 99000, image: IMG.marineCity, url: "https://www.viator.com/tours/Busan/Busan-Night-view-Tour/d4615-48881P121" },
  // 2026-10-01 2차 추가: viator.com 403이라 검색 스니펫(시작 시간·야간 문구)으로만 확인. 가격은 스니펫 US$ 표기만, 확실치 않으면 비움.
  // 뺀 것: 술집 순례·술 게임·치맥 상품, 예약 불가로 뜬 상품, hanCruise와 겹치는 한강 크루즈, 밤 전용 아닌 엑스더스카이.
  seoulBbqFood: { id: "seoulBbqFood", region: "Seoul", title: "Night food tour with Korean BBQ", desc: "4-hour evening food tour, starting 5pm at Euljiro 1-ga.", badge: "Small group · food", priceUsd: 110, image: IMG.bbqGrill, url: "https://www.viator.com/tours/Seoul/Small-Group-Korean-Night-Food-Tour/d973-5583FOOD" },
  seoulNightFood: { id: "seoulNightFood", region: "Seoul", title: "Night food tour: traditional & modern", desc: "3-hour night walking food tour, starting 5pm.", badge: "Walking · food", priceUsd: 89, image: IMG.myeongdongNight, url: "https://www.viator.com/tours/Seoul/Night-Food-Tour-in-Seoul-with-Traditional-and-Modern-Cuisine/d973-15527P31" },
  hongdaeFood: { id: "hongdaeFood", region: "Seoul", title: "Hongdae & Yeonnam night food tour", desc: "Starts 5:30pm with a night stroll in Yeonnam-dong — dinner included.", badge: "Walking · food", priceUsd: 130, image: IMG.hongdaeStreet, url: "https://www.viator.com/tours/Seoul/Seoul-Night-Food-Tour-Yeonnam-and-Hongdae/d973-27619P6" },
  seoulPalaceNight: { id: "seoulPalaceNight", region: "Seoul", title: "Gwangjang Market, palace & Naksan Park at night", desc: "Meets 5pm in Myeongdong — evening palace, then the lit city wall.", badge: "Guided · palace + market", image: IMG.naksanPath, url: "https://www.viator.com/tours/Seoul/Seoul-Night-Explorer-4-in-1-Day-including-Gwangmyeong-Cave-and-N-Seoul-Tower/d973-47013P23" },
  nanta: { id: "nanta", region: "Seoul", title: "NANTA show in Myeongdong", desc: "Non-verbal kitchen comedy — 8pm shows run most days.", badge: "Show · 1.5 hours", image: IMG.myeongdongStore, url: "https://www.viator.com/tours/Seoul/Myeongdong-NANTA/d973-114565P1" },
  painters: { id: "painters", region: "Seoul", title: "The Painters show, Gwanghwamun", desc: "Live drawing performance — daily 8pm show.", badge: "Show · 75 min", priceUsd: 24, image: IMG.gwanghwamun, url: "https://www.viator.com/tours/Seoul/Painters/d973-204437P1" },
  lotteTower: { id: "lotteTower", region: "Seoul", title: "Lotte World Tower Seoul Sky ticket", desc: "Skip-the-line entry, open until 10pm — Seoul's highest view.", badge: "Ticket · until 22:00", priceUsd: 50, image: IMG.lotteTower, url: "https://www.viator.com/tours/Seoul/Skip-The-Line-Lotte-World-Tower-Sky-Deck-Admission-Including-One-way-Metro-Ticket/d973-54628P1" },
  kkangtongFood: { id: "kkangtongFood", region: "Busan", title: "Kkangtong Market night food tour", desc: "Bupyeong Kkangtong Market, then a Korean BBQ pork dinner.", badge: "Food · market", priceUsd: 110, image: IMG.kkangtong, url: "https://www.viator.com/tours/Busan/Busan-Night-food-tour-Bupyeong-Kkangtong-market/d4615-42053P84" },
  busanMarketNight: { id: "busanMarketNight", region: "Busan", title: "Night food market + Hwangnyeongsan lookout", desc: "Leaves 7pm — dinner market, then the city from the hill.", badge: "Guided · market + view", image: IMG.busanHill, url: "https://www.viator.com/tours/Busan/Busan-Night-Tour-Including-Night-Food-Market-Visit/d4615-35385P8" },
  busanCruise: { id: "busanCruise", region: "Busan", title: "Busan night tour with a fireworks cruise", desc: "See Busan lit up at night from the water.", badge: "Cruise · fireworks", priceUsd: 110, image: IMG.gwanganBridge, url: "https://www.viator.com/tours/Busan/Busan-1-Night-Tour-with-a-Boat-tour/d4615-35385P3" },
  marineYacht: { id: "marineYacht", region: "Busan", title: "Marine City night tour with yacht cruise", desc: "One-hour yacht ride past Busan's night skyline.", badge: "Yacht · 1 hour on water", priceUsd: 80, image: IMG.marineReflect, url: "https://www.viator.com/tours/Busan/Busan-Marine-City-Night-Tour-Including-Yacht-Cruise/d4615-38395P9" },
  haeundaeBbq: { id: "haeundaeBbq", region: "Busan", title: "Haeundae night view & food tour with BBQ", desc: "After sunset — street food, skyline, Korean BBQ.", badge: "Small group · food", priceUsd: 102, image: IMG.busanLights, url: "https://www.viator.com/tours/Busan/Small-Group-Haeundae-Night-Food-tour-with-Korean-BBQ/d4615-123012P4" },
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
  /** 목록 카드 — plan은 실제 시각·비용이 든 동선(facts-nr-*-s.md 범위 안), know는 가기 전에 알아야 할 한 줄 */
  card: { title: string; line: string; meta: string; plan: { t: string; s: string }[]; know: string };
  days?: boolean;
  footnote?: string;
  /** 지역 클럽 목록(예약 의도 정본)으로 가는 링크 — SEO 세션 권고(코스 → 지역 클럽 페이지) */
  allClubs?: { href: string; label: string };
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
    allClubs: { href: "/en/clubs/hongdae", label: "See all Hongdae clubs →" },
    tours: ["hongdaeFood", "seoulSmallGroup", "hanCruise"],
    toursTitle: "Before the club",
    card: { title: "Dance & meet people — Hongdae", line: "Street music → park → club street. Easiest first night.", meta: "Seoul · Hongdae", plan: [{ t: "Until 22:00", s: "Street music on the walking street" }, { t: "Dinner", s: "Yeonnam park cafés" }, { t: "Late", s: "Club street · entry often ₩10–30K" }], know: "Saturday last trains end about an hour earlier than weekdays." },
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
    allClubs: { href: "/en/clubs/itaewon", label: "See all Itaewon clubs →" },
    tours: ["seoulPrivate", "nTowerWalk"],
    toursTitle: "Before the club",
    footnote: "Route based on travel guides, not an official course.",
    card: { title: "Global & English-friendly — Itaewon", line: "World food → rooftop view → clubs.", meta: "Seoul · Itaewon", plan: [{ t: "Evening", s: "World Food Street dinner" }, { t: "Sunset", s: "Haebangchon rooftop · N Seoul Tower view" }, { t: "Late", s: "Main strip clubs — busiest Fri–Sat" }], know: "The rooftops are uphill — give the climb time." },
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
    metaDescription: "Free Gwangalli drone show on Saturdays (Oct–Feb 19:00 & 21:00), then Seomyeon, Busan's club street — both on subway Line 2. Book a table in English if you want one.",
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
    allClubs: { href: "/en/clubs/busan", label: "See all Busan clubs →" },
    clubsNote: "Days, entry and prices from NightFlow listings; may change.",
    tours: ["busanCruise", "busanHike", "busanByNight"],
    toursTitle: "Before the club",
    card: { title: "A show, then the club — Busan", line: "Free drone show → Seomyeon club street.", meta: "Busan · Saturdays", plan: [{ t: "Sat 19:00 / 21:00", s: "Free drone show, Gwangalli (Oct–Feb)" }, { t: "22:00~", s: "Seomyeon — same subway Line 2" }, { t: "01:00~", s: "Late club Azit" }], know: "Weather can cancel the show — check the official site that day." },
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
    tours: ["marineYacht", "haeundaeBbq", "skyCapsule", "busanNightView"],
    toursTitle: "See it with a guide",
    bridge: { href: `${PLAN_BASE}/busan-night`, title: "Still want to dance?", body: "Seomyeon club street is on the same Line 2 — clubs you can book (Fri–Sat).", image: IMG.busanNight },
    card: { title: "Slow beach evening — Haeundae", line: "Seaside train → beach → skyline.", meta: "Busan · Haeundae", plan: [{ t: "Before 19:30", s: "Beach train · ₩8,000–10,000 a ride (Oct)" }, { t: "Until 22:00", s: "Haeundae Market street food" }, { t: "After dark", s: "Marine City skyline from The Bay 101" }], know: "The beach train is not a night ride — go before sunset." },
  },
];

export const routeBySlug = (slug: string) => ROUTES.find((r) => r.slug === slug);

export const HOME_CARDS = [
  { href: PLAN_BASE, title: "Night tours & views", sub: "Seoul · Busan · more", image: IMG.hanRiver },
  { href: `${PLAN_BASE}/busan-night`, title: "A show, then the club", sub: "Busan · Saturdays", image: IMG.busanNight },
  { href: `${PLAN_BASE}/hongdae-night`, title: "Dance & meet people", sub: "Hongdae · Seoul", image: IMG.hongdae },
  { href: `${PLAN_BASE}/itaewon-night`, title: "Global, English-friendly", sub: "Itaewon · Seoul", image: IMG.itaewon },
  { href: `${PLAN_BASE}/getting-around`, title: "Getting home safely", sub: "Last train · taxi · 1330", image: IMG.seoulSunset },
];

export const BOOK_HREF = (area?: string) => `/flags/new?lang=en${area ? `&area=${encodeURIComponent(area)}` : ""}`;
