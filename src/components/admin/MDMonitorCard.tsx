"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Club, MDHealthScore } from "@/types/database";
import { computeHealthStatus } from "@/lib/utils/mdHealth";
import { MDHealthBadge } from "./MDHealthBadge";
import { MDActivityTimeline } from "./MDActivityTimeline";
import { MDPuzzleOffers } from "./MDPuzzleOffers";
import { ChevronDown, ChevronUp, ArrowRight, ShieldOff, Flag, Gavel, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface Props {
  md: MDHealthScore;
  clubs?: Club[];
  defaultClubId?: string | null;
}

export function MDMonitorCard({ md, clubs = [], defaultClubId = null }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRevoke, setShowRevoke] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [puzzleStats, setPuzzleStats] = useState<{ total: number; accepted: number; rejected: number; pending: number } | null>(null);
  const status = computeHealthStatus(md);

  useEffect(() => {
    const fetchPuzzleStats = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("puzzle_offers")
        .select("status, puzzle_id")
        .eq("md_id", md.md_id);

      const rows = (data as Array<{ status: string; puzzle_id: string }>) || [];

      // 이벤트 날짜가 지난 puzzle은 진행중에서 제외
      const puzzleIds = [...new Set(rows.map(r => r.puzzle_id))];
      const puzzleMap = new Map<string, string | null>();
      if (puzzleIds.length > 0) {
        const { data: puzzles } = await supabase
          .from("puzzles")
          .select("id, event_date")
          .in("id", puzzleIds);
        for (const p of (puzzles as Array<{ id: string; event_date: string | null }> || [])) {
          puzzleMap.set(p.id, p.event_date);
        }
      }

      const today = dayjs().startOf("day");
      const isExpiredPending = (r: { status: string; puzzle_id: string }) => {
        if (r.status !== "pending") return false;
        const eventDate = puzzleMap.get(r.puzzle_id);
        if (!eventDate) return false;
        return dayjs(eventDate).isBefore(today);
      };

      const accepted = rows.filter(r => r.status === "accepted").length;
      const pending = rows.filter(r => r.status === "pending" && !isExpiredPending(r)).length;
      const rejected =
        rows.filter(r => ["rejected", "withdrawn", "expired"].includes(r.status)).length +
        rows.filter(isExpiredPending).length;
      setPuzzleStats({ total: rows.length, accepted, rejected, pending });
    };
    fetchPuzzleStats();
  }, [md.md_id]);

  const handleRevoke = async () => {
    if (!revokeReason.trim()) {
      setRevokeError("박탈 사유를 입력해주세요");
      return;
    }
    if (!confirm(`${md.name} 파트너의 권한을 박탈하시겠습니까?\n이 작업은 즉시 적용됩니다.`)) return;

    setRevokeLoading(true);
    setRevokeError(null);
    try {
      const res = await fetch("/api/admin/mds/sanction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mdId: md.md_id, action: "revoke", reason: revokeReason.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "박탈 처리 실패");
      setRevoked(true);
      setShowRevoke(false);
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : "박탈 처리 실패");
    } finally {
      setRevokeLoading(false);
    }
  };

  const lastActive = md.last_auction_date
    ? dayjs(md.last_auction_date).fromNow()
    : "활동 없음";

  return (
    <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden transition-all">
      {/* Clickable Header Area */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 cursor-pointer transition-colors hover:bg-[#2C2C2E] active:scale-[0.99]"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-white">
              {md.name?.[0] || "?"}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white">{md.name} 파트너</span>
                {md.md_status === "suspended" && (
                  <span className="text-[10px] font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                    SUSPENDED
                  </span>
                )}
                {(md.md_status === "revoked" || revoked) && (
                  <span className="text-[10px] font-black text-neutral-400 bg-neutral-700/40 px-2 py-0.5 rounded-full">
                    REVOKED
                  </span>
                )}
                {(md as unknown as { md_unique_slug?: string | null }).md_unique_slug && (
                  <Link
                    href={`/md/${(md as unknown as { md_unique_slug: string }).md_unique_slug}`}
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full hover:bg-amber-500/20 transition-colors"
                  >
                    공개 프로필 ↗
                  </Link>
                )}
              </div>
              <div className="text-sm text-neutral-400">
                {Array.isArray(md.area) ? md.area.join(", ") : md.area || "미지정"} · {lastActive}
              </div>
              {clubs.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-neutral-400 font-bold">
                  <Building2 className="w-3 h-3 text-neutral-500" />
                  <span className="truncate max-w-[280px]">
                    {clubs.length === 1
                      ? clubs[0].name
                      : `${clubs.map(c => c.name).join(", ")}`}
                  </span>
                  {clubs.length > 1 && (
                    <span className="text-neutral-600">({clubs.length}개)</span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                {md.instagram && (
                  <a href={`https://instagram.com/${md.instagram}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-pink-400 hover:text-pink-300">@{md.instagram}</a>
                )}
                {md.phone && (
                  <a href={`tel:${md.phone}`} onClick={(e) => e.stopPropagation()} className="text-[11px] text-neutral-500 hover:text-neutral-300">{md.phone}</a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MDHealthBadge status={status} />
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-neutral-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-neutral-600" />
            )}
          </div>
        </div>

        {/* 깃발 / 경매 그룹 메트릭 */}
        <div className="grid grid-cols-2 gap-2">
          {/* 깃발 (Puzzle Offers) */}
          <div className="bg-neutral-900/40 rounded-xl px-3 py-2.5 border border-neutral-800/40">
            <div className="flex items-center gap-1.5 mb-2">
              <Flag className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-black text-white">깃발</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              <div>
                <div className="text-[10px] text-neutral-500 font-bold">총</div>
                <div className="text-sm font-black text-white">{puzzleStats?.total ?? 0}</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 font-bold">진행</div>
                <div className="text-sm font-black text-amber-400">{puzzleStats?.pending ?? 0}</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 font-bold">선택</div>
                <div className="text-sm font-black text-green-400">{puzzleStats?.accepted ?? 0}</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 font-bold">미선택</div>
                <div className="text-sm font-black text-neutral-400">{puzzleStats?.rejected ?? 0}</div>
              </div>
            </div>
          </div>

          {/* 경매 (Auctions) */}
          <div className="bg-neutral-900/40 rounded-xl px-3 py-2.5 border border-neutral-800/40">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Gavel className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-black text-white">경매</span>
              </div>
              <span className="text-sm font-black text-white">{md.total_auctions}건</span>
            </div>
            <div className="text-[11px] font-bold text-neutral-400">
              낙찰률{" "}
              <span
                className={
                  md.sell_through_rate >= 60
                    ? "text-green-400"
                    : md.sell_through_rate >= 40
                      ? "text-amber-400"
                      : md.total_auctions > 0
                        ? "text-red-400"
                        : "text-neutral-500"
                }
              >
                {md.total_auctions > 0 ? `${md.sell_through_rate}%` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Activity Timeline */}
      {isExpanded && (
        <div
          className="border-t border-neutral-800/50 bg-neutral-900/30 px-4 pt-3 pb-4 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 등록 클럽 섹션 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-black text-neutral-300 uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5" />
                등록 클럽
                <span className="text-neutral-500 font-bold normal-case ml-1">{clubs.length}개</span>
              </div>
            </div>
            {clubs.length > 0 ? (
              <div className="space-y-1.5">
                {clubs.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 bg-neutral-900/40 rounded-lg px-3 py-2 border border-neutral-800/40">
                    <div className="w-8 h-8 rounded-md bg-neutral-800 overflow-hidden shrink-0 flex items-center justify-center">
                      {c.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbnail_url} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="w-3.5 h-3.5 text-neutral-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-white truncate">{c.name}</span>
                        {c.id === defaultClubId && (
                          <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">DEFAULT</span>
                        )}
                      </div>
                      {c.address && (
                        <p className="text-[11px] text-neutral-500 truncate">{c.address}</p>
                      )}
                    </div>
                    {c.area && (
                      <span className="text-[10px] text-neutral-500 font-bold shrink-0">{c.area}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-600 italic">등록된 클럽 없음</p>
            )}
          </div>

          {/* 깃발 섹션 */}
          <div>
            <div className="flex items-center gap-1.5 mb-3 text-xs font-black text-amber-400 uppercase tracking-wider">
              <Flag className="w-3.5 h-3.5" />
              깃발
            </div>
            <MDPuzzleOffers mdId={md.md_id} />
          </div>

          {/* 경매 섹션 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-black text-blue-400 uppercase tracking-wider">
                <Gavel className="w-3.5 h-3.5" />
                경매
                <span className="text-neutral-500 font-bold normal-case ml-1">
                  · 글 {md.total_auctions}건 · 낙찰률 {md.total_auctions > 0 ? `${md.sell_through_rate}%` : "—"}
                </span>
              </div>
              <Link
                href={`/admin/mds/${md.md_id}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors font-medium"
              >
                상세 보기
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <MDActivityTimeline mdId={md.md_id} />
          </div>

          {/* MD 권한 박탈 */}
          {!revoked && md.md_status !== "revoked" && (
            <div className="pt-3 border-t border-neutral-800/50">
              {!showRevoke ? (
                <button
                  onClick={() => setShowRevoke(true)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-bold transition-colors"
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                  파트너 권한 박탈
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold">
                    <ShieldOff className="w-3.5 h-3.5" />
                    파트너 권한 박탈
                  </div>
                  <textarea
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="박탈 사유 (필수 — 감사 로그에 기록됩니다)"
                    rows={2}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 resize-none focus:outline-none focus:border-red-500/50"
                  />
                  {revokeError && (
                    <p className="text-xs text-red-400">{revokeError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleRevoke}
                      disabled={revokeLoading}
                      className="flex-1 py-2.5 bg-red-600 text-white font-black text-xs rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40"
                    >
                      {revokeLoading ? "처리 중..." : "박탈 확정"}
                    </button>
                    <button
                      onClick={() => { setShowRevoke(false); setRevokeReason(""); setRevokeError(null); }}
                      disabled={revokeLoading}
                      className="px-4 py-2.5 bg-neutral-800 text-neutral-400 font-bold text-xs rounded-xl hover:bg-neutral-700 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
