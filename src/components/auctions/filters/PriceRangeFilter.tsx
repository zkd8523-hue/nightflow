"use client";

import { RangeSlider } from "@/components/ui/range-slider";
import {
  PRICE_MIN,
  PRICE_MAX,
  PRICE_STEP,
  PRICE_PRESETS,
  formatPriceRangeLabel,
  findMatchingPresetId,
} from "@/lib/utils/auctionFilters";

interface PriceRangeFilterProps {
  value: [number, number];
  onChange: (range: [number, number]) => void;
}

export function PriceRangeFilter({ value, onChange }: PriceRangeFilterProps) {
  const matchedPresetId = findMatchingPresetId(value);

  return (
    <div className="space-y-3 px-1 pb-1">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-neutral-400">가격</span>
        <span className="text-[12px] font-bold text-white tabular-nums">
          {formatPriceRangeLabel(value)}
        </span>
      </div>

      <div className="px-1">
        <RangeSlider
          value={value}
          onValueChange={onChange}
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={PRICE_STEP}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 touch-pan-x">
        {PRICE_PRESETS.map((preset) => {
          const active = preset.id === matchedPresetId;
          return (
            <button
              key={preset.id}
              onClick={() => onChange(preset.range)}
              className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                active
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
