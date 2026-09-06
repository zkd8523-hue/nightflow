"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Calendar, Users, UserRound, Coins, MapPin, Trash2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SelectedMenuSnapshot } from "@/types/database";
import { ProposalCard, MdResponseCard, ConfirmationCard, ConfirmForm, type ProposalReq } from "@/components/admin/ProposalSection";

export type ForeignReq = {
  id: string;
  lang: string;
  area: string | null;
  event_date: string;
  group_size: number;
  budget: number | null;
  /** 손님이 메뉴 화면에서 직접 담은 술 스냅샷. 메뉴 없는 클럽으로 온 요청은 null. */
  selected_menu: SelectedMenuSnapshot | null;
  selected_menu_total: number | null;
  /** MD가 제안서에서 누른 응답. NULL이면 아직 회신 없음. */
  proposal_token: string;
  md_response: string | null;
  md_responded_at: string | null;
  md_table_choosable: boolean | null;
  md_table_options: string | null;
  md_reject_reason: string | null;
  md_required_amount: number | null;
  club_ids: string[];
  clubNames: string[];
  guest_name: string | null;
  assigned_md_id: string | null;
  conf: {
    request_id: string;
    ref_no: string;
    public_token: string;
    md_token: string;
    club_id: string | null;
    table_info: string | null;
    confirmed_group_size: string | null;
    includes: string[];
    total_price: number | null;
    guest_request: string | null;
    internal_memo: string | null;
  } | null;
  mdCandidates: { id: string; name: string; phone: string | null }[];
  contact_type: string;
  contact_value: string;
  notes: string | null;
  status: string;
  created_at: string;
};

// ForeignReq(이 화면 전용, snake_case+club_ids배열) → ProposalReq(제안서/확정서
// 공용 컴포넌트가 쓰는 형태). 한국 예약(KoreanBookingsClient)도 각자의 타입에서
// 같은 어댑터 패턴으로 변환한다(2026-09-06).
function toProposalReq(r: ForeignReq): ProposalReq {
  return {
    id: r.id,
    requestType: "foreign",
    clubIds: r.club_ids,
    clubNames: r.clubNames,
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
  const [editing, setEditing] = useState<string | null>(null);
  // 목록이 200건까지 그냥 나열돼서, 지금 손 봐야 할 건(MD 답을 기다리는 것,
  // 거절당해 다시 잡아야 하는 것)을 눈으로 찾아야 했다. 처리 단계로 좁힌다.
  const [tab, setTab] = useState<"all" | "waiting" | "approved" | "rejected" | "done">("all");

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

  const applyConf = (id: string, conf: NonNullable<ForeignReq["conf"]>) => {
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, conf } : r)));
    setEditing(null);
  };

  // 제안서 링크를 보내기 전에 어떤 MD에게 보내는지 먼저 정해둔다 — 그래야
  // MD가 승인/거절해도 "누가 답했는지"가 바로 화면에 남는다(2026-09-06).
  // 확정서(ConfirmForm)의 담당 MD 지정과 같은 필드(assigned_md_id)를 쓰지만,
  // 확정서 나머지 필드 없이 이것만 단독으로 저장한다 — /api/admin/booking이
  // assigned_md_id만 와도 그것만 patch하도록 이미 지원한다.
  const assignMd = async (id: string, mdId: string | null) => {
    const res = await fetch("/api/admin/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_type: "foreign", request_id: id, assigned_md_id: mdId }),
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

  if (reqs.length === 0) {
    return <p className="text-center text-muted-foreground py-16 text-[14px]">아직 외국인 요청이 없어요.</p>;
  }

  // 취소된 건은 "완료"로 묶는다 — 더 볼 일이 없다는 점에서 같다.
  const bucketOf = (r: ForeignReq) =>
    r.status === "cancelled" || r.conf ? "done"
    : r.md_response === "approved" ? "approved"
    : r.md_response === "rejected" ? "rejected"
    : "waiting";

  const counts = {
    all: reqs.length,
    waiting: reqs.filter((r) => bucketOf(r) === "waiting").length,
    approved: reqs.filter((r) => bucketOf(r) === "approved").length,
    rejected: reqs.filter((r) => bucketOf(r) === "rejected").length,
    done: reqs.filter((r) => bucketOf(r) === "done").length,
  };
  const shown = tab === "all" ? reqs : reqs.filter((r) => bucketOf(r) === tab);

  const TABS: { key: typeof tab; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "waiting", label: "MD 답변 대기" },
    { key: "approved", label: "MD 승인" },
    { key: "rejected", label: "MD 거절" },
    { key: "done", label: "완료" },
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
              tab === t.key
                ? "bg-inverse text-inverse-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
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

            {/* 손님이 메뉴 화면에서 직접 담은 술 — 확정서가 아직 없을 때만 보여준다.
                확정서가 이미 있으면 그 안의 "포함 내역"이 최종본이라 여기 또 보이면
                운영자가 어느 쪽을 믿어야 할지 헷갈린다. */}
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
                {r.selected_menu.zone && (
                  <p className="text-[11px] text-muted-foreground">{r.selected_menu.zone}</p>
                )}
              </div>
            )}

            {r.notes && <p className="text-[13px] text-muted-foreground bg-card rounded-lg px-3 py-2">📝 {r.notes}</p>}

            {/* 연락처 */}
            <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2">
              <span className="text-[12px] text-muted-foreground uppercase shrink-0">{r.contact_type}</span>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-[14px] font-bold text-money underline truncate flex-1">{r.contact_value}</a>
              ) : (
                <span className="text-[14px] font-bold text-foreground truncate flex-1">{r.contact_value}</span>
              )}
              <button onClick={() => copy(r.contact_value)} className="shrink-0 text-muted-foreground hover:text-foreground p-2 -m-1"><Copy className="w-4 h-4" /></button>
            </div>

            {/* 제안서·MD응답·확정서 — 외국인/한국 요청 공용(ProposalSection.tsx, 2026-09-06). */}
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

// 손님이 메뉴 화면에서 직접 담은 스냅샷 → 확정서 "포함 내역" 줄.
// 확정서에는 우리가 파는 구성만 적으므로 테이블 차지는 줄로 안 뽑고 금액(price)에만 반영한다.
function menuToIncludeLines(snap: SelectedMenuSnapshot | null): string[] {
  if (!snap) return [];
  const lines = snap.items.map((it) => {
    const choice = it.choices?.length
      ? ` (${it.choices.map((c) => c.name_en).join(", ")})`
      : "";
    const variant = it.label_en ? ` ${it.label_en}` : "";
    return `${it.qty} ${it.name_en}${variant}${choice}`;
  });
  if (snap.combo) {
    lines.push(`Combo — Champagne x${snap.combo.cham_count} + Hard x${snap.combo.hard_count}`);
  }
  return lines;
}
