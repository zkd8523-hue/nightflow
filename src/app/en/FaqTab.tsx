"use client";

import { useMemo, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqCategory } from "./faqData";

export function FaqTab() {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<FaqCategory | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const trimmed = query.trim().toLowerCase();

  const results = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchesCat = activeCat === "all" || item.category === activeCat;
      const matchesQuery =
        trimmed === "" ||
        item.q.toLowerCase().includes(trimmed) ||
        item.a.toLowerCase().includes(trimmed);
      return matchesCat && matchesQuery;
    });
  }, [trimmed, activeCat]);

  const catMeta = (code: FaqCategory) =>
    FAQ_CATEGORIES.find((c) => c.code === code);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 검색 + 카테고리 (고정) */}
      <div className="shrink-0 px-4 pt-4 pb-2 space-y-3 border-b border-neutral-900">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — e.g. dress code, ID, scam, taxi"
            className="w-full h-11 pl-9 pr-9 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-[14px] text-white placeholder:text-neutral-600 focus:border-neutral-600 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-neutral-800"
            >
              <X className="w-3.5 h-3.5 text-neutral-400" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
          <button
            onClick={() => setActiveCat("all")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
              activeCat === "all"
                ? "bg-white text-black"
                : "bg-[#1C1C1E] text-neutral-400 hover:text-white border border-neutral-800"
            }`}
          >
            All
          </button>
          {FAQ_CATEGORIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setActiveCat(c.code)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors whitespace-nowrap ${
                activeCat === c.code
                  ? "bg-white text-black"
                  : "bg-[#1C1C1E] text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 리스트 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {results.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-neutral-500 text-[14px]">No results for &quot;{query}&quot;.</p>
            <button
              onClick={() => { setQuery(""); setActiveCat("all"); }}
              className="mt-3 text-[13px] text-amber-400 font-bold"
            >
              Clear search
            </button>
          </div>
        ) : (
          results.map((item) => {
            const open = openId === item.id;
            const meta = catMeta(item.category);
            const accent =
              item.emphasis === "warning"
                ? "border-amber-500/30"
                : item.emphasis === "safety"
                  ? "border-green-500/30"
                  : "border-neutral-800";
            return (
              <div
                key={item.id}
                className={`rounded-2xl bg-[#1C1C1E] border ${accent} overflow-hidden`}
              >
                <button
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="w-full flex items-start justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    {activeCat === "all" && meta && (
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                        {meta.emoji} {meta.label}
                      </span>
                    )}
                    <p className="font-bold text-[14px] leading-snug mt-0.5">
                      {item.emphasis === "warning" && <span className="text-amber-400">⚠ </span>}
                      {item.q}
                    </p>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-500 shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="px-4 pb-4 -mt-1">
                    <p className="text-[13px] text-neutral-300 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* 하단 안내 */}
        {results.length > 0 && (
          <p className="pt-3 pb-6 text-center text-[11px] text-neutral-600 leading-relaxed">
            Info cross-checked from public sources, current 2026.<br />
            Prices and venue policies vary — treat figures as ranges.
          </p>
        )}
      </div>
    </div>
  );
}
