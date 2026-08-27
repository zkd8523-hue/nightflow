"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { formatBusinessMin, nowBusinessMinutes, getBusinessDateISO } from "@/lib/lineups/time";
import { DjNameButton } from "@/components/djs/DjNameButton";
import { useDjFavoritesContext } from "@/components/providers";
import type { DjProfileTarget } from "@/components/djs/DjProfileSheet";

export interface LineupTableSet {
  // 캡션에서 수집한 라인업은 시간이 없다(순서만) — Migration 573
  start_min: number | null;
  end_min: number | null;
  dj: (DjProfileTarget & { slug: string }) | null;
}

/**
 * 날짜별 라인업 페이지의 타임테이블.
 *
 * 클라이언트 컴포넌트인 이유는 NOW 하나 때문이다 — 서버 렌더로는 "지금 몇 시"를
 * 알 수 없고, 알더라도 캐시된 시각이 박제된다(이 페이지는 force-dynamic이지만
 * 사용자가 화면을 열어둔 채 시간이 흐르는 것까지는 못 따라간다).
 *
 * NOW는 eventDate가 오늘 영업일일 때만 켠다. 내일 라인업을 보고 있는데 시각만
 * 맞다고 NOW가 뜨면 거짓 정보가 된다(전광판·시트와 같은 규칙).
 */
export function LineupSetTable({
  sets,
  eventDate,
}: {
  sets: LineupTableSet[];
  eventDate: string;
}) {
  const [nowMin, setNowMin] = useState<number | null>(null);
  const { isFavoritedDj } = useDjFavoritesContext();
  // 캡션 수집 라인업은 전 행이 start_min=null이다 — 이럴 때 시간 열을 그대로
  // 두면 빈 칸(w-20)만 남아 이름이 오른쪽으로 밀려나 보인다(왼쪽 여백 버그).
  // 시간이 하나도 없으면 그 열 자체를 없앤다.
  const hasAnyTime = sets.some((s) => s.start_min !== null);

  useEffect(() => {
    // 오늘이 아니면 시계를 돌릴 이유가 없다
    if (eventDate !== getBusinessDateISO()) return;
    const tick = () => setNowMin(nowBusinessMinutes());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [eventDate]);

  return (
    <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {sets.map((s, i) => {
            // 캡션 수집분은 start_min이 null이다 — 가드 없이 비교하면
            // null <= n 이 true라 첫 줄이 항상 NOW로 켜진다.
            const isNow =
              nowMin !== null &&
              s.start_min !== null &&
              s.end_min !== null &&
              s.start_min <= nowMin &&
              nowMin < s.end_min;

            return (
              <tr
                key={i}
                className={`border-b border-white/5 last:border-0 ${
                  isNow ? "bg-amber-500/5" : ""
                }`}
              >
                {hasAnyTime && (
                  <td
                    className={`px-4 py-3 font-mono w-20 ${
                      isNow
                        ? "text-amber-500 border-l-2 border-amber-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {s.start_min !== null ? formatBusinessMin(s.start_min) : ""}
                  </td>
                )}
                <td className={`py-3 text-foreground ${hasAnyTime ? "px-4" : "pl-5 pr-4"}`}>
                  {/* 이름 → 프로필 시트, 인스타 아이콘 → 인스타 (라인업 화면 공통 규칙).
                      찜한 DJ만 이름 왼쪽에 하트 표시 — 찜/해제는 이름을 눌러 여는
                      프로필 시트 안에서 이미 가능하므로 여기선 정적 표시만 한다.
                      하트 자리는 보이든 안 보이든 폭을 고정해 이름 시작 위치가
                      행마다 흔들리지 않게 한다. */}
                  {s.dj ? (
                    <span className="inline-flex items-center gap-1.5 max-w-full">
                      <span className="w-3.5 shrink-0 inline-flex items-center justify-center">
                        {isFavoritedDj(s.dj.id) && (
                          <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" aria-hidden="true" />
                        )}
                      </span>
                      <DjNameButton dj={s.dj} />
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3 w-12 text-right">
                  {isNow && (
                    <span className="text-[10px] font-bold text-amber-500">NOW</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
