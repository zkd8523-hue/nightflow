// 오퍼 포함내역(includes)의 한글 → 영문 변환 (외국인 /en 오퍼 표시용).
// 주류는 글로벌 고유명사라 번역이 아니라 "영문 표기"다 (돔 페리뇽 → Dom Pérignon).
// constants/liquor.ts 의 LIQUOR_CATEGORIES / LIQUOR_BRANDS / EXTRAS_OPTIONS 와 키를 맞춘다.

// 카테고리 (LIQUOR_CATEGORIES)
const CATEGORY_EN: Record<string, string> = {
  "하드": "Spirits",
  "샴페인": "Champagne",
  "위스키": "Whisky",
  "꼬냑": "Cognac",
  "기타": "Other",
};

// 테이블 옵션 (EXTRAS_OPTIONS)
const EXTRAS_EN: Record<string, string> = {
  "퍼레이드": "Sparkler parade",
  "전광판": "LED screen shoutout",
  "신청곡": "Song request",
  "믹서 무제한": "Unlimited mixers",
  "생일 이벤트 지원": "Birthday event",
};

// 주류 브랜드 (LIQUOR_BRANDS) — 한글 → 영문 원명
const BRAND_EN: Record<string, string> = {
  // hard (보드카·데킬라·진)
  "앱솔루트": "Absolut",
  "스미노프": "Smirnoff",
  "그레이구스": "Grey Goose",
  "시록": "Cîroc",
  "벨루가": "Beluga",
  "벨베디어": "Belvedere",
  "스노우레퍼드": "Snow Leopard",
  "케텔원": "Ketel One",
  "핀란디아": "Finlandia",
  "호세 쿠엘보": "Jose Cuervo",
  "올메카": "Olmeca",
  "패트론 실버": "Patrón Silver",
  "카사미고스": "Casamigos",
  "돈 훌리오 1942": "Don Julio 1942",
  "클라세 아술": "Clase Azul",
  "에라두라": "Herradura",
  "1800": "1800",
  "봄베이 사파이어": "Bombay Sapphire",
  "핸드릭스": "Hendrick's",
  "탱커레이": "Tanqueray",
  "고든스": "Gordon's",
  // champagne
  "모엣 샹동": "Moët & Chandon",
  "뵈브 클리코": "Veuve Clicquot",
  "모엣 로제": "Moët Rosé",
  "돔 페리뇽": "Dom Pérignon",
  "아르망 드 브리냑": "Armand de Brignac",
  "크리스탈": "Cristal",
  "페리에 주에": "Perrier-Jouët",
  "볼랭저": "Bollinger",
  // whisky
  "잭다니엘": "Jack Daniel's",
  "잭다니엘 허니": "Jack Daniel's Honey",
  "짐빔": "Jim Beam",
  "발렌타인 17년": "Ballantine's 17yr",
  "발렌타인 21년": "Ballantine's 21yr",
  "조니워커 블랙라벨": "Johnnie Walker Black",
  "조니워커 블루라벨": "Johnnie Walker Blue",
  "맥캘란 12년": "Macallan 12yr",
  "맥캘란 18년": "Macallan 18yr",
  "로얄살루트 21년": "Royal Salute 21yr",
  "글렌피딕": "Glenfiddich",
  "시바스 리갈": "Chivas Regal",
  // cognac
  "헤네시 VS": "Hennessy VS",
  "헤네시 VSOP": "Hennessy VSOP",
  "헤네시 XO": "Hennessy XO",
  "레미마틴": "Rémy Martin",
  "루이 13세": "Louis XIII",
  "마르텔": "Martell",
  "까뮈": "Camus",
  // etc
  "맥주 세트": "Beer set",
  "소주 세트": "Soju set",
  "하이볼 세트": "Highball set",
  "논알콜 칵테일": "Non-alcoholic cocktails",
};

/**
 * 오퍼 includes 항목 한 개를 영문으로 변환.
 * "발렌타인 17년 2병" → "Ballantine's 17yr ×2"
 * "샴페인" → "Champagne"
 * "퍼레이드" → "Sparkler parade"
 * 매핑이 없으면(MD 커스텀 입력 등) 원본 그대로 반환 → 호출부에서 LLM 번역 대상.
 */
export function toEnglishInclude(item: string): string {
  const trimmed = item.trim();
  // "이름 N병" 패턴
  const match = trimmed.match(/^(.+?)\s+(\d+)병$/);
  const name = match ? match[1].trim() : trimmed;
  const qty = match ? match[2] : null;

  const en = BRAND_EN[name] ?? CATEGORY_EN[name] ?? EXTRAS_EN[name];
  if (en) {
    return qty ? `${en} ×${qty}` : en;
  }
  // 매핑 없음 — 원본 유지 (커스텀 항목)
  return trimmed;
}

/** 매핑에 있어(=정형 항목) 그대로 표시 가능한지. false면 LLM 번역 후보(커스텀 한글). */
export function isMappedInclude(item: string): boolean {
  const trimmed = item.trim();
  const match = trimmed.match(/^(.+?)\s+(\d+)병$/);
  const name = match ? match[1].trim() : trimmed;
  return name in BRAND_EN || name in CATEGORY_EN || name in EXTRAS_EN;
}
