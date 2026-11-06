// 클럽 한 줄 소개(외국인 트랙). 사실만 쓴다 — "No.1" "추천 1위" 같은 순위·보장 표현 금지.
// DM SEOUL: 운영자 포지셔닝 "강남 제일의 힙합 라운지"(2026-11-06) → 순위 단정 대신 "go-to"로 옮긴다.
// 최저 금액은 이 문구가 아니라 가격 표시(CLUB_MIN_SPEND_OVERRIDE)에서 온다. 여기에 금액을 박지 않는다.

type Lang = "en" | "ja" | "zh" | "zh-tw";

const DM_ID = "cc7db051-b75d-4c1f-9f95-29f7d8ce70d7";

const TAGLINES: Record<string, Record<Lang, string>> = {
  [DM_ID]: {
    en: "Gangnam’s go-to hip-hop lounge. Open Fri & Sat nights — and the lowest table minimum we offer in Gangnam.",
    ja: "江南を代表するヒップホップ・ラウンジ。営業は金・土の夜。江南で当社がご案内するテーブル最低金額が最も低いクラブです。",
    zh: "江南代表性的嘻哈 Lounge。仅周五、周六夜间营业，也是我们在江南提供的最低消费最低的夜店。",
    "zh-tw": "江南代表性的嘻哈 Lounge。僅週五、週六夜間營業，也是我們在江南提供的低消最低的夜店。",
  },
};

export function clubTagline(clubId: string | null | undefined, lang: Lang): string | null {
  return (clubId && TAGLINES[clubId]?.[lang]) || null;
}

// Club Ace 상세 하단의 대안 한 줄(2026-11-06). 에이스가 맞지 않는 손님(힙합·낮은 예산)에게 DM으로 가는 길.
const ACE_IDS = new Set(["8f0e78f8-60c8-49a5-b865-47c4eabf97de", "35de296e-5fdc-435b-baf2-1c7c05538687"]);
const DM_HINT: Record<Lang, string> = {
  en: "Prefer hip-hop? DM SEOUL tables start at ₩1,000,000 (Fri & Sat) →",
  ja: "ヒップホップ派なら — DM SEOULは₩1,000,000〜（金・土）→",
  zh: "更喜欢嘻哈？DM SEOUL 卡座 ₩1,000,000 起（周五、周六）→",
  "zh-tw": "更喜歡嘻哈？DM SEOUL 包廂 ₩1,000,000 起（週五、週六）→",
};

export function clubAltHint(clubId: string | null | undefined, lang: Lang): { text: string; slug: string } | null {
  return clubId && ACE_IDS.has(clubId) ? { text: DM_HINT[lang], slug: "dm-seoul" } : null;
}
