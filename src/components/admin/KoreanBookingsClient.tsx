"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Calendar, Users, UserRound, Trash2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SelectedMenuSnapshot, KoreanBookingContactType, KoreanBookingStatus } from "@/types/database";
import { ProposalCard, MdResponseCard, ConfirmationCard, ConfirmForm, type ProposalReq, type ProposalConf } from "@/components/admin/ProposalSection";

export type KoreanBookingReq = {
  id: string;
  club_id: string;
  clubName: string;
  event_date: string;
  group_size: number;
  budget: number | null;
  selected_menu: SelectedMenuSnapshot | null;
  selected_menu_total: number | null;
  guest_name: string;
  contact_type: KoreanBookingContactType;
  contact_value: string;
  notes: string | null;
  status: KoreanBookingStatus;
  created_at: string;
  proposal_token: string;
  assigned_md_id: string | null;
  md_response: string | null;
  md_responded_at: string | null;
  md_table_choosable: boolean | null;
  md_table_options: string | null;
  md_reject_reason: string | null;
  md_required_amount: number | null;
  mdCandidates: { id: string; name: string; phone: string | null }[];
  conf: ProposalConf | null;
};

// KoreanBookingReq(이 화면 전용, club_id 단일) → ProposalReq(제안서/확정서
// 공용 컴포넌트가 쓰는 형태). ForeignRequestsClient와 같은 어댑터 패턴
// (2026-09-06) — 클럽이 항상 1곳뿐이라 clubIds는 1개짜리 배열로 맞춘다.
function toProposalReq(r: KoreanBookingReq): ProposalReq {
  return {
    id: r.id,
    requestType: "korean",
    clubIds: [r.club_id],
    clubNames: [r.clubName],
    groupSize: r.group_size,
    budget: r.budget,
    notes: r.notes,
    selectedMenuTotal: r.selected_menu_total,
    proposalToken: r.proposal_token,
    assignedMdId: r.assigned_md_id,
    mdResponse: r.md_response,
    mdRespondedAt: r.md_responded_at,
    mdTableChoosable: r.md_table_choosable,
    mdTableOptions: r.md_table_options,
    mdRejectReason: r.md_reject_reason,
    mdRequiredAmount: r.md_required_amount,
    mdCandidates: r.mdCandidates,
    conf: r.conf,
  };
}

const STATUS_META: Record<KoreanBookingStatus, { label: string; cls: string }> = {
  new: { label: "신규", cls: "bg-red-500/20 text-red-400 border-red-500/40" },
  contacted: { label: "연락함", cls: "bg-amber-500/20 text-brand-amber border-amber-500/40" },
  done: { label: "완료", cls: "bg-green-500/20 text-money border-green-500/40" },
  cancelled: { label: "취소", cls: "bg-muted/40 text-muted-foreground border-border" },
};

const CONTACT_LABEL: Record<KoreanBookingContactType, string> = {
  phone: "전화번호",
  instagram: "인스타그램",
  openchat: "오픈채팅",
};

function contactLink(type: KoreanBookingContactType, value: string): string | null {
  const v = value.trim();
  if (type === "phone") return `tel:${v.replace(/[^0-9+]/g, "")}`;
  if (type === "instagram") return `https://instagram.com/${v.replace(/^@/, "")}`;
  if (type === "openchat") return v;
  return null;
}

function menuToIncludeLines(snap: SelectedMenuSnapshot | null): string[] {
  if (!snap) return [];
  const lines = snap.items.map((it) => {
    const choice = it.choices?.length ? ` (${it.choices.map((c) => c.name_en).join(", ")})` : "";
    const variant = it.label_en ? ` ${it.label_en}` : "";
    return `${it.qty} ${it.name_en}${variant}${choice}`;
  });
  if (snap.combo) {
    lines.push(`콤보 — 샴페인 x${snap.combo.cham_count} + 하드 x${snap.combo.hard_count}`);
  }
  return lines;
}

export function KoreanBookingsClient({ initial }: { initial: KoreanBookingReq[] }) {
  const [reqs, setReqs] = useState<KoreanBookingReq[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | KoreanBookingStatus>("all");

  const updateStatus = async (id: string, status: KoreanBookingStatus) => {
    setBusy(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("korean_booking_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(null);
    if (error) return toast.error(`실패: ${error.message}`);
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success(STATUS_META[status]?.label ?? status);
  };

  const deleteReq = async (id: string) => {
    if (!window.confirm("이 요청을 영구 삭제할까요? 되돌릴 수 없어요.")) return;
    setBusy(id);
    const supabase = createClient();
    const { error } = await supabase.from("korean_booking_requests").delete().eq("id", id);
    setBusy(null);
    if (error) return toast.error(`삭제 실패: ${error.message}`);
    setReqs((prev) => prev.filter((r) => r.id !== id));
    toast.success("삭제됨");
  };

  const applyConf = (id: string, conf: ProposalConf) => {
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, conf } : r)));
    setEditing(null);
  };

  // 제안서 링크를 보내기 전에 어떤 MD에게 보내는지 먼저 정해둔다(2026-09-06) —
  // ForeignRequestsClient와 동일 패턴. /api/admin/booking이 assigned_md_id만
  // 와도 그것만 patch하도록 이미 지원한다.
  const assignMd = async (id: string, mdId: string | null) => {
    const res = await fetch("/api/admin/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_type: "korean", request_id: id, assigned_md_id: mdId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error ?? "담당 MD 저장 실패");
      return false;
    }
    // MD가 바뀌면 서버가 이전 MD의 응답을 지우고 제안서 링크를 새로 발급한다.
    // 화면도 같이 비워야 한다 — 안 그러면 새 MD 카드에 옛 거절이 남는다.
    setReqs((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              assigned_md_id: mdId,
              proposal_token: j.proposal_token ?? r.proposal_token,
              ...(j.md_response_reset
                ? {
                    md_response: null,
                    md_responded_at: null,
                    md_reject_reason: null,
                    md_required_amount: null,
                    md_table_choosable: null,
                    md_table_options: null,
                  }
                : {}),
            }
          : r
      )
    );
    if (j.md_response_reset) toast.success("담당 MD 변경 — 새 제안서 링크가 발급됐어요");
    return true;
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success("복사됨")).catch(() => {});
  };

  // 연락처를 복사한다 = MD에게 연락하러 나선다 = 운영자가 이 요청을 "확인"했다는 신호.
  // new → contacted 자동 전환. 이 시점 이후 예약자가 정보를 고치면 운영자에게 재알림이 간다.
  const copyContact = (r: KoreanBookingReq) => {
    copy(r.contact_value);
    if (r.status === "new") updateStatus(r.id, "contacted");
  };

  if (reqs.length === 0) {
    return <p className="text-center text-muted-foreground py-16 text-[14px]">아직 예약 요청이 없어요.</p>;
  }

  const counts = {
    all: reqs.length,
    new: reqs.filter((r) => r.status === "new").length,
    contacted: reqs.filter((r) => r.status === "contacted").length,
    done: reqs.filter((r) => r.status === "done").length,
    cancelled: reqs.filter((r) => r.status === "cancelled").length,
  };
  const shown = tab === "all" ? reqs : reqs.filter((r) => r.status === tab);

  const TABS: { key: typeof tab; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "new", label: "신규" },
    { key: "contacted", label: "연락함" },
    { key: "done", label: "완료" },
    { key: "cancelled", label: "취소" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
              tab === t.key ? "bg-inverse text-inverse-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} {counts[t.key]}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="text-center text-muted-foreground py-10 text-[13px]">이 단계에 해당하는 요청이 없어요.</p>
      )}

      {shown.map((r) => {
        const st = STATUS_META[r.status];
        const link = contactLink(r.contact_type, r.contact_value);
        return (
          <div key={r.id} className="rounded-2xl bg-card border border-border p-4 space-y-3">
            {/* 헤더: 상태 + 시각 */}
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            {/* 클럽 */}
            <span className="inline-block text-[13px] font-bold text-brand-amber bg-amber-500/10 border border-amber-500/25 rounded-full px-2.5 py-1">
              {r.clubName}
            </span>

            {/* 정보 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-foreground/80">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-muted-foreground" />{r.event_date}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-muted-foreground" />{r.group_size}명</span>
              <span className="flex items-center gap-1"><UserRound className="w-3.5 h-3.5 text-muted-foreground" />{r.guest_name}</span>
            </div>

            {/* 손님이 고른 술 — 확정서가 아직 없을 때만 보여준다(외국인 화면과 동일 원칙). */}
            {!r.conf && r.selected_menu && r.selected_menu.items.length > 0 && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-bold text-brand-amber">🍾 손님이 고른 술</span>
                  {r.selected_menu_total != null && (
                    <span className="text-[13px] font-black text-money tabular-nums">
                      {r.selected_menu_total.toLocaleString()}원
                    </span>
                  )}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {menuToIncludeLines(r.selected_menu).map((l, i) => (
                    <li key={i} className="text-[12.5px] text-foreground/80">{l}</li>
                  ))}
                </ul>
                {r.selected_menu.table_charge && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    테이블차지 {r.selected_menu.table_charge.amount.toLocaleString()}원 포함
                    ({r.selected_menu.table_charge.basis === "weekend" ? "주말" : "평일"})
                  </p>
                )}
                {r.selected_menu.zone && <p className="text-[11px] text-muted-foreground">{r.selected_menu.zone}</p>}
              </div>
            )}

            {r.notes && <p className="text-[13px] text-muted-foreground bg-card rounded-lg px-3 py-2">📝 {r.notes}</p>}

            {/* 연락처 */}
            <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2">
              <span className="text-[12px] text-muted-foreground shrink-0">{CONTACT_LABEL[r.contact_type]}</span>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-[14px] font-bold text-money underline truncate flex-1">{r.contact_value}</a>
              ) : (
                <span className="text-[14px] font-bold text-foreground truncate flex-1">{r.contact_value}</span>
              )}
              <button onClick={() => copyContact(r)} className="shrink-0 text-muted-foreground hover:text-foreground p-2 -m-1"><Copy className="w-4 h-4" /></button>
            </div>

            {/* 제안서·MD응답·확정서 — 외국인 요청과 공용(ProposalSection.tsx, 2026-09-06). */}
            <ProposalCard req={toProposalReq(r)} onAssignMd={(mdId) => assignMd(r.id, mdId)} />
            <MdResponseCard req={toProposalReq(r)} />
            {r.conf && <ConfirmationCard conf={r.conf} />}

            <button
              onClick={() => setEditing(editing === r.id ? null : r.id)}
              className="w-full h-9 rounded-lg bg-card border border-border text-[13px] font-bold text-foreground/80 hover:border-amber-500/50 flex items-center justify-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              {r.conf ? "확정서 수정" : "담당 MD 지정 · 확정서 작성"}
            </button>

            {editing === r.id && (
              <ConfirmForm
                key={`${r.id}-${r.conf?.ref_no ?? "new"}`}
                req={toProposalReq(r)}
                onSaved={(c) => applyConf(r.id, c)}
              />
            )}

            {/* 액션 */}
            <div className="flex items-center gap-2 pt-1">
              {(["new", "contacted", "done", "cancelled"] as const)
                .filter((s) => s !== r.status)
                .map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => updateStatus(r.id, s)}
                    className="flex-1 h-9 rounded-lg bg-muted text-foreground/80 text-[12px] font-bold hover:bg-muted/70 disabled:opacity-50"
                  >
                    {STATUS_META[s].label}로
                  </button>
                ))}
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => deleteReq(r.id)}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                title="삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
