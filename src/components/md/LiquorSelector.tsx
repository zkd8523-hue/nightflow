"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wine, X, Plus } from "lucide-react";

interface LiquorSelectorProps {
  selected: string[];
  onSelect: (items: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

function normalize(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 이미 "브랜드 N병" 형태 (공백 옵션)
  const explicit = trimmed.match(/^(.+?)\s*(\d+)\s*병$/);
  if (explicit) return `${explicit[1].trim()} ${explicit[2]}병`;

  // 끝에 숫자만 있는 경우 → "브랜드 N병"
  const trailing = trimmed.match(/^(.+?)\s*(\d+)$/);
  if (trailing) {
    const brand = trailing[1].trim();
    if (brand) return `${brand} ${trailing[2]}병`;
  }

  // "병"으로 끝나면 그대로 (1병 자동 추가 안 함)
  if (trimmed.endsWith("병")) return trimmed;

  // 숫자 없으면 1병 기본
  return `${trimmed} 1병`;
}

export function LiquorSelector({ selected, onSelect, disabled, compact }: LiquorSelectorProps) {
  const [customBrand, setCustomBrand] = useState("");

  const selectedBrandSet = new Set(selected);

  const removeLiquor = (item: string) => {
    onSelect(selected.filter((s) => s !== item));
  };

  const handleCustomAdd = () => {
    const raw = customBrand.trim();
    if (!raw) return;

    const parts = raw
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);

    const additions: string[] = [];
    for (const part of parts) {
      const item = normalize(part);
      if (item && !selectedBrandSet.has(item) && !additions.includes(item)) {
        additions.push(item);
      }
    }

    if (additions.length > 0) {
      onSelect([...selected, ...additions]);
    }

    setCustomBrand("");
  };

  const inner = (
    <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex gap-2">
        <Input
          type="text"
          value={customBrand}
          onChange={(e) => setCustomBrand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleCustomAdd();
            }
          }}
          placeholder="예: 돔페3, 모엣2, 샴3, 하드1, 데킬라1"
          className="bg-neutral-900 border-neutral-800 h-11 text-white text-[13px] flex-1"
        />
        <Button
          type="button"
          onClick={handleCustomAdd}
          disabled={!customBrand.trim()}
          className="h-11 px-4 bg-white text-black hover:bg-neutral-200 font-bold"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-[10px] text-neutral-600">각 주류는 쉼표(,)로 구분</p>

      {selected.length > 0 && (
        <div className="pt-3 border-t border-neutral-800/50 space-y-2">
          <p className="text-purple-400 text-[10px] font-bold">선택된 주류 ({selected.length}개)</p>
          <div className="flex flex-wrap gap-2">
            {selected.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-purple-500/20 text-purple-300 rounded-lg text-[11px] font-bold"
              >
                {item}
                <button
                  type="button"
                  onClick={() => removeLiquor(item)}
                  className="hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (compact) return inner;

  return (
    <section className={`space-y-4 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-500 tracking-wide mb-2">
        <Wine className="w-3 h-3 text-purple-400/70" />
        <span>주류</span>
        <span className="text-red-500">*</span>
        <span className="text-neutral-600 font-medium">최소 1병 이상</span>
      </div>
      <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5">
        {inner}
      </div>
    </section>
  );
}
