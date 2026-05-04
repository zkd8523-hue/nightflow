"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface PuzzleOfferRow {
  id: string;
  status: string;
  table_type: string | null;
  proposed_price: number;
  includes: string[] | null;
  comment: string | null;
  created_at: string;
  puzzle: { id: string; area: string | null; event_date: string | null; notes: string | null } | null;
  club: { name: string | null } | null;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "대기 중", color: "bg-amber-500/20 text-amber-400" },
  accepted: { label: "수락됨", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "거절됨", color: "bg-neutral-700 text-neutral-400" },
  withdrawn: { label: "철회됨", color: "bg-neutral-700 text-neutral-400" },
  expired: { label: "미선택", color: "bg-neutral-700 text-neutral-500" },
};

function formatDateLabel(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}/${day} (${days[d.getDay()]})`;
}

function OfferCard({ offer }: { offer: PuzzleOfferRow }) {
  const status = STATUS_LABEL[offer.status] || { label: offer.status, color: "bg-neutral-700 text-neutral-400" };
  const includes = (offer.includes || []).filter(Boolean);
  const dateLabel = formatDateLabel(offer.puzzle?.event_date || null);

  const cardBody = (
    <div className="bg-neutral-900/60 rounded-xl p-3 space-y-1.5 border border-neutral-800/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white truncate">
            {dateLabel}
            {offer.puzzle?.area && <> · {offer.puzzle.area}</>}
            {offer.puzzle?.notes && <span className="text-neutral-400"> · "{offer.puzzle.notes}"</span>}
          </p>
          <p className="text-[12px] text-neutral-400 truncate">
            {offer.club?.name || "클럽 미정"} · {offer.table_type || "—"} · {formatPrice(offer.proposed_price)}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status.color}`}>
          {status.label}
        </span>
      </div>
      {includes.length > 0 && (
        <p className="text-[11px] text-neutral-500 truncate">🍾 {includes.join(", ")}</p>
      )}
      {offer.comment && (
        <p className="text-[11px] text-neutral-500 italic truncate">💬 "{offer.comment}"</p>
      )}
      <p className="text-[10px] text-neutral-600">{dayjs(offer.created_at).fromNow()} 제안</p>
    </div>
  );

  return offer.puzzle?.id ? (
    <Link
      href={`/flags/${offer.puzzle.id}`}
      onClick={(e) => e.stopPropagation()}
      className="block hover:opacity-90 transition-opacity"
    >
      {cardBody}
    </Link>
  ) : (
    cardBody
  );
}

export function MDPuzzleOffers({ mdId }: { mdId: string }) {
  const [offers, setOffers] = useState<PuzzleOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const fetchOffers = async () => {
      const supabase = createClient();
      // puzzles nested select 제거 — RLS 충돌 회피, 별도 조회 후 매핑
      const { data: rawOffers, error } = await supabase
        .from("puzzle_offers")
        .select(`
          id, status, table_type, proposed_price, includes, comment, created_at, puzzle_id,
          club:clubs(name)
        `)
        .eq("md_id", mdId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("[MDPuzzleOffers] offers fetch error:", error);
      }

      const offerRows = (rawOffers as unknown as Array<{
        id: string;
        status: string;
        table_type: string | null;
        proposed_price: number;
        includes: string[] | null;
        comment: string | null;
        created_at: string;
        puzzle_id: string;
        club: { name: string | null } | null;
      }>) || [];

      // puzzle 정보 별도 조회
      const puzzleIds = [...new Set(offerRows.map((o) => o.puzzle_id))];
      const puzzleMap = new Map<string, { id: string; area: string | null; event_date: string | null; notes: string | null }>();
      if (puzzleIds.length > 0) {
        const { data: puzzles, error: pErr } = await supabase
          .from("puzzles")
          .select("id, area, event_date, notes")
          .in("id", puzzleIds);
        if (pErr) {
          console.error("[MDPuzzleOffers] puzzles fetch error:", pErr);
        }
        for (const p of puzzles || []) {
          puzzleMap.set(p.id, p);
        }
      }

      const merged: PuzzleOfferRow[] = offerRows.map((o) => ({
        id: o.id,
        status: o.status,
        table_type: o.table_type,
        proposed_price: o.proposed_price,
        includes: o.includes,
        comment: o.comment,
        created_at: o.created_at,
        puzzle: puzzleMap.get(o.puzzle_id) || null,
        club: o.club,
      }));

      setOffers(merged);
      setLoading(false);
    };

    fetchOffers();
  }, [mdId]);

  if (loading) {
    return (
      <div className="space-y-2 py-2">
        <div className="h-4 bg-neutral-800 rounded w-32 animate-pulse" />
        <div className="h-16 bg-neutral-800/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  const pending = offers.filter((o) => o.status === "pending");
  const history = offers.filter((o) => o.status !== "pending");

  if (offers.length === 0) {
    return (
      <div className="py-3 text-center text-neutral-600 text-xs">깃발 제안 내역이 없습니다</div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 현재 제안 중 — 항상 표시 */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] font-black text-green-400 uppercase tracking-wider">
              현재 제안 중 ({pending.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {pending.map((o) => <OfferCard key={o.id} offer={o} />)}
          </div>
        </div>
      )}

      {/* 깃발 제안 내역 — 토글 드롭다운 */}
      {history.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={(e) => { e.stopPropagation(); setHistoryOpen(!historyOpen); }}
            className="w-full flex items-center justify-between text-left py-1 hover:opacity-80 transition-opacity"
          >
            <span className="text-[11px] font-black text-neutral-400 uppercase tracking-wider">
              📋 깃발 제안 내역 (총 {offers.length}건)
            </span>
            {historyOpen ? (
              <ChevronUp className="w-4 h-4 text-neutral-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-500" />
            )}
          </button>
          {historyOpen && (
            <div className="space-y-1.5">
              {history.map((o) => <OfferCard key={o.id} offer={o} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
