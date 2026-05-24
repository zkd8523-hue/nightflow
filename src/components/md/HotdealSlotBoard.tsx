"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Flame, X, CheckCircle2 } from "lucide-react";
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
}

const DOW_KEYS: HotdealDow[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DOW_LABELS: Record<HotdealDow, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목",
  fri: "금", sat: "토", sun: "일",
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
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [selectedWeek, setSelectedWeek] = useState<string>(thisWeekISO);
  const [busy, setBusy] = useState(false);

  const weekSlots = useMemo(
    () => slots.filter((s) => s.week_start === selectedWeek),
    [slots, selectedWeek]
  );
  const mySlotForWeek = useMemo(
    () => mySlots.find((s) => s.week_start === selectedWeek) ?? null,
    [mySlots, selectedWeek]
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
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("claim_hotdeal_slot", {
        p_club_id: clubId,
        p_week_start: selectedWeek,
        p_benefits_by_dow: {},
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "차지 실패");
        return;
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
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-lg mx-auto px-4 py-5">
        <Link
          href="/md/dashboard"
          className="inline-flex items-center gap-1 text-neutral-500 text-sm font-bold hover:text-white transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          대시보드
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <Flame className="w-5 h-5 text-amber-400" />
          <h1 className="text-2xl font-black text-white tracking-tight">HOT DEAL 슬롯</h1>
        </div>
        <p className="text-[12px] text-neutral-500 mb-4 leading-relaxed">
          한 주를 통째로 차지 (선착순 1MD 1클럽). 차지한 후 요일별로 혜택을 입력하세요.
          <br />
          <span className="text-amber-400">매주 월 18:00에 그 주 슬롯 오픈</span>
        </p>

        {/* 주 전환 탭 */}
        <div className="flex gap-2 mb-4">
          {[thisWeekISO, nextWeekISO].map((w, i) => (
            <button
              key={w}
              type="button"
              onClick={() => setSelectedWeek(w)}
              className={`flex-1 px-3 py-2 rounded-xl text-[12px] font-bold transition-colors ${
                selectedWeek === w
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              <div>{i === 0 ? "이번 주" : "다음 주"}</div>
              <div className="text-[10px] font-medium mt-0.5 opacity-70">
                {formatWeekRange(w)}
              </div>
            </button>
          ))}
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
                      : "차지"}
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
      toast.success(`${DOW_LABELS[dow]} 저장됨`);
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
                  placeholder="예: 여성 무료입장 / 프리드링크 1잔"
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
                  {dirty ? "저장" : saved ? "저장됨" : "비움"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
