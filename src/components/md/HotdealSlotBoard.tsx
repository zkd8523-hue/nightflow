"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { HotdealBenefitsByDow, HotdealDow } from "@/types/database";

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
  benefits_by_dow: HotdealBenefitsByDow;
  expires_at: string;
}

interface MySlot {
  id: string;
  club_id: string;
  week_start: string;
  benefits_by_dow: HotdealBenefitsByDow;
  expires_at: string;
}

interface Props {
  currentUserId: string;
  isAdmin?: boolean;
  clubs: ClubLite[];
  slots: SlotLite[];     // 이번주 + 다음주 모든 슬롯 (다른 MD 거 포함)
  mySlots: MySlot[];     // 본인 슬롯 (최대 2개)
  thisWeekISO: string;   // 이번 주 월요일
  nextWeekISO: string;   // 다음 주 월요일
  /** Sheet 등 다른 컨테이너 안에서 띄울 때 자체 헤더/패딩 생략 */
  embedded?: boolean;
}

const DOW_KEYS: HotdealDow[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DOW_LABELS: Record<HotdealDow, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목",
  fri: "금", sat: "토", sun: "일",
};
const DOW_FULL_LABELS: Record<HotdealDow, string> = {
  mon: "월요일", tue: "화요일", wed: "수요일", thu: "목요일",
  fri: "금요일", sat: "토요일", sun: "일요일",
};
const DOW_PLACEHOLDERS: Record<HotdealDow, string> = {
  mon: "예: 여성 무료입장 / 입장료 1만원 할인",
  tue: "예: 프리드링크 1잔 / 칵테일 1+1",
  wed: "예: 단체 4인 이상 샴페인 증정",
  thu: "예: 졸업생 무료입장 / 입구컷 X",
  fri: "예: 1시 이전 입장 무료 / 게스트 우대",
  sat: "예: 테이블 1만원 할인 / VIP 라인 대기 X",
  sun: "예: 마지막 입장 새벽 4시 / 프리드링크",
};

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

export function HotdealSlotBoard({
  currentUserId,
  isAdmin = false,
  clubs,
  slots,
  mySlots,
  thisWeekISO,
  nextWeekISO,
  embedded = false,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // 다음 주 탭 제거 — 매주 월 18:00에 다음 주 슬롯이 동시 오픈되므로 사전 예약 불가
  const selectedWeek = thisWeekISO;
  const [busy, setBusy] = useState(false);
  const [clientMySlots, setClientMySlots] = useState<MySlot[] | null>(null);
  const GUIDE_DISMISSED_KEY = "nightflow_guest_sign_guide_dismissed";
  const [showGuide, setShowGuide] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(GUIDE_DISMISSED_KEY) === "1") setShowGuide(false);
  }, []);
  const dismissGuide = () => {
    setShowGuide(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
    }
  };

  // 페이지 마운트 시 본인 슬롯 클라이언트에서도 재조회 (서버 캐싱 우회)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      console.log("[HotdealSlotBoard] fetching mySlots", { currentUserId, thisWeekISO, nextWeekISO });
      // 정책 우회 시도: md_id 필터 없이 전체 조회 후 클라이언트 측 필터
      const { data, error } = await supabase
        .from("weekly_hotdeal_slots")
        .select("id, club_id, md_id, week_start, benefits_by_dow, expires_at")
        .in("week_start", [thisWeekISO, nextWeekISO]);
      console.log("[HotdealSlotBoard] all result:", { data, error, len: data?.length });
      const myData = (data ?? []).filter((s: { md_id: string }) => s.md_id === currentUserId);
      console.log("[HotdealSlotBoard] my filtered:", myData);
      if (!cancelled) {
        setClientMySlots(
          myData.map((s) => ({
            id: s.id,
            club_id: s.club_id,
            week_start: s.week_start,
            benefits_by_dow: (s.benefits_by_dow ?? {}) as HotdealBenefitsByDow,
            expires_at: s.expires_at,
          }))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, thisWeekISO, nextWeekISO]);

  const effectiveMySlots = clientMySlots ?? mySlots;

  const weekSlots = useMemo(
    () => slots.filter((s) => s.week_start === selectedWeek),
    [slots, selectedWeek]
  );
  const mySlotForWeek = useMemo(
    () => effectiveMySlots.find((s) => s.week_start === selectedWeek) ?? null,
    [effectiveMySlots, selectedWeek]
  );
  const slotByClub = useMemo(() => {
    const m = new Map<string, SlotLite>();
    for (const s of weekSlots) m.set(s.club_id, s);
    return m;
  }, [weekSlots]);

  const preOpen = !isAdmin && isBeforeOpen(selectedWeek);
  const hasMyClaimThisWeek = !!mySlotForWeek;

  const handleClaim = async (clubId: string) => {
    if (busy) return;
    const club = clubs.find((c) => c.id === clubId);
    const clubName = club?.name ?? "이 클럽";
    const weekLabel = formatWeekRange(selectedWeek);
    const ok = window.confirm(
      `${clubName}의 ${weekLabel} 게스트 간판 홍보권을 차지할까요?\n\n` +
        `· 한 주를 통째로 점유 (선착순 1MD 1클럽)\n` +
        `· 차지 후 요일별 혜택을 입력하면 홈 '오늘 어디갈래?' 에 노출돼요\n` +
        `· 언제든 '해제'로 반납할 수 있어요`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("claim_hotdeal_slot", {
        p_club_id: clubId,
        p_week_start: selectedWeek,
        p_benefits_by_dow: {},
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; slot_id?: string; expires_at?: string };
      if (!result?.success) {
        toast.error(result?.error || "차지 실패");
        return;
      }
      // 서버 응답으로 클라이언트 슬롯 즉시 추가 (refresh 대기 없이 본인 슬롯 카드 즉시 표시)
      if (result.slot_id && result.expires_at) {
        const newSlot: MySlot = {
          id: result.slot_id,
          club_id: clubId,
          week_start: selectedWeek,
          benefits_by_dow: {} as HotdealBenefitsByDow,
          expires_at: result.expires_at,
        };
        setClientMySlots((prev) => [...(prev ?? []), newSlot]);
      }
      toast.success("슬롯 차지 완료! 요일별 혜택을 입력해주세요");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleRelease = async (slotId: string) => {
    if (!window.confirm("이 슬롯을 해제할까요?")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("release_hotdeal_slot", {
        p_slot_id: slotId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "해제 실패");
        return;
      }
      toast.success("슬롯 해제됨");
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
        {!embedded && (
          <Link
            href="/md/dashboard"
            className="inline-flex items-center gap-1 text-neutral-500 text-sm font-bold hover:text-white transition-colors mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            대시보드
          </Link>
        )}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[20px] leading-none">🎫</span>
          <h1 className="text-2xl font-black text-white tracking-tight">게스트 간판</h1>
        </div>
        <p className="text-[12px] text-amber-400 font-bold mb-3">
          매주 월 18:00에 그 주 슬롯 오픈
        </p>

        {/* 4단계 시각 가이드 (사용자가 닫을 수 있음) */}
        {showGuide ? (
        <div className="relative bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 mb-4 space-y-3">
          <button
            type="button"
            onClick={dismissGuide}
            aria-label="가이드 닫기"
            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-neutral-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-[13px] text-white font-black">게스트 간판이 뭔가요?</p>
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">1</div>
              <div className="flex-1">
                <p className="text-[12.5px] text-white font-bold leading-snug">&quot;오늘 어디갈래?&quot;에 상위 노출</p>
                <p className="text-[11px] text-neutral-500 leading-snug">유저가 오늘 갈 클럽 고를 때 혜택 배지로 강조</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">2</div>
              <div className="flex-1">
                <p className="text-[12.5px] text-white font-bold leading-snug">1클럽, 1파트너</p>
                <p className="text-[11px] text-neutral-500 leading-snug">선착순 한 명의 파트너가 그 주 홍보권을 가져가요</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">3</div>
              <div className="flex-1">
                <p className="text-[12.5px] text-white font-bold leading-snug">요일별 혜택 입력</p>
                <p className="text-[11px] text-neutral-500 leading-snug">예: 월 여성무료입장 / 토 프리드링크 1잔</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">4</div>
              <div className="flex-1">
                <p className="text-[12.5px] text-white font-bold leading-snug">상세 페이지에 파트너님의 인스타·연락처가 노출돼요</p>
                <p className="text-[11px] text-neutral-500 leading-snug">더 많은 게스트를 모아보세요</p>
              </div>
            </div>
          </div>
        </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="text-[11px] text-neutral-500 hover:text-white font-bold inline-flex items-center gap-1 mb-3"
          >
            <span className="text-[12px]">ⓘ</span>
            게스트 간판이 뭔가요?
          </button>
        )}

        {/* 이번 주 라벨 (사전 예약 없음 — 매주 월 18:00에 다음 주 슬롯 동시 오픈) */}
        <div className="mb-4">
          <div className="inline-flex flex-col items-start px-3 py-2 rounded-xl bg-white text-black">
            <div className="text-[12px] font-bold">이번 주</div>
            <div className="text-[10px] font-medium mt-0.5 opacity-70">{formatWeekRange(thisWeekISO)}</div>
          </div>
        </div>

        {preOpen && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-[12px] text-amber-300 mb-4">
            이 주 슬롯은 매주 월요일 오후 6시에 오픈돼요.
          </div>
        )}

        {/* 내가 차지한 슬롯 (이번 주 기준) */}
        {mySlotForWeek && (
          <MyClaimedSection
            slot={mySlotForWeek}
            club={clubs.find((c) => c.id === mySlotForWeek.club_id)}
            busy={busy}
            onRelease={() => handleRelease(mySlotForWeek.id)}
            onChanged={() => router.refresh()}
          />
        )}

        {/* 클럽 카드 리스트 */}
        {clubs.length === 0 ? (
          <div className="bg-[#1C1C1E] rounded-2xl px-4 py-8 text-center mt-4">
            <p className="text-[13px] text-neutral-400 mb-2">소속 클럽이 없어요</p>
            <p className="text-[11px] text-neutral-600">관리자에게 클럽 연결을 요청해주세요</p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {clubs.map((club) => {
              const slot = slotByClub.get(club.id);
              const isMine = slot?.md_id === currentUserId;
              if (isMine) return null; // 본인 슬롯은 위에서 처리

              const claimedByOther = !!slot;
              const disabled = preOpen || claimedByOther || hasMyClaimThisWeek || busy;

              return (
                <div
                  key={club.id}
                  className="flex items-center gap-3 bg-[#1C1C1E] rounded-2xl p-3"
                >
                  {club.thumbnail_url ? (
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-neutral-900 shrink-0">
                      <Image src={club.thumbnail_url} alt={club.name} fill sizes="48px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center text-[16px] font-black text-white/60 shrink-0">
                      {club.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[14px] font-black truncate">{club.name}</p>
                    <p className="text-[10px] text-neutral-500">{club.area ?? "기타"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaim(club.id)}
                    disabled={disabled}
                    className={`px-3 py-2 rounded-full text-[12px] font-black flex-shrink-0 transition-colors ${
                      claimedByOther
                        ? "bg-neutral-800 text-neutral-500"
                        : hasMyClaimThisWeek
                        ? "bg-neutral-800 text-neutral-600"
                        : preOpen
                        ? "bg-neutral-800 text-neutral-600"
                        : "bg-amber-500 text-black hover:bg-amber-400"
                    }`}
                  >
                    {claimedByOther
                      ? "차지됨"
                      : hasMyClaimThisWeek
                      ? "주 1슬롯"
                      : preOpen
                      ? "미오픈"
                      : "슬롯 비었음"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MyClaimedSection({
  slot,
  club,
  busy,
  onRelease,
  onChanged,
}: {
  slot: MySlot;
  club?: ClubLite;
  busy: boolean;
  onRelease: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [drafts, setDrafts] = useState<Record<HotdealDow, string>>(() => {
    const out: Record<HotdealDow, string> = {
      mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "",
    };
    for (const k of DOW_KEYS) {
      out[k] = slot.benefits_by_dow[k] ?? "";
    }
    return out;
  });
  const [savingDow, setSavingDow] = useState<HotdealDow | null>(null);

  const handleSaveDow = async (dow: HotdealDow) => {
    setSavingDow(dow);
    const prev = slot.benefits_by_dow[dow] ?? "";
    const next = drafts[dow] || "";
    const isUpdate = prev.length > 0 && next.length > 0;
    const isClear = prev.length > 0 && next.length === 0;
    try {
      const { data, error } = await supabase.rpc("update_hotdeal_benefit", {
        p_slot_id: slot.id,
        p_dow: dow,
        p_text: drafts[dow] || null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "저장 실패");
        return;
      }
      const verb = isClear ? "비워졌어요" : isUpdate ? "수정됨" : "저장됨";
      toast.success(`${DOW_FULL_LABELS[dow]} ${verb}`);
      onChanged();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setSavingDow(null);
    }
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 mb-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[12px] text-amber-300 font-bold">내가 차지한 슬롯</p>
          <p className="text-white text-[15px] font-black mt-0.5">
            {club?.name ?? "클럽"}
          </p>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            만료: {new Date(slot.expires_at).toLocaleDateString("ko-KR")}
          </p>
        </div>
        <button
          type="button"
          onClick={onRelease}
          disabled={busy}
          className="text-[11px] text-neutral-500 hover:text-red-400 font-bold inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" /> 해제
        </button>
      </div>

      <div className="space-y-2 pt-2 border-t border-amber-500/20">
        <p className="text-[11px] text-amber-300 font-bold">요일별 혜택 (안 적은 요일은 비어있음으로 노출)</p>
        {DOW_KEYS.map((dow) => {
          const saving = savingDow === dow;
          const saved = slot.benefits_by_dow[dow] ?? "";
          const value = drafts[dow];
          const dirty = value !== saved;
          return (
            <div key={dow} className="flex items-start gap-2">
              <div className="w-8 pt-2 flex justify-center">
                <span className="text-[12px] font-bold text-white">{DOW_LABELS[dow]}</span>
              </div>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={value}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [dow]: e.target.value }))
                  }
                  placeholder={DOW_PLACEHOLDERS[dow]}
                  disabled={saving}
                  className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <button
                  type="button"
                  onClick={() => handleSaveDow(dow)}
                  disabled={saving || !dirty}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1 transition-colors ${
                    dirty
                      ? "bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50"
                      : saved
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-neutral-800 text-neutral-600"
                  }`}
                >
                  {saving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : saved && !dirty ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : null}
                  {dirty ? (saved ? "수정" : "저장") : saved ? "저장됨" : "비움"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
