"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

const PRESET_FEATURES = [
  "퍼레이드",
  "전광판",
  "신청곡",
  "믹서 무제한",
  "생일 이벤트 지원",
];

interface TableFeatureSelectorProps {
  selected: string[];
  onSelect: (items: string[]) => void;
  disabled?: boolean;
}

export function TableFeatureSelector({ selected, onSelect, disabled }: TableFeatureSelectorProps) {
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const selectedSet = new Set(selected);

  const toggle = (feature: string) => {
    if (selectedSet.has(feature)) {
      onSelect(selected.filter((s) => s !== feature));
    } else {
      onSelect([...selected, feature]);
    }
  };

  const addCustom = () => {
    const val = customInput.trim();
    if (!val) return;
    const parts = val.split(/[,，]/).map((p) => p.trim()).filter(Boolean);
    const additions = parts.filter((p) => !selectedSet.has(p));
    if (additions.length > 0) onSelect([...selected, ...additions]);
    setCustomInput("");
    setShowCustomInput(false);
  };

  const customFeatures = selected.filter((s) => !PRESET_FEATURES.includes(s));

  return (
    <div className={`space-y-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex flex-wrap gap-2">
        {PRESET_FEATURES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => toggle(f)}
            className={`px-3.5 py-2 rounded-2xl text-[13px] font-bold transition-all ${
              selectedSet.has(f)
                ? "bg-white text-black"
                : "bg-neutral-800 text-neutral-300 border border-neutral-700"
            }`}
          >
            {f}
          </button>
        ))}

        {customFeatures.map((f) => (
          <span
            key={f}
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-2xl text-[13px] font-bold bg-white text-black"
          >
            {f}
            <button
              type="button"
              onClick={() => toggle(f)}
              className="ml-0.5 hover:opacity-60"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {!showCustomInput && (
          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            className="px-3.5 py-2 rounded-2xl text-[13px] font-bold bg-neutral-800 text-neutral-400 border border-neutral-700 border-dashed inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            직접 입력
          </button>
        )}
      </div>

      {showCustomInput && (
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addCustom();
              }
              if (e.key === "Escape") {
                setShowCustomInput(false);
                setCustomInput("");
              }
            }}
            placeholder="예: 파티 패키지, 케이크 제공"
            autoFocus
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-white text-[13px] placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!customInput.trim()}
            className="px-4 py-2 bg-white text-black rounded-xl text-[13px] font-bold disabled:opacity-40"
          >
            추가
          </button>
          <button
            type="button"
            onClick={() => { setShowCustomInput(false); setCustomInput(""); }}
            className="px-3 py-2 bg-neutral-800 text-neutral-400 rounded-xl text-[13px]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
