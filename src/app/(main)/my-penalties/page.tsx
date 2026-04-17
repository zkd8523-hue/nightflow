"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import type { NoshowHistory, PenaltyAction, AppealStatus } from "@/types/database";
import { toast } from "sonner";

dayjs.locale("ko");

const PENALTY_LABEL: Record<PenaltyAction, string> = {
  block_3_days: "3일 정지",
  block_14_days: "14일 정지",
  block_60_days: "60일 정지",
  permanent_block: "영구 차단",
};

const APPEAL_STATUS_LABEL: Record<AppealStatus, { label: string; className: string }> = {
  pending: { label: "검토 중", className: "text-amber-400 bg-amber-400/10" },
  accepted: { label: "이의제기 인용 ✓", className: "text-green-400 bg-green-400/10" },
  rejected: { label: "이의제기 기각", className: "text-red-400 bg-red-400/10" },
};

interface HistoryWithAppeal extends NoshowHistory {
  appeal: {
    id: string;
    status: AppealStatus;
    reason: string;
    admin_response: string | null;
    reviewed_at: string | null;
  } | null;
  auction: {
    id: string;
    event_date: string | null;
    current_bid: number;
    clubs: { name: string } | null;
  } | null;
}

export default function MyPenaltiesPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const [histories, setHistories] = useState<HistoryWithAppeal[]>([]);
  const [loading, setLoading] = useState(true);

  // 이의제기 Sheet 상태
  const [appealSheet, setAppealSheet] = useState<{ open: boolean; historyId: string | null }>({
    open: false,
    historyId: null,
  });
  const [appealReason, setAppealReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) {
      router.replace("/login");
    }
  }, [user, userLoading, router]);

  useEffect(() => {
    if (!user) return;

    const fetchHistories = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("noshow_history")
        .select(`
          *,
          auction:auctions (
            id,
            event_date,
            current_bid,
            clubs ( name )
          ),
          appeal:penalty_appeals (
            id,
            status,
            reason,
            admin_response,
            reviewed_at
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setHistories(data as unknown as HistoryWithAppeal[]);
      }
      setLoading(false);
    };

    fetchHistories();
  }, [user]);

  const isBanned = user?.blocked_until && new Date(user.blocked_until) > new Date();
  const isBlocked = user?.is_blocked;

  const openAppealSheet = (historyId: string) => {
    setAppealReason("");
    setAppealSheet({ open: true, historyId });
  };

  const submitAppeal = async () => {
    if (!appealSheet.historyId) return;
    if (appealReason.trim().length < 20) {
      toast.error("이의제기 사유를 20자 이상 작성해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/penalty/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noshow_history_id: appealSheet.historyId,
          reason: appealReason.trim(),
        }),
      });

      if (res.status === 409) {
        toast.error("이미 이의제기를 제출한 이력입니다.");
        setAppealSheet({ open: false, historyId: null });
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "제출에 실패했습니다.");
        return;
      }

      toast.success("이의제기가 제출되었습니다. 영업일 3일 내 검토됩니다.");
      setAppealSheet({ open: false, historyId: null });

      // 목록 새로고침
      setHistories((prev) =>
        prev.map((h) =>
          h.id === appealSheet.historyId
            ? {
                ...h,
                appeal: {
                  id: "",
                  status: "pending" as AppealStatus,
                  reason: appealReason.trim(),
                  admin_response: null,
                  reviewed_at: null,
                },
              }
            : h
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <h1 className="text-xl font-black text-white">패널티 내역</h1>
        </div>

        {/* 현재 제재 상태 */}
        {(isBlocked || isBanned) ? (
          <div className={`rounded-2xl p-4 mb-6 ${isBlocked ? "bg-red-500/10 border border-red-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className={`w-4 h-4 ${isBlocked ? "text-red-400" : "text-amber-400"}`} />
              <span className={`text-[13px] font-bold ${isBlocked ? "text-red-400" : "text-amber-400"}`}>
                {isBlocked ? "계정이 영구 정지되었습니다" : "이용이 일시 정지되었습니다"}
              </span>
            </div>
            {isBanned && !isBlocked && (
              <p className="text-[12px] text-neutral-400 ml-6">
                정지 해제: {dayjs(user?.blocked_until).format("YYYY년 M월 D일 HH:mm")}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 ml-6">
              <span className="text-[12px] text-neutral-500">
                스트라이크 <span className="text-red-400 font-bold">{user?.strike_count || 0}</span>회
              </span>
              {(user?.warning_count || 0) > 0 && (
                <span className="text-[12px] text-neutral-500">
                  경고 <span className="text-amber-400 font-bold">{user?.warning_count}</span>/3
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#1C1C1E] rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-[13px] font-bold text-green-400">정상 이용 중</span>
            </div>
            {((user?.strike_count || 0) > 0 || (user?.warning_count || 0) > 0) && (
              <div className="flex items-center gap-3 mt-2 ml-6">
                {(user?.strike_count || 0) > 0 && (
                  <span className="text-[12px] text-neutral-500">
                    스트라이크 <span className="text-amber-400 font-bold">{user?.strike_count}</span>회 누적
                  </span>
                )}
                {(user?.warning_count || 0) > 0 && (
                  <span className="text-[12px] text-neutral-500">
                    경고 <span className="text-amber-400 font-bold">{user?.warning_count}</span>/3
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 노쇼 이력 */}
        <h2 className="text-[13px] font-bold text-neutral-400 mb-3 uppercase tracking-wider">
          노쇼 이력
        </h2>

        {histories.length === 0 ? (
          <div className="bg-[#1C1C1E] rounded-2xl p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
            <p className="text-[14px] text-neutral-400">노쇼 이력이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {histories.map((history) => (
              <NoshowHistoryCard
                key={history.id}
                history={history}
                onAppeal={() => openAppealSheet(history.id)}
              />
            ))}
          </div>
        )}

        {/* 고객센터 안내 */}
        <div className="mt-6 p-4 bg-[#1C1C1E] rounded-2xl">
          <p className="text-[12px] text-neutral-500 leading-relaxed">
            Migration 108 이전 노쇼 이력은 목록에 표시되지 않습니다.
            이전 이력에 대한 이의제기는{" "}
            <a
              href="http://pf.kakao.com/_nightflow"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 underline"
            >
              카카오 채널 고객센터
            </a>
            로 문의해주세요.
          </p>
        </div>
      </div>

      {/* 이의제기 Sheet */}
      <Sheet
        open={appealSheet.open}
        onOpenChange={(open) => setAppealSheet({ open, historyId: open ? appealSheet.historyId : null })}
      >
        <SheetContent
          side="bottom"
          className="bg-[#1C1C1E] border-t border-neutral-800 rounded-t-3xl px-6 pb-10"
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="text-white text-left text-[17px] font-black">
              이의제기 제출
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-[12px] text-amber-400 leading-relaxed">
                이의제기는 노쇼 이력 1건당 1회만 제출 가능합니다.
                허위 이의제기 시 추가 패널티가 부과될 수 있습니다.
              </p>
            </div>

            <div>
              <label className="text-[13px] text-neutral-400 font-bold mb-2 block">
                이의제기 사유 <span className="text-neutral-600">(최소 20자)</span>
              </label>
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="연락 시도 내역, 상황 설명 등을 구체적으로 작성해주세요."
                rows={5}
                className="w-full bg-neutral-800 text-white text-[14px] rounded-xl p-3 resize-none border border-neutral-700 focus:border-neutral-500 focus:outline-none placeholder:text-neutral-600"
              />
              <p className={`text-[11px] mt-1 text-right ${appealReason.trim().length >= 20 ? "text-green-500" : "text-neutral-600"}`}>
                {appealReason.trim().length} / 20+자
              </p>
            </div>

            <p className="text-[12px] text-neutral-500">
              제출 후 영업일 3일 내 검토되며, 결과는 알림으로 안내됩니다.
            </p>

            <Button
              onClick={submitAppeal}
              disabled={submitting || appealReason.trim().length < 20}
              className="w-full bg-white text-black font-black rounded-2xl h-12 text-[15px] disabled:opacity-40"
            >
              {submitting ? "제출 중..." : "이의제기 제출"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NoshowHistoryCard({
  history,
  onAppeal,
}: {
  history: HistoryWithAppeal;
  onAppeal: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);

  const clubName = history.auction?.clubs?.name || "알 수 없는 클럽";
  const eventDate = history.auction?.event_date
    ? dayjs(history.auction.event_date).format("YYYY.MM.DD")
    : dayjs(history.created_at).format("YYYY.MM.DD");
  const penaltyLabel = PENALTY_LABEL[history.penalty_action];
  const appeal = history.appeal;
  const appealInfo = appeal ? APPEAL_STATUS_LABEL[appeal.status] : null;

  return (
    <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden">
      <button
        onClick={() => setShowDetail((v) => !v)}
        className="w-full p-4 flex items-start justify-between text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-[14px] font-bold text-white">{penaltyLabel}</span>
            {appealInfo && (
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${appealInfo.className}`}>
                {appealInfo.label}
              </span>
            )}
          </div>
          <p className="text-[12px] text-neutral-500 ml-6">
            {eventDate} · {clubName}
          </p>
          {history.blocked_until && (
            <p className="text-[12px] text-neutral-600 ml-6 mt-0.5">
              정지 해제: {dayjs(history.blocked_until).format("YYYY.MM.DD HH:mm")}
            </p>
          )}
        </div>
        <ChevronRight
          className={`w-4 h-4 text-neutral-600 mt-0.5 transition-transform ${showDetail ? "rotate-90" : ""}`}
        />
      </button>

      {showDetail && (
        <div className="px-4 pb-4 pt-0 border-t border-neutral-800/50">
          <div className="mt-3 space-y-2">
            {history.auction && (
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-neutral-500">낙찰가</span>
                <span className="text-white font-bold">
                  {new Intl.NumberFormat("ko-KR").format(history.auction.current_bid)}원
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-neutral-500">처리일시</span>
              <span className="text-neutral-300">
                {dayjs(history.created_at).format("YYYY.MM.DD HH:mm")}
              </span>
            </div>
          </div>

          {/* 이의제기 결과 표시 */}
          {appeal && (
            <div className={`mt-3 p-3 rounded-xl ${appeal.status === "accepted" ? "bg-green-500/10" : appeal.status === "rejected" ? "bg-red-500/10" : "bg-amber-500/10"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {appeal.status === "pending" && <Clock className="w-3.5 h-3.5 text-amber-400" />}
                {appeal.status === "accepted" && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                {appeal.status === "rejected" && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                <span className={`text-[12px] font-bold ${APPEAL_STATUS_LABEL[appeal.status].className.split(" ")[0]}`}>
                  {APPEAL_STATUS_LABEL[appeal.status].label}
                </span>
              </div>
              {appeal.admin_response && (
                <p className="text-[12px] text-neutral-400 ml-5">{appeal.admin_response}</p>
              )}
              {appeal.status === "pending" && (
                <p className="text-[11px] text-neutral-500 ml-5">영업일 3일 내 검토됩니다</p>
              )}
            </div>
          )}

          {/* 이의제기 버튼 — 아직 이의제기 안 한 경우 */}
          {!appeal && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAppeal();
              }}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-neutral-700 text-[13px] text-neutral-300 hover:bg-white/5 transition-colors font-bold"
            >
              <MessageSquare className="w-4 h-4" />
              이의제기하기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
