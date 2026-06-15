"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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

// 이번 주(월~일) 각 요일의 날짜 — 표시용 M/D + 비교용 ISO. KST 기준.
function weekDates(): Record<ShareDow, { md: string; iso: string }> {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dow = kstNow.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(kstNow);
  monday.setUTCDate(kstNow.getUTCDate() - daysFromMonday);
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

function todayKstISO(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function ShareWeekdayPlanBoard({ clubId, options, plans }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const dates = useMemo(() => weekDates(), []);
  const todayISO = useMemo(() => todayKstISO(), []);
  const activeOptions = useMemo(() => options.filter((o) => o.is_active), [options]);

  // dow → 배정된 option_id[]
  const [assign, setAssign] = useState<Record<ShareDow, string[]>>(() => {
    const m = {} as Record<ShareDow, string[]>;
    for (const d of DOW_ORDER) m[d] = [];
    for (const p of plans) {
      if (p.club_id === clubId) m[p.dow] = [...(m[p.dow] ?? []), p.option_id];
    }
    return m;
  });
  const [savingDow, setSavingDow] = useState<ShareDow | null>(null);
  // 처리 중 전역 잠금 — 완료될 때까지 다른 칩 클릭 무시(race 원천 차단). ref라 동기적으로 즉시 막힘.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const toggle = async (dow: ShareDow, optionId: string) => {
    if (busyRef.current) return; // 처리 중이면 무시(잠금이 race를 막으므로 아래 동기 계산이 안전)
    busyRef.current = true;
    setBusy(true);
    // 잠금 중엔 다른 토글이 끼어들 수 없으므로 현재 state를 그대로 읽어 next를 동기 계산한다.
    const current = assign[dow] ?? [];
    const next = current.includes(optionId)
      ? current.filter((x) => x !== optionId)
      : [...current, optionId];
    setAssign((a) => ({ ...a, [dow]: next })); // 낙관적 반영
    const added = next.length > current.length;
    setSavingDow(dow);
    try {
      const { data, error } = await supabase.rpc("set_share_weekday_plan", {
        p_club_id: clubId,
        p_dow: dow,
        p_option_ids: next,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "저장 실패");
        setAssign((a) => ({ ...a, [dow]: current })); // 롤백
        return;
      }
      if (added) {
        // 켰을 때: cron 안 기다리고 이번 주치 즉시 생성 (멱등 + 슬롯/오픈챗 게이트 내장)
        try {
          await supabase.functions.invoke("generate-share-listings");
          // invoke 완료 후에도 DB 반영(커밋→읽기)이 살짝 늦어 refresh가 한 박자 빠를 수 있음.
          // 짧게 대기 후 새로고침해 방금 생성된 조각이 확실히 잡히게 한다.
          await new Promise((r) => setTimeout(r, 500));
        } catch (genErr) {
          console.warn("즉시 생성 실패(다음 cron이 반영):", genErr);
        }
      } else {
        // 껐을 때: 그 옵션이 만든 "그 요일·이번 주" 자동생성 조각을 내림.
        // 참여 0건 + 진행/예정인 것만 (이미 손님이 들어온 조각은 보호).
        const iso = dates[dow]?.iso;
        if (iso) {
          try {
            // share_date/event_date 중 하나라도 그 날짜면 매칭 (자동생성 시 둘이 한 칸 어긋날 수 있음)
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
    } catch (err) {
      console.error(err);
      toast.error("저장에 실패했어요");
      setAssign((a) => ({ ...a, [dow]: current })); // 롤백
    } finally {
      setSavingDow(null);
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
      <p className="text-[13px] font-black text-white">요일표</p>
      <p className="text-[11px] text-neutral-500 -mt-0.5">요일에 옵션을 켜두면 그 요일에 자동으로 조각이 올라가요.</p>
      <div className="space-y-1.5 mt-0.5">
        {DOW_ORDER.map((dow) => {
          const isWeekend = dow === "fri" || dow === "sat" || dow === "sun";
          return (
            <div key={dow} className="flex items-start gap-2.5">
              <div className="w-11 pt-1.5 flex flex-col items-center leading-tight shrink-0">
                <span className={`text-[13px] font-black ${isWeekend ? "text-amber-400" : "text-white"}`}>
                  {DOW_LABEL[dow]}
                </span>
                <span className="text-[10px] text-neutral-600">{dates[dow].md}</span>
              </div>
              <div className="flex-1 min-w-0 flex flex-wrap gap-1.5 py-1">
                {activeOptions.map((o) => {
                  const on = (assign[dow] ?? []).includes(o.id);
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
                      {savingDow === dow && on && <Loader2 className="w-3 h-3 animate-spin" />}
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
