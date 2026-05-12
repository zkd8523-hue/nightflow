"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface AbusePuzzleRow {
  id: string;
  created_at: string;
  event_date: string;
  area: string;
  notes: string | null;
  status: string;
  accepted_md_id: string | null;
  accepted_md_name: string | null;
  offer_count: number;
}

export interface AbuseLeaderRow {
  leader_id: string;
  leader_name: string;
  total_puzzles: number;
  accepted_count: number;
  last_puzzle_at: string;
  accepted_md_summary: { md_id: string; md_name: string; count: number }[];
  puzzles: AbusePuzzleRow[];
}

interface Props {
  rows: AbuseLeaderRow[];
}

const STATUS_LABEL: Record<string, string> = {
  open: "모집 중",
  matched: "마감",
  accepted: "성사",
  cancelled: "취소",
  expired: "만료",
};

const STATUS_COLOR: Record<string, string> = {
  open: "text-green-400",
  matched: "text-amber-400",
  accepted: "text-amber-400",
  cancelled: "text-neutral-500",
  expired: "text-red-400",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
}

export function AbuseInvestigationTable({ rows }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <div className="text-center py-20 text-neutral-500">
        <p>깃발을 올린 유저가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl overflow-hidden">
      {/* 헤더 */}
      <div className="grid grid-cols-[1fr_70px_70px_1.5fr_30px] gap-2 px-4 py-3 border-b border-neutral-800 text-[11px] font-bold text-neutral-500">
        <div>유저</div>
        <div className="text-right">게시</div>
        <div className="text-right">수락</div>
        <div>수락한 MD</div>
        <div />
      </div>

      {/* 행 */}
      {rows.map((row) => {
        const isOpen = expanded.has(row.leader_id);
        return (
          <div key={row.leader_id} className="border-b border-neutral-800/60 last:border-b-0">
            <button
              type="button"
              onClick={() => toggle(row.leader_id)}
              className="w-full grid grid-cols-[1fr_70px_70px_1.5fr_30px] gap-2 px-4 py-3.5 items-center hover:bg-neutral-900/50 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-white truncate">{row.leader_name}</p>
                <p className="text-[11px] text-neutral-600 mt-0.5">
                  최근 {formatDateTime(row.last_puzzle_at)}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[14px] font-black text-white">{row.total_puzzles}</span>
                <span className="text-[11px] text-neutral-500 ml-0.5">건</span>
              </div>
              <div className="text-right">
                <span
                  className={`text-[14px] font-black ${
                    row.accepted_count === 0
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  {row.accepted_count}
                </span>
                <span className="text-[11px] text-neutral-500 ml-0.5">건</span>
              </div>
              <div className="min-w-0">
                {row.accepted_md_summary.length === 0 ? (
                  <span className="text-[12px] text-neutral-600">-</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {row.accepted_md_summary.map((md) => (
                      <span
                        key={md.md_id}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          md.count >= 2
                            ? "bg-red-500/20 text-red-300"
                            : "bg-neutral-800 text-neutral-300"
                        }`}
                      >
                        {md.md_name}
                        {md.count >= 2 && ` ×${md.count}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end text-neutral-500">
                {isOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="bg-[#141414] border-t border-neutral-800/60 px-4 py-3 space-y-2">
                {row.puzzles.map((p) => (
                  <div
                    key={p.id}
                    className="bg-[#1C1C1E] border border-neutral-800/80 rounded-lg px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-neutral-500 font-mono">
                            {formatDateTime(p.created_at)}
                          </span>
                          <span className="text-[11px] text-neutral-600">·</span>
                          <span className="text-[12px] font-bold text-neutral-300">
                            {formatEventDate(p.event_date)} {p.area}
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              STATUS_COLOR[p.status] || "text-neutral-500"
                            }`}
                          >
                            · {STATUS_LABEL[p.status] || p.status}
                          </span>
                        </div>
                        {p.notes && (
                          <p className="text-[12px] text-neutral-400 mt-1 break-words">
                            {p.notes}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-[11px] text-neutral-500">
                            제안 {p.offer_count}건
                          </span>
                          {p.accepted_md_name && (
                            <>
                              <span className="text-[11px] text-neutral-600">·</span>
                              <span className="text-[11px] text-amber-400 font-bold">
                                수락: {p.accepted_md_name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/flags/${p.id}`}
                        className="text-[11px] text-neutral-500 hover:text-white shrink-0 underline"
                      >
                        상세
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
