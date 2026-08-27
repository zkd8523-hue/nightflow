"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";

/**
 * 홈 상단 LED 전광판 — 기존 LIVE(ShotCarousel) 자리.
 *
 * 두 줄이 각각 독립 링크다:
 *   DJ LINE UP    → /lineups  (club_lineups + lineup_sets + djs)
 *   UNDERGROUND   → /events   (club_events, 별개 테이블)
 *
 * 한쪽 데이터가 비면 그 줄만 빠지고, 둘 다 비면 컴포넌트 자체가 null이라
 * 빈 껍데기가 남지 않는다(LIVE가 그랬듯 여백만 남는 사고 방지).
 */
export function LineupTicker() {
  const [djNames, setDjNames] = useState<string[]>([]);
  const [eventLabels, setEventLabels] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const fromDate = getBusinessDateISO();

      // 두 소스는 서로 독립이라 병렬로. 한쪽이 실패해도 다른 줄은 살린다.
      const [lineupRes, eventRes] = await Promise.all([
        supabase
          .from("lineup_sets")
          .select(
            "start_min, djs!inner(display_name), club_lineups!inner(event_date, clubs!inner(name, is_test, status, deleted_at))"
          )
          .gte("club_lineups.event_date", fromDate)
          .limit(60),
        supabase
          .from("club_events")
          .select("event_date, title, club_name_raw, lineup")
          .eq("status", "approved")
          .gte("event_date", fromDate)
          .order("event_date", { ascending: true })
          .limit(20),
      ]);

      if (cancelled) return;

      // ── DJ 라인업 ──
      type SetRow = {
        start_min: number | null;
        djs: { display_name: string } | { display_name: string }[] | null;
        club_lineups:
          | { event_date: string; clubs: ClubRef | ClubRef[] }
          | { event_date: string; clubs: ClubRef | ClubRef[] }[]
          | null;
      };
      type ClubRef = { name: string; is_test: boolean; status: string; deleted_at: string | null };
      const one = <T,>(v: T | T[] | null): T | null =>
        Array.isArray(v) ? v[0] ?? null : v;

      const rows: Array<{ date: string; start: number; name: string }> = [];
      for (const r of (lineupRes.data ?? []) as unknown as SetRow[]) {
        const dj = one(r.djs);
        const lineup = one(r.club_lineups);
        if (!dj || !lineup) continue;
        const club = one(lineup.clubs);
        // club_lineups에는 is_test가 없어 clubs 조인으로 거른다(558 규약)
        if (!club || club.deleted_at || club.status !== "approved") continue;
        if (!SHOW_TEST_DATA && club.is_test) continue;
        rows.push({ date: lineup.event_date, start: r.start_min, name: dj.display_name });
      }
      // 가장 가까운 날짜의 셋만, 시간순으로 — 여러 날짜를 섞으면 순서가 뒤죽박죽이 된다
      rows.sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.start ?? Number.MAX_SAFE_INTEGER) - (b.start ?? Number.MAX_SAFE_INTEGER)
      );
      const firstDate = rows[0]?.date;
      const names = rows
        .filter((r) => r.date === firstDate)
        .map((r) => r.name);
      setDjNames([...new Set(names)].slice(0, 12));

      // ── 언더그라운드 공연 ──
      type EventRow = {
        event_date: string | null;
        title: string | null;
        club_name_raw: string | null;
        lineup: string[] | null;
      };
      const labels: string[] = [];
      for (const e of (eventRes.data ?? []) as EventRow[]) {
        if (!e.event_date) continue;
        const [, m, d] = e.event_date.split("-");
        // 아티스트명이 있으면 그게 제일 눈에 띈다. 없으면 공연 제목, 그것도 없으면 클럽명.
        const who = e.lineup?.[0]?.trim() || e.title?.trim() || e.club_name_raw?.trim();
        if (!who) continue;
        labels.push(`${parseInt(m, 10)}/${parseInt(d, 10)} ${who}`);
      }
      setEventLabels(labels.slice(0, 12));

      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 로딩 중엔 아무것도 안 그린다 — 빈 전광판이 깜빡였다 채워지면 더 어수선하다
  if (!loaded) return null;
  if (djNames.length === 0 && eventLabels.length === 0) return null;

  return (
    <div
      /* 여백을 부모 래퍼가 아니라 여기서 준다 — 부모가 감싸면 이 컴포넌트가 null일 때
         빈 래퍼의 margin만 남는다. */
      className="relative overflow-hidden rounded-lg mb-4 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.5)]"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.3px)",
        backgroundSize: "6px 6px",
        backgroundColor: "#000",
      }}
    >
      {/* 스캔라인 — LED 도트매트릭스 질감 (UpcomingLineupSheet와 동일) */}
      <span
        className="absolute inset-0 pointer-events-none opacity-50 z-[2]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 3px)",
        }}
        aria-hidden="true"
      />

      {djNames.length > 0 && (
        <TickerRow
          href="/lineups"
          tag="DJ LINE UP"
          items={djNames}
          color="#39ff6a"
          glow="0 0 2px rgba(57,255,106,0.9), 0 0 8px rgba(57,255,106,0.7), 0 0 18px rgba(57,255,106,0.4)"
          durationSec={30}
        />
      )}

      {eventLabels.length > 0 && (
        <TickerRow
          href="/events"
          tag="LIVE STAGE"
          items={eventLabels}
          color="#ff2f92"
          glow="0 0 2px rgba(255,47,146,0.9), 0 0 8px rgba(255,47,146,0.6)"
          durationSec={34}
          topBorder={djNames.length > 0}
        />
      )}
    </div>
  );
}

function TickerRow({
  href,
  tag,
  items,
  color,
  glow,
  durationSec,
  topBorder = false,
}: {
  href: string;
  tag: string;
  items: string[];
  color: string;
  glow: string;
  durationSec: number;
  topBorder?: boolean;
}) {
  const text = items.join("  ·  ");

  return (
    <Link
      href={href}
      aria-label={`${tag} 보기`}
      className={`relative z-[1] flex items-center gap-2.5 px-3 py-2 ${
        topBorder ? "border-t border-white/[0.07]" : ""
      }`}
    >
      <span
        className="font-mono text-[9px] font-bold tracking-[0.15em] w-[84px] flex-shrink-0"
        style={{ color, textShadow: glow }}
      >
        {tag}
      </span>

      <span className="relative flex-1 min-w-0 overflow-hidden">
        <span
          className="absolute inset-y-0 left-0 w-7 z-[3] bg-gradient-to-r from-black to-transparent"
          aria-hidden="true"
        />
        <span
          className="absolute inset-y-0 right-0 w-7 z-[3] bg-gradient-to-l from-black to-transparent"
          aria-hidden="true"
        />
        {/* 두 벌을 이어 붙여 -50% 이동 → 이음매 없이 순환 */}
        <span
          className="relative z-[1] flex w-max animate-led-scroll font-mono text-[12.5px] font-bold"
          style={{ animationDuration: `${durationSec}s`, color, textShadow: glow }}
        >
          <span className="whitespace-nowrap pr-6">{text}</span>
          <span className="whitespace-nowrap pr-6" aria-hidden="true">
            {text}
          </span>
        </span>
      </span>

      <span
        className="text-[13px] flex-shrink-0"
        style={{ color, textShadow: glow }}
        aria-hidden="true"
      >
        ›
      </span>
    </Link>
  );
}
