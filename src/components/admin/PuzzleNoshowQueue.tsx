"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ShieldAlert, Clock, CheckCircle } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import dayjs from "dayjs";
import "dayjs/locale/ko";

dayjs.locale("ko");

interface NoshowOffer {
  id: string;
  proposed_price: number;
  table_type: string | null;
  visit_marked_at: string;
  strike_applied_at: string | null;
  md: { id: string; display_name: string; name: string | null; instagram?: string | null } | null;
  puzzle: {
    id: string;
    event_date: string;
    area: string;
    leader_id?: string;
    leader: {
      id: string;
      display_name: string;
      name: string | null;
      strike_count: number;
      is_blocked?: boolean;
      blocked_until?: string | null;
    } | null;
  } | null;
}

interface Props {
  pendingNoshows: NoshowOffer[];
  processedNoshows: NoshowOffer[];
}

function NoshowCard({
  offer,
  onStrikeApplied,
}: {
  offer: NoshowOffer;
  onStrikeApplied?: (offerId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leader = offer.puzzle?.leader;

  const handleStrike = async () => {
    if (!confirm(
      `${leader?.display_name || "방장"}에게 strike를 적용하시겠습니까?\n현재 strike: ${leader?.strike_count ?? 0}회`
    )) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/puzzles/apply-strike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "처리 실패");
      setDone(true);
      onStrikeApplied?.(offer.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="bg-neutral-900/50 rounded-2xl p-4 border border-neutral-800/30 flex items-center gap-2 text-green-400 text-sm font-bold">
        <CheckCircle className="w-4 h-4" /> Strike 적용 완료
      </div>
    );
  }

  return (
    <div className="bg-[#1C1C1E] rounded-2xl p-4 border border-red-500/20 space-y-3">
      {/* 이벤트 정보 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-black text-white">
              {offer.puzzle?.event_date
                ? dayjs(offer.puzzle.event_date).format("M/D (ddd)")
                : "날짜 미상"}
            </span>
            {offer.puzzle?.area && (
              <span className="text-xs text-neutral-500">· {offer.puzzle.area}</span>
            )}
          </div>
          <div className="text-xs text-neutral-400">
            {offer.table_type && <span>{offer.table_type} · </span>}
            <span className="text-green-400 font-bold">{formatPrice(offer.proposed_price)}</span>
            <span className="text-neutral-600"> · MD 마킹: {dayjs(offer.visit_marked_at).fromNow()}</span>
          </div>
        </div>
        <span className="text-[10px] font-black text-red-400 bg-red-500/10 px-2 py-1 rounded-full shrink-0">NOSHOW</span>
      </div>

      {/* 방장 정보 */}
      {leader && (
        <div className="bg-neutral-900/60 rounded-xl p-3 border border-neutral-800/40">
          <p className="text-[10px] text-neutral-500 font-bold mb-1.5 uppercase tracking-wider">방장 (평가 대상)</p>
          <div className="flex items-center justify-between">
            <div>
              <Link
                href={`/admin/users?focus=${leader.id}`}
                className="text-sm font-black text-white hover:text-blue-400 hover:underline transition-colors"
              >
                {leader.display_name || leader.name || "이름 없음"}
              </Link>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-bold ${leader.strike_count > 0 ? "text-red-400" : "text-neutral-500"}`}>
                  현재 strike {leader.strike_count}회
                </span>
                {leader.is_blocked && (
                  <span className="text-[10px] text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-full font-bold">차단됨</span>
                )}
                {leader.blocked_until && !leader.is_blocked && (
                  <span className="text-[10px] text-amber-400 font-bold">
                    정지 ~{dayjs(leader.blocked_until).format("M/D")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MD 정보 */}
      {offer.md && (
        <div className="text-xs text-neutral-500">
          마킹 MD: <span className="text-neutral-400 font-bold">{offer.md.display_name || offer.md.name}</span>
          {offer.md.instagram && (
            <a
              href={`https://instagram.com/${offer.md.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1.5 text-pink-400 hover:text-pink-300"
            >
              @{offer.md.instagram}
            </a>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* 액션 */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleStrike}
          disabled={loading}
          className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-sm rounded-xl transition-colors disabled:opacity-40"
        >
          {loading ? "처리 중..." : "⚡ Strike 적용"}
        </button>
        <Link
          href={`/flags/${offer.puzzle?.id}`}
          target="_blank"
          className="px-4 py-2.5 bg-neutral-800 text-neutral-400 hover:text-white font-bold text-sm rounded-xl transition-colors"
        >
          깃발 보기
        </Link>
      </div>
    </div>
  );
}

export function PuzzleNoshowQueue({ pendingNoshows, processedNoshows }: Props) {
  const [pending, setPending] = useState<NoshowOffer[]>(pendingNoshows);
  const [tab, setTab] = useState<"pending" | "done">("pending");

  const handleStrikeApplied = (offerId: string) => {
    setPending(prev => prev.filter(o => o.id !== offerId));
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-12 pb-24">
      <div className="max-w-2xl mx-auto px-6 space-y-8">
        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-neutral-400" />
            </Link>
            <div className="flex items-center gap-2 text-neutral-500 font-bold uppercase tracking-widest text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5" />
              Admin
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tighter">깃발 노쇼 검토</h1>
          <p className="text-neutral-500 text-sm">MD가 마킹한 노쇼를 검토하고 방장에게 strike를 적용합니다</p>
        </header>

        {/* 탭 */}
        <div className="flex gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
          <button
            onClick={() => setTab("pending")}
            className={`flex-1 py-2 text-sm font-black rounded-lg transition-colors ${
              tab === "pending"
                ? "bg-[#1C1C1E] text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            미처리 {pending.length > 0 && (
              <span className={`ml-1 text-xs font-black ${tab === "pending" ? "text-red-400" : "text-neutral-600"}`}>
                {pending.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("done")}
            className={`flex-1 py-2 text-sm font-black rounded-lg transition-colors ${
              tab === "done"
                ? "bg-[#1C1C1E] text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            처리 완료
          </button>
        </div>

        {/* 미처리 큐 */}
        {tab === "pending" && (
          <div className="space-y-3">
            {pending.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <div className="w-14 h-14 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-7 h-7 text-green-500" />
                </div>
                <p className="text-neutral-500 font-medium">미처리 노쇼가 없습니다</p>
              </div>
            ) : (
              pending.map(offer => (
                <NoshowCard
                  key={offer.id}
                  offer={offer}
                  onStrikeApplied={handleStrikeApplied}
                />
              ))
            )}
          </div>
        )}

        {/* 처리 완료 */}
        {tab === "done" && (
          <div className="space-y-3">
            {processedNoshows.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-neutral-600 text-sm">처리된 내역이 없습니다</p>
              </div>
            ) : (
              processedNoshows.map(offer => (
                <div key={offer.id} className="bg-[#1C1C1E] rounded-2xl p-4 border border-neutral-800/30 opacity-60">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-white">
                        {offer.puzzle?.event_date
                          ? dayjs(offer.puzzle.event_date).format("M/D (ddd)")
                          : "날짜 미상"}
                      </span>
                      {offer.puzzle?.area && (
                        <span className="text-xs text-neutral-500 ml-2">· {offer.puzzle.area}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-green-400 font-bold">
                      <Clock className="w-3.5 h-3.5" />
                      Strike 적용됨
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    방장: {offer.puzzle?.leader?.display_name || offer.puzzle?.leader?.name || "—"}
                    {offer.puzzle?.leader && (
                      <span className="ml-1.5 text-red-400">strike {offer.puzzle.leader.strike_count}회</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
