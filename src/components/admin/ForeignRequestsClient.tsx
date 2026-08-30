"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Calendar, Users, UserRound, Coins, MapPin, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ForeignReq = {
  id: string;
  lang: string;
  area: string | null;
  event_date: string;
  group_size: number;
  budget: number | null;
  club_ids: string[];
  clubNames: string[];
  guest_name: string | null;
  contact_type: string;
  contact_value: string;
  notes: string | null;
  status: string;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: "신규", cls: "bg-red-500/20 text-red-400 border-red-500/40" },
  contacted: { label: "연락함", cls: "bg-amber-500/20 text-brand-amber border-amber-500/40" },
  done: { label: "완료", cls: "bg-green-500/20 text-money border-green-500/40" },
  cancelled: { label: "취소", cls: "bg-muted/40 text-muted-foreground border-border" },
};

function contactLink(type: string, value: string): string | null {
  const v = value.trim();
  if (type === "email") return `mailto:${v}`;
  if (type === "whatsapp") return `https://wa.me/${v.replace(/[^0-9]/g, "")}`;
  if (type === "instagram") return `https://instagram.com/${v.replace(/^@/, "")}`;
  if (type === "line") return `https://line.me/ti/p/~${v.replace(/^@/, "")}`;
  return null; // wechat 등: 딥링크 없음 → 복사만
}

export function ForeignRequestsClient({ initial }: { initial: ForeignReq[] }) {
  const [reqs, setReqs] = useState<ForeignReq[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const updateStatus = async (id: string, status: string) => {
    setBusy(id);
    const supabase = createClient();
    const { error } = await supabase.from("foreign_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(`실패: ${error.message}`);
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success(STATUS_META[status]?.label ?? status);
  };

  const deleteReq = async (id: string) => {
    if (!window.confirm("이 요청을 영구 삭제할까요? 되돌릴 수 없어요.")) return;
    setBusy(id);
    const supabase = createClient();
    const { error } = await supabase.from("foreign_requests").delete().eq("id", id);
    setBusy(null);
    if (error) return toast.error(`삭제 실패: ${error.message}`);
    setReqs((prev) => prev.filter((r) => r.id !== id));
    toast.success("삭제됨");
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success("복사됨")).catch(() => {});
  };

  if (reqs.length === 0) {
    return <p className="text-center text-muted-foreground py-16 text-[14px]">아직 외국인 요청이 없어요.</p>;
  }

  return (
    <div className="space-y-3">
      {reqs.map((r) => {
        const st = STATUS_META[r.status] ?? STATUS_META.new;
        const link = contactLink(r.contact_type, r.contact_value);
        return (
          <div key={r.id} className="rounded-2xl bg-card border border-border p-4 space-y-3">
            {/* 헤더: 상태 + 언어 + 시각 */}
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
              <span className="text-[11px] text-muted-foreground">{r.lang.toUpperCase()} · {new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            {/* 클럽 */}
            {r.clubNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {r.clubNames.map((n, i) => (
                  <span key={i} className="text-[13px] font-bold text-brand-amber bg-amber-500/10 border border-amber-500/25 rounded-full px-2.5 py-1">
                    {i + 1}. {n}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">클럽 미지정 — 지역 기반 추천 필요</p>
            )}

            {/* 정보 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-foreground/80">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-muted-foreground" />{r.event_date}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-muted-foreground" />{r.group_size}명</span>
              {r.area && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-muted-foreground" />{r.area}</span>}
              {r.budget != null && <span className="flex items-center gap-1"><Coins className="w-3.5 h-3.5 text-muted-foreground" />{r.budget.toLocaleString()}원</span>}
              {r.guest_name && <span className="flex items-center gap-1"><UserRound className="w-3.5 h-3.5 text-muted-foreground" />{r.guest_name}</span>}
            </div>

            {r.notes && <p className="text-[13px] text-muted-foreground bg-card rounded-lg px-3 py-2">📝 {r.notes}</p>}

            {/* 연락처 */}
            <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2">
              <span className="text-[12px] text-muted-foreground uppercase shrink-0">{r.contact_type}</span>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-[14px] font-bold text-money underline truncate flex-1">{r.contact_value}</a>
              ) : (
                <span className="text-[14px] font-bold text-foreground truncate flex-1">{r.contact_value}</span>
              )}
              <button onClick={() => copy(r.contact_value)} className="shrink-0 text-muted-foreground hover:text-foreground"><Copy className="w-4 h-4" /></button>
            </div>

            {/* 상태 버튼 */}
            <div className="flex gap-2 pt-1">
              {r.status !== "contacted" && (
                <button disabled={busy === r.id} onClick={() => updateStatus(r.id, "contacted")} className="flex-1 h-9 rounded-lg bg-amber-500/15 text-brand-amber text-[13px] font-bold border border-amber-500/30 disabled:opacity-50">연락함</button>
              )}
              {r.status !== "done" && (
                <button disabled={busy === r.id} onClick={() => updateStatus(r.id, "done")} className="flex-1 h-9 rounded-lg bg-green-500/15 text-money text-[13px] font-bold border border-green-500/30 disabled:opacity-50">완료</button>
              )}
              {r.status !== "cancelled" && (
                <button disabled={busy === r.id} onClick={() => updateStatus(r.id, "cancelled")} className="px-3 h-9 rounded-lg bg-muted text-muted-foreground text-[13px] font-bold disabled:opacity-50">취소</button>
              )}
              {r.status === "cancelled" && (
                <button disabled={busy === r.id} onClick={() => deleteReq(r.id)} className="px-3 h-9 rounded-lg bg-red-500/15 text-red-400 text-[13px] font-bold border border-red-500/30 disabled:opacity-50 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />삭제</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
