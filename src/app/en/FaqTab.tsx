"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqCategory } from "./faqData";
import { FAQ_I18N } from "./faqData.i18n";
import { type Lang, makeT } from "@/lib/i18n";

export function FaqTab() {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<FaqCategory | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const l = new URLSearchParams(window.location.search).get("lang");
    setLang(l === "ja" ? "ja" : l === "zh" ? "zh" : "en");
  }, []);
  const tr = (en: string) => makeT(lang)("", en);

  const trimmed = query.trim().toLowerCase();
  // 현재 언어의 q/a (ja/zh면 번역본, 아니면 영어 원본)
  const loc = (item: { id: string; q: string; a: string }) => {
    const t = (lang === "ja" || lang === "zh") ? FAQ_I18N[item.id]?.[lang] : null;
    return { q: t?.q ?? item.q, a: t?.a ?? item.a };
  };

  const results = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchesCat = activeCat === "all" || item.category === activeCat;
      const tl = (lang === "ja" || lang === "zh") ? FAQ_I18N[item.id]?.[lang] : null;
      const hay = `${item.q} ${item.a} ${tl?.q ?? ""} ${tl?.a ?? ""}`.toLowerCase();
      const matchesQuery = trimmed === "" || hay.includes(trimmed);
      return matchesCat && matchesQuery;
    });
  }, [trimmed, activeCat, lang]);

  const catMeta = (code: FaqCategory) =>
    FAQ_CATEGORIES.find((c) => c.code === code);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 검색 + 카테고리 (고정) */}
      <div className="shrink-0 px-4 pt-4 pb-2 space-y-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Search — e.g. dress code, ID, scam, taxi")}
            className="w-full h-11 pl-9 pr-9 rounded-xl bg-card border border-border text-[14px] text-foreground placeholder:text-muted-foreground focus:border-border outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
          <button
            onClick={() => setActiveCat("all")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
              activeCat === "all"
                ? "bg-inverse text-inverse-foreground"
                : "bg-card text-muted-foreground hover:text-foreground border border-border"
            }`}
          >
            {tr("All")}
          </button>
          {FAQ_CATEGORIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setActiveCat(c.code)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors whitespace-nowrap ${
                activeCat === c.code
                  ? "bg-inverse text-inverse-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              {c.emoji} {tr(c.label)}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 리스트 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {results.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground text-[14px]">{tr("No results for")} &quot;{query}&quot;.</p>
            <button
              onClick={() => { setQuery(""); setActiveCat("all"); }}
              className="mt-3 text-[13px] text-brand-amber font-bold"
            >
              {tr("Clear search")}
            </button>
          </div>
        ) : (
          results.map((item) => {
            const open = openId === item.id;
            const meta = catMeta(item.category);
            const { q, a } = loc(item);
            const accent =
              item.emphasis === "warning"
                ? "border-amber-500/30"
                : item.emphasis === "safety"
                  ? "border-green-500/30"
                  : "border-border";
            return (
              <div
                key={item.id}
                className={`rounded-2xl bg-card border ${accent} overflow-hidden`}
              >
                <button
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="w-full flex items-start justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    {activeCat === "all" && meta && (
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        {meta.emoji} {tr(meta.label)}
                      </span>
                    )}
                    <p className="font-bold text-[14px] leading-snug mt-0.5">
                      {item.emphasis === "warning" && <span className="text-brand-amber">⚠ </span>}
                      {q}
                    </p>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="px-4 pb-4 -mt-1">
                    <p className="text-[13px] text-foreground/80 leading-relaxed">{a}</p>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* 하단 안내 */}
        {results.length > 0 && (
          <p className="pt-3 pb-6 text-center text-[11px] text-muted-foreground leading-relaxed">
            {tr("Info cross-checked from public sources, current 2026.")}<br />
            {tr("Prices and venue policies vary — treat figures as ranges.")}
          </p>
        )}
      </div>
    </div>
  );
}
