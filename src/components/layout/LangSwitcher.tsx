"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Globe, Check, ChevronDown } from "lucide-react";
import { getLang, type Lang } from "@/lib/i18n";

// 언어 선택 드롭다운 (푸터). 한/영/일/중.
// 한국어=/ , 외국어=/en?lang=xx (랜딩은 /en, 언어는 쿼리로 전파).
const OPTIONS: { lang: Lang; label: string; href: string }[] = [
  { lang: "ko", label: "한국어", href: "/" },
  { lang: "en", label: "English", href: "/en" },
  { lang: "ja", label: "日本語", href: "/en?lang=ja" },
  { lang: "zh", label: "中文", href: "/en?lang=zh" },
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

  // 현재 언어: /en 경로면 ?lang(기본 en), 아니면 ko
  const onForeign = pathname?.startsWith("/en");
  const current: Lang = onForeign ? (getLang(langParam) === "ko" ? "en" : getLang(langParam)) : "ko";

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
