"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import type { AppealStatus, PenaltyAction } from "@/types/database";

dayjs.locale("ko");

const PENALTY_LABEL: Record<PenaltyAction, string> = {
  block_3_days: "3일 정지",
  block_14_days: "14일 정지",
  block_60_days: "60일 정지",
  permanent_block: "영구 차단",
};

interface AppealWithDetails {
  id: string;
  user_id: string;
  noshow_history_id: string;
  reason: string;
  status: AppealStatus;
  admin_response: string | null;
  created_at: string;
  reviewed_at: string | null;
  noshow_history: {
    id: string;
    penalty_action: PenaltyAction;
    strike_count_at_time: number;
    blocked_until: string | null;
    created_at: string;
    auction: {
      id: string;
      event_date: string | null;
      current_bid: number;
      clubs: { name: string } | null;
    } | null;
    user: {
      id: string;
      display_name: string;
      profile_image: string | null;
      strike_count: number;
      is_blocked: boolean;
      blocked_until: string | null;
    };
  };
}

type FilterTab = "pending" | "all";

export default function AdminAppealsPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useCurrentUser();
  const [appeals, setAppeals] = useState<AppealWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !user) {
      router.replace("/login");
    }
  }, [user, userLoading, router]);

  const fetchAppeals = async () => {
    const supabase = createClient();
    let query = supabase
      .from("penalty_appeals")
      .select(`
        *,
        noshow_history:noshow_history (
          id,
          penalty_action,
          strike_count_at_time,
          blocked_until,
          created_at,
          auction:auctions (
            id,
            event_date,
            current_bid,
            clubs ( name )
          ),
          user:users (
            id,
            display_name,
            profile_image,
            strike_count,
            is_blocked,
            blocked_until
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (tab === "pending") {
      query = query.eq("status", "pending");
    }

    const { data, error } = await query;
    if (!error && data) {
      setAppeals(data as unknown as AppealWithDetails[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchAppeals();
  }, [user, tab]);

  const handleDecision = async (appealId: string, status: "accepted" | "rejected") => {
    const response = responseText[appealId]?.trim();
    if (!response || response.length < 5) {
      toast.error("관리자 답변을 5자 이상 입력해주세요.");
      return;
    }

    setProcessing(appealId);
    try {
      const res = await fetch(`/api/admin/appeals/${appealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_response: response }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "처리에 실패했습니다.");
        return;
      }

      toast.success(status === "accepted" ? "이의제기를 인용했습니다." : "이의제기를 기각했습니다.");
      setExpanded(null);
      fetchAppeals();
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount = appeals.filter((a) => a.status === "pending").length;

  if (userLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <div>
            <h1 className="text-xl font-black text-white">이의제기 관리</h1>
            {pendingCount > 0 && (
              <p className="text-[12px] text-amber-400 font-bold">{pendingCount}건 대기 중</p>
            )}
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-6">
          {([["pending", "대기 중"], ["all", "전체"]] as [FilterTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setLoading(true); }}
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-colors ${
                tab === key
                  ? "bg-white text-black"
                  : "bg-[#1C1C1E] text-neutral-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : appeals.length === 0 ? (
          <div className="bg-[#1C1C1E] rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
            <p className="text-[14px] text-neutral-400">
              {tab === "pending" ? "대기 중인 이의제기가 없습니다" : "이의제기 이력이 없습니다"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {appeals.map((appeal) => (
              <AppealCard
                key={appeal.id}
                appeal={appeal}
                isExpanded={expanded === appeal.id}
                onToggle={() => setExpanded(expanded === appeal.id ? null : appeal.id)}
                responseText={responseText[appeal.id] || ""}
                onResponseChange={(text) =>
                  setResponseText((prev) => ({ ...prev, [appeal.id]: text }))
                }
                onDecision={(status) => handleDecision(appeal.id, status)}
                processing={processing === appeal.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AppealCard({
  appeal,
  isExpanded,
  onToggle,
  responseText,
  onResponseChange,
  onDecision,
  processing,
}: {
  appeal: AppealWithDetails;
  isExpanded: boolean;
  onToggle: () => void;
  responseText: string;
  onResponseChange: (text: string) => void;
  onDecision: (status: "accepted" | "rejected") => void;
  processing: boolean;
}) {
  const history = appeal.noshow_history;
  const userInfo = history.user;
  const auction = history.auction;
  const clubName = auction?.clubs?.name || "알 수 없는 클럽";
  const eventDate = auction?.event_date
    ? dayjs(auction.event_date).format("YYYY.MM.DD")
    : dayjs(history.created_at).format("YYYY.MM.DD");

  const statusConfig = {
    pending: { icon: <Clock className="w-4 h-4 text-amber-400" />, label: "대기 중", cls: "text-amber-400" },
    accepted: { icon: <CheckCircle2 className="w-4 h-4 text-green-400" />, label: "인용", cls: "text-green-400" },
    rejected: { icon: <XCircle className="w-4 h-4 text-red-400" />, label: "기각", cls: "text-red-400" },
  }[appeal.status];

  return (
    <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-start justify-between text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {statusConfig.icon}
            <span className={`text-[13px] font-bold ${statusConfig.cls}`}>{statusConfig.label}</span>
            <span className="text-[13px] text-white font-bold">{userInfo.display_name}</span>
            <span className="text-[12px] text-neutral-500">
              · {PENALTY_LABEL[history.penalty_action]}
            </span>
          </div>
          <p className="text-[12px] text-neutral-500 ml-6">
            {eventDate} · {clubName} · 제출 {dayjs(appeal.created_at).format("MM.DD HH:mm")}
          </p>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-neutral-600 mt-0.5 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-600 mt-0.5 shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-neutral-800/50 space-y-3 pt-3">
          {/* 유저 정보 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-neutral-800/50 rounded-xl p-2.5 text-center">
              <p className="text-[11px] text-neutral-500 mb-0.5">스트라이크</p>
              <p className="text-[14px] font-black text-red-400">{userInfo.strike_count}회</p>
            </div>
            <div className="bg-neutral-800/50 rounded-xl p-2.5 text-center">
              <p className="text-[11px] text-neutral-500 mb-0.5">정지 상태</p>
              <p className="text-[13px] font-bold text-white">
                {userInfo.is_blocked ? "영구" : userInfo.blocked_until && new Date(userInfo.blocked_until) > new Date() ? "정지중" : "정상"}
              </p>
            </div>
            <div className="bg-neutral-800/50 rounded-xl p-2.5 text-center">
              <p className="text-[11px] text-neutral-500 mb-0.5">정지 해제</p>
              <p className="text-[11px] font-bold text-neutral-300">
                {userInfo.blocked_until && !userInfo.is_blocked
                  ? dayjs(userInfo.blocked_until).format("MM.DD")
                  : "-"}
              </p>
            </div>
          </div>

          {/* 이의제기 사유 */}
          <div className="bg-neutral-800/50 rounded-xl p-3">
            <p className="text-[11px] text-neutral-500 mb-1 font-bold">이의제기 사유</p>
            <p className="text-[13px] text-neutral-200 leading-relaxed whitespace-pre-wrap">
              {appeal.reason}
            </p>
          </div>

          {/* 처리 UI (대기 중일 때만) */}
          {appeal.status === "pending" ? (
            <>
              <div>
                <label className="text-[12px] text-neutral-400 font-bold mb-1.5 block">
                  관리자 답변 <span className="text-neutral-600">(필수, 5자+)</span>
                </label>
                <textarea
                  value={responseText}
                  onChange={(e) => onResponseChange(e.target.value)}
                  placeholder="처리 사유를 간략히 작성해주세요."
                  rows={3}
                  className="w-full bg-neutral-800 text-white text-[13px] rounded-xl p-3 resize-none border border-neutral-700 focus:border-neutral-500 focus:outline-none placeholder:text-neutral-600"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onDecision("accepted")}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-[13px] font-bold hover:bg-green-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {processing ? "처리 중..." : "인용 (스트라이크 -1)"}
                </button>
                <button
                  onClick={() => onDecision("rejected")}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-[13px] font-bold hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  {processing ? "처리 중..." : "기각"}
                </button>
              </div>
            </>
          ) : (
            /* 처리 완료 */
            <div className={`p-3 rounded-xl ${appeal.status === "accepted" ? "bg-green-500/10" : "bg-red-500/10"}`}>
              <p className="text-[11px] text-neutral-500 mb-1 font-bold">관리자 답변</p>
              <p className="text-[13px] text-neutral-200">{appeal.admin_response}</p>
              <p className="text-[11px] text-neutral-600 mt-1">
                처리: {appeal.reviewed_at ? dayjs(appeal.reviewed_at).format("YYYY.MM.DD HH:mm") : "-"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
