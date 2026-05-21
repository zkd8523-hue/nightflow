"use client";

import { FILTER_GROUPS, AREA_OPTIONS } from "@/lib/clubs/tags";

export interface ClubFilters {
  areas: string[];
  genres: string[];
}

interface Props {
  value: ClubFilters;
  onChange: (next: ClubFilters) => void;
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
        active
          ? "bg-white text-black"
          : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

export function ClubFilterChips({ value, onChange }: Props) {
  const toggle = (arr: string[], key: string) =>
    arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key];

  const genreGroup = FILTER_GROUPS.find((g) => g.group === "genre");

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-semibold text-neutral-500 mb-1.5 px-1">
          📍 지역
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-1 touch-pan-x">
          {AREA_OPTIONS.map((area) => (
            <Chip
              key={area}
              label={area}
              active={value.areas.includes(area)}
              onClick={() =>
                onChange({ ...value, areas: toggle(value.areas, area) })
              }
            />
          ))}
        </div>
      </div>

      {genreGroup && (
        <div>
          <div className="text-[11px] font-semibold text-neutral-500 mb-1.5 px-1">
            🎵 음악
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-1 touch-pan-x">
            {genreGroup.options.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                active={value.genres.includes(opt.key)}
                onClick={() =>
                  onChange({ ...value, genres: toggle(value.genres, opt.key) })
                }
              />
            ))}
          </div>
        </div>
      )}

      {(value.areas.length > 0 || value.genres.length > 0) && (
        <div className="flex justify-end px-1 pt-1">
          <button
            type="button"
            onClick={() => onChange({ areas: [], genres: [] })}
            className="text-[11px] text-neutral-500 hover:text-white"
          >
            초기화
          </button>
        </div>
      )}
    </div>
  );
}
