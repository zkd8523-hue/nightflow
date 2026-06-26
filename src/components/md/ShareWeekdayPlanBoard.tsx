"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useShareNextWeekEdit } from "@/stores/useShareNextWeekEdit";
import type { ShareOption, ShareWeekdayPlan, ShareDow } from "@/types/database";

const DOW_ORDER: ShareDow[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DOW_LABEL: Record<ShareDow, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};
// JS getUTCDay: 0=일~6=토 → ShareDow
const JS_DOW: ShareDow[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface Props {
  clubId: string;
  options: ShareOption[];
  plans: ShareWeekdayPlan[];
}

// 기준 주(+offsetWeeks) 각 요일의 날짜 — 표시용 M/D + 비교용 ISO. KST 기준.
function weekDatesFor(offsetWeeks: number): Record<ShareDow, { md: string; iso: string }> {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dow = kstNow.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(kstNow);
  monday.setUTCDate(kstNow.getUTCDate() - daysFromMonday + offsetWeeks * 7);
  const out = {} as Record<ShareDow, { md: string; iso: string }>;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    out[JS_DOW[d.getUTCDay()]] = {
      md: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      iso: d.toISOString().slice(0, 10),
    };
  }
  return out;
}

export function ShareWeekdayPlanBoard({ clubId, options, plans }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const dates = useMemo(() => weekDatesFor(0), []);
  const nextDates = useMemo(() => weekDatesFor(1), []);
  const activeOptions = useMemo(() => options.filter((o) => o.is_active), [options]);

  // 다음 주 설정 모드 (스토어 공유 — ShareSlotBoard의 "다음주 설정" 토글)
  const editingNextWeek = useShareNextWeekEdit((s) => s.editingByClub[clubId] ?? false);
  const nextSlotId = useShareNextWeekEdit((s) => s.slotByClub[clubId] ?? null);
  const isNextWeek = editingNextWeek && !!nextSlotId;

  // 이번 주 배정 (plans에서 초기화)
  const [assign, setAssign] = useState<Record<ShareDow, string[]>>(() => {
    const m = {} as Record<ShareDow, string[]>;
    for (const d of DOW_ORDER) m[d] = [];
    for (const p of plans) {
      if (p.club_id === clubId) m[p.dow] = [...(m[p.dow] ?? []), p.option_id];
    }
    return m;
  });
  // 다음 주 배정 (슬롯 plan_snapshot에서 로드)
  const [nextAssign, setNextAssign] = useState<Record<ShareDow, string[]>>(() => {
    const m = {} as Record<ShareDow, string[]>;
    for (const d of DOW_ORDER) m[d] = [];
    return m;
  });

  // 다음 주 모드 진입 시 스냅샷 로드
  useEffect(() => {
    if (!isNextWeek || !nextSlotId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("weekly_share_slots")
        .select("plan_snapshot")
        .eq("id", nextSlotId)
        .maybeSingle();
      if (cancelled) return;
      const snap = (data?.plan_snapshot ?? {}) as Record<string, string[]>;
      const m = {} as Record<ShareDow, string[]>;
      for (const d of DOW_ORDER) m[d] = snap[d] ?? [];
      setNextAssign(m);
    })();
    return () => { cancelled = true; };
  }, [isNextWeek, nextSlotId, supabase]);

  const [savingDow, setSavingDow] = useState<ShareDow | null>(null);
  const [savingOptionId, setSavingOptionId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  // 현재 보고 있는 주의 배정 + 날짜
  const view = isNextWeek ? nextAssign : assign;
  const displayDates = isNextWeek ? nextDates : dates;
  const applyView = (fn: (a: Record<ShareDow, string[]>) => Record<ShareDow, string[]>) =>
    (isNextWeek ? setNextAssign(fn) : setAssign(fn));

  // 저장 대상 분기: 다음 주면 슬롯 스냅샷, 이번 주면 공유 요일표
  const persist = (dow: ShareDow, ids: string[]) =>
    isNextWeek
      ? supabase.rpc("set_share_slot_plan", { p_slot_id: nextSlotId, p_dow: dow, p_option_ids: ids })
      : supabase.rpc("set_share_weekday_plan", { p_club_id: clubId, p_dow: dow, p_option_ids: ids });

  const toggle = async (dow: ShareDow, optionId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const current = view[dow] ?? [];
    const next = current.includes(optionId)
      ? current.filter((x) => x !== optionId)
      : [...current, optionId];
    applyView((a) => ({ ...a, [dow]: next })); // 낙관적
    const added = next.length > current.length;
    setSavingDow(dow);
    setSavingOptionId(optionId);
    try {
      const { data, error } = await persist(dow, next);
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "저장 실패");
        applyView((a) => ({ ...a, [dow]: current })); // 롤백
        return;
      }
      // 다음 주는 카드가 아직 없으므로 즉시 생성/내림 없음 (cron 롤오버가 처리)
      if (!isNextWeek) {
        if (added) {
          try {
            await supabase.functions.invoke("generate-share-listings");
            await new Promise((r) => setTimeout(r, 500));
          } catch (genErr) {
            console.warn("즉시 생성 실패(다음 cron이 반영):", genErr);
          }
        } else {
          const iso = dates[dow]?.iso;
          if (iso) {
            try {
              await supabase
                .from("auctions")
                .update({ status: "unsold" })
                .eq("listing_type", "share")
                .eq("share_option_id", optionId)
                .or(`share_date.eq.${iso},event_date.eq.${iso}`)
                .eq("seats_claimed", 0)
                .eq("external_attendees", 0)
                .in("status", ["active", "scheduled"]);
            } catch (delErr) {
              console.warn("조각 내림 실패:", delErr);
            }
          }
        }
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      toast.error("저장에 실패했어요");
      applyView((a) => ({ ...a, [dow]: current })); // 롤백
    } finally {
      setSavingDow(null);
      setSavingOptionId(null);
      busyRef.current = false;
      setBusy(false);
    }
  };

  const allOn = useMemo(
    () =>
      activeOptions.length > 0 &&
      DOW_ORDER.every((dow) => {
        const a = view[dow] ?? [];
        return activeOptions.every((o) => a.includes(o.id));
      }),
    [view, activeOptions]
  );

  const toggleAll = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const turnOn = !allOn;
    const allIds = activeOptions.map((o) => o.id);
    const prev = view;
    const optimistic = {} as Record<ShareDow, string[]>;
    for (const d of DOW_ORDER) optimistic[d] = turnOn ? [...allIds] : [];
    applyView(() => optimistic);
    try {
      for (const dow of DOW_ORDER) {
        const { data, error } = await persist(dow, turnOn ? allIds : []);
        if (error) throw error;
        const result = data as { success: boolean; error?: string };
        if (!result?.success) throw new Error(result?.error || "저장 실패");
      }
      if (!isNextWeek) {
        if (turnOn) {
          try {
            await supabase.functions.invoke("generate-share-listings");
            await new Promise((r) => setTimeout(r, 500));
          } catch (genErr) {
            console.warn("즉시 생성 실패(다음 cron이 반영):", genErr);
          }
        } else {
          try {
            await supabase
              .from("auctions")
              .update({ status: "unsold" })
              .eq("listing_type", "share")
              .in("share_option_id", allIds)
              .eq("seats_claimed", 0)
              .eq("external_attendees", 0)
              .in("status", ["active", "scheduled"]);
          } catch (delErr) {
            console.warn("조각 내림 실패:", delErr);
          }
        }
        router.refresh();
      }
      toast.success(turnOn ? "모든 요일에 켰어요" : "모든 요일을 껐어요");
    } catch (err) {
      console.error(err);
      toast.error("저장에 실패했어요");
      applyView(() => prev); // 롤백
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (activeOptions.length === 0) {
    return (
      <p className="text-center py-4 text-neutral-500 text-[12.5px]">
        먼저 위에서 조각 옵션을 만들면 요일에 배치할 수 있어요.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-black text-white">
          요일표
          {isNextWeek && <span className="ml-1.5 text-[11px] text-amber-400 font-black">· 다음 주</span>}
        </p>
        <button
          type="button"
          onClick={toggleAll}
          disabled={busy}
          className={`h-7 px-3 rounded-full text-[11px] font-black inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${
            allOn
              ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              : "bg-amber-500 text-black hover:bg-amber-400"
          }`}
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          {allOn ? "모두 끄기" : "모두 켜기"}
        </button>
      </div>
      <p className="text-[11px] text-neutral-500 -mt-0.5">
        {isNextWeek
          ? "다음 주 요일표예요. 여기서 켠 대로 다음 주에 자동으로 올라가요."
          : "요일에 옵션을 켜두면 그 요일에 자동으로 조각이 올라가요."}
      </p>
      <div className="space-y-1.5 mt-0.5">
        {DOW_ORDER.map((dow) => {
          const isWeekend = dow === "fri" || dow === "sat" || dow === "sun";
          return (
            <div key={dow} className="flex items-start gap-2.5">
              <div className="w-11 pt-1.5 flex flex-col items-center leading-tight shrink-0">
                <span className={`text-[13px] font-black ${isWeekend ? "text-amber-400" : "text-white"}`}>
                  {DOW_LABEL[dow]}
                </span>
                <span className="text-[10px] text-neutral-600">{displayDates[dow].md}</span>
              </div>
              <div className="flex-1 min-w-0 flex flex-wrap gap-1.5 py-1">
                {activeOptions.map((o) => {
                  const on = (view[dow] ?? []).includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(dow, o.id)}
                      className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap flex items-center gap-1 transition-colors disabled:opacity-50 ${
                        on ? "bg-green-500 text-black" : "bg-neutral-900 text-neutral-500 border border-neutral-800"
                      }`}
                    >
                      {savingDow === dow && savingOptionId === o.id && <Loader2 className="w-3 h-3 animate-spin" />}
                      {o.label || o.table_info}
                      <span className={on ? "text-black/60" : "text-neutral-600"}>
                        {(o.price_per_seat / 10000).toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
