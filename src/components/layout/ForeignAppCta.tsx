"use client";

import { Apple, Smartphone } from "lucide-react";
import type { Lang } from "@/lib/i18n";

// 외국인용 앱 다운로드 CTA. 기종 무관 App Store + Google Play 둘 다 노출
// (플랫폼 감지는 iPad·인앱브라우저 등에서 오탐 → 항상 둘 다 보여줘 다운로드 옵션 최대화).
// iOS 앱은 미국·중국·일본 스토어 출시 (한국 제외 = 외국인 전용).
const APP_STORE_URL = "https://apps.apple.com/app/id6769749996";
const playUrl = (lang: Lang) =>
  `https://play.google.com/store/apps/details?id=kr.nightflow.app&hl=${lang === "ko" ? "en" : lang}`;

const STR: Record<"en" | "ja" | "zh", { title: string; sub: string; ios: string; android: string }> = {
  en: { title: "📱 Get the NightFlow app", sub: "Faster booking, instant offer alerts.", ios: "App Store", android: "Google Play" },
  ja: { title: "📱 NightFlowアプリを入手", sub: "予約がもっと速く、オファー通知も即時。", ios: "App Store", android: "Google Play" },
  zh: { title: "📱 获取 NightFlow App", sub: "预订更快，报价提醒即时到。", ios: "App Store", android: "Google Play" },
};

export function ForeignAppCta({ lang }: { lang: Lang }) {
  const t = STR[lang === "ko" ? "en" : (lang as "en" | "ja" | "zh")] ?? STR.en;

  const AppStoreBtn = (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-inverse text-inverse-foreground font-black text-[13px] hover:opacity-90 transition-colors"
    >
      <Apple className="w-4 h-4" /> {t.ios}
    </a>
  );
  const PlayBtn = (
    <a
      href={playUrl(lang)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-muted border border-border text-foreground font-bold text-[13px] hover:bg-muted/60 transition-colors"
    >
      <Smartphone className="w-4 h-4" /> {t.android}
    </a>
  );

  return (
    <div className="mx-4 my-4 rounded-2xl bg-card border border-border p-4 space-y-3">
      <div>
        <p className="text-[15px] font-black text-foreground">{t.title}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">{t.sub}</p>
      </div>
      <div className="flex gap-2">
        {AppStoreBtn}
        {PlayBtn}
      </div>
    </div>
  );
}
