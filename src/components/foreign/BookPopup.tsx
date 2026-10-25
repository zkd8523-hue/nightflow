"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics/events";

// 외국어 클럽 상세 예약 유도 팝업(2026-10-25 운영자 결정, 하이엔드 검수 A안 "컨시어지형").
// "concierge"는 사람이 영어로 응대한다는 전제에서만 맞는 말 — 응대 구조가 바뀌면 문구도 바꿀 것.
// 들어오고 6초 뒤 한 번만(3초는 너무 빠르다 — 운영자 2026-10-25) — 들어오자마자 본문을 가리면 구글이 모바일 검색 유입 페이지 품질을 깎는다.
// 닫거나 누르면 7일간 다시 안 띄운다. 예약 안 되는 클럽 페이지에서도 뜬다(폼에서 예약 가능한 클럽 추천).
// 문구는 하이엔드 검수 통과본: 가성비 톤("real prices", "no deposit")·VIP 표현·"Book now"(즉시 결제로 읽힘) 금지.
// 닫기 문구는 거절("No thanks")이 아니라 "계속 둘러보기"로(운영자 2026-10-25).
// 가독성(운영자: "가독성 너무 구려"): 어두운 페이지 위 밝은 카드 + 검정 큰 글씨, 뒤 배경은 어둡게 흐림.

const KEY = "nf_book_popup_until";
const DELAY_MS = 6000;
const SNOOZE_MS = 7 * 864e5;

const COPY: Record<string, { title: string; sub: string; cta: string; close: string }> = {
  en: { title: "Let our concierge arrange your table.", sub: "We confirm everything with the club and send it to you in writing.", cta: "Request a table", close: "Keep browsing" },
  ja: { title: "コンシェルジュが\nテーブルを手配します。", sub: "クラブに確認し、\n内容を書面でお送りします。", cta: "テーブルをリクエスト", close: "このまま見る" },
  zh: { title: "让我们的礼宾\n为您安排卡座。", sub: "我们会与夜店确认所有细节，\n并以书面形式发给您。", cta: "申请卡座", close: "继续浏览" },
  "zh-tw": { title: "讓我們的禮賓\n為您安排包廂。", sub: "我們會向夜店確認所有細節，\n並以書面傳給您。", cta: "申請包廂", close: "繼續瀏覽" },
};

export function BookPopup({ lang, href, clubId, bookable }: { lang: string; href: string; clubId: string; bookable: boolean }) {
  const [open, setOpen] = useState(false);
  const c = COPY[lang] ?? COPY.en;

  useEffect(() => {
    let until = 0;
    try { until = Number(localStorage.getItem(KEY) || 0); } catch {}
    if (until > Date.now()) return;
    const t = setTimeout(() => {
      setOpen(true);
      trackEvent("foreign_book_popup_view", { lang, club_id: clubId, bookable });
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [lang, clubId, bookable]);

  const snooze = () => { try { localStorage.setItem(KEY, String(Date.now() + SNOOZE_MS)); } catch {} };
  const dismiss = (how: string) => {
    snooze();
    setOpen(false);
    trackEvent("foreign_book_popup_dismiss", { lang, club_id: clubId, bookable, how });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" role="dialog" aria-modal="true" aria-label={c.title.replace("\n", "")}>
      <button type="button" aria-label={c.close} onClick={() => dismiss("backdrop")}
        className="absolute inset-0 bg-black/75 backdrop-blur-[3px]" />
      <div className="relative w-full max-w-[360px] rounded-3xl bg-[#faf8f3] px-5 pt-12 pb-4 text-center shadow-2xl">
        <button type="button" aria-label={c.close} onClick={() => dismiss("x")}
          className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center text-[#555] hover:bg-black/5 text-[18px] leading-none">
          ✕
        </button>
        <h2 className="text-[22px] leading-[1.2] font-black tracking-tight text-[#111] [text-wrap:balance]">{c.title.split("\n").map((line) => <span key={line} className="block">{line}</span>)}</h2>
        {/* 한·중·일은 단어 중간에서 끊겨("细/节") 쉼표 뒤 \n에서만 줄을 바꾼다 */}
        <p className="mt-3 text-[15px] leading-[1.5] text-[#444] [text-wrap:balance]">
          {c.sub.split("\n").map((line) => <span key={line} className="block">{line}</span>)}
        </p>
        <Link rel="nofollow" href={href} data-nf-track="book_popup_cta"
          onClick={() => { snooze(); trackEvent("foreign_book_popup_click", { lang, club_id: clubId, bookable }); }}
          className="mt-6 block w-full rounded-2xl bg-amber-500 py-4 text-[17px] font-black text-black hover:bg-amber-400">
          {c.cta}
        </Link>
        <button type="button" onClick={() => dismiss("no_thanks")}
          className="mt-2 w-full py-3 text-[15px] font-semibold text-[#555] hover:text-[#111]">
          {c.close}
        </button>
      </div>
    </div>
  );
}
