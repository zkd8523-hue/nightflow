"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Instagram, ExternalLink, Calendar, Disc3, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { DjClaim } from "@/types/database";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

/** PendingMDCard(MDManagement.tsx)와 같은 구성 — 운영자가 두 심사를 같은
 *  방식으로 처리할 수 있도록 카드 레이아웃을 맞춘다. */
export function DjClaimCard({
  claim,
  onUpdate,
}: {
  claim: DjClaim;
  onUpdate: (updated: Partial<DjClaim> & { id: string }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const isNew = !claim.dj_id;
  const claimantName = claim.claimant?.display_name || claim.claimant?.name || "이름 없음";
  const targetName = claim.dj?.display_name || claim.requested_name || "이름 없음";
  const instagramMismatch = claim.dj?.instagram && claim.dj.instagram !== claim.claimed_instagram;

  const handleApprove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dj-claims/${claim.id}/approve`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      onUpdate({ id: claim.id, status: "approved" });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? `승인 실패: ${e.message}` : "승인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dj-claims/${claim.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      onUpdate({ id: claim.id, status: "rejected", reject_reason: rejectReason.trim() || null });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? `거절 실패: ${e.message}` : "거절에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card border-amber-500/20 overflow-hidden">
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center font-black text-xl text-muted-foreground shrink-0">
            <Disc3 className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black text-foreground">{targetName}</h3>
              {isNew && (
                <span className="text-[10px] font-bold text-brand-amber bg-amber-500/10 px-1.5 py-0.5 rounded">
                  신규 등록 요청
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-xs">신청자: {claimantName}</p>

            {!isNew && claim.dj?.slug && (
              <Link
                href={`/dj/${claim.dj.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Disc3 className="w-3.5 h-3.5" /> 대상 프로필 보기 <ArrowRight className="w-3 h-3" />
              </Link>
            )}

            {isNew && claim.requested_clubs && (
              <p className="text-xs text-muted-foreground">주로 뛰는 클럽: {claim.requested_clubs}</p>
            )}

            <a
              href={`https://instagram.com/${claim.claimed_instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold hover:text-foreground transition-colors w-fit"
            >
              <Instagram className="w-3.5 h-3.5" /> @{claim.claimed_instagram}
              <ExternalLink className="w-3 h-3" />
            </a>
            {instagramMismatch && (
              <p className="text-[11px] text-brand-amber">
                기존 등록 핸들과 다름: @{claim.dj?.instagram}
              </p>
            )}
            {claim.memo && <p className="text-xs text-muted-foreground italic">&ldquo;{claim.memo}&rdquo;</p>}

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {dayjs(claim.created_at).format("YYYY-MM-DD HH:mm")}
              <span className="text-muted-foreground">({dayjs(claim.created_at).fromNow()})</span>
            </div>
          </div>
        </div>

        <div className="border-t border-border/30 pt-4 space-y-2">
          {showRejectInput && (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="거절 사유 (선택사항 — 신청자에게 표시됩니다)"
                rows={2}
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-red-500/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={loading}
                  className="flex-1 py-3 bg-red-600 text-white font-black text-[14px] rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40"
                >
                  {loading ? "처리 중..." : "거절 확정"}
                </button>
                <button
                  onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                  disabled={loading}
                  className="px-4 py-3 bg-muted text-muted-foreground font-bold text-sm rounded-xl hover:bg-muted transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
          {!showRejectInput && (
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 py-3 bg-green-600 text-white font-black text-[14px] rounded-xl hover:bg-green-700 transition-colors disabled:opacity-40"
              >
                {loading ? "처리 중..." : "승인하기"}
              </button>
              <button
                onClick={() => setShowRejectInput(true)}
                disabled={loading}
                className="px-5 py-3 bg-muted text-red-400 font-black text-sm rounded-xl hover:bg-red-500/10 hover:text-red-300 border border-transparent hover:border-red-500/20 transition-colors"
              >
                거절
              </button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
