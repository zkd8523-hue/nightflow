import Link from "next/link";

/**
 * 홈 상단 LED 전광판 — 기존 LIVE(ShotCarousel) 자리.
 *
 * 두 줄이 각각 독립 링크다:
 *   DJ LINE UP    → /lineups  (club_lineups + lineup_sets + djs)
 *   UNDERGROUND   → /events   (club_events, 별개 테이블)
 *
 * 한쪽 데이터가 비면 그 줄만 빠지고, 둘 다 비면 컴포넌트 자체가 null이라
 * 빈 껍데기가 남지 않는다(LIVE가 그랬듯 여백만 남는 사고 방지).
 *
 * 데이터는 page.tsx(RSC)에서 SSR로 미리 가져와 props로 넘어온다 — 파티/클럽다이렉트와
 * 같은 최초 페인트에 함께 채워지도록(예전엔 클라이언트 useEffect라 hydration 이후에야
 * 채워져 화면 상단이 하단보다 늦게 뜨는 문제가 있었다). 가공 로직은
 * @/lib/home/lineupTickerData의 buildLineupTickerData 참고.
 */
export function LineupTicker({
  djNames,
  eventLabels,
}: {
  djNames: string[];
  eventLabels: string[];
}) {
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
