"use client";

import { useEffect, useState } from "react";
import { Radio, ChevronDown, ChevronUp } from "lucide-react";
import { DjNameButton } from "@/components/djs/DjNameButton";
import { formatBusinessMin, nowBusinessMinutes } from "@/lib/lineups/time";

export interface TodayLineupSet {
  // 캡션에서 수집한 라인업은 시간이 없다(순서만) — Migration 573
  start_min: number | null;
  end_min: number | null;
  sort_order: number;
  // instagram: DJ 프로필 페이지가 준비되기 전까지 라인업에서 바로 인스타로
  // 나갈 수 있게 하는 임시 진입점. 핸들만 저장한다(Migration 203 규약).
  dj: { id: string; slug: string; display_name: string; instagram: string | null } | null;
}

export interface TodayLineup {
  door_open_min: number | null;
  event_title: string | null;
  sets: TodayLineupSet[];
}

/**
 * 클럽 상세의 "오늘 라인업" 섹션. 데이터가 없으면 스스로 렌더하지 않는다
 * (ClubCouponBar의 자기소거 패턴). source(ig_auto/admin_vision 등)는 구분하지 않는다 —
 * 사용자에게 출처는 무의미하고 오히려 신뢰도만 깎는다.
 */
export function ClubLineupSection({ lineup }: { lineup: TodayLineup | null }) {
  const [expanded, setExpanded] = useState(false);
  // lazy initializer — 마운트 시점 값은 여기서 한 번만 구하고, 이후 갱신은 effect의 setInterval이 담당.
  // (effect 본문에서 곧바로 setState를 부르지 않기 위함 — SSR과 클라이언트 첫 렌더가 어긋날 수 있어
  // null로 시작해 마운트 후 채우는 값이므로 SSR 불일치는 없음)
  const [nowMin, setNowMin] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMin(nowBusinessMinutes());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!lineup || lineup.sets.length === 0) return null;

  // 기본은 완전히 접는다 — 상단 전광판이 "지금 트는 DJ"를 이미 보여주므로
  // 전체 타임테이블은 궁금한 사람만 펴서 본다. 예전엔 4개를 항상 펼쳐 뒀는데
  // 클럽 상세 화면의 세로를 통째로 잡아먹었다.
  const visibleSets = expanded ? lineup.sets : [];
  const hasMore = lineup.sets.length > 0;

  return (
    <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">오늘 라인업: </span>
          <h3 className="text-sm font-bold text-foreground">
            오늘 라인업
            {/* 파티 이름은 꺾쇠 + amber로 — "· 이름"으로 이어붙이면 라인업 제목의
                일부처럼 읽힌다 */}
            {lineup.event_title && (
              <span className="ml-1.5 text-amber-400">〈{lineup.event_title}〉</span>
            )}
          </h3>
        </div>
        {lineup.door_open_min != null && (
          <span className="text-[11px] text-muted-foreground">
            DOOR OPEN {formatBusinessMin(lineup.door_open_min)}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {visibleSets.map((set, i) => {
          // 캡션 수집 라인업은 시간이 없다(start_min=null, Migration 573) —
          // null 가드 없이 비교하면 null <= n 이 true라 첫 셋이 항상 NOW로 켜진다.
          const isNow =
            nowMin !== null &&
            set.start_min !== null &&
            set.end_min !== null &&
            set.start_min <= nowMin &&
            nowMin < set.end_min;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 py-1.5 px-2 rounded-lg ${
                isNow ? "border-l-2 border-amber-500 bg-amber-500/5" : ""
              }`}
            >
              {set.start_min !== null && (
                <span className="text-[11px] font-mono text-muted-foreground w-11 flex-shrink-0">
                  {formatBusinessMin(set.start_min)}
                </span>
              )}
              {/* 이름 → 프로필 시트(활동 클럽), 인스타 아이콘 → 인스타 (라인업 화면 공통) */}
              {set.dj ? (
                <DjNameButton dj={set.dj} className="text-sm text-foreground" />
              ) : (
                <span className="text-sm text-muted-foreground truncate">-</span>
              )}
              {isNow && (
                <span className="text-[10px] font-bold text-amber-500 flex-shrink-0 ml-auto">NOW</span>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
        >
          {expanded ? (
            <>
              접기 <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              전체 {lineup.sets.length}개 보기 <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
