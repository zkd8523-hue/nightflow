"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { getLang, type Lang } from "@/lib/i18n";

type LangExt = Lang | "zh-tw";

// 언어 선택 드롭다운 (푸터). 한/영/일/중(간체)/중(번체).
// 각 언어 = 전용 경로(/, /en, /ja, /zh, /zh-tw) — 네이티브 타이틀·메타데이터·SEO가 심긴 페이지로 보냄.
const OPTIONS: { lang: LangExt; label: string; href: string; flag: string }[] = [
  { lang: "ko",    label: "한국어",      href: "/",       flag: "🇰🇷" },
  { lang: "en",    label: "English",     href: "/en",     flag: "🇺🇸" },
  { lang: "ja",    label: "日本語",      href: "/ja",     flag: "🇯🇵" },
  { lang: "zh",    label: "简体中文",    href: "/zh",     flag: "🇨🇳" },
  { lang: "zh-tw", label: "繁體中文",    href: "/zh-tw",  flag: "🇹🇼" },
];

export function LangSwitcher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [langParam, setLangParam] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // ?lang= 는 mount 후 client에서 읽기 (useSearchParams Suspense 회피)
  useEffect(() => {
    setLangParam(new URLSearchParams(window.location.search).get("lang"));
  }, [pathname]);

  // 현재 언어: 경로 우선(/zh-tw > /zh > /ja > /en). /en 은 ?lang(레거시)도 반영.
  const current: LangExt = pathname?.startsWith("/zh-tw")
    ? "zh-tw"
    : pathname?.startsWith("/zh")
    ? "zh"
    : pathname?.startsWith("/ja")
    ? "ja"
    : pathname?.startsWith("/en")
    ? (getLang(langParam) === "ko" ? "en" : getLang(langParam))
    : "ko";

  const currentOption = OPTIONS.find((o) => o.lang === current) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Select language"
      >
        <span className="text-base leading-none" aria-hidden="true">{currentOption.flag}</span>
        Language
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 rounded-xl bg-card border border-border overflow-hidden shadow-xl z-20">
          {OPTIONS.map((o) => (
            <a
              key={o.lang}
              href={o.href}
              onClick={() => { try { localStorage.setItem("nf_lang_pref", o.lang); } catch { /* noop */ } }}
              className={`flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                o.lang === current
                  ? "text-foreground bg-muted"
                  : "text-foreground/80 hover:bg-muted"
              }`}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true">{o.flag}</span>
                <span>{o.label}</span>
              </span>
              {o.lang === current && <Check className="w-3.5 h-3.5 text-money" />}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
