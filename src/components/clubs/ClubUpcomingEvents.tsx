"use client";

import { useState } from "react";
import { Mic2, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { splitLineupDate, isLineupToday } from "@/lib/lineups/formatDate";

export interface ClubEventPerformer {
  id: string;
  display_name: string;
  instagram: string | null;
}

export interface ClubUpcomingEvent {
  id: string;
  event_date: string;
  title: string | null;
  source_url: string | null;
  performers: ClubEventPerformer[];
  /** 아티스트 마스터에 못 붙은 원문 이름 — 텍스트로만 표시 */
  extra_names: string[];
}

/**
 * 클럽 상세의 "예정된 공연" 전광판.
 *
 * 왜 필요한가(2026-08-27): DJ 라인업은 상세에 LED 티커로 보이는데 공연은
 * 어디에도 안 보였다. JEJE 처럼 공연(COLDE X KHAKII)이 잡힌 클럽도 상세만 보면
 * 아무 일정이 없는 것처럼 읽힌다.
 *
 * 디자인은 UpcomingLineupSheet 의 LED 전광판을 그대로 쓴다 — 같은 화면에 성격이
 * 같은 블록이 둘인데 생김새가 다르면 둘 중 하나는 남의 것처럼 보인다.
 * 라벨만 UPCOMING LIVE 로 바꾼다.
 *
 * 라인업 섹션과 같은 자기소거 규칙 — 데이터가 없으면 렌더하지 않는다.
 * 빈 상태 문구를 두면 대부분의 클럽 상세에 "공연이 없어요"가 상시 노출된다.
 */
export function ClubUpcomingEvents({ events }: { events: ClubUpcomingEvent[] }) {
  const [open, setOpen] = useState(false);
  if (!events.length) return null;

  // 전광판에 흐를 항목 — 날짜 + 출연자(없으면 공연명)
  const marquee = events.map((e) => {
    const { label } = splitLineupDate(e.event_date);
    const names = [...e.performers.map((p) => p.display_name), ...e.extra_names];
    return { date: label, text: names.length ? names.join(", ") : e.title ?? "-" };
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg relative overflow-hidden text-left shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.5)]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.3px)",
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

        <span className="relative flex items-center justify-center gap-1.5 pt-1 pb-0.5">
          <Mic2 className="w-2.5 h-2.5 text-[#ff2f92] drop-shadow-[0_0_4px_#ff2f92]" aria-hidden="true" />
          <span
            className="font-mono text-[9px] font-bold tracking-[0.18em] text-[#ff2f92]"
            style={{ textShadow: "0 0 3px rgba(255,47,146,0.9), 0 0 10px rgba(255,47,146,0.6)" }}
          >
            UPCOMING LIVE
          </span>
        </span>
        <span className="relative block h-px mx-4 bg-gradient-to-r from-transparent via-[#ff2f92]/35 to-transparent" />

        {/* 하단 줄: 초록 LED 스크롤 */}
        <span className="relative block py-1.5 overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-9 z-[3] bg-gradient-to-r from-black to-transparent" aria-hidden="true" />
          <span className="absolute inset-y-0 right-0 w-9 z-[3] bg-gradient-to-l from-black to-transparent" aria-hidden="true" />
          <span className="relative z-[1] flex w-max animate-led-scroll">
            {[0, 1].map((dup) => (
              <span key={dup} className="flex">
                {marquee.map((m, i) => (
                  <span key={i} className="flex items-baseline gap-2 px-5 whitespace-nowrap font-mono">
                    <span
                      className="text-[12px] font-bold text-[#2f9e4a]"
                      style={{ textShadow: "0 0 4px rgba(57,255,106,0.5)" }}
                    >
                      {m.date}
                    </span>
                    <span
                      className="text-[15px] font-bold tracking-[0.04em] text-[#39ff6a]"
                      style={{
                        textShadow:
                          "0 0 2px rgba(57,255,106,0.9), 0 0 8px rgba(57,255,106,0.7), 0 0 18px rgba(57,255,106,0.4)",
                      }}
                    >
                      {m.text}
                    </span>
                    <span className="text-[11px] text-[#0d3318]">●</span>
                  </span>
                ))}
              </span>
            ))}
          </span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="bg-[#1C1C1E] border-t border-border rounded-t-3xl px-4 pb-6 pt-3 max-w-lg mx-auto max-h-[80vh] overflow-y-auto"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-[15px] font-black tracking-tight">예정된 공연</SheetTitle>
          </SheetHeader>

          <div className="mt-3 space-y-2">
            {events.map((e) => {
              const { label, dow } = splitLineupDate(e.event_date);
              const today = isLineupToday(e.event_date);
              const names = [...e.performers.map((p) => p.display_name), ...e.extra_names];
              return (
                <div key={e.id} className="bg-[#141416] rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className={today ? "font-black text-amber-400" : "font-bold text-neutral-300"}>
                      {label}
                    </span>
                    <span className="text-neutral-600">{dow}</span>
                    {today && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black text-[9px] font-black">
                        오늘
                      </span>
                    )}
                  </div>

                  {e.title && (
                    <p className="mt-1 text-[13px] font-bold text-foreground leading-snug">{e.title}</p>
                  )}

                  {names.length > 0 && (
                    <p className="mt-1 text-[12px] leading-relaxed text-neutral-300">
                      {e.performers.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && <span className="text-neutral-600">, </span>}
                          {/* 라인업 화면 공통 규칙: 인스타 있으면 이름 자체가 링크 */}
                          {p.instagram ? (
                            <a
                              href={`https://instagram.com/${p.instagram}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-pink-400 transition-colors"
                            >
                              {p.display_name}
                            </a>
                          ) : (
                            p.display_name
                          )}
                        </span>
                      ))}
                      {e.extra_names.map((n, i) => (
                        <span key={`x-${i}`}>
                          {(e.performers.length > 0 || i > 0) && <span className="text-neutral-600">, </span>}
                          {n}
                        </span>
                      ))}
                    </p>
                  )}

                  {e.source_url && (
                    <a
                      href={e.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                      원본 게시물
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
