"use client";

import { useEffect, useState } from "react";
import { Apple, Smartphone } from "lucide-react";
import type { Lang } from "@/lib/i18n";

// 외국인용 앱 다운로드 CTA. 플랫폼 자동 감지:
//   iPhone → App Store(미/중/일 스토어) / Android → Google Play(hl=언어) / 데스크탑 → 둘 다
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
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  useEffect(() => {
    const ua = navigator.userAgent || "";
    setPlatform(/iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "other");
  }, []);

  const t = STR[lang === "ko" ? "en" : (lang as "en" | "ja" | "zh")] ?? STR.en;

  const AppStoreBtn = (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white text-black font-black text-[13px] hover:bg-neutral-200 transition-colors"
    >
      <Apple className="w-4 h-4" /> {t.ios}
    </a>
  );
  const PlayBtn = (
    <a
      href={playUrl(lang)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-neutral-800 border border-neutral-700 text-white font-bold text-[13px] hover:bg-neutral-700/60 transition-colors"
    >
      <Smartphone className="w-4 h-4" /> {t.android}
    </a>
  );

  return (
    <div className="mx-4 my-4 rounded-2xl bg-[#1C1C1E] border border-neutral-800 p-4 space-y-3">
      <div>
        <p className="text-[15px] font-black text-white">{t.title}</p>
        <p className="text-[12px] text-neutral-500 mt-0.5">{t.sub}</p>
      </div>
      <div className="flex gap-2">
        {platform === "ios" && AppStoreBtn}
        {platform === "android" && PlayBtn}
        {platform === "other" && (<>{AppStoreBtn}{PlayBtn}</>)}
      </div>
    </div>
  );
}
