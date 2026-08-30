"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatBusinessMin, nowBusinessMinutes } from "@/lib/lineups/time";
import { formatLineupDate } from "@/lib/lineups/formatDate";
import { Disc3, Play } from "lucide-react";
import { DjNameButton } from "@/components/djs/DjNameButton";
import { DjProfileSheet, type DjProfileTarget } from "@/components/djs/DjProfileSheet";
import { LineupReportSheet } from "@/components/lineups/LineupReportSheet";
import type { TodayLineupSet } from "./ClubLineupSection";

export interface UpcomingLineup {
  event_date: string; // "YYYY-MM-DD"
  door_open_min: number | null;
  event_title: string | null;
  sets: TodayLineupSet[];
}


/**
 * 클럽 상세의 "어떤 DJ들이 올까?" 진입점 + 목록 시트.
 * 오늘 라인업(ClubLineupSection)과 달리 앞으로 예정된 전체 게시물을 보여준다 —
 * 게시일과 실제 방문일 사이에 라인업을 미리 확인할 방법이 없다는 문제를 해결한다.
 * 클럽 상세 화면 자체에서 봐야 하므로 별도 URL로 보내지 않고 시트로 뜬다.
 */
export function UpcomingLineupSheet({ clubId, lineups }: { clubId: string; lineups: UpcomingLineup[] }) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // 지금 트는 DJ — 전광판 라벨 자리에 NOW로 띄운다. 부모에서 넘겨받지 않고 여기서
  // 계산하는 이유: 1분마다 갱신돼야 하는데 부모(클럽 상세 전체)를 리렌더시킬 이유가 없다.
  // SSR/클라이언트 첫 렌더가 어긋나지 않도록 null로 시작해 마운트 후 채운다.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMin(nowBusinessMinutes());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);
  // 시트 안에서 어느 날짜를 보고 있는지 — 날짜 캐러셀(탭) 선택 상태.
  // Sheet가 열릴 때마다 첫 날짜로 리셋되도록 open이 될 때 0으로 맞춘다.
  const [selectedIndex, setSelectedIndex] = useState(0);
  /* 프로필 시트는 이 컴포넌트가 하나만 소유한다 — 행 아무 데나 누르면 열린다 */
  const [openDj, setOpenDj] = useState<(DjProfileTarget & { slug: string }) | null>(null);

  if (lineups.length === 0) return null;
  const selectedLineup = lineups[Math.min(selectedIndex, lineups.length - 1)];

  // 전광판 미리보기는 가장 가까운 예정 라인업 하나만 흘린다 — 여러 개를 한 줄에 섞으면
  // 어느 DJ가 어느 날짜인지 알 수 없어진다. 나머지는 시트를 열어야 보인다.
  const previewSets = lineups[0].sets;

  // 오늘(가장 가까운 날짜) 셋 중 현재 시각이 걸친 것. 시간이 없는 캡션 수집
  // 라인업(start_min=null, Migration 573)은 "지금"을 판정할 수 없어 건너뛴다.
  const nowDjName =
    nowMin === null
      ? null
      : previewSets.find(
          (s) =>
            s.start_min !== null &&
            s.end_min !== null &&
            s.start_min <= nowMin &&
            nowMin < s.end_min
        )?.dj?.display_name ?? null;

  // 시트 티커의 NOW — 목록의 isNow와 같은 규칙(첫 날짜 탭에서만 유효)을 한 번만 계산한다.
  const sheetNowDjName =
    selectedIndex === 0 && nowMin !== null
      ? selectedLineup.sets.find(
          (s) =>
            s.start_min !== null &&
            s.end_min !== null &&
            s.start_min <= nowMin &&
            nowMin < s.end_min
        )?.dj?.display_name ?? null
      : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg relative overflow-hidden text-left shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.5)]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.3px)",
          backgroundSize: "6px 6px",
          backgroundColor: "#000",
        }}
      >
        {/* 스캔라인 — LED 도트매트릭스 질감 */}
        <span
          className="absolute inset-0 pointer-events-none opacity-50"
          style={{
            backgroundImage:
              "repeating-linear-gradient(180deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 3px)",
          }}
          aria-hidden="true"
        />

        {/* 상단 줄: 라벨. 지금 트는 DJ가 있으면 그걸 띄운다 —
            아래 목록을 접어도 "지금 누가 트는지"는 여기서 바로 보이게 하려는 것. */}
        <span className="relative flex items-center justify-center gap-1.5 pt-1 pb-0.5">
          {nowDjName ? (
            <>
              {/* 켜진 점 — 실시간이라는 신호 */}
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#ff2f92] animate-pulse"
                style={{ boxShadow: "0 0 6px #ff2f92" }}
                aria-hidden="true"
              />
              <span
                className="font-mono text-[9px] font-bold tracking-[0.18em] text-[#ff2f92]"
                style={{ textShadow: "0 0 3px rgba(255,47,146,0.9), 0 0 10px rgba(255,47,146,0.6)" }}
              >
                NOW
              </span>
              <span
                className="font-mono text-[11px] font-bold tracking-[0.04em] text-[#ff2f92] truncate max-w-[60%]"
                style={{ textShadow: "0 0 3px rgba(255,47,146,0.9), 0 0 10px rgba(255,47,146,0.6)" }}
              >
                {nowDjName}
              </span>
            </>
          ) : (
            <>
              <Disc3 className="w-2.5 h-2.5 text-[#ff2f92] drop-shadow-[0_0_4px_#ff2f92]" aria-hidden="true" />
              <span
                className="font-mono text-[9px] font-bold tracking-[0.18em] text-[#ff2f92]"
                style={{ textShadow: "0 0 3px rgba(255,47,146,0.9), 0 0 10px rgba(255,47,146,0.6)" }}
              >
                DJ LINE UP
              </span>
            </>
          )}
        </span>
        <span className="relative block h-px mx-4 bg-gradient-to-r from-transparent via-[#ff2f92]/35 to-transparent" />

        {/* 하단 줄: 초록 LED 스크롤 — 라인업 DJ가 이음매 없이 흐름 */}
        <span className="relative block py-1.5 overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-9 z-[3] bg-gradient-to-r from-black to-transparent" aria-hidden="true" />
          <span className="absolute inset-y-0 right-0 w-9 z-[3] bg-gradient-to-l from-black to-transparent" aria-hidden="true" />
          <span className="relative z-[1] flex w-max animate-led-scroll">
            {[0, 1].map((dup) => (
              <span key={dup} className="flex">
                {previewSets.map((set, i) => (
                  <span key={i} className="flex items-baseline gap-2 px-5 whitespace-nowrap font-mono">
                    <span
                      className="text-[12px] font-bold text-[#2f9e4a]"
                      style={{ textShadow: "0 0 4px rgba(57,255,106,0.5)" }}
                    >
                      {set.start_min !== null ? formatBusinessMin(set.start_min) : ""}
                    </span>
                    <span
                      className="text-[15px] font-bold tracking-[0.04em] text-[#39ff6a]"
                      style={{
                        textShadow:
                          "0 0 2px rgba(57,255,106,0.9), 0 0 8px rgba(57,255,106,0.7), 0 0 18px rgba(57,255,106,0.4)",
                      }}
                    >
                      {set.dj?.display_name ?? "-"}
                    </span>
                    <span className="text-[11px] text-[#0d3318]">●</span>
                  </span>
                ))}
              </span>
            ))}
          </span>
        </span>
      </button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setSelectedIndex(0); // 열 때마다 가장 가까운 날짜부터
        }}
      >
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl pb-6 px-4 max-h-[80vh] overflow-y-auto max-w-lg mx-auto !gap-1.5">
          <SheetHeader className="text-left pb-0 !p-0">
            <SheetTitle className="text-foreground text-lg">예정된 라인업</SheetTitle>
          </SheetHeader>

          {/* 날짜 칩 — 스와이프 캐러셀이 아니라 눌러서 전환하는 버튼 목록.
              날짜가 하나뿐이어도 항상 띄운다 — 눌러야 하는 UI는 아니지만
              "이게 몇 월 며칠 라인업인지"를 일관된 자리에서 보여준다. */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {lineups.map((lineup, i) => (
              <button
                key={i}
                onClick={() => setSelectedIndex(i)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                  i === selectedIndex
                    ? "bg-amber-500 text-black"
                    : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
                }`}
              >
                {formatLineupDate(lineup.event_date)}
              </button>
            ))}
          </div>

          {/* 전광판 티커 — 트리거 버튼과 같은 도트매트릭스/스캔라인/초록 LED를 시트 안까지 이어
              "그 전광판을 열었다"는 연결을 준다. 선택한 날짜의 셋이 흐른다. */}
          <div
            className="relative overflow-hidden rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.5)]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.3px)",
              backgroundSize: "6px 6px",
              backgroundColor: "#000",
            }}
            aria-hidden="true"
          >
            <span
              className="absolute inset-0 pointer-events-none opacity-50"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(180deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 3px)",
              }}
            />

            {/* 상단 라벨 — 지금 트는 DJ가 있으면 NOW, 없으면 DJ LINE UP (트리거와 동일 규칙) */}
            <span className="relative flex items-center justify-center gap-1.5 pt-1 pb-0.5">
              {sheetNowDjName ? (
                <>
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[#ff2f92] animate-pulse"
                    style={{ boxShadow: "0 0 6px #ff2f92" }}
                  />
                  <span
                    className="font-mono text-[9px] font-bold tracking-[0.18em] text-[#ff2f92]"
                    style={{ textShadow: "0 0 3px rgba(255,47,146,0.9), 0 0 10px rgba(255,47,146,0.6)" }}
                  >
                    NOW
                  </span>
                  <span
                    className="font-mono text-[11px] font-bold tracking-[0.04em] text-[#ff2f92] truncate max-w-[60%]"
                    style={{ textShadow: "0 0 3px rgba(255,47,146,0.9), 0 0 10px rgba(255,47,146,0.6)" }}
                  >
                    {sheetNowDjName}
                  </span>
                </>
              ) : (
                <>
                  <Disc3 className="w-2.5 h-2.5 text-[#ff2f92] drop-shadow-[0_0_4px_#ff2f92]" />
                  <span
                    className="font-mono text-[9px] font-bold tracking-[0.18em] text-[#ff2f92]"
                    style={{ textShadow: "0 0 3px rgba(255,47,146,0.9), 0 0 10px rgba(255,47,146,0.6)" }}
                  >
                    DJ LINE UP
                  </span>
                </>
              )}
            </span>
            <span className="relative block h-px mx-4 bg-gradient-to-r from-transparent via-[#ff2f92]/35 to-transparent" />

            <span className="relative block py-1.5 overflow-hidden">
              <span className="absolute inset-y-0 left-0 w-9 z-[3] bg-gradient-to-r from-black to-transparent" />
              <span className="absolute inset-y-0 right-0 w-9 z-[3] bg-gradient-to-l from-black to-transparent" />
              <span className="relative z-[1] flex w-max animate-led-scroll">
                {[0, 1].map((dup) => (
                  <span key={dup} className="flex">
                    {selectedLineup.sets.map((set, i) => (
                      <span key={i} className="flex items-baseline gap-2 px-5 whitespace-nowrap font-mono">
                        <span
                          className="text-[12px] font-bold text-[#2f9e4a]"
                          style={{ textShadow: "0 0 4px rgba(57,255,106,0.5)" }}
                        >
                          {set.start_min !== null ? formatBusinessMin(set.start_min) : ""}
                        </span>
                        <span
                          className="text-[15px] font-bold tracking-[0.04em] text-[#39ff6a]"
                          style={{
                            textShadow:
                              "0 0 2px rgba(57,255,106,0.9), 0 0 8px rgba(57,255,106,0.7), 0 0 18px rgba(57,255,106,0.4)",
                          }}
                        >
                          {set.dj?.display_name ?? "-"}
                        </span>
                        <span className="text-[11px] text-[#0d3318]">●</span>
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            </span>
          </div>


          <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">
                {/* 날짜는 이제 칩이 항상 보여주므로 여기서 반복하지 않는다 */}
                {selectedLineup.event_title && (
                  <span className="text-amber-400">
                    〈{selectedLineup.event_title}〉
                  </span>
                )}
              </h3>
              {selectedLineup.door_open_min != null && (
                <span className="text-[11px] text-muted-foreground">
                  OPEN {formatBusinessMin(selectedLineup.door_open_min)}
                </span>
              )}
            </div>
            <div className="space-y-0.5">
              {selectedLineup.sets.map((set, j) => {
                // NOW는 "오늘(가장 가까운 날짜)"에만 의미가 있다 — 다른 날짜 탭을
                // 보고 있는데 시각만 맞다고 NOW를 켜면 거짓 정보가 된다.
                const isNow =
                  selectedIndex === 0 &&
                  nowMin !== null &&
                  set.start_min !== null &&
                  set.end_min !== null &&
                  set.start_min <= nowMin &&
                  nowMin < set.end_min;
                return (
                  <div
                    key={j}
                    onClick={() => set.dj && setOpenDj(set.dj)}
                    className={`flex items-center gap-3 py-1.5 ${
                      set.dj ? "cursor-pointer active:bg-white/[0.03] transition-colors" : ""
                    } ${
                      isNow ? "-mx-2 px-2 border-l-2 border-amber-500 bg-amber-500/5 rounded-r" : ""
                    }`}
                  >
                    {set.start_min !== null && (
                      <span className="text-[11px] font-mono text-muted-foreground w-11 flex-shrink-0">
                        {formatBusinessMin(set.start_min)}
                      </span>
                    )}
                    {/* 이름 → 프로필 시트, 아이콘 → 인스타 (라인업 화면 공통 규칙).
                        min-w-0 이 없으면 긴 이름 + 아이콘 2개가 폭을 넘겨 행이 무너진다. */}
                    {set.dj ? (
                      <span className="min-w-0 flex-1">
                        {/* 시트는 행이 연다 — 이름 글자만 표적이면 누르기 어렵다
                            (날짜별 라인업 표와 같은 규칙) */}
                        <DjNameButton dj={set.dj} className="text-sm text-foreground" nameOnly showPreview={false} />
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground truncate">-</span>
                    )}
                    {/* ▶ 는 오른쪽 끝 고정 — 날짜별 라인업 표와 같은 배치 */}
                    <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                    {(set.dj?.soundcloud_url || set.dj?.youtube_url) && (
                      <Play className="w-3.5 h-3.5 fill-current text-muted-foreground" aria-label="미리듣기 가능" />
                    )}
                    {isNow && (
                      <span className="text-[10px] font-bold text-amber-500">
                        NOW
                      </span>
                    )}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-1">
              <Link
                href={`/clubs/${clubId}/lineup/${selectedLineup.event_date}`}
                onClick={() => setOpen(false)}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                전체 보기 →
              </Link>
            </div>
          </div>

          {/* 제보 진입점 — 라인업 목록 화면(NationwideLineupList)과 같은 문장형·같은 자리.
              카드 안 "전체 보기"와 한 행을 나눠 쓰면 문장이 안 들어가고, 다 보고
              "없네"라고 느낀 순간에 눈에 들어와야 하므로 카드 아래 한 줄로 뺀다. */}
          <button
            onClick={() => setReportOpen(true)}
            className="w-full py-4 text-center text-[11px] text-muted-foreground leading-relaxed"
          >
            빠진 타임라인이 있나요? <b className="text-amber-400 font-bold">제보하기 ›</b>
          </button>
        </SheetContent>
      </Sheet>

      <DjProfileSheet dj={openDj} onClose={() => setOpenDj(null)} />
      <LineupReportSheet open={reportOpen} onOpenChange={setReportOpen} variant="lineup" />
    </>
  );
}
