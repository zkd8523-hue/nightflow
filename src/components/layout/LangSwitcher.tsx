"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Globe, Check, ChevronDown } from "lucide-react";
import { getLang, type Lang } from "@/lib/i18n";

// 언어 선택 드롭다운 (푸터). 한/영/일/중.
// 각 언어 = 전용 경로(/, /en, /ja, /zh) — 네이티브 타이틀·메타데이터·SEO가 심긴 페이지로 보냄.
// (/en?lang=xx 쿼리형은 영어 타이틀이라 부적합 → 깨끗한 경로 사용)
const OPTIONS: { lang: Lang; label: string; href: string }[] = [
  { lang: "ko", label: "한국어", href: "/" },
  { lang: "en", label: "English", href: "/en" },
  { lang: "ja", label: "日本語", href: "/ja" },
  { lang: "zh", label: "中文", href: "/zh" },
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

  // 현재 언어: 경로 우선(/zh·/ja), /en 은 ?lang(레거시) 반영, 그 외 ko
  const current: Lang = pathname?.startsWith("/zh")
    ? "zh"
    : pathname?.startsWith("/ja")
    ? "ja"
    : pathname?.startsWith("/en")
    ? (getLang(langParam) === "ko" ? "en" : getLang(langParam))
    : "ko";

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
        className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
        aria-label="Select language"
      >
        <Globe className="w-4 h-4" />
        Language
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 rounded-xl bg-neutral-900 border border-neutral-700 overflow-hidden shadow-xl z-20">
          {OPTIONS.map((o) => (
            <a
              key={o.lang}
              href={o.href}
              onClick={() => { try { localStorage.setItem("nf_lang_pref", o.lang); } catch { /* noop */ } }}
              className={`flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                o.lang === current
                  ? "text-white bg-neutral-800"
                  : "text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {o.label}
              {o.lang === current && <Check className="w-3.5 h-3.5 text-green-400" />}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
