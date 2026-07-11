"use client";

import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  AlertTriangle,
  ShieldAlert,
  Clock,
  ChevronRight,
  MessageCircle,
  Instagram,
  Check,
  X,
} from "lucide-react";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
import { MyStampsCard } from "@/components/profile/MyStampsCard";
import { PuzzleCard } from "@/components/puzzles/PuzzleCard";
import { toast } from "sonner";
import dayjs from "dayjs";
import type { ContactMethodType, Puzzle } from "@/types/database";

const CONTACT_METHOD_OPTIONS: { value: ContactMethodType; label: string; icon: typeof Instagram }[] = [
  { value: "dm", label: "인스타 DM", icon: Instagram },
  { value: "kakao", label: "오픈채팅", icon: MessageCircle },
  { value: "phone", label: "전화", icon: Phone },
];

const FLAG_STATUS: Record<string, { text: string; tone: string }> = {
  open: { text: "제안 받는중", tone: "text-amber-400" },
  selecting: { text: "제안 검토중", tone: "text-amber-400" },
  matched: { text: "매칭 완료", tone: "text-green-400" },
  accepted: { text: "매칭 완료", tone: "text-green-400" },
  cancelled: { text: "취소됨", tone: "text-neutral-500" },
  expired: { text: "만료됨", tone: "text-neutral-500" },
};

export default function ProfilePage() {
  const { user, isLoading, refetch } = useCurrentUser();
  const router = useRouter();
  const supabase = createClient();

  // 닉네임/사진 편집은 /me (공개 프로필) ProfileEditSheet에서 처리

  // MD 비즈니스 연락처 수정
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const [instagram, setInstagram] = useState("");
  const [kakaoUrl, setKakaoUrl] = useState("");
  const [preferredMethods, setPreferredMethods] = useState<ContactMethodType[]>([]);
  const [savingBusiness, setSavingBusiness] = useState(false);

  const [myFlags, setMyFlags] = useState<Puzzle[]>([]);
  // 진행중 깃발별 pending 오퍼 수 — 홈 카드와 동일한 "오퍼 N개 중에서 고르는중" 표시용
  const [flagOfferCounts, setFlagOfferCounts] = useState<Record<string, number>>({});
  // 깃발별 "마지막으로 확인한 오퍼 수"(localStorage) — 상세를 열면 갱신됨. NEW +N 계산 기준.
  const [flagOffersSeen, setFlagOffersSeen] = useState<Record<string, number>>({});
  // 합류(참여)한 조각 — 내가 만든 게 아니라 puzzle_members로 들어간 조각
  const [joinedShares, setJoinedShares] = useState<Puzzle[]>([]);

  useEffect(() => {
    if (!user) return;
    // 내가 만든 깃발/조각
    supabase
      .from("puzzles")
      .select("*")
      .eq("leader_id", user.id)
      .is("leader_hidden_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        setMyFlags(data as Puzzle[]);

        // 진행중(open/selecting) 깃발의 pending 오퍼 수 집계 (홈과 동일 방식)
        const activeIds = (data as Puzzle[])
          .filter((f) => !f.is_recruiting_party && (f.status === "open" || f.status === "selecting"))
          .map((f) => f.id);
        if (activeIds.length === 0) return;
        supabase
          .from("puzzle_offers")
          .select("puzzle_id")
          .in("puzzle_id", activeIds)
          .eq("status", "pending")
          .then(({ data: offers }) => {
            if (!offers) return;
            const counts: Record<string, number> = {};
            offers.forEach((o) => {
              counts[o.puzzle_id] = (counts[o.puzzle_id] ?? 0) + 1;
            });
            setFlagOfferCounts(counts);

            // 각 깃발의 "확인한 오퍼 수"를 localStorage에서 읽어옴
            const seen: Record<string, number> = {};
            activeIds.forEach((id) => {
              const v = typeof window !== "undefined" ? localStorage.getItem(`flag_offers_seen_${id}`) : null;
              seen[id] = v ? parseInt(v, 10) || 0 : 0;
            });
            setFlagOffersSeen(seen);
          });
      });

    // 내가 합류한 조각 (방장 제외 — 내가 만든 건 위에서 이미 조회)
    (async () => {
      const { data: memberRows } = await supabase
        .from("puzzle_members")
        .select("puzzle_id")
        .eq("user_id", user.id);
      const joinedIds = (memberRows ?? []).map((r) => r.puzzle_id);
      if (joinedIds.length === 0) {
        setJoinedShares([]);
        return;
      }
      const { data: joined } = await supabase
        .from("puzzles")
        .select("*")
        .in("id", joinedIds)
        .eq("is_recruiting_party", true)
        .neq("leader_id", user.id)
        .order("created_at", { ascending: false });
      setJoinedShares((joined ?? []) as Puzzle[]);
    })();
  }, [user]);

  const handleHideFlag = async (id: string) => {
    if (typeof window !== "undefined" &&
        !window.confirm("삭제하면 복구할 수 없습니다.\n이 깃발을 목록에서 삭제할까요?")) return;
    const { data, error } = await supabase.rpc("hide_my_puzzle", { p_puzzle_id: id });
    if (error || !data?.success) {
      toast.error(data?.error || "삭제에 실패했습니다");
      return;
    }
    setMyFlags((prev) => prev.filter((f) => f.id !== id));
  };

  // 취소/만료된 항목 한번에 정리 (진행중/매칭완료는 대상 아님)
  const handleBulkCleanup = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (typeof window !== "undefined" &&
        !window.confirm(`취소·만료된 ${ids.length}개를 삭제할까요?\n삭제하면 복구할 수 없습니다.`)) return;
    const results = await Promise.all(
      ids.map((id) => supabase.rpc("hide_my_puzzle", { p_puzzle_id: id }))
    );
    const succeededIds = ids.filter((_, i) => !results[i].error && results[i].data?.success);
    const failedCount = ids.length - succeededIds.length;
    if (succeededIds.length > 0) {
      setMyFlags((prev) => prev.filter((f) => !succeededIds.includes(f.id)));
    }
    if (failedCount > 0) toast.error(`${failedCount}개는 삭제하지 못했습니다`);
    if (succeededIds.length > 0) toast.success(`${succeededIds.length}개 정리했습니다`);
  };

  // 깃발(인원 확정) / 조각(파티원 모집) 분리
  const flagsOnly = myFlags.filter((f) => !f.is_recruiting_party);
  const sharesOnly = myFlags.filter((f) => f.is_recruiting_party);
  // 진행중(open/selecting) 판별 — 카드에 오퍼 현황/상태 뱃지 분기용
  const isActiveStatus = (s: string) => s === "open" || s === "selecting";
  // 취소/만료된 항목만 정리 대상 (매칭완료는 기록 보존을 위해 제외)
  const isCleanable = (s: string) => s === "cancelled" || s === "expired";
  const cleanableFlagIds = flagsOnly.filter((f) => isCleanable(f.status)).map((f) => f.id);
  const cleanableShareIds = sharesOnly.filter((f) => isCleanable(f.status)).map((f) => f.id);

  // 내 조각(내가 만든 것 + 합류한 것) 통합
  const allShares = [
    ...sharesOnly.map((flag) => ({ flag, joined: false })),
    ...joinedShares.map((flag) => ({ flag, joined: true })),
  ];

  // 로딩 타임아웃: 5초 후 강제 해제
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (isLoading && !timedOut) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/profile");
    return null;
  }

  // MD 비즈니스 연락처 수정 시작
  const handleEditBusiness = () => {
    setInstagram(user.instagram || "");
    setKakaoUrl(user.kakao_open_chat_url || "");
    setPreferredMethods(user.preferred_contact_methods || []);
    setIsEditingBusiness(true);
  };

  // MD 비즈니스 연락처 저장 (API 경유 → slug 재생성)
  const handleSaveBusiness = async () => {
    const cleanInstagram = instagram.trim().replace(/^@/, "");
    if (!cleanInstagram) {
      toast.error("인스타그램 아이디를 입력해주세요");
      return;
    }
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleanInstagram)) {
      toast.error("인스타그램 아이디 형식이 올바르지 않습니다");
      return;
    }
    if (kakaoUrl && !/^https:\/\/open\.kakao\.com\//.test(kakaoUrl)) {
      toast.error("카카오톡 오픈채팅 URL 형식이 올바르지 않습니다");
      return;
    }

    setSavingBusiness(true);
    try {
      const res = await fetch("/api/md/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagram: cleanInstagram,
          kakao_open_chat_url: kakaoUrl.trim() || null,
          preferred_contact_methods: preferredMethods.length > 0 ? preferredMethods : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "저장에 실패했습니다");
      toast.success("파트너 정보가 저장되었습니다");
      setIsEditingBusiness(false);
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다");
    } finally {
      setSavingBusiness(false);
    }
  };

  const isBanned = user.blocked_until && new Date(user.blocked_until) > new Date();
  const isBlocked = user.is_blocked;

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
          <h1 className="text-xl font-black text-white">MY</h1>
        </div>

        {/* 제재 상태 배너 */}
        {(isBlocked || isBanned) && (
          <div className={`rounded-2xl p-4 mb-4 ${isBlocked ? "bg-red-500/10 border border-red-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className={`w-4 h-4 ${isBlocked ? "text-red-400" : "text-amber-400"}`} />
              <span className={`text-[13px] font-bold ${isBlocked ? "text-red-400" : "text-amber-400"}`}>
                {isBlocked ? "계정이 영구 정지되었습니다" : "이용이 일시 정지되었습니다"}
              </span>
            </div>
            {isBanned && !isBlocked && (
              <p className="text-[12px] text-neutral-400 ml-6">
                정지 해제: {dayjs(user.blocked_until).format("YYYY년 M월 D일 HH:mm")}
              </p>
            )}
          </div>
        )}

        {/* MD 비즈니스 연락처 */}
        {(user.role === "md" || user.role === "admin") && (
          <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-bold text-white">파트너 정보</h2>
              {!isEditingBusiness ? (
                <button
                  onClick={handleEditBusiness}
                  className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold"
                >
                  수정
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingBusiness(false)}
                    className="text-[13px] text-neutral-500 hover:text-neutral-300 transition-colors font-bold"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveBusiness}
                    disabled={savingBusiness}
                    className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold disabled:opacity-50"
                  >
                    {savingBusiness ? "저장 중..." : "저장"}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* 인스타그램 */}
              <div className="flex items-center gap-3">
                <Instagram className="w-4 h-4 text-neutral-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-neutral-500">인스타그램 *</p>
                  {isEditingBusiness ? (
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-[14px]">@</span>
                      <input
                        type="text"
                        value={instagram.replace(/^@/, "")}
                        onChange={(e) =>
                          setInstagram(e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, ""))
                        }
                        maxLength={30}
                        placeholder="your_instagram_id"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-7 pr-3 py-2 text-[14px] text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  ) : (
                    <p className="text-[14px] text-white font-bold">@{user.instagram || "미설정"}</p>
                  )}
                </div>
              </div>

              {/* 카카오 오픈채팅 */}
              {isEditingBusiness ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white font-bold text-[13px]">
                      <MessageCircle className="w-4 h-4 text-green-500" />
                      카카오 오픈채팅 URL
                    </div>
                    <KakaoOpenChatGuide />
                  </div>
                  <div className="bg-neutral-800/50 border border-neutral-700 rounded-2xl p-4 space-y-3">
                    <input
                      type="url"
                      value={kakaoUrl}
                      onChange={(e) => setKakaoUrl(e.target.value)}
                      placeholder="https://open.kakao.com/o/..."
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-green-500 font-mono"
                    />
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      방 만든 후 URL을 붙여넣어 주세요.<br />
                      낙찰 고객에게만 공개됩니다.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-4 h-4 text-neutral-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[11px] text-neutral-500">카카오 오픈채팅</p>
                    {user.kakao_open_chat_url ? (
                      <a
                        href={user.kakao_open_chat_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-[#FEE500] text-[#3C1E1E] font-bold text-[13px] rounded-xl hover:bg-[#FDD835] transition-colors mt-1"
                      >
                        카카오 오픈채팅 열기
                      </a>
                    ) : (
                      <p className="text-[13px] text-neutral-500">미설정</p>
                    )}
                  </div>
                </div>
              )}

              {/* 고객에게 표시할 연락 수단 */}
              <div>
                <p className="text-[11px] text-neutral-500 mb-2">고객에게 표시할 연락 수단</p>
                {isEditingBusiness ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {CONTACT_METHOD_OPTIONS.map(({ value, label, icon: Icon }) => {
                        const isSelected = preferredMethods.includes(value);
                        const isDisabled = value === "kakao" && !kakaoUrl;
                        return (
                          <button
                            key={value}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => {
                              setPreferredMethods((prev) =>
                                isSelected ? prev.filter((m) => m !== value) : [...prev, value]
                              );
                            }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${
                              isDisabled
                                ? "bg-neutral-900 text-neutral-700 cursor-not-allowed"
                                : isSelected
                                  ? "bg-white text-black"
                                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-neutral-600 mt-2">
                      {preferredMethods.length === 0
                        ? "미선택 시 모든 연락 수단이 표시됩니다"
                        : "선택한 수단만 고객에게 표시됩니다"}
                    </p>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(user.preferred_contact_methods?.length ?? 0) > 0
                      ? user.preferred_contact_methods!.map((m) => {
                          const opt = CONTACT_METHOD_OPTIONS.find((o) => o.value === m);
                          if (!opt) return null;
                          const Icon = opt.icon;
                          return (
                            <span key={m} className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 rounded-full text-[11px] text-neutral-300 font-bold">
                              <Icon className="w-3 h-3" />
                              {opt.label}
                            </span>
                          );
                        })
                      : <span className="text-[13px] text-neutral-500">모든 수단 표시</span>
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 내 깃발 + 찜 목록 — 일반 유저 전용 (MD/admin은 숨김) */}
        {user.role !== "md" && user.role !== "admin" && (
        <>
        {/* 내 스탬프 카드 (LIVE 활동 리워드) */}
        <MyStampsCard />

        {/* 내 깃발 — 홈과 동일하게 카드를 페이지 배경 위에 올림(패널 없음) */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-white">내 깃발</h2>
            {cleanableFlagIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleBulkCleanup(cleanableFlagIds)}
                className="text-[12px] font-bold text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                취소·만료 {cleanableFlagIds.length}개 정리
              </button>
            )}
          </div>

          {flagsOnly.length > 0 ? (
            <div className="flex flex-col gap-3">
              {/* 모든 내 깃발 — 홈과 동일한 카드. 진행중은 오퍼 현황 노출, 종료는 상태 뱃지+삭제 */}
              {flagsOnly.map((flag) => {
                const active = isActiveStatus(flag.status);
                const st = FLAG_STATUS[flag.status] ?? { text: flag.status, tone: "text-neutral-400" };
                const offers = active ? (flagOfferCounts[flag.id] ?? 0) : 0;
                const newOffers = Math.max(0, offers - (flagOffersSeen[flag.id] ?? 0));
                return (
                  <div key={flag.id} className={`relative ${active ? "" : "opacity-70"}`}>
                    {newOffers > 0 && (
                      <span className="pointer-events-none absolute -top-2 -right-1.5 z-10 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black leading-none tracking-tight shadow-md shadow-rose-900/40">
                        NEW +{newOffers}
                      </span>
                    )}
                    <PuzzleCard
                      puzzle={flag}
                      userRole="user"
                      isLeader
                      offerCount={offers}
                      hideNewBadge
                      myFlagStatus={active ? undefined : st}
                      onHide={active ? undefined : () => handleHideFlag(flag.id)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-[13px] text-neutral-500">아직 꽂은 깃발이 없어요</p>
            </div>
          )}

          {/* 제재 정보 */}
          {((user.warning_count || 0) > 0 || (user.strike_count || 0) > 0) && (
            <Link
              href="/my-penalties"
              className="flex items-center justify-between gap-2 mt-3 p-2.5 bg-neutral-800/50 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <p className="text-[12px] text-neutral-400">
                  경고 <span className="text-amber-400 font-bold">{user.warning_count || 0}</span>/3
                  {(user.strike_count || 0) > 0 && (
                    <span className="ml-2">
                      스트라이크 <span className="text-red-400 font-bold">{user.strike_count}</span>
                    </span>
                  )}
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
            </Link>
          )}

          {isBanned && !isBlocked && (
            <div className="flex items-center gap-2 mt-2 p-2.5 bg-amber-500/5 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-[12px] text-amber-400">
                정지 해제: {dayjs(user.blocked_until).format("YYYY.MM.DD HH:mm")}
              </p>
            </div>
          )}
        </div>

        {/* 내 조각 — 홈과 동일하게 카드를 페이지 배경 위에 올림(패널 없음) */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-white">내 조각</h2>
            {cleanableShareIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleBulkCleanup(cleanableShareIds)}
                className="text-[12px] font-bold text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                취소·만료 {cleanableShareIds.length}개 정리
              </button>
            )}
          </div>
          {allShares.length > 0 ? (
            <div className="flex flex-col gap-3">
              {/* 모든 내 조각 — 홈과 동일한 카드. 종료는 상태 뱃지, 내가 만든 종료 조각만 삭제 */}
              {allShares.map(({ flag, joined }) => {
                const active = isActiveStatus(flag.status);
                const st = FLAG_STATUS[flag.status] ?? { text: flag.status, tone: "text-neutral-400" };
                return (
                  <div key={flag.id} className={active ? "" : "opacity-70"}>
                    <PuzzleCard
                      puzzle={flag}
                      userRole="user"
                      isLeader={!joined}
                      isMember={joined}
                      hideNewBadge
                      myFlagStatus={active ? undefined : st}
                      onHide={active || joined ? undefined : () => handleHideFlag(flag.id)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-[13px] text-neutral-500">아직 올린 조각이 없어요</p>
            </div>
          )}
        </div>

        </>
        )}
      </div>
    </div>
  );
}
