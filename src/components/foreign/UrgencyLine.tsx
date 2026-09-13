// 폼 앞 CTA 위 한 줄 — "주말은 예약이 조기 마감될 수 있어요".
// 목업으로 5곳 비교 후 3곳으로 좁혔다(2026-09-14): 홈 히어로, 홈 sticky, 클럽 상세 하단 고정 바.
// 뺀 곳: 클럽 상세 예약 블록(고정 바와 한 화면에 같이 보여 도배가 됨), vip-tables(고정 바가
// 없어 표 → 클럽 상세 → 고정 바 경로로 어차피 본다).
//
// 숫자·요일·카운트다운 없음. 신청 순 확인·만석 시 입장 중단은 구조적으로 참이라 이 문구만 쓴다.
// 글로우는 아주 옅게(목업에서 강한 버전은 반려됨), ⚡만 3초 주기로 살짝 숨쉼(nf-breathe, globals.css).

import type { SeoLang } from "@/lib/seo/clubBookingSeo";

const TEXT: Record<SeoLang, string> = {
  en: "Hurry — weekend bookings can close early.",
  ja: "お急ぎを — 週末の予約は早めに締め切ることがあります。",
  zh: "抓紧 — 周末预订可能提前截止。",
  // 手刀 = 대만 구어 "서둘러"(Dcard·Threads 어투)
  "zh-tw": "手刀 — 週末預訂可能提前額滿。",
};

// lang은 홈(EnHomeClient)의 Lang("ko" 포함)도 받는다 — 외국어 트랙 밖이면 영어로.
export function UrgencyLine({ lang, align = "center", className = "" }: { lang: string; align?: "center" | "left"; className?: string }) {
  const text = TEXT[lang as SeoLang] ?? TEXT.en;
  return (
    <p
      className={`flex items-center gap-1.5 text-[12px] font-bold text-brand-amber break-keep [text-shadow:0_0_8px_rgba(245,158,11,0.28)] ${align === "center" ? "justify-center text-center" : "justify-start"} ${className}`}
    >
      <span aria-hidden className="inline-block motion-safe:animate-[nf-breathe_3.2s_ease-in-out_infinite] [filter:drop-shadow(0_0_3px_rgba(245,158,11,0.45))]">⚡</span>
      {text}
    </p>
  );
}
