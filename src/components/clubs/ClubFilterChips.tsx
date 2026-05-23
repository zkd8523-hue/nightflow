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
      className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
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
  // 단일 선택: 이미 선택된 칩 클릭 시 해제, 아니면 그 하나만 활성
  const selectSingle = (arr: string[], key: string) =>
    arr.length === 1 && arr[0] === key ? [] : [key];

  const genreGroup = FILTER_GROUPS.find((g) => g.group === "genre");
  const hasAnyFilter = value.areas.length > 0 || value.genres.length > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {AREA_OPTIONS.map((area) => (
          <Chip
            key={area}
            label={area}
            active={value.areas.includes(area)}
            onClick={() =>
              onChange({ ...value, areas: selectSingle(value.areas, area) })
            }
          />
        ))}
      </div>

      {genreGroup && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {genreGroup.options.map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              active={value.genres.includes(opt.key)}
              onClick={() =>
                onChange({ ...value, genres: selectSingle(value.genres, opt.key) })
              }
            />
          ))}
          {hasAnyFilter && (
            <button
              type="button"
              onClick={() => onChange({ areas: [], genres: [] })}
              className="text-[10px] text-neutral-500 hover:text-white flex-shrink-0 ml-auto pl-2 underline underline-offset-2"
            >
              초기화
            </button>
          )}
        </div>
      )}
    </div>
  );
}
