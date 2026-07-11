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
  /** true면 주류를 선택 입력으로 표시(별표·"최소 1병" 제거). 조각(share) 모드용. */
  optional?: boolean;
  /** 필수 헤더의 보조 문구 오버라이드. 기본값 "최소 1병 이상"(경매). 깃발 오퍼는 "또는 혜택 1개 이상"(OR 룰 반영). */
  requiredHint?: string;
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

export function LiquorSelector({ selected, onSelect, disabled, compact, optional, requiredHint }: LiquorSelectorProps) {
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
          placeholder="예: 돔페3 (입력 후 엔터)"
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
      <p className="text-[10px] text-neutral-600">하나씩 입력 후 엔터 (쉼표로 여러 개 한 번에 가능)</p>

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

  // 조각 모드(optional): 다른 입력들(테이블 구성 등)과 헤더·구조 통일.
  // 헤더는 "주류 (선택)" 텍스트 한 줄, 바깥 카드 박스 없이 입력칸 바로 노출.
  if (optional) {
    return (
      <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <p className="text-[12px] text-neutral-400 font-medium">주류 (선택)</p>
        {inner}
      </div>
    );
  }

  // 일반 경매(주류 필수): 기존 강조 헤더 + 카드 박스 유지.
  return (
    <section className={`space-y-4 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-500 tracking-wide mb-2">
        <Wine className="w-3 h-3 text-purple-400/70" />
        <span>주류</span>
        <span className="text-red-500">*</span>
        {(requiredHint ?? "최소 1병 이상") && (
          <span className="text-neutral-600 font-medium">{requiredHint ?? "최소 1병 이상"}</span>
        )}
      </div>
      <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5">
        {inner}
      </div>
    </section>
  );
}
