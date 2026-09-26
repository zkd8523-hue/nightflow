import { createHash } from "crypto";
import ja from "@/data/review-translations/ja.json";
import zh from "@/data/review-translations/zh.json";
import zhTw from "@/data/review-translations/zh-tw.json";
import type { Lang } from "@/lib/i18n";

// 구글 리뷰 일본어·중국어(간체·번체) 번역 — ⚠️ 서버 페이지에서만 import. 클라이언트에서 import해도 빌드는 될 수 있지만
// (crypto 브라우저 폴백) 번역 JSON ~330KB가 번들에 통째로 실린다. 서버 페이지에서 치환한 결과만 props로 넘길 것.
//
// 배경(2026-09-26): 리뷰는 ingest-google-ratings.mjs가 languageCode=en으로 받아 영어로만
// 저장된다. /ja·/zh·/zh-tw는 <html lang>이 그 언어라 브라우저 자동번역도 안 뜨고, 영어 리뷰가
// 그대로 노출됐다. 번역은 API 없이 Claude가 직접 해서 여기 JSON으로 커밋했다(399개, 욕설은
// 뜻을 살려 순화). DB 컬럼이 아닌 파일인 이유: 리뷰가 나오는 외국어 화면(홈·지역 목록 시트,
// 클럽 상세)이 전부 서버에서 데이터를 받으므로, 마이그레이션·배포 순서 없이 서버에서 바꿔 끼우면 된다.
//
// 키 = 원문(trim) sha1 앞 12자리. 리뷰를 다시 받아 새 문장이 들어오면 키가 없으므로 그 언어에서는
// 숨긴다 — 영어가 섞여 나오는 것보다 한 장 덜 보이는 게 낫다. 새 리뷰 번역 절차는
// scripts/check-review-translations.mjs 머리 주석 참고.
//
// 번역 규칙(다음 번역도 같게): 뜻·불만·숫자·이모지는 그대로(미화 금지). 욕설은 감정만 살린
// 비속어 없는 강조로(fucking good → めちゃくちゃ良かった / 超级好 / 超級讚), 성적 표현은 중립으로.
// 클럽·DJ·브랜드명은 라틴 표기 유지. 지역명 ja 江南·ホンデ·イテウォン, zh 江南·弘大·梨泰院.
// 번체는 문자 변환이 아니라 대만 어휘(夜店·包廂·低消·訂位·很讚·CP值). 기계번역 흔적은 쓴 사람 의도대로.

const DICTS: Partial<Record<Lang, Record<string, string>>> = { ja, zh, "zh-tw": zhTw };

export function reviewKey(text: string): string {
  return createHash("sha1").update(text.trim()).digest("hex").slice(0, 12);
}

// 구글이 주는 상대시각은 "a month ago" / "3 weeks ago" / "in the last week" 몇 가지뿐이다(2026-09 실측 24종).
const UNIT: Record<string, Record<"ja" | "zh" | "zh-tw", string>> = {
  minute: { ja: "分", zh: "分钟", "zh-tw": "分鐘" },
  hour: { ja: "時間", zh: "小时", "zh-tw": "小時" },
  day: { ja: "日", zh: "天", "zh-tw": "天" },
  week: { ja: "週間", zh: "周", "zh-tw": "週" },
  month: { ja: "か月", zh: "个月", "zh-tw": "個月" },
  year: { ja: "年", zh: "年", "zh-tw": "年" },
};

/** 번역 못 하는 형태면 null — 영어로 새게 두지 않고 시각만 뺀다. */
export function localizeRelativeTime(rel: string | null | undefined, lang: Lang): string | null {
  if (!rel) return null;
  if (lang !== "ja" && lang !== "zh" && lang !== "zh-tw") return rel;
  const s = rel.trim().toLowerCase();
  if (s === "in the last week") return { ja: "1週間以内", zh: "一周内", "zh-tw": "一週內" }[lang];
  const m = s.match(/^(a|an|\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (!m) return null;
  const n = m[1] === "a" || m[1] === "an" ? 1 : Number(m[1]);
  return `${n}${UNIT[m[2]][lang]}前`;
}

// 필드 전부를 제약에 둔다 — supabase 행이 any라 T가 제약 타입으로 추론되는데, 일부만 있으면 호출처 타입과 안 맞는다.
type ReviewLike = { author_name: string | null; rating: number | null; text: string | null; relative_time: string | null };

// 모든 언어에서 숨기는 리뷰.
// - 연락처가 적힌 홍보 리뷰: Club Ace(강남 추천) 페이지에 "외국인 테이블 예약은 Line:club_race /
//   Wechat:seoulclub888로" 라는 남의 중개 광고가 리뷰로 떠 있었다(2026-09-26 번역 중 발견).
//   우리 추천 클럽 페이지에서 손님을 경쟁 중개로 보내는 셈이라, 연락처 패턴이 있으면 자동으로 숨긴다.
// - 날짜만 있는 리뷰("2025/12/20") — 읽을 내용이 없다.
const CONTACT_RE = /\b(line|wechat|we\s*chat|whats\s*app|kakao(?:\s*talk)?|telegram|tg)\s*(id)?\s*[:：]\s*\S+/i;
const NO_CONTENT_RE = /^[\d\s/.\-:]+$/;

export function isHiddenReview(text: string): boolean {
  return CONTACT_RE.test(text) || NO_CONTENT_RE.test(text);
}

/**
 * 외국어 페이지용 리뷰 치환. 숨김 대상(isHiddenReview)은 모든 언어에서 뺀다.
 * en·ko는 원문 그대로, ja·zh·zh-tw는 번역문으로 바꾸고 번역 없는 리뷰는 뺀다.
 * 결과가 빈 배열이면 호출처의 "리뷰 있으면 렌더" 조건에 걸려 섹션째 숨는다.
 */
export function localizeReviews<T extends ReviewLike>(reviews: T[] | null | undefined, lang: Lang): T[] {
  if (!reviews) return [];
  const dict = DICTS[lang];
  return reviews.flatMap((r) => {
    const src = r.text?.trim();
    if (!src || isHiddenReview(src)) return [];
    if (!dict) return [r];
    const text = dict[reviewKey(src)];
    if (!text) return [];
    return [{ ...r, text, relative_time: localizeRelativeTime(r.relative_time, lang) }];
  });
}
