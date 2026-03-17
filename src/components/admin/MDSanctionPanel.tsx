"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  Clock,
  ShieldOff,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import type { MDSanction, MDSanctionAction } from "@/types/database";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";
import { getErrorMessage, logError } from "@/lib/utils/error";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface MDSanctionPanelProps {
  mdId: string;
  mdName: string;
  mdStatus: string;
  mdSuspendedUntil: string | null;
  sanctions: MDSanction[];
}

const ACTION_LABELS: Record<MDSanctionAction, string> = {
  warning: "경고",
  suspend: "일시 정지",
  unsuspend: "정지 해제",
  revoke: "자격 박탈",
};

const ACTION_COLORS: Record<MDSanctionAction, string> = {
  warning: "text-amber-500",
  suspend: "text-red-500",
  unsuspend: "text-green-500",
  revoke: "text-red-600",
};

export function MDSanctionPanel({
  mdId,
  mdName,
  mdStatus,
  mdSuspendedUntil,
  sanctions,
}: MDSanctionPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dialogAction, setDialogAction] = useState<MDSanctionAction | null>(null);
  const [reason, setReason] = useState("");
  const [durationDays, setDurationDays] = useState(7);

  const isSuspended = mdStatus === "suspended";
  const isRevoked = mdStatus === "revoked";
  const isApproved = mdStatus === "approved";

  const handleSanction = async () => {
    if (!dialogAction || !reason.trim()) {
      toast.error("사유를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/mds/sanction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mdId,
          action: dialogAction,
          reason: reason.trim(),
          durationDays: dialogAction === "suspend" ? durationDays : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const actionLabel = ACTION_LABELS[dialogAction];
      toast.success(
        `${actionLabel} 처리 완료` +
        (data.cancelledAuctions > 0 ? ` (경매 ${data.cancelledAuctions}건 취소)` : "")
      );

      setDialogAction(null);
      setReason("");
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'MDSanctionPanel.handleSanction');
      toast.error(msg || "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (action: MDSanctionAction) => {
    setDialogAction(action);
    setReason("");
    setDurationDays(7);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black">제재 관리</h2>

      {/* 현재 상태 배너 */}
      {isApproved && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-green-500">정상 활동 중</p>
            <p className="text-xs text-green-500/70">현재 제재 없이 정상 활동 중입니다.</p>
          </div>
        </div>
      )}

      {isSuspended && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
          <Ban className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-500">활동 정지 중</p>
            <p className="text-xs text-red-500/70">
              경매 등록이 제한됩니다.
              {mdSuspendedUntil && (
                <> 해제 예정: <span className="font-semibold">
                  {dayjs(mdSuspendedUntil).format("YYYY-MM-DD HH:mm")}
                </span> ({dayjs(mdSuspendedUntil).fromNow()})</>
              )}
            </p>
          </div>
        </div>
      )}

      {isRevoked && (
        <div className="bg-neutral-500/5 border border-neutral-500/20 rounded-2xl p-4 flex items-center gap-3">
          <ShieldOff className="w-5 h-5 text-neutral-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-neutral-400">자격 박탈됨</p>
            <p className="text-xs text-neutral-500">MD 자격이 영구적으로 박탈되었습니다. 일반 유저로 전환되었습니다.</p>
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      {!isRevoked && (
        <div className="flex gap-2 flex-wrap">
          {(isApproved || isSuspended) && (
            <Button
              variant="outline"
              onClick={() => openDialog("warning")}
              className="border-amber-500/30 text-amber-500 hover:bg-amber-500/10 rounded-xl h-10 px-4 font-bold"
            >
              <AlertTriangle className="w-4 h-4 mr-1.5" />
              경고
            </Button>
          )}

          {isApproved && (
            <Button
              variant="outline"
              onClick={() => openDialog("suspend")}
              className="border-red-500/30 text-red-500 hover:bg-red-500/10 rounded-xl h-10 px-4 font-bold"
            >
              <Clock className="w-4 h-4 mr-1.5" />
              일시 정지
            </Button>
          )}

          {isSuspended && (
            <Button
              variant="outline"
              onClick={() => openDialog("unsuspend")}
              className="border-green-500/30 text-green-500 hover:bg-green-500/10 rounded-xl h-10 px-4 font-bold"
            >
              <Undo2 className="w-4 h-4 mr-1.5" />
              정지 해제
            </Button>
          )}

          {(isApproved || isSuspended) && (
            <Button
              onClick={() => openDialog("revoke")}
              className="bg-red-600 text-white hover:bg-red-700 rounded-xl h-10 px-4 font-bold"
            >
              <ShieldOff className="w-4 h-4 mr-1.5" />
              자격 박탈
            </Button>
          )}
        </div>
      )}

      {/* 제재 이력 */}
      {sanctions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-neutral-400">제재 이력</p>
          <div className="space-y-2">
            {sanctions.map((s) => (
              <Card key={s.id} className="bg-[#1C1C1E] border-neutral-800 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black ${ACTION_COLORS[s.action]}`}>
                        {ACTION_LABELS[s.action]}
                      </span>
                      {s.duration_days && (
                        <span className="text-[10px] text-neutral-600 font-bold">
                          {s.duration_days}일
                        </span>
                      )}
                      {s.active_auctions_cancelled > 0 && (
                        <span className="text-[10px] text-red-500/60 font-bold">
                          경매 {s.active_auctions_cancelled}건 취소
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">{s.reason}</p>
                  </div>
                  <span className="text-[10px] text-neutral-600 shrink-0">
                    {dayjs(s.created_at).format("YY.MM.DD HH:mm")}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 제재 다이얼로그 */}
      <Dialog open={!!dialogAction} onOpenChange={(open) => {
        if (!open) {
          setDialogAction(null);
          setReason("");
        }
      }}>
        <DialogContent className="bg-[#1C1C1E] border-neutral-800 text-white" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-white font-black text-xl">
              {dialogAction && ACTION_LABELS[dialogAction]}
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              <span className="text-white font-bold">{mdName}</span> MD에게{" "}
              {dialogAction === "warning" && "경고를 발송합니다."}
              {dialogAction === "suspend" && "활동 정지를 적용합니다. 진행중인 경매가 취소됩니다."}
              {dialogAction === "unsuspend" && "활동 정지를 해제합니다."}
              {dialogAction === "revoke" && "MD 자격을 영구 박탈합니다. 이 작업은 되돌릴 수 없습니다."}
            </DialogDescription>
          </DialogHeader>

          {/* 정지 기간 선택 */}
          {dialogAction === "suspend" && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500 font-bold">정지 기간</p>
              <div className="flex gap-2">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDurationDays(d)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
                      durationDays === d
                        ? "bg-red-500 text-white"
                        : "bg-neutral-900 text-neutral-400 border border-neutral-800 hover:border-neutral-600"
                    }`}
                  >
                    {d}일
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 자격 박탈 경고 */}
          {dialogAction === "revoke" && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400 leading-relaxed">
                자격 박탈 시 MD 역할이 일반 유저로 변경되며, 진행중인 모든 경매가 취소됩니다.
                이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
          )}

          {/* 사유 입력 */}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="제재 사유를 입력해주세요"
            className="w-full h-28 bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-sm text-white placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600"
          />

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setDialogAction(null); setReason(""); }}
              className="border-neutral-800 text-neutral-400 hover:bg-neutral-900 rounded-xl"
            >
              취소
            </Button>
            <Button
              onClick={handleSanction}
              disabled={!reason.trim() || loading}
              className={`font-bold rounded-xl ${
                dialogAction === "revoke"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : dialogAction === "unsuspend"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : dialogAction === "warning"
                  ? "bg-amber-500 text-black hover:bg-amber-600"
                  : "bg-red-500 text-white hover:bg-red-600"
              }`}
            >
              {loading ? "처리중..." : (dialogAction && `${ACTION_LABELS[dialogAction]} 확정`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
