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
        <span className="text-[12px] font-bold text-muted-foreground">가격</span>
        <span className="text-[12px] font-bold text-foreground tabular-nums">
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

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 touch-pan-x touch-pan-y">
        {PRICE_PRESETS.map((preset) => {
          const active = preset.id === matchedPresetId;
          return (
            <button
              key={preset.id}
              onClick={() => onChange(preset.range)}
              className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                active
                  ? "bg-inverse text-inverse-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
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
