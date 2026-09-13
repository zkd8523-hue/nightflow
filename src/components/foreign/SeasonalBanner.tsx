// 지역 페이지(/{lang}/clubs/{area}) 상단의 시즌 한 줄 배너. 서버 컴포넌트.
// 이태원·홍대·강남 페이지가 외국인 검색 유입 1위라 여기서 시즌 페이지로 흘려보낸다.
// 노출 창은 seasonal.ts가 정한다 — 지나면 null.

import Link from "next/link";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";
import { HALLOWEEN_2026, isHalloweenWindow } from "@/lib/foreign/seasonal";

const HALLOWEEN_AREAS = new Set(["itaewon", "hongdae", "gangnam"]);

const T: Record<SeoLang, { label: string; text: string; cta: string }> = {
  en: { label: "OCT 31 · SAT", text: "Halloween falls on a Saturday — clubs here hit capacity by 22:00.", cta: "Halloween tables & prices →" },
  ja: { label: "10/31 · 土", text: "今年のハロウィンは土曜日 — このエリアのクラブは22時には満員。", cta: "ハロウィンのテーブルと料金 →" },
  zh: { label: "10/31 · 周六", text: "今年万圣节是周六 — 这一带的夜店 22 点就满了。", cta: "万圣节卡座与价格 →" },
  "zh-tw": { label: "10/31 · 週六", text: "今年萬聖節是星期六 — 這一帶的夜店 22 點就滿了。", cta: "萬聖節包廂與價格 →" },
};

export function SeasonalBanner({ lang, areaSlug }: { lang: SeoLang; areaSlug: string }) {
  if (!isHalloweenWindow() || !HALLOWEEN_AREAS.has(areaSlug)) return null;
  const t = T[lang];
  return (
    <Link
      href={`/${lang}/${HALLOWEEN_2026.slug}`}
      data-nf-track="seasonal_banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 mx-4 my-3 px-4 py-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
    >
      <span className="text-[11px] font-black tracking-wider text-brand-amber">🎃 {t.label}</span>
      <span className="text-[13px] text-foreground break-keep flex-1 min-w-[200px]">{t.text}</span>
      <span className="text-[13px] font-bold text-brand-amber whitespace-nowrap">{t.cta}</span>
    </Link>
  );
}
