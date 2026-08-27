"use client";

import Link from "next/link";
import { Disc3, Mic2 } from "lucide-react";

/**
 * /lineups 와 /events 공용 상단 — LED 전광판 탭.
 *
 * 홈 상단 전광판(LineupTicker)과 같은 시각 언어를 쓴다: 검은 도트매트릭스 바탕,
 * 스캔라인, 형광 글로우. 홈에서 그 전광판을 누르고 들어온 유저가 같은 화면에
 * 도착했다고 느끼게 하는 게 목적이다.
 *
 * 단 여기서는 흐르지 않는다 — 탭은 조작 대상이라 움직이면 누르기 어렵다.
 * 색도 전광판과 짝을 맞춘다(라인업 초록 / 공연 핑크).
 */
const TABS = [
  {
    key: "lineups" as const,
    href: "/lineups",
    label: "DJ LINE UP",
    title: "전국 DJ 라인업",
    Icon: Disc3,
    color: "#39ff6a",
    /** 꺼진 상태 — 같은 색조의 아주 어두운 버전(형광 초록의 "전구 꺼짐") */
    dim: "#1e4d2b",
    glow: "0 0 2px rgba(57,255,106,0.9), 0 0 9px rgba(57,255,106,0.65), 0 0 20px rgba(57,255,106,0.35)",
  },
  {
    key: "events" as const,
    href: "/events",
    // "UNDERGROUND"만 두면 무엇을 보는 탭인지 안 읽힌다(반대쪽 DJ LINE UP은 자명한데).
    // 장르 색보다 "공연"이라는 정보가 먼저다.
    label: "LIVE STAGE",
    title: "언더그라운드 공연",
    Icon: Mic2,
    color: "#ff2f92",
    /** 꺼진 상태 — 같은 색조의 아주 어두운 버전 */
    dim: "#5c1638",
    glow: "0 0 2px rgba(255,47,146,0.9), 0 0 9px rgba(255,47,146,0.6), 0 0 20px rgba(255,47,146,0.3)",
  },
];

export function LineupPageHeader({ active }: { active: "lineups" | "events" }) {
  const current = TABS.find((t) => t.key === active)!;

  return (
    <>
      {/* 제목은 화면에 두지 않는다 — 전광판 탭이 이미 어느 화면인지 보여주고,
          같은 말을 두 번 쓰면 상단만 두꺼워진다. SEO/스크린리더용 h1은 남긴다
          (문서에 h1이 없으면 접근성·검색 양쪽에서 손해). */}
      <h1 className="sr-only">{current.title}</h1>

      {/* LED 전광판 탭 — 실제 페이지 이동이므로 button이 아니라 Link.
          서버 렌더된 목록을 그대로 쓰기 위해 라우팅으로 전환한다. */}
      <nav
        aria-label="라인업 · 공연 전환"
        className="relative overflow-hidden rounded-lg shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_6px_18px_rgba(0,0,0,0.45)]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.3px)",
          backgroundSize: "6px 6px",
          backgroundColor: "#000",
        }}
      >
        {/* 스캔라인 — LED 도트매트릭스 질감 (홈 전광판과 동일) */}
        <span
          className="absolute inset-0 pointer-events-none opacity-50 z-[2]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(180deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 3px)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-[1] flex">
          {TABS.map((t, i) => {
            const isActive = t.key === active;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex-1 py-2.5 inline-flex items-center justify-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.14em] transition-colors ${
                  i > 0 ? "border-l border-white/[0.08]" : ""
                }`}
                style={{
                  // 꺼진 탭은 같은 색의 아주 어두운 버전 — 전구가 꺼진 상태.
                  // 투명도만 낮추면 형광색이 워낙 밝아 여전히 켜진 것처럼 보인다.
                  color: isActive ? t.color : t.dim,
                  textShadow: isActive ? t.glow : "none",
                  backgroundColor: isActive ? "rgba(255,255,255,0.05)" : "transparent",
                }}
              >
                {/* 켜진 탭에만 인디케이터 점 — 색맹·저조도에서도 구분되게
                    색 하나에만 의존하지 않는다 */}
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: isActive ? t.color : "transparent",
                    boxShadow: isActive ? `0 0 6px ${t.color}` : "none",
                  }}
                  aria-hidden="true"
                />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
