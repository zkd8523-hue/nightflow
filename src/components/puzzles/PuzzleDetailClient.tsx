"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Users, AlertCircle, CheckCircle2, XCircle, Undo2, Building2 } from "lucide-react";
import { maskName } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PuzzleJoinSheet } from "./PuzzleJoinSheet";
import { OfferSheet } from "./OfferSheet";
import type { Puzzle, PuzzleMember, PuzzleOffer, GenderPref, AgePref, VibePref } from "@/types/database";

interface PuzzleDetailClientProps {
  puzzle: Puzzle;
  members: PuzzleMember[];
  currentUserId?: string;
  userRole?: "user" | "md" | "admin";
}

const GENDER_LABEL: Record<GenderPref, string | null> = {
  male_only: "남성만",
  female_only: "여성만",
  any: null,
};
const AGE_LABEL: Record<AgePref, string | null> = {
  early_20s: "20초",
  late_20s: "20후",
  "30s": "30대",
  any: null,
};
const VIBE_LABEL: Record<VibePref, string | null> = {
  chill: "조용히",
  active: "신나게",
  any: null,
};

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}월 ${day}일 (${days[d.getDay()]})`;
}

const STATUS_LABEL: Record<string, string> = {
  open: "모집 중",
  matched: "마감",
  accepted: "성사됨",
  cancelled: "취소됨",
  expired: "만료됨",
};

const OFFER_STATUS_LABEL: Record<string, string> = {
  pending: "제안 중",
  accepted: "수락됨",
  rejected: "거절됨",
  withdrawn: "철회됨",
  expired: "미선택",
};

export function PuzzleDetailClient({
  puzzle,
  members,
  currentUserId,
  userRole,
}: PuzzleDetailClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [showJoin, setShowJoin] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [offers, setOffers] = useState<PuzzleOffer[]>([]);
  const [myOffer, setMyOffer] = useState<PuzzleOffer | null>(null);
  const [acceptedOffer, setAcceptedOffer] = useState<PuzzleOffer | null>(null);
  const [acceptedKakaoUrl, setAcceptedKakaoUrl] = useState<string | null>(null);

  const isLeader = currentUserId === puzzle.leader_id;
  const isMember = members.some((m) => m.user_id === currentUserId);
  const isMd = userRole === "md";
  const isOpen = puzzle.status === "open";
  const isAccepted = puzzle.status === "accepted";
  // 하위 호환: V1 퍼즐은 budget_per_person, V2는 total_budget 사용
  const baseBudget = puzzle.total_budget ?? (puzzle.budget_per_person * puzzle.target_count);
  const perPersonBudget = puzzle.total_budget
    ? Math.floor(puzzle.total_budget / puzzle.target_count)
    : puzzle.budget_per_person;
  const fillRate = Math.round((puzzle.current_count / puzzle.target_count) * 100);

  const genderTag = GENDER_LABEL[puzzle.gender_pref];
  const ageTag = AGE_LABEL[puzzle.age_pref];
  const vibeTag = VIBE_LABEL[puzzle.vibe_pref];
  const tags = [genderTag, ageTag, vibeTag].filter(Boolean) as string[];

  const loadOffers = useCallback(async () => {
    const { data } = await supabase
      .from("puzzle_offers")
      .select("*, club:clubs(id, name, area), md:users!puzzle_offers_md_id_fkey(id, name, profile_image)")
      .eq("puzzle_id", puzzle.id)
      .order("created_at", { ascending: true });

    if (!data) return;
    setOffers(data as PuzzleOffer[]);

    if (currentUserId && isMd) {
      const mine = data.find((o) => o.md_id === currentUserId) || null;
      setMyOffer(mine as PuzzleOffer | null);
    }

    if (puzzle.accepted_offer_id) {
      const accepted = data.find((o) => o.id === puzzle.accepted_offer_id) || null;
      setAcceptedOffer(accepted as PuzzleOffer | null);
    }
  }, [puzzle.id, puzzle.accepted_offer_id, currentUserId, isMd, supabase]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const pendingOffers = offers.filter((o) => o.status === "pending");

  const handleCancel = async () => {
    if (!confirm("퍼즐을 취소하시겠습니까? 참여자 전원에게 알림이 발송됩니다.")) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("cancel_puzzle", { p_puzzle_id: puzzle.id });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "취소에 실패했습니다"); return; }
      toast.success("퍼즐이 취소되었습니다");
      router.push("/?tab=puzzle");
    } catch {
      toast.error("취소에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm("퍼즐에서 나가시겠습니까?")) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("leave_puzzle", { p_puzzle_id: puzzle.id });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "나가기에 실패했습니다"); return; }
      toast.success("퍼즐에서 나갔습니다");
      router.refresh();
    } catch {
      toast.error("나가기에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("이 참여자를 제거하시겠습니까?")) return;
    try {
      const { data, error } = await supabase.rpc("remove_puzzle_member", {
        p_puzzle_id: puzzle.id,
        p_user_id: memberId,
      });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "제거에 실패했습니다"); return; }
      toast.success("자리가 조정되었습니다");
      router.refresh();
    } catch {
      toast.error("제거에 실패했습니다");
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    if (!confirm("이 제안을 수락하시겠습니까? 수락 후에는 취소할 수 없으며 MD에게 카카오 링크가 공개됩니다.")) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("accept_offer", { p_offer_id: offerId });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "수락에 실패했습니다"); return; }
      toast.success("제안을 수락했습니다! MD가 곧 연락할 예정입니다.");
      if (data.kakao_open_chat_url) {
        setAcceptedKakaoUrl(data.kakao_open_chat_url);
      }
      router.refresh();
      await loadOffers();
    } catch {
      toast.error("수락에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    if (!confirm("이 제안을 거절하시겠습니까?")) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("reject_offer", { p_offer_id: offerId });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "거절에 실패했습니다"); return; }
      toast.success("제안을 거절했습니다");
      await loadOffers();
    } catch {
      toast.error("거절에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdrawOffer = async (offerId: string) => {
    if (!confirm("제안을 철회하시겠습니까?")) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("withdraw_offer", { p_offer_id: offerId });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "철회에 실패했습니다"); return; }
      toast.success("제안이 철회되었습니다. 슬롯이 회복되었습니다.");
      await loadOffers();
    } catch {
      toast.error("철회에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="max-w-lg mx-auto px-4">
        {/* 헤더 */}
        <div className="flex items-center gap-3 py-5">
          <Link href="/?tab=puzzle" className="text-white">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-[17px] font-black text-white flex-1">퍼즐 상세</h1>
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
              puzzle.status === "open"
                ? "bg-green-500/20 text-green-400"
                : puzzle.status === "accepted"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : puzzle.status === "matched"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-neutral-700 text-neutral-400"
            }`}
          >
            {STATUS_LABEL[puzzle.status] || puzzle.status}
          </span>
        </div>

        <div className="space-y-5 pb-10">
          {/* 기본 정보 */}
          <section className="bg-[#1C1C1E] rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-[22px] font-black text-white">
                {formatEventDate(puzzle.event_date)}
              </p>
              <p className="text-[15px] text-neutral-400 mt-0.5">{puzzle.area}</p>
            </div>

            {/* 인원 프로그레스 */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-neutral-400">{puzzle.current_count}/{puzzle.target_count}명 참여 중</span>
                <span className="text-neutral-500">{fillRate}%</span>
              </div>
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${fillRate}%` }}
                />
              </div>
            </div>

            {/* 예산 */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[24px] font-black text-green-400">
                총 {baseBudget.toLocaleString()}원
              </span>
              <span className="text-[13px] text-neutral-500">
                (인당 {perPersonBudget.toLocaleString()}원)
              </span>
            </div>

            {/* 취향 태그 */}
            {tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[12px] px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* 자유 메모 */}
            {puzzle.notes && (
              <div className="pt-4 border-t border-neutral-800/50">
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
                  <p className="text-[11px] text-neutral-500 mb-2 font-bold uppercase tracking-wider">남긴 메모</p>
                  <p className="text-[13px] text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {puzzle.notes}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* 성사 기록 (accepted 상태) */}
          {isAccepted && (
            <section className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
                <h2 className="text-[15px] font-black text-amber-400">성사됨</h2>
              </div>
              {acceptedOffer && (
                <div className="space-y-1">
                  <p className="text-[14px] font-bold text-white">
                    {(acceptedOffer.club as { name?: string } | null)?.name || "클럽"} · {acceptedOffer.table_type}
                  </p>
                  {/* 방장에게만 상세 정보 표시 */}
                  {isLeader && (
                    <div className="space-y-2 pt-2 border-t border-amber-500/20 mt-2">
                      <p className="text-[13px] text-neutral-300">
                        💰 {acceptedOffer.proposed_price.toLocaleString()}원
                      </p>
                      {acceptedOffer.includes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {acceptedOffer.includes.map((inc) => (
                            <span key={inc} className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                              {inc}
                            </span>
                          ))}
                        </div>
                      )}
                      {acceptedOffer.comment && (
                        <p className="text-[12px] text-neutral-400 italic">"{acceptedOffer.comment}"</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <p className="text-[11px] text-neutral-500">
                {isLeader
                  ? "MD가 곧 연락할 예정입니다. 선입금/테이블 배정은 MD와 직접 협의하세요."
                  : `MD ${offers.filter(o => o.status !== 'expired').length}명이 경쟁, 성사됨`}
              </p>

              {/* 수락 후 방장에게 카카오 링크 재표시 (방장이 이미 알고 있지만 편의용) */}
              {isLeader && (acceptedKakaoUrl || puzzle.kakao_open_chat_url) && (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3">
                  <p className="text-[11px] text-neutral-500 mb-1">MD에게 공개된 오픈채팅 링크</p>
                  <p className="text-[12px] text-neutral-300 break-all">
                    {acceptedKakaoUrl || puzzle.kakao_open_chat_url}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* 오퍼 섹션 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-neutral-400" />
                <h2 className="text-[14px] font-bold text-neutral-300">MD 제안</h2>
              </div>
              <span className="text-[12px] text-neutral-500">
                {pendingOffers.length > 0
                  ? `MD ${pendingOffers.length}명이 제안 중`
                  : isAccepted
                  ? "제안 마감"
                  : "아직 제안 없음"}
              </span>
            </div>

            {/* 방장: 전체 제안 목록 + 수락/거절 버튼 */}
            {isLeader && offers.length > 0 && (
              <div className="space-y-3">
                {offers
                  .filter((o) => o.status === "pending" || o.id === puzzle.accepted_offer_id)
                  .map((offer) => (
                    <div
                      key={offer.id}
                      className={`rounded-2xl border p-4 space-y-3 ${
                        offer.status === "accepted"
                          ? "bg-amber-500/10 border-amber-500/30"
                          : "bg-[#1C1C1E] border-neutral-800"
                      }`}
                    >
                      {/* 클럽명 + 테이블타입 (공개) */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[15px] font-black text-white">
                            {(offer.club as { name?: string } | null)?.name || "클럽"}
                          </p>
                          <p className="text-[12px] text-neutral-400">{offer.table_type}</p>
                        </div>
                        {offer.status === "accepted" ? (
                          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                            ✓ 수락됨
                          </span>
                        ) : (
                          <span className="text-[11px] px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 font-medium">
                            제안 중
                          </span>
                        )}
                      </div>

                      {/* 방장 전용: 금액 + 포함내역 + 코멘트 */}
                      <div className="space-y-2 pt-2 border-t border-neutral-800/60">
                        <p className="text-[16px] font-black text-green-400">
                          {offer.proposed_price.toLocaleString()}원
                          {offer.proposed_price > baseBudget && (
                            <span className="ml-1.5 text-[11px] text-amber-400 font-bold">⚡ 프리미엄</span>
                          )}
                        </p>
                        {offer.includes.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {offer.includes.map((inc) => (
                              <span key={inc} className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
                                {inc}
                              </span>
                            ))}
                          </div>
                        )}
                        {offer.comment && (
                          <p className="text-[12px] text-neutral-400 italic">"{offer.comment}"</p>
                        )}
                      </div>

                      {/* 수락/거절 버튼 (open 상태일 때만) */}
                      {isOpen && offer.status === "pending" && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            onClick={() => handleAcceptOffer(offer.id)}
                            disabled={actionLoading}
                            className="flex-1 h-10 bg-white hover:bg-neutral-200 text-black font-black text-[13px] rounded-xl"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                            수락
                          </Button>
                          <Button
                            onClick={() => handleRejectOffer(offer.id)}
                            disabled={actionLoading}
                            variant="outline"
                            className="flex-1 h-10 border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10 font-bold text-[13px] rounded-xl"
                          >
                            <XCircle className="w-4 h-4 mr-1.5" />
                            거절
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* 방장 아닌 일반유저/MD (다른 MD): 오퍼 건수만 표시 */}
            {!isLeader && !isMd && pendingOffers.length > 0 && !isAccepted && (
              <div className="bg-[#1C1C1E] rounded-2xl border border-neutral-800 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-neutral-500" />
                  <p className="text-[13px] text-neutral-400">
                    현재 <span className="text-white font-bold">MD {pendingOffers.length}명</span>이 방장에게 제안 중입니다.
                  </p>
                </div>
              </div>
            )}

            {/* MD 본인 오퍼 상태 */}
            {isMd && myOffer && (
              <div className={`rounded-2xl border p-4 space-y-2 ${
                myOffer.status === "accepted"
                  ? "bg-amber-500/10 border-amber-500/30"
                  : myOffer.status === "pending"
                  ? "bg-[#1C1C1E] border-green-500/30"
                  : "bg-[#1C1C1E] border-neutral-800"
              }`}>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-white">내 제안</p>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    myOffer.status === "accepted"
                      ? "bg-amber-500/20 text-amber-400"
                      : myOffer.status === "pending"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-neutral-700 text-neutral-500"
                  }`}>
                    {OFFER_STATUS_LABEL[myOffer.status]}
                  </span>
                </div>
                <p className="text-[14px] font-black text-white">
                  {myOffer.table_type} · {myOffer.proposed_price.toLocaleString()}원
                </p>
                {myOffer.status === "accepted" && (
                  <p className="text-[12px] text-amber-400">방장의 카카오 링크로 직접 연락하세요!</p>
                )}
                {myOffer.status === "pending" && isOpen && (
                  <Button
                    onClick={() => handleWithdrawOffer(myOffer.id)}
                    disabled={actionLoading}
                    variant="outline"
                    size="sm"
                    className="h-8 border-neutral-700 bg-transparent text-neutral-400 hover:bg-neutral-800 font-bold text-[12px] rounded-lg"
                  >
                    <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                    제안 철회
                  </Button>
                )}
              </div>
            )}
          </section>

          {/* 참여자 목록 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-neutral-400" />
              <h2 className="text-[14px] font-bold text-neutral-300">참여자</h2>
            </div>
            <div className="space-y-2">
              {members.map((member) => {
                const isMe = member.user_id === currentUserId;
                const isLeaderMember = member.user_id === puzzle.leader_id;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between bg-[#1C1C1E] rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {isMe && member.user?.profile_image ? (
                        <img
                          src={member.user.profile_image}
                          alt="나"
                          className="w-9 h-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-neutral-700 flex items-center justify-center text-[14px] font-bold text-white">
                          {member.user?.name?.[0] || "?"}
                        </div>
                      )}
                      <div>
                        <p className="text-[14px] font-bold text-white flex items-center gap-1.5">
                          {isMe ? (member.user?.name || "알 수 없음") : maskName(member.user?.name)}
                          {isLeaderMember && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                              대표자
                            </span>
                          )}
                          {isMe && !isLeaderMember && (
                            <span className="text-[10px] text-neutral-500">나</span>
                          )}
                        </p>
                        {member.guest_count > 0 && (
                          <p className="text-[11px] text-neutral-500">+{member.guest_count}명 동행</p>
                        )}
                      </div>
                    </div>
                    {isLeader && !isLeaderMember && isOpen && (
                      <button
                        onClick={() => handleRemoveMember(member.user_id)}
                        className="text-[11px] text-red-500 hover:text-red-400 font-medium"
                      >
                        자리 조정
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 대표자 전용 액션 */}
          {isLeader && isOpen && (
            <section className="space-y-2">
              <Button
                onClick={handleCancel}
                disabled={actionLoading}
                variant="outline"
                className="w-full h-12 border-red-500/50 bg-transparent text-red-400 hover:bg-red-500/10 font-bold text-[14px] rounded-2xl"
              >
                퍼즐 취소하기
              </Button>
            </section>
          )}

          {/* 참여자 나가기 버튼 */}
          {isMember && isOpen && (
            <Button
              onClick={handleLeave}
              disabled={actionLoading}
              variant="outline"
              className="w-full h-12 border-neutral-700 bg-transparent text-neutral-400 hover:bg-neutral-800 font-bold text-[14px] rounded-2xl"
            >
              나가기
            </Button>
          )}

          {/* 미참여 유저 참여 버튼 */}
          {!isMember && !isLeader && !isMd && isOpen && currentUserId && (
            <Button
              onClick={() => setShowJoin(true)}
              className="w-full h-13 bg-white hover:bg-neutral-200 text-black font-black text-[15px] rounded-2xl transition-all active:scale-[0.98]"
            >
              참여하기
            </Button>
          )}

          {/* MD 제안하기 버튼 */}
          {isMd && isOpen && !myOffer && (
            <div className="space-y-2">
              <Button
                onClick={() => setShowOffer(true)}
                className="w-full h-13 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl"
              >
                제안하기
              </Button>
              <p className="text-[11px] text-neutral-600 text-center leading-relaxed">
                수락 시 30크레딧 차감 · 미선택 시 크레딧 차감 없음
              </p>
            </div>
          )}

          {/* MD 이미 제안한 경우 */}
          {isMd && isOpen && myOffer && myOffer.status === "pending" && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
              <p className="text-[13px] text-green-400 font-bold">제안서를 보냈습니다</p>
              <p className="text-[12px] text-neutral-500 mt-1">방장의 수락을 기다리고 있습니다</p>
            </div>
          )}

          {/* 로그인 유도 */}
          {!currentUserId && isOpen && (
            <Link href="/login">
              <Button className="w-full h-12 bg-white text-black font-black text-[14px] rounded-2xl">
                로그인하고 참여하기
              </Button>
            </Link>
          )}
        </div>
      </div>

      {showJoin && (
        <PuzzleJoinSheet
          puzzle={puzzle}
          open={showJoin}
          onClose={() => setShowJoin(false)}
        />
      )}

      {showOffer && (
        <OfferSheet
          puzzle={puzzle}
          open={showOffer}
          onClose={() => setShowOffer(false)}
          onSubmitted={() => {
            setShowOffer(false);
            loadOffers();
          }}
        />
      )}
    </div>
  );
}
