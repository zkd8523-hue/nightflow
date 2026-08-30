import Link from "next/link";
import Image from "next/image";
import { Disc3 } from "lucide-react";
import { formatBusinessMin } from "@/lib/lineups/time";
import { formatLineupDate } from "@/lib/lineups/formatDate";

export interface DjShowRow {
  club_id: string;
  club_name: string;
  club_area: string | null;
  club_thumbnail: string | null;
  event_date: string;
  start_min: number | null;
}

/**
 * DJ 공개 프로필의 라인업 목록 — 명함 카드(/u와 동일)와 달리 이 섹션만 LED
 * 전광판 언어를 쓴다(LineupPageHeader·LineupTicker와 같은 도트매트릭스+스캔라인).
 * "DJ 라인업"이라는 콘텐츠 자체를 나플다운 톤으로 보여주는 자리이기 때문이다.
 * 색은 /lineups 탭의 DJ LINE UP과 맞춘 형광 초록.
 */
export function DjLedShowList({
  rows,
  emptyLabel,
  onItemClick,
}: {
  rows: DjShowRow[];
  emptyLabel: string;
  /** 행을 눌러 다른 페이지로 이동하기 직전에 호출된다 — 시트에서 쓸 때 onClose로 넘긴다. */
  onItemClick?: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 py-8 text-center">
        <p className="text-[12px] text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_6px_18px_rgba(0,0,0,0.45)]"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.3px)",
        backgroundSize: "6px 6px",
        backgroundColor: "#000",
      }}
    >
      <span
        className="absolute inset-0 pointer-events-none opacity-50 z-[2]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 3px)",
        }}
        aria-hidden="true"
      />
      <div className="relative z-[1] divide-y divide-white/[0.06]">
        {rows.map((r, i) => (
          <Link
            key={`${r.club_id}-${r.event_date}-${i}`}
            href={`/clubs/${r.club_id}/lineup/${r.event_date}`}
            onClick={onItemClick}
            className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors"
          >
            {/* 클럽 대표 이미지 — 없을 때만 레코드 아이콘으로 대체한다.
                LED 전광판 톤이라 이미지도 작게 원형으로 넣어 결을 맞춘다. */}
            {r.club_thumbnail ? (
              <span className="relative w-7 h-7 flex-shrink-0 rounded-full overflow-hidden ring-1 ring-white/15">
                <Image src={r.club_thumbnail} alt="" fill sizes="28px" className="object-cover" />
              </span>
            ) : (
              <Disc3 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#39ff6a" }} aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className="font-mono text-[12px] font-bold tracking-[0.02em] truncate"
                style={{ color: "#39ff6a", textShadow: "0 0 6px rgba(57,255,106,0.5)" }}
              >
                {r.club_name}
                {r.club_area && <span className="ml-1.5 opacity-60">{r.club_area}</span>}
              </p>
              <p className="font-mono text-[10px] text-white/40 mt-0.5">{formatLineupDate(r.event_date)}</p>
            </div>
            {r.start_min !== null && (
              <span className="font-mono text-[11px] text-white/50 flex-shrink-0">
                {formatBusinessMin(r.start_min)}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
