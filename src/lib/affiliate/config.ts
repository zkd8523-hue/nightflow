// 제휴 광고(쿠팡 파트너스 · 아고다) 공통 설정과 노출 규칙.
//
// 기획: ~/Desktop/나플_광고제안/제휴광고_구현가이드.md (2026-10-22)
// - 한국어 페이지 기본 = 쿠팡 "클럽 필수템". 강남·부산·페스티벌/지방 공연·연말 = 아고다 숙소.
// - 외국어 페이지 = 아고다 숙소만(외국인은 쿠팡을 못 쓴다).
// - 유료 광고(클럽 광고주)가 생기면 그 기간·자리만 덮어쓴다 — 지금은 제휴만 있다.

export const AGODA_CID = "1976626"; // nightflow.kr/en 사이트 ID (파트너 센터 Manage Your Sites)

/** 쿠팡이 요구하는 대가성 고지. 문구를 바꾸지 말 것. */
export const COUPANG_DISCLOSURE =
  "이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

export type AffLang = "ko" | "en" | "ja" | "zh" | "zh-tw";

export const AGODA_DISCLOSURE: Record<AffLang, string> = {
  ko: "아고다 제휴 링크예요. 예약하시면 나플이 수수료를 받을 수 있고, 가격은 똑같아요.",
  en: "Partner links via Agoda — we may earn a commission. Your price stays the same.",
  ja: "Agodaの提携リンクです。予約されると手数料を受け取る場合がありますが、料金は変わりません。",
  zh: "Agoda 合作链接——我们可能获得佣金，您的价格不变。",
  "zh-tw": "Agoda 合作連結——我們可能獲得佣金，您的價格不變。",
};

export const AD_LABEL: Record<AffLang, string> = {
  ko: "Ad",
  en: "Ad",
  ja: "広告",
  zh: "广告",
  "zh-tw": "廣告",
};

/** 큐레이션·노출 규칙에 쓰는 지역 키. */
/** seoul = 홍대·이태원·강남을 섞은 "서울 전체"(지역을 못 정하는 페이지의 기본) */
export type AffArea = "hongdae" | "itaewon" | "gangnam" | "busan" | "seoul" | "other";

const AREA_ALIASES: Record<Exclude<AffArea, "other">, string[]> = {
  hongdae: ["홍대", "hongdae", "마포", "합정", "연남", "상수"],
  itaewon: ["이태원", "itaewon", "용산", "한남"],
  gangnam: ["강남", "gangnam", "신사", "압구정", "청담", "논현", "역삼", "서초"],
  busan: ["부산", "busan", "서면", "해운대", "광안리"],
  seoul: ["서울", "seoul"],
};

/** 클럽 area(한글) · 영어 slug · 공연 venue_area 어느 것이든 받아 지역 키로. */
export function toAffArea(raw?: string | null): AffArea {
  if (!raw) return "other";
  const s = raw.toLowerCase();
  for (const [key, words] of Object.entries(AREA_ALIASES)) {
    if (words.some((w) => s.includes(w.toLowerCase()))) return key as AffArea;
  }
  return "other";
}

/** 서울 클럽권인지(서울 밖 공연 = 숙소 수요). */
export function isSeoulArea(raw?: string | null): boolean {
  if (!raw) return true; // 모르면 서울로 본다(숙소 카드를 남발하지 않게)
  const a = toAffArea(raw);
  if (a === "hongdae" || a === "itaewon" || a === "gangnam" || a === "seoul") return true;
  return /서울|seoul|강북|성수|건대|종로|을지로|신촌|잠실/i.test(raw);
}

const FESTIVAL_RE = /(festival|페스티벌|페스타|\bfest\b|축제)/i;

export interface AffContext {
  lang: AffLang;
  /** 클럽 area 또는 공연 venue_area */
  area?: string | null;
  /** 공연 페이지일 때만 */
  event?: {
    date: string; // YYYY-MM-DD
    dateEnd?: string | null;
    title?: string | null;
    venueType?: string | null;
  } | null;
  /** 테스트용 "오늘"(KST YYYY-MM-DD) */
  todayKst?: string;
}

export type AffKind = "coupang" | "agoda";

/** 이 공연이 숙소 수요가 있는 공연인지 — 페스티벌·여러 날·서울 밖. */
export function isStayEvent(ev: NonNullable<AffContext["event"]>, area?: string | null): boolean {
  if (ev.dateEnd && ev.dateEnd > ev.date) return true;
  if (ev.venueType && /festival|outdoor|야외|페스티벌/i.test(ev.venueType)) return true;
  if (ev.title && FESTIVAL_RE.test(ev.title)) return true;
  return !isSeoulArea(area); // 부산·지방 공연
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 연말(12/10~12/31)엔 서울 클럽도 숙소 — 카운트다운·막차 수요. */
function isYearEnd(today: string): boolean {
  const md = today.slice(5);
  return md >= "12-10" && md <= "12-31";
}

/**
 * 어떤 제휴를 보여줄지. 외국어는 늘 아고다, 한국어는 문맥으로.
 * (가이드 2장: 강남·부산 상시 아고다, 페스티벌/지방 공연 아고다, 연말 서울 확대)
 */
export function decideAffiliate(ctx: AffContext): AffKind {
  if (ctx.lang !== "ko") return "agoda";
  if (ctx.event && isStayEvent(ctx.event, ctx.area)) return "agoda";
  const a = toAffArea(ctx.area);
  if (a === "gangnam" || a === "busan") return "agoda";
  if (isYearEnd(ctx.todayKst ?? kstToday()) && isSeoulArea(ctx.area)) return "agoda";
  return "coupang";
}

/** 미리보기 모드: 쿠팡 링크가 아직 없는 상품도 자리표시로 보여준다(?affpreview=1). */
export function isAffPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("affpreview");
    if (q === "1") sessionStorage.setItem("nf_affpreview", "1");
    if (q === "0") sessionStorage.removeItem("nf_affpreview");
    return sessionStorage.getItem("nf_affpreview") === "1";
  } catch {
    return false;
  }
}
