"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { SharePreviewSheet } from "@/components/home/SharePreviewSheet";

interface ClubLite {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
}

interface SlotLite {
  id: string;
  club_id: string;
  md_id: string;
  week_start: string;
  expires_at: string;
}

interface Props {
  currentUserId: string;
  clubs: ClubLite[];
  /** 이번 주 모든 슬롯 (다른 MD 것 포함) */
  slots: SlotLite[];
  /** 이번 주 월요일 (YYYY-MM-DD) */
  thisWeekISO: string;
  /** 대시보드 인라인 등 컨테이너 안에서 띄울 때 자체 헤더/페이지 패딩 생략 */
  embedded?: boolean;
  /** admin은 월 18시 오픈 전에도 선점 가능 (테스트용 — DB claim_share_slot도 admin 우회) */
  isAdmin?: boolean;
  /** claim 성공 시 부모에 즉시 알림 (낙관적 업데이트) */
  onClaim?: (slot: SlotLite) => void;
  /** release 성공 시 부모에 즉시 알림 */
  onRelease?: (clubId: string) => void;
}

function isBeforeOpen(weekStartISO: string): boolean {
  const open = new Date(weekStartISO + "T18:00:00+09:00");
  return new Date() < open;
}

function formatWeekRange(weekStartISO: string): string {
  const start = new Date(weekStartISO + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return `${start.getUTCMonth() + 1}/${start.getUTCDate()}(월) ~ ${end.getUTCMonth() + 1}/${end.getUTCDate()}(일)`;
}

export function ShareSlotBoard({ currentUserId, clubs, slots, thisWeekISO, embedded = false, isAdmin = false, onClaim, onRelease }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  // 슬롯 로컬 상태 — claim/release 시 즉시 반영(낙관적 업데이트). 서버 prop 변경 시 동기화.
  const [localSlots, setLocalSlots] = useState<SlotLite[]>(slots);
  useEffect(() => { setLocalSlots(slots); }, [slots]);

  // 안내 가이드 접기/펼치기 (게스트 간판과 동일 패턴)
  const GUIDE_DISMISSED_KEY = "nightflow_share_slot_guide_dismissed";
  const [showGuide, setShowGuide] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(GUIDE_DISMISSED_KEY) === "1") setShowGuide(false);
  }, []);
  const dismissGuide = () => {
    setShowGuide(false);
    if (typeof window !== "undefined") localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
  };

  // club_id → 이번 주 슬롯 (있으면)
  const slotByClub = useMemo(() => {
    const map = new Map<string, SlotLite>();
    for (const s of localSlots) {
      if (s.week_start === thisWeekISO) map.set(s.club_id, s);
    }
    return map;
  }, [localSlots, thisWeekISO]);

  // 이번 주에 내가 이미 차지한 슬롯이 있는지 (주당 1자리)
  const myClaimedThisWeek = useMemo(
    () => localSlots.some((s) => s.week_start === thisWeekISO && s.md_id === currentUserId),
    [localSlots, thisWeekISO, currentUserId]
  );

  // admin은 오픈 시간 무관하게 선점 가능 (DB claim_share_slot도 admin 우회)
  const beforeOpen = !isAdmin && isBeforeOpen(thisWeekISO);

  const handleClaim = async (clubId: string, clubName: string) => {
    const ok = window.confirm(
      `${clubName}의 이번 주 조각 자리를 선점할까요?\n\n` +
        `· 이 자리를 가진 MD만 이 클럽 조각을 올릴 수 있어요 (선착순 1MD 1클럽)\n` +
        `· 매주 월요일 오후 6시에 초기화돼요\n` +
        `· 언제든 '해제'로 반납할 수 있어요`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("claim_share_slot", {
        p_club_id: clubId,
        p_week_start: thisWeekISO,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; slot_id?: string; expires_at?: string };
      if (!result?.success) {
        toast.error(result?.error || "선점 실패");
        return;
      }
      // 즉시 반영 (서버 새로고침 대기 없이 카드 상태 변경)
      if (result.slot_id) {
        const newSlot: SlotLite = {
          id: result.slot_id!,
          club_id: clubId,
          md_id: currentUserId,
          week_start: thisWeekISO,
          expires_at: result.expires_at ?? "",
        };
        setLocalSlots((prev) => [
          ...prev.filter((s) => !(s.club_id === clubId && s.week_start === thisWeekISO)),
          newSlot,
        ]);
        onClaim?.(newSlot);
      }
      toast.success("조각 자리 선점 완료! 이제 조각을 등록할 수 있어요");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleRelease = async (slotId: string) => {
    if (!window.confirm("이 조각 자리를 해제할까요?")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("release_share_slot", {
        p_slot_id: slotId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "해제 실패");
        return;
      }
      // 즉시 반영 (해제된 슬롯 제거)
      const released = localSlots.find((s) => s.id === slotId);
      setLocalSlots((prev) => prev.filter((s) => s.id !== slotId));

      // 이 클럽의 활성 조각 전부 내림 (슬롯 해제 시 무조건)
      if (released) {
        await supabase
          .from("auctions")
          .update({ status: "unsold" })
          .eq("md_id", currentUserId)
          .eq("club_id", released.club_id)
          .eq("listing_type", "share")
          .in("status", ["active", "scheduled"]);
        onRelease?.(released.club_id);
      }
      toast.success("조각 자리 해제됨");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? "" : "min-h-screen bg-[#0A0A0A] pb-24"}>
      <div className={embedded ? "" : "max-w-lg mx-auto px-4 py-5"}>
        {/* 대시보드 링크 (페이지 단독일 때만) */}
        {!embedded && (
          <Link
            href="/md/dashboard"
            className="inline-flex items-center gap-1 text-neutral-500 text-sm font-bold hover:text-white transition-colors mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            대시보드
          </Link>
        )}

        {/* 제목 헤더 — 게스트 간판과 통일. embedded(대시보드 인라인)에서는
            상단 탭이 제목 역할을 하므로 제목 대신 좌상단에 선점 액션 문구를 노출. */}
        <div className="flex items-center justify-between gap-2 mb-0">
          {embedded ? (
            <p className="text-[17px] text-amber-400 font-black leading-tight flex-1 min-w-0">
              우리 클럽 조각을 일주일 동안 대표!
            </p>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[20px] leading-none">🧩</span>
              <h1 className="text-2xl font-black text-white tracking-tight">나플 조각</h1>
            </div>
          )}
          <p className="text-[11px] text-amber-400 font-bold text-right leading-tight shrink-0">
            매주 월 18시 오픈
          </p>
        </div>

        {/* 이번 주 날짜 — 제목 바로 아래 좌정렬. 선점 중이면 클럽 카드에 주차가 표시되므로 숨김 */}
        {!myClaimedThisWeek && (
          <p className="text-[13px] text-white font-black mt-0.5 mb-3">
            이번 주 {formatWeekRange(thisWeekISO)}
          </p>
        )}

        {/* 안내 가이드 (접기 가능) — 게스트 간판과 동일 패턴 */}
        {showGuide ? (
          <div className="relative bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-3 mb-2 space-y-2">
            <button
              type="button"
              onClick={dismissGuide}
              aria-label="가이드 닫기"
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-neutral-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="text-[13px] text-white font-black">이용방법</p>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">1</div>
                <div className="flex-1">
                  <p className="text-[12.5px] text-white font-bold leading-snug">자리를 가진 MD만 조각 등록</p>
                  <p className="text-[11px] text-neutral-500 leading-snug">이번 주 자리를 차지해야 그 클럽 조각을 올릴 수 있어요</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">2</div>
                <div className="flex-1">
                  <p className="text-[12.5px] text-white font-bold leading-snug">1클럽, 1파트너</p>
                  <p className="text-[11px] text-neutral-500 leading-snug">선착순 한 명이 그 주 조각 등록권을 가져가요</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">3</div>
                <div className="flex-1">
                  <p className="text-[12.5px] text-white font-bold leading-snug">한 번 세팅으로 1주일치 자동 등록</p>
                  <p className="text-[11px] text-neutral-500 leading-snug">요일표에 옵션을 배치하면 그 주 조각이 매일 자동으로 올라가요</p>
                </div>
              </div>
            </div>
            {/* 실제 노출 화면 미리보기 */}
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="w-full mt-1 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[12.5px] font-black hover:bg-amber-500/15 transition-colors inline-flex items-center justify-center gap-1.5"
            >
              👀 미리보기
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="-mt-1 text-[11px] text-neutral-500 hover:text-white font-bold inline-flex items-center gap-1 mb-2"
          >
            <span className="text-[12px]">ⓘ</span>
            이용방법
          </button>
        )}



        {/* 클럽 목록 */}
        {clubs.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-4xl">🏢</p>
            <p className="text-neutral-400 text-sm leading-relaxed">
              소속된 클럽이 없습니다.
              <br />
              관리자에게 파트너 등록을 요청해주세요.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {clubs.map((club) => {
              const slot = slotByClub.get(club.id);
              const isMine = slot?.md_id === currentUserId;
              const takenByOther = !!slot && !isMine;
              // 차지 가능: 오픈됨 + 미점유 + (이번 주 내 자리 없음)
              const canClaim = !beforeOpen && !slot && !myClaimedThisWeek;

              // 선점 중이면 내 클럽만 노출 (게스트 간판처럼 컴팩트하게 — 나머지는 숨김)
              if (myClaimedThisWeek && !isMine) return null;

              return (
                <div
                  key={club.id}
                  className="flex items-center gap-3 bg-[#1C1C1E] rounded-2xl p-3"
                >
                  {/* 썸네일 */}
                  {club.thumbnail_url ? (
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-neutral-900 shrink-0">
                      <Image src={club.thumbnail_url} alt={club.name} fill sizes="48px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center text-[16px] font-black text-white/60 shrink-0">
                      {club.name.charAt(0)}
                    </div>
                  )}

                  {/* 클럽 정보 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[14px] font-black truncate">{club.name}</p>
                    {takenByOther ? (
                      <p className="text-[10px] text-amber-400/80 font-bold truncate">다른 파트너님이 차지</p>
                    ) : isMine ? (
                      <p className="text-[10px] truncate">
                        <span className="text-green-400 font-bold">내가 선점 중</span>
                        <span className="text-neutral-500 font-medium"> · {formatWeekRange(thisWeekISO)}</span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-neutral-500">{club.area ?? "기타"}</p>
                    )}
                  </div>

                  {/* 액션 */}
                  {isMine && slot ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRelease(slot.id)}
                      className="px-3 py-2 rounded-full text-[12px] font-black flex-shrink-0 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-amber-400" />}
                      해제
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !canClaim}
                      onClick={() => handleClaim(club.id, club.name)}
                      className={`px-3 py-2 rounded-full text-[12px] font-black flex-shrink-0 transition-colors inline-flex items-center gap-1 ${
                        takenByOther
                          ? "bg-neutral-800 text-neutral-500"
                          : myClaimedThisWeek
                          ? "bg-neutral-800 text-neutral-600"
                          : beforeOpen
                          ? "bg-neutral-800 text-neutral-600"
                          : "bg-amber-500 text-black hover:bg-amber-400"
                      }`}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      {takenByOther
                        ? "마감됐어요"
                        : myClaimedThisWeek
                        ? "주 1자리"
                        : beforeOpen
                        ? "미오픈"
                        : "선점하기"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* 조각 실제 노출 미리보기 (이용방법의 '미리보기'에서 염) */}
      <SharePreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}
