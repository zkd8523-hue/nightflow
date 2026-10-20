// 지역 페이지(/{lang}/clubs/{area}) 상단의 시즌 한 줄 배너. 서버 컴포넌트.
// 이태원·홍대·강남 페이지가 외국인 검색 유입 1위라 여기서 시즌 페이지로 흘려보낸다.
// 노출 창은 seasonal.ts가 정한다 — 지나면 null.

import Link from "next/link";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";
import { HALLOWEEN_2026, CHRISTMAS_2026, NYE_2026, isHalloweenWindow, isChristmasWindow, isNyeWindow } from "@/lib/foreign/seasonal";

const HALLOWEEN_AREAS = new Set(["itaewon", "hongdae", "gangnam"]);

const T: Record<SeoLang, { label: string; text: string; cta: string }> = {
  en: { label: "OCT 31 · SAT", text: "Halloween falls on a Saturday — clubs here hit capacity by 22:00.", cta: "Halloween tables & prices →" },
  ja: { label: "10/31 · 土", text: "今年のハロウィンは土曜日 — このエリアのクラブは22時には満員。", cta: "ハロウィンのテーブルと料金 →" },
  zh: { label: "10/31 · 周六", text: "今年万圣节是周六 — 这一带的夜店 22 点就满了。", cta: "万圣节卡座与价格 →" },
  "zh-tw": { label: "10/31 · 週六", text: "今年萬聖節是星期六 — 這一帶的夜店 22 點就滿了。", cta: "萬聖節包廂與價格 →" },
};

// 할로윈 창이 닫히면(11/1 06시) 크리스마스 → 신년으로 넘어간다(2026-10-20).
const T_XMAS: Record<SeoLang, { label: string; text: string; cta: string }> = {
  en: { label: "DEC 24 · THU", text: "Christmas Eve is one of the busiest club nights of the year — book the group a table.", cta: "Christmas tables & prices →" },
  ja: { label: "12/24 · 木", text: "クリスマスイブは一年で最も混む夜のひとつ — グループはテーブル予約を。", cta: "クリスマスのテーブルと料金 →" },
  zh: { label: "12/24 · 周四", text: "平安夜是一年里夜店最满的晚上之一 — 一群人去就订卡座。", cta: "圣诞卡座与价格 →" },
  "zh-tw": { label: "12/24 · 週四", text: "平安夜是一年裡夜店最滿的晚上之一 — 一群人去就訂包廂，不怕被卡。", cta: "聖誕包廂與價格 →" },
};
const T_NYE: Record<SeoLang, { label: string; text: string; cta: string }> = {
  en: { label: "DEC 31 · THU", text: "Be inside for the midnight countdown — queues peak between 23:00 and 00:00.", cta: "New Year's Eve tables & prices →" },
  ja: { label: "12/31 · 木", text: "0時のカウントダウンは店内で — 23時〜0時が行列のピーク。", cta: "大晦日のテーブルと料金 →" },
  zh: { label: "12/31 · 周四", text: "0 点倒数要在店里 — 23 点到 0 点排队最长。", cta: "跨年卡座与价格 →" },
  "zh-tw": { label: "12/31 · 週四", text: "0 點倒數要在店裡 — 23 點到 0 點排隊最長。", cta: "跨年包廂與價格 →" },
};

export function SeasonalBanner({ lang, areaSlug }: { lang: SeoLang; areaSlug: string }) {
  if (!HALLOWEEN_AREAS.has(areaSlug)) return null;
  const season = isHalloweenWindow()
    ? { t: T[lang], slug: HALLOWEEN_2026.slug, icon: "🎃" }
    : isChristmasWindow()
      ? { t: T_XMAS[lang], slug: CHRISTMAS_2026.slug, icon: "🎄" }
      : isNyeWindow()
        ? { t: T_NYE[lang], slug: NYE_2026.slug, icon: "🥂" }
        : null;
  if (!season) return null;
  const t = season.t;
  return (
    <Link
      href={`/${lang}/${season.slug}`}
      data-nf-track="seasonal_banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 mx-4 my-3 px-4 py-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
    >
      <span className="text-[11px] font-black tracking-wider text-brand-amber">{season.icon} {t.label}</span>
      <span className="text-[13px] text-foreground break-keep flex-1 min-w-[200px]">{t.text}</span>
      <span className="text-[13px] font-bold text-brand-amber whitespace-nowrap">{t.cta}</span>
    </Link>
  );
}
