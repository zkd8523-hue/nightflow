// 주류 카테고리 정의
export const LIQUOR_CATEGORIES = [
  { key: "champagne", label: "샴페인", emoji: "🍾" },
  { key: "vodka", label: "보드카", emoji: "🍸" },
  { key: "whisky", label: "위스키", emoji: "🥃" },
  { key: "tequila", label: "데킬라", emoji: "🌵" },
  { key: "etc", label: "기타", emoji: "🍺" },
] as const;

export type LiquorCategoryKey = (typeof LIQUOR_CATEGORIES)[number]["key"];

// 카테고리별 브랜드 목록 (검색 대상)
export const LIQUOR_BRANDS: Record<string, string[]> = {
  champagne: [
    "모엣 샹동", "돔 페리뇽", "G.H. Mumm", "베르세이스 로제",
    "엔젤", "아르망 드 브리냑", "크뤽", "뵈브 클리코",
    "페리에 주에", "루이 로드레", "볼랭저",
  ],
  vodka: [
    "그레이구스", "벨베디어", "스노우레퍼드", "시록",
    "앱솔루트", "스미노프", "핀란디아", "케텔원",
  ],
  whisky: [
    "잭다니엘", "잭다니엘 허니", "발렌타인 17년", "맥켈란 12년",
    "조니워커 블루라벨", "조니워커 블랙라벨", "로얄살루트 21년",
    "글렌피딕", "시바스 리갈", "헨네시 VSOP", "헨네시 XO",
    "발렌타인 21년", "맥켈란 18년",
  ],
  tequila: [
    "호세 쿠엘보", "파트론", "돈 훌리오", "1800",
    "카사미고스", "에라두라",
  ],
  etc: [
    "맥주 세트", "소주 세트", "하이볼 세트", "논알콜 칵테일",
  ],
};

// 영문 검색 → 한글 브랜드 매핑
export const BRAND_ALIASES: Record<string, string> = {
  "grey goose": "그레이구스",
  "greygoose": "그레이구스",
  "jack daniels": "잭다니엘",
  "jack": "잭다니엘",
  "dom perignon": "돔 페리뇽",
  "dom": "돔 페리뇽",
  "moet": "모엣 샹동",
  "moët": "모엣 샹동",
  "johnny walker": "조니워커 블루라벨",
  "johnnie walker": "조니워커 블루라벨",
  "macallan": "맥켈란 12년",
  "hennessy": "헨네시 VSOP",
  "patron": "파트론",
  "belvedere": "벨베디어",
  "absolut": "앱솔루트",
  "mumm": "G.H. Mumm",
  "krug": "크뤽",
  "chivas": "시바스 리갈",
  "ballantine": "발렌타인 17년",
  "glenfiddich": "글렌피딕",
  "jose cuervo": "호세 쿠엘보",
  "don julio": "돈 훌리오",
  "casamigos": "카사미고스",
};

export const QUANTITY_OPTIONS = [1, 2, 3, 4, 5];

// 테이블 구성 (주류와 분리)
export const EXTRAS_OPTIONS = [
  "기본 안주", "과일 플레이트", "음료 무제한", "생일 이벤트 지원",
];

// 주류 판별용 키워드
export const LIQUOR_KEYWORDS = [
  "병",
  "샴페인", "보드카", "위스키", "데킬라",
  "모엣", "그레이구스", "잭다니엘", "발렌타인", "맥켈란", "돔 페리뇽",
  "헨네시", "파트론", "벨베디어", "조니워커",
  "로얄살루트", "글렌피딕", "시바스", "크뤽", "뵈브", "엔젤",
  "아르망", "스노우레퍼드", "시록", "앱솔루트", "스미노프",
  "호세", "돈 훌리오", "카사미고스",
  "맥주", "소주", "하이볼", "논알콜",
  "Mumm", "G.H.",
];
