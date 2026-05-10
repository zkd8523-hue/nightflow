export const CONTACT_PATTERNS = {
  phone_mobile: /(?:\+?82[\s\-.·_]?|0)1(?:0|1|[6-9])[\s\-.·_‐‑‒–—ㅡ―]?\d{3,4}[\s\-.·_‐‑‒–—ㅡ―]?\d{4}/,
  phone_landline: /(?:\+?82[\s\-.·_]?|0)(?:2|3[1-3]|4[1-4]|5[1-5]|6[1-4])[\s\-.·_‐‑‒–—ㅡ―]?\d{3,4}[\s\-.·_‐‑‒–—ㅡ―]?\d{4}/,
  phone_special: /\b(?:1(?:5(?:88|77|99)|6(?:44|66|70|88)|899)|080)[\s\-.·_‐‑‒–—ㅡ―]?\d{3,4}[\s\-.·_‐‑‒–—ㅡ―]?\d{0,4}\b/,
  phone_compact: /\b01[016-9]\d{7,8}\b/,
  phone_fullwidth: /[０-９]{3}[\s\-.·]?[０-９]{3,4}[\s\-.·]?[０-９]{4}/,
  phone_hangul: /[공영빵일이둘삼사오육칠팔구]{10,}/,

  url_http: /https?:\/\/[^\s]+/i,
  url_bare: /\b[\w-]+\.(?:com|kr|net|org|me|tv|io|app|link|gg)(?:\/[^\s]*)?/i,

  social_handle: /(?<![A-Za-z0-9_])@[A-Za-z0-9._]{2,}/,
  insta_url: /instagram\.com\/[^\s]+/i,
  telegram_url: /(?:t\.me|telegram\.me)\/[^\s]+/i,
  kakao_url: /(?:open\.kakao\.com|pf\.kakao\.com|kko\.to)\/[^\s]+/i,
  line_url: /line\.me\/[^\s]+/i,

  kakao_keyword: /(?:카\s*톡|카\s*카\s*오\s*톡|오\s*픈\s*카\s*톡|오\s*픈\s*채\s*팅|kakao|kkt|kkid)[\s가-힣:：=\-]{0,20}[A-Za-z0-9_.]{3,}/i,
  dm_keyword: /(?:디\s*엠|\bd\s*m\b|insta?gram|인\s*스\s*타(?:그램)?|텔레그램|라인|\bline\b)[\s가-힣:：=\-]{0,20}[@A-Za-z0-9_.]{3,}/i,
  // 단독 차단: 라인·인스타는 제외 (라인업·인스타 사진 등 정상 표현 보호)
  messenger_solo: /(?:디\s*엠|\bDM\b|카\s*톡|카\s*카\s*오\s*톡|오\s*픈\s*카\s*톡|오\s*픈\s*채\s*팅|텔\s*레\s*그\s*램|\btelegram\b|\bkakao\b|\bkkt\b|\bkkid\b)/i,
} as const;

export type ContactPatternType = keyof typeof CONTACT_PATTERNS;

export interface ContactDetection {
  type: ContactPatternType;
  match: string;
}

/** 전각 숫자(０-９)를 ASCII 숫자로 정규화. 혼합형 우회 (예: ０１０-1234-5678) 검출용. */
function normalizeFullwidthDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)
  );
}

export function detectContactInfo(text: string): ContactDetection[] {
  if (!text) return [];
  const results: ContactDetection[] = [];
  // 원문 + 전각 정규화본 둘 다 검사 (전각/혼합형 우회 차단)
  const normalized = normalizeFullwidthDigits(text);
  const targets = normalized === text ? [text] : [text, normalized];
  for (const [type, regex] of Object.entries(CONTACT_PATTERNS)) {
    for (const t of targets) {
      const match = t.match(regex);
      if (match) {
        results.push({ type: type as ContactPatternType, match: match[0] });
        break;
      }
    }
  }
  return results;
}

export function describeContactDetection(detections: ContactDetection[]): string {
  if (detections.length === 0) return "";
  const types = new Set(detections.map((d) => d.type));
  const labels: string[] = [];
  if ([...types].some((t) => t.startsWith("phone"))) labels.push("전화번호");
  if ([...types].some((t) => t.startsWith("url_") || t.endsWith("_url"))) labels.push("URL");
  if (types.has("social_handle")) labels.push("@핸들");
  if (types.has("kakao_keyword") || types.has("dm_keyword") || types.has("messenger_solo")) {
    labels.push("메신저/SNS 키워드");
  }
  return labels.join(", ");
}
