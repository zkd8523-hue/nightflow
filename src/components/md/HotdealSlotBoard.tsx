"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Flame, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

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
  slot_date: string;
  benefit_text: string | null;
  expires_at: string;
}

interface MyWeekSlot {
  id: string;
  club_id: string;
  slot_date: string;
  benefit_text: string | null;
  expires_at: string;
}

interface Props {
  currentUserId: string;
  clubs: ClubLite[];
  slots: SlotLite[];
  myWeekSlot: MyWeekSlot | null;
  /** "YYYY-MM-DD" — 이번 주 월요일 (KST) */
  weekStartISO: string;
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** "YYYY-MM-DD" → "5/26" 같은 짧은 라벨 */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** KST 기준 오늘 날짜 ISO */
function todayKstISO(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 이번 주 월 18:00 KST 이전인가 */
function isBeforeOpen(weekStartISO: string): boolean {
  const open = new Date(weekStartISO + "T18:00:00+09:00");
  return new Date() < open;
}

export function HotdealSlotBoard({
  currentUserId,
  clubs,
  slots,
  myWeekSlot,
  weekStartISO,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [claimText, setClaimText] = useState("");
  const [claimingKey, setClaimingKey] = useState<string | null>(null); // "clubId|date"

  const today = todayKstISO();
  const preOpen = isBeforeOpen(weekStartISO);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartISO, i)),
    [weekStartISO]
  );

  const slotByKey = useMemo(() => {
    const m = new Map<string, SlotLite>();
    for (const s of slots) m.set(`${s.club_id}|${s.slot_date}`, s);
    return m;
  }, [slots]);

  const hasMyWeekSlot = !!myWeekSlot;

  const handleClaim = async (clubId: string, date: string) => {
    const key = `${clubId}|${date}`;
    setBusyKey(key);
    try {
      const { data, error } = await supabase.rpc("claim_hotdeal_slot", {
        p_club_id: clubId,
        p_slot_date: date,
        p_benefit_text: claimText.trim() || null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "차지 실패");
        return;
      }
      toast.success("슬롯 차지 완료");
      setClaimingKey(null);
      setClaimText("");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusyKey(null);
    }
  };

  const handleUpdate = async (slotId: string) => {
    setBusyKey(slotId);
    try {
      const { data, error } = await supabase.rpc("update_hotdeal_benefit", {
        p_slot_id: slotId,
        p_benefit_text: editText.trim() || null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "저장 실패");
        return;
      }
      toast.success("저장됐어요");
      setEditingId(null);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRelease = async (slotId: string) => {
    if (!window.confirm("이 슬롯을 해제할까요? 이번 주 다른 슬롯을 차지할 수 있게 됩니다.")) return;
    setBusyKey(slotId);
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
      setBusyKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-lg mx-auto px-4 py-5">
        {/* 헤더 */}
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
          한 요일 = MD 1명. 본인 클럽의 슬롯을 선착순으로 차지하고 혜택을 게시하세요.
          <br />
          <span className="text-amber-400">매주 월 18:00에 그 주 슬롯 오픈 · 1인 1슬롯</span>
        </p>

        {preOpen && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-[12px] text-amber-300 mb-4">
            아직 이번 주 슬롯이 오픈되지 않았어요. 매주 월요일 오후 6시에 오픈됩니다.
          </div>
        )}

        {/* 내가 차지한 슬롯 */}
        {myWeekSlot && (
          <MyClaimedSection
            slot={myWeekSlot}
            club={clubs.find((c) => c.id === myWeekSlot.club_id)}
            editingId={editingId}
            editText={editText}
            busyKey={busyKey}
            onStartEdit={() => {
              setEditingId(myWeekSlot.id);
              setEditText(myWeekSlot.benefit_text ?? "");
            }}
            onChangeText={setEditText}
            onCancel={() => setEditingId(null)}
            onSave={() => handleUpdate(myWeekSlot.id)}
            onRelease={() => handleRelease(myWeekSlot.id)}
          />
        )}

        {/* 클럽별 요일 보드 */}
        {clubs.length === 0 ? (
          <div className="bg-[#1C1C1E] rounded-2xl px-4 py-8 text-center mt-6">
            <p className="text-[13px] text-neutral-400 mb-2">소속 클럽이 없어요</p>
            <p className="text-[11px] text-neutral-600">관리자에게 클럽 연결을 요청해주세요</p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {clubs.map((club) => (
              <div key={club.id} className="bg-[#1C1C1E] rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2.5 px-1">
                  {club.thumbnail_url ? (
                    <div className="relative w-7 h-7 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                      <Image src={club.thumbnail_url} alt={club.name} fill sizes="28px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[12px] font-black text-white/60 shrink-0">
                      {club.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-[14px] font-black truncate">{club.name}</p>
                    <p className="text-[10px] text-neutral-500">{club.area ?? "기타"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {weekDates.map((date, i) => {
                    const key = `${club.id}|${date}`;
                    const slot = slotByKey.get(key);
                    const isMine = slot?.md_id === currentUserId;
                    const isPast = date < today;
                    const blockedByMyWeek = hasMyWeekSlot && !isMine;
                    const isClaiming = claimingKey === key;
                    const disabled =
                      preOpen || isPast || !!slot || blockedByMyWeek || busyKey === key;

                    return (
                      <div key={date} className="flex flex-col items-center">
                        <div className="text-[10px] text-neutral-500 mb-0.5">
                          {DAY_LABELS[i]}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (slot) return; // 차지된 칸은 클릭 무시
                            if (disabled) return;
                            setClaimingKey(key);
                            setClaimText("");
                          }}
                          disabled={disabled && !slot}
                          className={`w-full aspect-square rounded-lg text-[10px] font-black flex flex-col items-center justify-center transition-colors ${
                            isMine
                              ? "bg-amber-500 text-black"
                              : slot
                              ? "bg-neutral-700 text-neutral-400"
                              : isPast
                              ? "bg-neutral-900 text-neutral-700"
                              : blockedByMyWeek
                              ? "bg-neutral-900 text-neutral-700"
                              : preOpen
                              ? "bg-neutral-900 text-neutral-700"
                              : "bg-neutral-800 hover:bg-neutral-700 text-white"
                          }`}
                        >
                          <span>{shortDate(date)}</span>
                          {isMine && <CheckCircle2 className="w-3 h-3 mt-0.5" />}
                        </button>

                        {/* 차지 모달 (inline) */}
                        {isClaiming && (
                          <div className="absolute inset-0 z-40 bg-black/70 flex items-end" onClick={() => setClaimingKey(null)}>
                            <div
                              className="bg-[#1C1C1E] w-full rounded-t-3xl p-5 space-y-4"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div>
                                <p className="text-[14px] font-black text-white">
                                  {club.name} · {shortDate(date)} ({DAY_LABELS[i]})
                                </p>
                                <p className="text-[11px] text-neutral-500 mt-0.5">
                                  슬롯 차지 + 혜택 입력 (나중에 수정 가능)
                                </p>
                              </div>
                              <textarea
                                value={claimText}
                                onChange={(e) => setClaimText(e.target.value)}
                                placeholder={"예: 여성 무료입장 / 프리드링크 1잔\n예: 23:00 전 입장 시 입장료 50% 할인"}
                                rows={3}
                                disabled={busyKey === key}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setClaimingKey(null)}
                                  disabled={busyKey === key}
                                  className="flex-1 h-11 rounded-full bg-neutral-800 text-white font-bold text-[14px]"
                                >
                                  취소
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleClaim(club.id, date)}
                                  disabled={busyKey === key}
                                  className="flex-1 h-11 rounded-full bg-amber-500 text-black font-black text-[14px] flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                  {busyKey === key && <Loader2 className="w-4 h-4 animate-spin" />}
                                  차지하기
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MyClaimedSection({
  slot,
  club,
  editingId,
  editText,
  busyKey,
  onStartEdit,
  onChangeText,
  onCancel,
  onSave,
  onRelease,
}: {
  slot: MyWeekSlot;
  club?: ClubLite;
  editingId: string | null;
  editText: string;
  busyKey: string | null;
  onStartEdit: () => void;
  onChangeText: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onRelease: () => void;
}) {
  const editing = editingId === slot.id;
  const saving = busyKey === slot.id;

  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 mb-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[12px] text-amber-300 font-bold">내가 차지한 슬롯</p>
        <button
          type="button"
          onClick={onRelease}
          disabled={saving}
          className="text-[11px] text-neutral-500 hover:text-red-400 font-bold inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" /> 해제
        </button>
      </div>
      <p className="text-white text-[15px] font-black">
        {club?.name ?? "클럽"} · {shortDate(slot.slot_date)} (
        {DAY_LABELS[(new Date(slot.slot_date + "T00:00:00Z").getUTCDay() + 6) % 7]})
      </p>
      <p className="text-[10px] text-neutral-500 mt-0.5">
        만료: {new Date(slot.expires_at).toLocaleString("ko-KR")}
      </p>

      <div className="mt-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editText}
              onChange={(e) => onChangeText(e.target.value)}
              rows={3}
              disabled={saving}
              placeholder="혜택 내용 입력"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="flex-1 h-10 rounded-full bg-neutral-800 text-white font-bold text-[13px]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="flex-1 h-10 rounded-full bg-amber-500 text-black font-black text-[13px] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                저장
              </button>
            </div>
          </div>
        ) : slot.benefit_text ? (
          <div className="flex items-start justify-between gap-3">
            <p className="text-white text-[13px] leading-relaxed whitespace-pre-line flex-1">
              {slot.benefit_text}
            </p>
            <button
              type="button"
              onClick={onStartEdit}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-bold shrink-0"
            >
              수정
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            className="w-full h-10 rounded-xl bg-amber-500 text-black font-black text-[13px]"
          >
            혜택 내용 입력하기
          </button>
        )}
      </div>
    </div>
  );
}
