"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Calendar, Users, UserRound, Coins, MapPin, Trash2, FileText, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isClubOpenOn } from "@/lib/utils/clubOpenDays";
import type { SelectedMenuSnapshot } from "@/types/database";
import { ProposalCard, MdResponseCard, ConfirmationCard, ConfirmForm, type ProposalReq, type ProposalConf } from "@/components/admin/ProposalSection";
import { chatLang, firstGroupMessage, hostNameGuess, waShareUrl } from "@/lib/booking/groupChat";

// "보낸 지 N분/N시간" — 제안서 무응답 배지용. 24시간이 넘으면 일 단위.
function sinceText(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}시간` : `${Math.floor(h / 24)}일`;
}

/** 예약 진행 타임라인 + "지금 누구 차례인지"(2026-11-06) — 상태 배지만으론 누가 뭘 해야 하는지 몰라 카드를 일일이 열어봐야 했다.
 *  이미 저장된 시각·값으로만 그린다(새 컬럼 없음). 무응답 기준은 cron(proposal-reminders)과 같다: 당일 15분, 그 외 3시간. */
function ReqTimeline({ r, mdName }: { r: ForeignReq; mdName: string | null }) {
  const md = mdName ?? "담당자";
  const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
  const seats = r.md_seats ?? [];
  const approved = r.md_response === "approved";
  const rejected = r.md_response === "rejected";
  const menuTotal = (r.md_menu as { total?: number } | null | undefined)?.total ?? null;
  const pendingReconfirm = r.md_reconfirm_state === "pending";
  type Step = { done: boolean; title: string; sub?: string };
  const steps: Step[] = [
    { done: true, title: r.assigned_md_id ? `접수 · ${md} 지정` : "접수 · 담당자 미지정", sub: hhmm(r.created_at) },
    rejected
      ? { done: true, title: "MD 받기 어려움", sub: r.md_required_amount ? `${r.md_required_amount.toLocaleString()}원이면 가능` : undefined }
      : {
          done: approved,
          title: approved ? "MD 예약 가능" : "MD 답변 대기",
          sub: approved
            ? [seats.length ? (seats.length > 6 ? `자리 ${seats.length}개` : seats.join("·")) : "당일 배정", r.md_bump_risk === true ? "밀림 O" : r.md_bump_risk === false ? "밀림 X" : "", menuTotal ? `합계 ${menuTotal.toLocaleString()}원` : ""].filter(Boolean).join(" · ")
            : undefined,
        },
  ];
  if (approved && seats.length > 0) {
    steps.push({ done: !!r.guest_choice, title: r.guest_choice ? `손님이 ${r.guest_choice.replace(/^zone:/, "") } 선택` : "손님 자리 선택 대기", sub: r.guest_choice ? hhmm(r.guest_responded_at) : undefined });
    if (r.guest_choice) steps.push({ done: !pendingReconfirm && !!r.conf, title: pendingReconfirm ? "담당자 재확인 대기" : "담당자 재확인" });
  }
  steps.push({ done: !!r.conf, title: r.conf ? `예약 확인서 발급 · ${r.conf.ref_no}` : "예약 확인서" });

  // 지금 차례
  const sameDay = r.event_date === businessToday();
  const since = (iso: string | null | undefined) => (iso ? `${sinceText(iso)}째` : "");
  let turn: string | null = null;
  if (r.conf) turn = null;
  else if (!r.assigned_md_id) turn = "나: 담당자를 지정해 제안서를 보내주세요";
  else if (rejected) turn = r.md_required_amount ? `손님: 금액 안내 메일 확인 ${since(r.guest_action_sent_at)}` : "나: 다른 클럽·조건 제안";
  else if (!approved) turn = `${md}: 제안서 답변 ${since(r.proposal_sent_at)} · ${sameDay ? "15분" : "3시간"} 넘으면 알림`;
  else if (seats.length > 0 && !r.guest_choice) turn = `손님: 자리 고르기 ${since(r.guest_action_sent_at)}`;
  else if (pendingReconfirm) turn = `${md}: "이 자리 지금도 되나요?" ${since(r.guest_responded_at)}`;
  else turn = `${md}: 예약 확인서 발급 대기`;

  return (
    <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5">
      <ol className="space-y-1.5">
        {steps.map((st, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={`mt-px shrink-0 w-[18px] h-[18px] rounded-full grid place-items-center text-[10px] font-black border ${st.done ? "bg-green-500/15 text-money border-green-500/40" : "bg-card text-muted-foreground border-border"}`}
            >
              {st.done ? "✓" : "·"}
            </span>
            <span className={`text-[12.5px] leading-snug ${st.done ? "text-foreground/90" : "text-muted-foreground"}`}>
              <b className="font-bold">{st.title}</b>
              {st.sub && <span className="text-muted-foreground"> · {st.sub}</span>}
            </span>
          </li>
        ))}
      </ol>
      {turn && <p className="mt-2 pt-2 border-t border-border text-[12.5px] font-black text-brand-amber">지금 차례 → {turn}</p>}
    </div>
  );
}

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
  /** 제안서가 MD에게 닿은 시각(Migration 700). NULL이면 아직 안 보냄 */
  proposal_sent_at: string | null;
  /** 담당자가 고른 자리 · 밀림 O/X · 이 조건이면 가능해요(Migration 704) */
  guest_token?: string | null;
  md_seats?: string[] | null;
  md_bump_risk?: boolean | null;
  md_conditions?: string | null;
  md_menu?: unknown;
  /** 손님이 메일에서 고른 자리 + 담당자 재확인 상태(pending | yes | no) */
  guest_choice?: string | null;
  md_reconfirm_state?: string | null;
  /** 손님에게 행동을 요청한 메일(pick_seat | budget | bump)을 보낸 시각 — guest_responded_at이 비면 아직 안 눌렀다 */
  guest_action_kind?: string | null;
  guest_action_sent_at?: string | null;
  guest_responded_at?: string | null;
  md_response: string | null;
  md_responded_at: string | null;
  md_table_choosable: boolean | null;
  md_table_options: string | null;
  md_reject_reason: string | null;
  md_required_amount: number | null;
  md_proposed_items?: string | null;
  md_reject_note?: string | null;
  club_ids: string[];
  clubNames: string[];
  /** 첫 클럽 영문명 — 단톡방 방 이름·첫 메시지용(없으면 clubNames[0]) */
  clubNameEn?: string | null;
  guest_name: string | null;
  assigned_md_id: string | null;
  conf: ProposalConf | null;
  mdCandidates: { id: string; name: string; phone: string | null }[];
  /** 배정된 단톡방(Migration 707) — 없으면 null */
  chatRoom?: { label: string; url: string } | null;
  contact_type: string;
  contact_value: string;
  backup_email: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  /** 담당자가 테스트 계정(is_test)인 요청 — 목록·통계에서 기본 숨김 */
  isTest?: boolean;
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
    mdMenuTotal: (r.md_menu as { total?: number } | null | undefined)?.total ?? null,
    mdProposedItems: r.md_proposed_items ?? null,
    mdRejectNote: r.md_reject_note ?? null,
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

/** 손님이 WhatsApp을 남겼으면 대화창이 문구가 채워진 채로 바로 열린다(2026-11-01) — 번호를 찾거나 붙여넣을 필요 없이
 *  보내기만 누르면 된다. WhatsApp이 없는 손님(이메일만)에겐 버튼이 안 보인다. 메일에 못 닿았을 때 한 번 더 보내는 용도. */
function waSendUrl(r: ForeignReq, text: string): string | null {
  if (r.contact_type !== "whatsapp") return null;
  const num = r.contact_value.replace(/[^0-9]/g, "");
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : null;
}

/** 지금 이 요청에서 손님에게 보낼 안내 문구 — 자동 메일과 같은 내용을 WhatsApp용 번호 선택지로 줄인 것. */
function waDraft(r: ForeignReq): string | null {
  const club = r.clubNames[0] ?? "the club";
  const date = r.event_date;
  const link = (q = "") => `https://nightflow.kr/booking/respond/${r.guest_token ?? ""}${q}`;
  if (r.md_response === "rejected" && r.md_reject_reason === "budget" && r.md_required_amount) {
    const amt = `₩${r.md_required_amount.toLocaleString("en-US")}`;
    return `Hi ${r.guest_name ?? ""}! About ${club} on ${date}: the club can't do your budget that night. The closest option is ${amt}${r.md_conditions ? `\n${r.md_conditions}` : ""}\n\nReply with a number:\n1️⃣ Go ahead with ${amt}\n2️⃣ Talk about other options\n3️⃣ No thanks, cancel`;
  }
  if (r.md_response === "approved" && (r.md_seats?.length ?? 0) > 0 && !r.guest_choice) {
    return `Hi ${r.guest_name ?? ""}! Good news, ${club} can take your booking on ${date} 🎉\nPlease choose your table here:\n${link()}`;
  }
  return null;
}

type ClubOption = { id: string; name: string; area: string | null; open_dows: number[] | null };

/** "클럽이 알아서 골라주세요" 요청에 클럽을 지정 — 저장되면 club_ids[0]이 채워져
 *  제안서(받는 MD 후보)·확정서·MD 알림이 기존 흐름 그대로 이어진다(2026-10-02). */
function ClubAssignBox({
  req,
  options,
  onAssigned,
}: {
  req: ForeignReq;
  options: ClubOption[];
  onAssigned: (clubId: string, clubName: string, mdCandidates: ForeignReq["mdCandidates"]) => void;
}) {
  // 손님이 고른 지역 클럽을 위로, 그 안에서 그날 여는 곳을 먼저. 쉬는 곳은 "그날 휴무"를 붙여
  // 실수로 고르지 않게 한다(영업일 데이터가 비어 있으면 매일 여는 것으로 본다 — clubOpenDays 규칙).
  const sorted = useMemo(() => {
    const open = (o: ClubOption) => isClubOpenOn(o.open_dows, req.event_date);
    const byOpen = (a: ClubOption, b: ClubOption) => Number(open(b)) - Number(open(a));
    const same = options.filter((o) => req.area && o.area === req.area).sort(byOpen);
    const rest = options.filter((o) => !(req.area && o.area === req.area)).sort(byOpen);
    return { same, rest, open };
  }, [options, req.area, req.event_date]);
  const [clubId, setClubId] = useState(sorted.same.find(sorted.open)?.id ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!clubId) return;
    setSaving(true);
    const res = await fetch("/api/admin/foreign-club", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: req.id, club_id: clubId }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return toast.error(j.error ?? "클럽 지정 실패");
    toast.success(`클럽 지정 — ${j.club_name}`);
    onAssigned(clubId, j.club_name, j.md_candidates ?? []);
  };
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2.5 space-y-2">
      <p className="text-[12px] font-bold text-brand-amber">
        🎯 클럽 지정 필요 — 손님이 클럽을 맡겼어요{req.area ? ` (${req.area})` : " (지역 무관)"}
      </p>
      <p className="text-[11px] text-muted-foreground">지정하면 아래에 제안서·받는 MD·예약 확인서가 열립니다. 지정 후에는 바꿀 수 없어요.</p>
      <div className="flex gap-2">
        <select
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          className="flex-1 min-w-0 h-10 px-2 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-amber-500"
        >
          <option value="">클럽 선택…</option>
          {sorted.same.length > 0 && (
            <optgroup label={`${req.area} (손님 희망 지역)`}>
              {sorted.same.map((o) => <option key={o.id} value={o.id}>{o.name}{sorted.open(o) ? "" : " · 그날 휴무"}</option>)}
            </optgroup>
          )}
          <optgroup label={sorted.same.length > 0 ? "다른 지역" : "예약 가능 클럽"}>
            {sorted.rest.map((o) => <option key={o.id} value={o.id}>{o.name}{o.area ? ` · ${o.area}` : ""}{sorted.open(o) ? "" : " · 그날 휴무"}</option>)}
          </optgroup>
        </select>
        <button
          type="button"
          onClick={save}
          disabled={!clubId || saving}
          className="shrink-0 h-10 px-4 rounded-lg bg-white text-black text-[13px] font-black disabled:opacity-40"
        >
          {saving ? "저장 중…" : "지정"}
        </button>
      </div>
    </div>
  );
}


type PoolMd = { mdId: string; name: string; short: string; roomName: string; free: number; total: number };

/** 단톡방 풀(2026-11-04, Migration 707) — 한가할 때 "담당 MD가 들어 있는 빈 방"을 미리 만들어 초대 링크만 여기 등록한다.
 *  확인서가 나오면 안 쓴 방이 자동으로 한 예약에 붙고, 그 링크가 손님 확정 메일·확인서 버튼으로 나간다. 한 번 쓴 방은 다시 안 쓴다. */
function GroupRoomPool({ initial }: { initial: PoolMd[] }) {
  const [pool, setPool] = useState(initial);
  const [mdId, setMdId] = useState(initial.find((m) => m.free < 3)?.mdId ?? initial[0]?.mdId ?? "");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  if (initial.length === 0) return null;
  const low = pool.filter((m) => m.free <= 1);
  const sel = pool.find((m) => m.mdId === mdId);
  const add = async () => {
    if (!mdId || !links.trim()) return;
    setBusy(true);
    const res = await fetch("/api/admin/group-rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", md_id: mdId, links: links.split(/\s+/).filter(Boolean) }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(j.error ?? "등록 실패");
    setPool((prev) => prev.map((m) => (m.mdId === mdId ? { ...m, free: j.free, total: j.total } : m)));
    setLinks("");
    const bad = (j.invalid?.length ?? 0) + (j.duplicate?.length ?? 0);
    toast.success(`${j.added.length}개 등록${bad ? ` · ${bad}개는 건너뜀(링크 형식 오류·이미 등록)` : ""}`);
  };
  return (
    <details className="rounded-xl border border-border bg-card px-3 py-2.5" open={low.length > 0}>
      <summary className="cursor-pointer text-[13px] font-bold flex items-center gap-2 flex-wrap">
        <span>💬 단톡방 풀</span>
        {pool.map((m) => (
          <span key={m.mdId} className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${m.free <= 1 ? "border-red-500/40 bg-red-500/10 text-red-400" : "border-green-500/40 bg-green-500/10 text-money"}`}>
            {m.short} 남은 방 {m.free}
          </span>
        ))}
      </summary>
      <div className="mt-2.5 space-y-2">
        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
          WhatsApp에서 <b>담당 MD를 넣은 빈 방</b>을 만들고 초대 링크(그룹 정보 → 링크로 초대)를 여기에 붙여넣으세요. 한 줄에 하나, 여러 개 한꺼번에 가능해요.
          {sel && <> 방 이름은 모두 <b className="text-foreground">{sel.roomName}</b>로 — 손님이 보는 이름이라 예약마다 바꿀 필요가 없어요.</>}
        </p>
        <select value={mdId} onChange={(e) => setMdId(e.target.value)} className="w-full h-9 px-2 rounded-lg bg-background border border-border text-[13px] font-bold">
          {pool.map((m) => (
            <option key={m.mdId} value={m.mdId}>{m.name} · 남은 방 {m.free}/{m.total}</option>
          ))}
        </select>
        <textarea
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          placeholder={"https://chat.whatsapp.com/...\nhttps://chat.whatsapp.com/..."}
          className="w-full min-h-[84px] px-2.5 py-2 rounded-lg bg-background border border-border text-[12.5px] font-mono outline-none focus:border-green-500/60"
        />
        <button type="button" disabled={busy || !links.trim()} onClick={add} className="w-full h-9 rounded-lg bg-green-500/15 text-money border border-green-500/30 text-[13px] font-bold disabled:opacity-50">
          방 등록
        </button>
      </div>
    </details>
  );
}

// 폰에서 번호가 잘리지 않게 버튼은 아이콘으로 — 방 이름·링크 전체가 보여야 그대로 확인하고 쓸 수 있다.
function ChatRow({ label, sub, value, copyText, onCopy, href }: { label: string; sub?: string; value: string; copyText?: string | null; onCopy: (t: string) => void; href?: string | null }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-t border-border/60 first:border-t-0">
      <span className="w-12 shrink-0 text-[11px] font-bold text-muted-foreground">{label}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold text-foreground break-words">{value}</span>
        {sub && <span className="block text-[11px] text-muted-foreground truncate">{sub}</span>}
      </span>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} 열기`} className="shrink-0 w-8 h-8 rounded-lg border border-green-500/40 text-money flex items-center justify-center">
          <MessageCircle className="w-4 h-4" />
        </a>
      )}
      {copyText && (
        <button type="button" onClick={() => onCopy(copyText)} aria-label={`${label} 복사`} className="shrink-0 w-8 h-8 rounded-lg border border-border bg-background text-foreground/80 flex items-center justify-center">
          <Copy className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/** 단톡방(2026-11-04 개편) — 확인서가 나오면 미리 만든 방이 자동 배정된다. 운영자는 그 방을 열어 이름을 바꾸고 첫 메시지만 보낸다.
 *  손님은 링크로 직접 들어온다(번호를 몰라도 되고, 번호가 틀려도 상관없다). 방이 없으면 여기서 배정하거나 링크를 직접 연결한다. */
function GroupChatBox({ r, md }: { r: ForeignReq; md: { id: string; name: string; phone: string | null } | null }) {
  const conf = r.conf!;
  const [room, setRoom] = useState(r.chatRoom ?? null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const club = r.clubNameEn || r.clubNames[0] || "the club";
  // 호스트 영문 이름 — MD 테이블에 영문 이름이 없어 display_name으로 추정하고, 고치면 이 브라우저에 MD별로 기억한다.
  const hostKey = md ? `nf_host_en_${md.id}` : null;
  const [host, setHost] = useState(() => hostNameGuess(md?.name));
  useEffect(() => {
    if (!hostKey) return;
    try {
      const saved = localStorage.getItem(hostKey);
      // 서버 렌더엔 localStorage가 없어 첫 렌더는 추정값, 마운트 뒤 저장값으로 바꾼다(useDetectedArea와 같은 이유)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setHost(saved);
    } catch {}
  }, [hostKey]);
  const saveHost = (v: string) => {
    setHost(v);
    try {
      if (hostKey) localStorage.setItem(hostKey, v);
    } catch {}
  };
  const msg = firstGroupMessage({
    lang: chatLang(r.lang),
    guestName: r.guest_name,
    club,
    eventDate: r.event_date,
    groupSize: (conf.confirmed_group_size ?? String(r.group_size)).trim(),
    tableInfo: conf.table_info,
    includes: conf.includes ?? [],
    total: conf.total_price,
    host,
  });
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success("복사됨")).catch(() => toast.error("복사하지 못했어요"));
  };
  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    const res = await fetch("/api/admin/group-rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: r.id, ...body }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      const msgs: Record<string, string> = {
        no_free_room: "남은 방이 없어요. 위 '단톡방 풀'에서 방을 더 등록하거나 링크를 직접 연결하세요.",
        invalid_link: "WhatsApp 그룹 초대 링크(chat.whatsapp.com/…)가 아니에요.",
        link_in_use: "이미 다른 곳에 등록된 링크예요.",
        md_required: "담당 MD가 아직 없어요.",
      };
      return toast.error(msgs[j.error] ?? j.error ?? "실패");
    }
    if (j.room) setRoom({ label: j.room.label, url: j.room.invite_url });
    toast.success(j.mailed ? "방 연결 · 손님에게 링크 메일을 보냈어요" : "방 연결 (손님 메일은 못 보냈어요 — 확인서에는 버튼이 나와요)");
  };

  if (!room) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.05] px-3 py-2.5 space-y-2">
        <p className="text-[13px] font-black text-brand-amber">💬 단톡방 — 아직 배정된 방이 없어요</p>
        <button type="button" disabled={busy || !r.assigned_md_id} onClick={() => call({ action: "assign" })} className="w-full h-10 rounded-xl bg-green-500/15 text-money border border-green-500/30 text-[13px] font-bold disabled:opacity-50">
          미리 만든 빈 방 배정하기
        </button>
        <div className="flex gap-1.5">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="또는 방 초대 링크 직접 붙여넣기"
            className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-background border border-border text-[12.5px] outline-none focus:border-green-500/60"
          />
          <button type="button" disabled={busy || !manual.trim()} onClick={() => call({ action: "link", url: manual })} className="shrink-0 h-9 px-3 rounded-lg border border-border bg-background text-[12.5px] font-bold disabled:opacity-50">
            연결
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-green-500/35 bg-green-500/[0.05] px-3 py-2.5">
      <p className="text-[13px] font-black text-money">💬 단톡방 · 배정됨</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">① 아래 방 열기(링크를 누르면 그 방으로 바로 가요) ② 첫 메시지 보내기 — 손님은 확정 메일·확인서의 링크로 직접 들어와요</p>
      <ChatRow onCopy={copy} label="배정 방" value={room.label} sub="방 이름은 모두 같아서 링크로 열어야 해요" copyText={room.url} href={room.url} />
      <div className="flex items-center gap-2 py-1.5 border-t border-border/60">
        <span className="w-12 shrink-0 text-[11px] font-bold text-muted-foreground">호스트</span>
        <input
          value={host}
          onChange={(e) => saveHost(e.target.value)}
          placeholder="영문 이름 (예: Woohyun)"
          className="flex-1 min-w-0 h-8 px-2 rounded-lg bg-background border border-border text-[13px] font-bold text-foreground outline-none focus:border-green-500/60"
        />
      </div>
      <details className="mt-1.5">
        <summary className="text-[12px] text-foreground/80 cursor-pointer">첫 메시지 미리보기</summary>
        <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-foreground/85 bg-background border border-border rounded-lg px-2.5 py-2">{msg}</pre>
      </details>
      <div className="flex gap-1.5 mt-2">
        <a
          href={waShareUrl(msg)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center h-10 rounded-xl text-[13px] font-bold text-white"
          style={{ background: "#25D366" }}
        >
          첫 메시지 WhatsApp으로 보내기
        </a>
        <button type="button" onClick={() => copy(msg)} className="shrink-0 h-10 px-3 rounded-xl border border-border bg-background text-[12.5px] font-bold text-foreground/80">
          복사
        </button>
      </div>
    </div>
  );
}

/** 영업일(KST, 새벽 6시 경계) — 어젯밤 예약은 새벽까지 "다가오는 예약"으로 본다. */
const businessToday = () => new Date(Date.now() + (9 - 6) * 3600_000).toISOString().slice(0, 10);

export function ForeignRequestsClient({
  initial,
  allMds = [],
  clubOptions = [],
  focusId = null,
  pool = [],
}: {
  initial: ForeignReq[];
  allMds?: { id: string; name: string; phone: string | null }[];
  clubOptions?: ClubOption[];
  /** 알림에서 열었을 때(?id=) 그 카드로 스크롤 */
  focusId?: string | null;
  /** 단톡방 풀 — MD별 남은 방(Migration 707) */
  pool?: PoolMd[];
}) {
  const [reqs, setReqs] = useState<ForeignReq[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // 목록이 200건까지 그냥 나열돼서, 지금 손 봐야 할 건(MD 답을 기다리는 것,
  // 거절당해 다시 잡아야 하는 것)을 눈으로 찾아야 했다. 처리 단계로 좁힌다.
  const [showTest, setShowTest] = useState(() => !!initial.find((x) => x.id === focusId)?.isTest);
  const [tab, setTab] = useState<"all" | "needs_club" | "not_sent" | "waiting" | "guest_waiting" | "approved" | "rejected" | "done">("all");
  // 알림을 누르고 들어오면(?id=) 그 카드로 스크롤하고 테두리를 강조한다 — 예전엔 목록 맨 위에서 직접 찾아야 했다.
  useEffect(() => {
    if (focusId) document.getElementById(`req-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusId]);

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
    // 저장 응답엔 손님 전달 상태(Migration 680)가 없다 — 기존 값을 유지해야 카드가 "아직 안 보냄"으로 되돌아가지 않는다.
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, conf: { ...r.conf, ...conf } } : r)));
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
                    md_proposed_items: null,
                    md_reject_note: null,
                    md_table_choosable: null,
                    md_table_options: null,
                    proposal_sent_at: null,
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
    // 손님이 클럽을 맡긴 요청 — 클럽을 정해야 제안서를 보낼 수 있어 따로 모은다(2026-10-02).
    : r.club_ids.length === 0 ? "needs_club"
    : r.md_response === "approved" ? "approved"
    : r.md_response === "rejected" ? "rejected"
    // 답이 없는 건을 둘로 — 제안서를 아직 안 보낸 건과, 보냈는데 무응답인 건(Migration 700, 2026-11-01).
    // 예전엔 둘 다 "MD 답변 대기"라 몇 시간째 무응답인지 알 수 없었다.
    : r.proposal_sent_at ? "waiting"
    : "not_sent";
  // 담당자는 답했는데 손님이 메일 버튼을 아직 안 누른 건 — 메일을 못 보고 있을 수 있어 따로 모은다(2026-11-01).
  const isGuestWaiting = (r: ForeignReq) =>
    !!r.guest_action_sent_at && !r.guest_responded_at && r.status !== "cancelled" && !r.conf;

  const hiddenTest = reqs.filter((r) => r.isTest).length;
  const visible = showTest ? reqs : reqs.filter((r) => !r.isTest);
  const counts = {
    all: visible.length,
    needs_club: visible.filter((r) => bucketOf(r) === "needs_club").length,
    not_sent: visible.filter((r) => bucketOf(r) === "not_sent").length,
    waiting: visible.filter((r) => bucketOf(r) === "waiting").length,
    guest_waiting: visible.filter(isGuestWaiting).length,
    approved: visible.filter((r) => bucketOf(r) === "approved").length,
    rejected: visible.filter((r) => bucketOf(r) === "rejected").length,
    done: visible.filter((r) => bucketOf(r) === "done").length,
  };
  const shown = tab === "all" ? visible : tab === "guest_waiting" ? visible.filter(isGuestWaiting) : visible.filter((r) => bucketOf(r) === tab);

  const TABS: { key: typeof tab; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "needs_club", label: "클럽 지정 필요" },
    { key: "not_sent", label: "제안서 미발송" },
    { key: "waiting", label: "MD 답변 대기" },
    { key: "guest_waiting", label: "손님 답변 대기" },
    { key: "approved", label: "MD 예약 가능" },
    { key: "rejected", label: "MD 받기 어려움" },
    { key: "done", label: "완료" },
  ];

  return (
    <div className="space-y-3">
      <GroupRoomPool initial={pool} />
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

      {hiddenTest > 0 && (
        <button type="button" onClick={() => setShowTest((v) => !v)} className="text-[12px] font-bold text-brand-amber">
          {showTest ? `테스트 요청 ${hiddenTest}건 다시 숨기기` : `테스트 요청 ${hiddenTest}건 숨김 · 보기`}
        </button>
      )}

      {shown.length === 0 && (
        <p className="text-center text-muted-foreground py-10 text-[13px]">이 단계에 해당하는 요청이 없어요.</p>
      )}

      {shown.map((r) => {
        const st = STATUS_META[r.status] ?? STATUS_META.new;
        const link = contactLink(r.contact_type, r.contact_value);
        return (
          <div key={r.id} id={`req-${r.id}`} className={`rounded-2xl bg-card border p-4 space-y-3 scroll-mt-4 transition-shadow ${focusId === r.id ? "border-amber-500 ring-2 ring-amber-500/60" : "border-border"}`}>
            {/* 헤더: 상태 + 언어 + 시각 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                {isGuestWaiting(r) && r.guest_action_sent_at && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-sky-400/40 bg-sky-400/10 text-sky-300 truncate">
                    손님에게 보낸 지 {sinceText(r.guest_action_sent_at)} · 미확인
                  </span>
                )}
                {r.md_reconfirm_state === "pending" && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-brand-amber truncate">
                    손님 선택 · 담당자 재확인 대기
                  </span>
                )}
                {r.md_bump_risk === true && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-red-500/40 bg-red-500/10 text-red-400 truncate">
                    ⚠️ 밀릴 수 있음
                  </span>
                )}
                {bucketOf(r) === "waiting" && r.proposal_sent_at && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-brand-amber truncate">
                    보낸 지 {sinceText(r.proposal_sent_at)} · 무응답
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">{r.lang.toUpperCase()} · {new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            {/* 진행 타임라인 + 지금 누구 차례인지 — 취소된 건은 생략 */}
            {r.status !== "cancelled" && (
              <ReqTimeline r={r} mdName={(r.mdCandidates.find((m) => m.id === r.assigned_md_id)?.name ?? allMds.find((m) => m.id === r.assigned_md_id)?.name) ?? null} />
            )}

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
              <ClubAssignBox
                req={r}
                options={clubOptions}
                onAssigned={(cid, name, mds) => {
                  setReqs((prev) => prev.map((x) => (x.id === r.id ? { ...x, club_ids: [cid], clubNames: [name], mdCandidates: mds } : x)));
                }}
              />
            )}

            {/* 정보 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-foreground/80">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-muted-foreground" />{r.event_date}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-muted-foreground" />{r.group_size}명</span>
              {r.area && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-muted-foreground" />{r.area}</span>}
              {r.budget != null && <span className="flex items-center gap-1"><Coins className="w-3.5 h-3.5 text-muted-foreground" />{r.budget.toLocaleString()}원</span>}
              {r.guest_name && <span className="flex items-center gap-1"><UserRound className="w-3.5 h-3.5 text-muted-foreground" />{r.guest_name}</span>}
              <span className="font-mono text-[11px] text-muted-foreground" title="손님이 WhatsApp·메일에서 말하는 접수 번호">{`NF-${r.id.slice(0, 6).toUpperCase()}`}</span>
            </div>

            {/* 손님이 메뉴 화면에서 직접 담은 술 — 확정서가 아직 없을 때만 보여준다.
                확정서가 이미 있으면 그 안의 "포함 내역"이 최종본이라 여기 또 보이면
                운영자가 어느 쪽을 믿어야 할지 헷갈린다. */}
            {/* 손님이 술을 직접 담지 않고 "MD 추천"을 고른 경우 — 예산만 있다. 세트 제안을 운영자/MD가 한다. */}
            {!r.conf && r.selected_menu?.md_recommend && (
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/[0.05] px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-bold text-violet-400">
                    {r.selected_menu.md_recommend.club_pick ? "🎯 클럽·세트 모두 추천 요청" : "🎯 MD 추천 요청 (손님이 직접 안 담음)"}
                  </span>
                  <span className="text-[13px] font-black text-money tabular-nums">예산 {r.selected_menu.md_recommend.budget.toLocaleString()}원</span>
                </div>
                <p className="text-[12px] text-foreground/80 mt-1">이 예산 안에서 세트를 제안해 주세요. 예약 확인서에 가격을 적어 보내면 손님이 봅니다.</p>
              </div>
            )}
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
            {/* 예비 이메일(Migration 669) — 메신저 ID 검색이 막히면 이 경로로 연락한다.
                2026-09-19 LINE ID 검색 실패로 ₩100만 예약을 놓친 뒤 추가. */}
            {r.backup_email && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[12px] text-muted-foreground uppercase shrink-0">email</span>
                <a href={`mailto:${r.backup_email}`} className="text-[14px] font-bold text-money underline truncate flex-1">{r.backup_email}</a>
                <button onClick={() => copy(r.backup_email!)} className="shrink-0 text-muted-foreground hover:text-foreground p-2 -m-1"><Copy className="w-4 h-4" /></button>
              </div>
            )}

            {r.conf && r.status !== "cancelled" && r.event_date >= businessToday() && (
              <GroupChatBox r={r} md={allMds.find((m) => m.id === r.assigned_md_id) ?? r.mdCandidates.find((m) => m.id === r.assigned_md_id) ?? null} />
            )}

            {/* 제안서·MD응답·확정서 — 외국인/한국 요청 공용(ProposalSection.tsx, 2026-09-06). */}
            {/* 클럽이 비어 있으면 받는 MD 후보·제안서 클럽명이 없다 — 위에서 클럽을 먼저 지정한다. */}
            {r.club_ids.length > 0 && (
              <>
                <ProposalCard
                  req={toProposalReq(r)}
                  allMds={allMds}
                  onAssignMd={(mdId) => assignMd(r.id, mdId)}
                  onProposalSent={() => setReqs((prev) => prev.map((x) => (x.id === r.id ? { ...x, proposal_sent_at: new Date().toISOString() } : x)))}
                />
                <MdResponseCard req={toProposalReq(r)} allMds={allMds} />
              </>
            )}
            {/* 손님이 메일을 못 봤거나 아직 안 눌렀을 때 WhatsApp으로 한 번 더 — 문구가 채워진 대화창이 바로 열린다(손님이 WhatsApp을 남긴 경우만). */}
            {(() => {
              const draft = waDraft(r);
              const url = draft ? waSendUrl(r, draft) : null;
              if (!url) return null;
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center h-11 rounded-xl text-[13.5px] font-bold text-white"
                  style={{ background: "#25D366" }}
                >
                  WhatsApp으로 보내기
                </a>
              );
            })()}
            {r.conf && <ConfirmationCard key={r.conf.ref_no} conf={r.conf} requestType="foreign" hasMd={!!r.assigned_md_id} guestContactType={r.contact_type} />}

            {(r.club_ids.length > 0 || r.conf) && (
            <button
              onClick={() => setEditing(editing === r.id ? null : r.id)}
              className="w-full h-9 rounded-lg bg-card border border-border text-[13px] font-bold text-foreground/80 hover:border-amber-500/50 flex items-center justify-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              {r.conf ? "예약 확인서 수정" : "담당 MD 지정 · 예약 확인서 작성"}
            </button>
            )}

            {editing === r.id && (
              <ConfirmForm
                key={`${r.id}-${r.conf?.ref_no ?? "new"}`}
                req={toProposalReq(r)}
                allMds={allMds}
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
