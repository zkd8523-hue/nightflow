"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { SharePreviewSheet } from "@/components/home/SharePreviewSheet";
import { useShareNextWeekEdit } from "@/stores/useShareNextWeekEdit";

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
  /** 클럽별 이번 주 요일표 세팅 일수 (다음 주 선점 게이트용, 2일↑). 없으면 자체 조회 */
  daysSetByClub?: Record<string, number>;
}

// 다음 주 선점을 위한 이번 주 최소 세팅 일수 (DB claim_share_slot과 일치)
const MIN_DAYS_FOR_NEXT_WEEK = 2;

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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

export function ShareSlotBoard({ currentUserId, clubs, slots, thisWeekISO, embedded = false, isAdmin = false, onClaim, onRelease, daysSetByClub }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  // 슬롯 로컬 상태 — claim/release 시 즉시 반영(낙관적 업데이트). 서버 prop 변경 시 동기화.
  const [localSlots, setLocalSlots] = useState<SlotLite[]>(slots);
  useEffect(() => { setLocalSlots(slots); }, [slots]);

  const nextWeekISO = useMemo(() => addDaysISO(thisWeekISO, 7), [thisWeekISO]);

  // 내가 이번 주 차지한 슬롯 (다음 주 선점 UI의 기준 클럽)
  const myThisWeekSlot = useMemo(
    () => localSlots.find((s) => s.week_start === thisWeekISO && s.md_id === currentUserId) ?? null,
    [localSlots, thisWeekISO, currentUserId]
  );
  const myClubId = myThisWeekSlot?.club_id ?? null;

  // 다음 주 내 슬롯 + 이번 주 세팅 일수 — 자체 조회 (claim/release 시 갱신)
  const [nextWeekSlot, setNextWeekSlot] = useState<SlotLite | null>(null);
  const [fetchedDays, setFetchedDays] = useState<number | null>(null);
  useEffect(() => {
    if (!myClubId) { setNextWeekSlot(null); setFetchedDays(null); return; }
    let cancelled = false;
    (async () => {
      const [{ data: nw }, { data: planRows }] = await Promise.all([
        supabase
          .from("weekly_share_slots")
          .select("id, club_id, md_id, week_start, expires_at")
          .eq("club_id", myClubId)
          .eq("md_id", currentUserId)
          .eq("week_start", nextWeekISO)
          .maybeSingle(),
        supabase
          .from("share_weekday_plan")
          .select("dow")
          .eq("md_id", currentUserId)
          .eq("club_id", myClubId),
      ]);
      if (cancelled) return;
      setNextWeekSlot((nw as SlotLite) ?? null);
      const dows = new Set((planRows ?? []).map((p: { dow: string }) => p.dow));
      setFetchedDays(dows.size);
    })();
    return () => { cancelled = true; };
  }, [supabase, myClubId, currentUserId, nextWeekISO]);

  // 우선순위: 부모가 준 일수(서버 최신) → 자체 조회값
  const daysSet = (myClubId ? daysSetByClub?.[myClubId] : undefined) ?? fetchedDays ?? 0;

  // "다음 주 설정" 토글 상태 — 요일표 보드(ShareWeekdayPlanBoard)와 공유
  const setNextWeekSlotStore = useShareNextWeekEdit((s) => s.setSlot);
  const toggleNextWeekEdit = useShareNextWeekEdit((s) => s.toggle);
  const editingNextWeek = useShareNextWeekEdit((s) => (myClubId ? s.editingByClub[myClubId] : false) ?? false);
  // 다음 주 슬롯 id를 스토어에 반영 (선점/해제 시)
  useEffect(() => {
    if (myClubId) setNextWeekSlotStore(myClubId, nextWeekSlot?.id ?? null);
  }, [myClubId, nextWeekSlot, setNextWeekSlotStore]);

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
      `${clubName}의 이번 주 파티 자리를 선점할까요?\n\n` +
        `· 이 자리를 가진 파트너만 이 클럽 파티를 올릴 수 있어요 (선착순 1파트너 1클럽)\n` +
        `· 매주 월요일 오후 6시에 초기화돼요`
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
      toast.success("파티 자리 선점 완료! 이제 파티를 등록할 수 있어요");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleRelease = async (slotId: string) => {
    if (!window.confirm("이 파티 자리를 해제할까요?")) return;
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
      toast.success("파티 자리 해제됨");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusy(false);
    }
  };

  // 다음 주 미리 선점 — 같은 클럽, 이번 주 요일표 세팅이 다음 주에도 그대로 적용됨
  const handleClaimNextWeek = async () => {
    if (!myClubId || busy) return;
    if (daysSet < MIN_DAYS_FOR_NEXT_WEEK) {
      toast.error(`이번 주 요일표를 ${MIN_DAYS_FOR_NEXT_WEEK}일 이상 세팅해주세요`);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("claim_share_slot", {
        p_club_id: myClubId,
        p_week_start: nextWeekISO,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; slot_id?: string; expires_at?: string };
      if (!result?.success) {
        toast.error(result?.error || "선점 실패");
        return;
      }
      if (result.slot_id) {
        setNextWeekSlot({
          id: result.slot_id,
          club_id: myClubId,
          md_id: currentUserId,
          week_start: nextWeekISO,
          expires_at: result.expires_at ?? "",
        });
      }
      toast.success("다음 주 자리도 선점 완료! 이번 주 세팅 그대로 올라가요");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleReleaseNextWeek = async () => {
    if (!nextWeekSlot || busy) return;
    if (!window.confirm("다음 주 미리 선점을 해제할까요?")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("release_share_slot", {
        p_slot_id: nextWeekSlot.id,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "해제 실패");
        return;
      }
      // 다음 주 카드는 아직 생성 전이라 별도 정리 불필요 (슬롯만 해제)
      setNextWeekSlot(null);
      toast.success("다음 주 선점 해제됨");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? "" : "min-h-screen bg-background pb-24"}>
      <div className={embedded ? "" : "max-w-lg mx-auto px-4 py-5"}>
        {/* 대시보드 링크 (페이지 단독일 때만) */}
        {!embedded && (
          <Link
            href="/md/dashboard"
            className="inline-flex items-center gap-1 text-muted-foreground text-sm font-bold hover:text-foreground transition-colors mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            대시보드
          </Link>
        )}

        {/* 제목 헤더 — 게스트 간판과 통일. embedded(대시보드 인라인)에서는
            상단 탭이 제목 역할을 하므로 제목 대신 좌상단에 선점 액션 문구를 노출. */}
        <div className="flex items-center justify-between gap-2 mb-0">
          {embedded ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <p className="text-[17px] text-brand-amber font-black leading-tight">
                이번주 파티 일정
              </p>
              <button
                type="button"
                onClick={() => setShowGuide((v) => !v)}
                className="text-[11px] text-muted-foreground hover:text-foreground font-bold inline-flex items-center gap-0.5"
              >
                <span className="text-[12px]">ⓘ</span>
                이용방법
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[20px] leading-none">🎉</span>
              <h1 className="text-2xl font-black text-foreground tracking-tight">나플 파티</h1>
            </div>
          )}
          <p className="text-[11px] text-brand-amber font-bold text-right leading-tight shrink-0">
            매주 월 18시 오픈
          </p>
        </div>

        {!myClaimedThisWeek && (
          <p className="text-[13px] text-foreground font-black mt-0.5 mb-3">
            이번 주 {formatWeekRange(thisWeekISO)}
          </p>
        )}

        {/* 안내 가이드 (접기 가능) — 게스트 간판과 동일 패턴 */}
        {showGuide && (
          <div className="relative bg-card border border-border rounded-2xl p-4 mb-4 space-y-3">
            <button
              type="button"
              onClick={dismissGuide}
              aria-label="가이드 닫기"
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="text-[13px] text-foreground font-black">이용방법</p>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">1</div>
                <div className="flex-1">
                  <p className="text-[12.5px] text-foreground font-bold leading-snug">자리를 가진 파트너만 파티 등록</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">이번 주 자리를 차지해야 그 클럽 파티를 올릴 수 있어요</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">2</div>
                <div className="flex-1">
                  <p className="text-[12.5px] text-foreground font-bold leading-snug">1클럽, 1파트너</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">선착순 한 명이 그 주 파티 등록권을 가져가요</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">3</div>
                <div className="flex-1">
                  <p className="text-[12.5px] text-foreground font-bold leading-snug">한 번 세팅으로 1주일치 자동 등록</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">요일표에 옵션을 배치하면 그 주 파티가 매일 자동으로 올라가요</p>
                </div>
              </div>
            </div>
            {/* 실제 노출 화면 미리보기 */}
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="w-full mt-1 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-brand-amber text-[12.5px] font-black hover:bg-amber-500/15 transition-colors inline-flex items-center justify-center gap-1.5"
            >
              👀 미리보기
            </button>
          </div>
        )}



        {/* 클럽 목록 */}
        {clubs.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-4xl">🏢</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
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

              // 선점 중인 내 클럽 — 게스트 간판 MyClaimedSection과 동일한 그리드
              if (isMine && slot) {
                return (
                  <div
                    key={club.id}
                    className="bg-muted/60 rounded-2xl p-4"
                  >
                    <div>
                      <p className="text-foreground text-[15px] font-black">{club.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        내 파티 · {formatWeekRange(thisWeekISO)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        최대 6개까지 세팅 가능
                      </p>
                    </div>

                    {/* 다음 주 미리 선점 */}
                    <div className="mt-3 pt-3 border-t border-border">
                      {nextWeekSlot ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[12px] font-black text-money">✓ 다음 주도 선점됨</p>
                            <p className="text-[10.5px] text-muted-foreground mt-0.5">
                              {formatWeekRange(nextWeekISO)}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => myClubId && toggleNextWeekEdit(myClubId)}
                              className={`px-3 py-2 rounded-full text-[11px] font-black transition-colors ${
                                editingNextWeek
                                  ? "bg-amber-500 text-black hover:bg-amber-400"
                                  : "bg-muted text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              다음주 설정
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={handleReleaseNextWeek}
                              className="px-3 py-2 rounded-full text-[11px] font-bold bg-muted text-muted-foreground hover:text-red-400 disabled:opacity-40"
                            >
                              해제
                            </button>
                          </div>
                        </div>
                      ) : daysSet >= MIN_DAYS_FOR_NEXT_WEEK ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleClaimNextWeek}
                          className="w-full h-10 rounded-xl bg-amber-500 text-black text-[12.5px] font-black hover:bg-amber-400 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "📌"}
                          다음 주도 미리 선점 (지금 세팅 그대로)
                        </button>
                      ) : (
                        <div>
                          <button
                            type="button"
                            disabled
                            className="w-full h-10 rounded-xl bg-muted text-muted-foreground text-[12.5px] font-black cursor-not-allowed"
                          >
                            다음 주 미리 선점 (현재 {daysSet}/{MIN_DAYS_FOR_NEXT_WEEK}일)
                          </button>
                          <p className="text-[10.5px] text-muted-foreground mt-1.5 leading-snug">
                            이번 주 요일표를 {MIN_DAYS_FOR_NEXT_WEEK}일 이상 세팅하면 다음 주 자리도 미리 잡을 수 있어요
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={club.id}
                  className="flex items-center gap-3 bg-card rounded-2xl border border-border p-3"
                >
                  {/* 썸네일 */}
                  {club.thumbnail_url ? (
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-card shrink-0">
                      <Image src={club.thumbnail_url} alt={club.name} fill sizes="48px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-card flex items-center justify-center text-[16px] font-black text-foreground/60 shrink-0">
                      {club.name.charAt(0)}
                    </div>
                  )}

                  {/* 클럽 정보 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-[14px] font-black truncate">{club.name}</p>
                    {takenByOther ? (
                      <p className="text-[10px] text-brand-amber dark:text-brand-amber/80 font-bold truncate">다른 파트너님이 차지</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">{club.area ?? "기타"}</p>
                    )}
                  </div>

                  {/* 액션 */}
                  <button
                    type="button"
                    disabled={busy || !canClaim}
                    onClick={() => handleClaim(club.id, club.name)}
                    className={`px-3 py-2 rounded-full text-[12px] font-black flex-shrink-0 transition-colors inline-flex items-center gap-1 ${
                      takenByOther
                        ? "bg-muted text-muted-foreground"
                        : beforeOpen
                        ? "bg-muted text-muted-foreground"
                        : "bg-amber-500 text-black hover:bg-amber-400"
                    }`}
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {takenByOther
                      ? "마감됐어요"
                      : beforeOpen
                      ? "미오픈"
                      : "선점하기"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* 파티 실제 노출 미리보기 (이용방법의 '미리보기'에서 염) */}
      <SharePreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}
