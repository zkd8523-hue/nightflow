"use client";

// 제안서 · MD 응답 · 확정서 — 외국인 요청(foreign_requests)과 한국 예약
// 요청(korean_booking_requests) 두 트랙이 완전히 같은 UI/로직을 쓴다
// (2026-09-06). 예전엔 외국인 쪽에만 있고 한국 쪽은 MD 연락처 태그만
// 나열하는 원시 화면이었다 — 두 벌을 따로 만들지 않고 이 컴포넌트 하나를
// requestType으로 분기해 공유한다. API(/api/admin/booking,
// /api/proposal-response)도 같은 분기 방식을 쓴다.

import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Copy, FileText, ExternalLink, Send } from "lucide-react";

export type RequestType = "foreign" | "korean";

export type MdCandidate = { id: string; name: string; phone: string | null };

export type GuestChannel = "push" | "sms" | "none";

export type ProposalConf = {
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
  /** 손님 전달 상태(Migration 680) — 확정서 저장 직후엔 없을 수 있다 */
  guest_notified_at?: string | null;
  guest_notify_channel?: GuestChannel | null;
  guest_viewed_at?: string | null;
  /** 손님 벨 알림 읽음 여부 — 벨 알림이 없으면 null */
  guest_bell_read?: boolean | null;
};

export type ProposalReq = {
  id: string;
  requestType: RequestType;
  clubIds: string[];
  clubNames: string[];
  groupSize: number;
  budget: number | null;
  notes: string | null;
  selectedMenuTotal: number | null;
  proposalToken: string;
  assignedMdId: string | null;
  mdResponse: string | null;
  mdRespondedAt: string | null;
  mdTableChoosable: boolean | null;
  mdTableOptions: string | null;
  mdRejectReason: string | null;
  /** 손님에게 보낸 안내 문장(Migration 678, 한국 예약 전용) */
  guestNotice?: string | null;
  guestNoticeAt?: string | null;
  mdRequiredAmount: number | null;
  /** 주류 제안 요청에 MD가 승인하며 적은 추천 구성(Migration 676) */
  mdProposedItems: string | null;
  /** 거절 사유 직접 입력 문장(Migration 677) */
  mdRejectNote: string | null;
  mdCandidates: MdCandidate[];
  conf: ProposalConf | null;
};

const MD_REJECT_LABEL: Record<string, string> = {
  budget: "금액 부족",
  absent: "당일 미출근",
  expired: "예약 만료",
  other: "기타",
};

const copy = (text: string) => {
  navigator.clipboard?.writeText(text).then(() => toast.success("복사됨")).catch(() => {});
};

// 번호 없는 MD는 도착 알림 SMS가 안 가므로 라벨에 표시한다.
function mdLabel(m: { name: string; phone: string | null }): string {
  return m.phone ? m.name : `${m.name} (번호없음)`;
}

// 요청 클럽의 파트너가 아닌 승인 MD. 여러 클럽을 맡는데 club_partners엔 한
// 클럽만 걸린 MD를 지정하려면 필요하다(2026-09-29). 전부 펼치면 목록이 너무
// 길어지므로 이름을 입력했을 때만 "다른 클럽 MD"로 보여준다.
function otherMdsOf(candidates: MdCandidate[], allMds: MdCandidate[]): MdCandidate[] {
  const ids = new Set(candidates.map((m) => m.id));
  return allMds.filter((m) => !ids.has(m.id));
}

const OTHER_MD_LIMIT = 30;

function matchOthers(others: MdCandidate[], query: string): MdCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return others.filter((m) => mdLabel(m).toLowerCase().includes(q)).slice(0, OTHER_MD_LIMIT);
}

// 담당 MD 검색·선택 — 처음부터 검색창만 있으면 "타이핑해야 뭐가 나오는" 인풋으로만
// 보여서, 후보가 몇 명인지도 모르는 상태로 이름을 정확히 쳐야 했다. 버튼을 누르면
// 검색창 + 전체 목록이 같이 펼쳐지는 구조로 한다 — 검색은 그 목록을 좁히는
// 보조 수단일 뿐, 기본은 목록에서 고르는 것이다(2026-09-06).
function MdPicker({
  candidates,
  others,
  assignedId,
  onAssign,
}: {
  candidates: MdCandidate[];
  others: MdCandidate[];
  assignedId: string | null;
  onAssign: (mdId: string | null) => Promise<boolean>;
}) {
  const pool = useMemo(() => [...candidates, ...others], [candidates, others]);
  const soleMd = candidates.length === 1 ? candidates[0] : null;
  const initialMd = pool.find((m) => m.id === assignedId) ?? soleMd ?? null;
  const [mdId, setMdId] = useState(initialMd?.id ?? "");
  const [mdQuery, setMdQuery] = useState("");
  const [mdOpen, setMdOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // 모바일에선 목록이 fixed 하단 시트로 boxRef 밖에 그려지므로 별도 ref로 바깥클릭을 판정한다.
  const panelRef = useRef<HTMLDivElement>(null);
  const matchedMd = pool.find((m) => m.id === mdId) ?? null;

  const filtered = useMemo(() => {
    const q = mdQuery.trim().toLowerCase();
    if (!q) {
      // 다른 클럽 MD가 이미 지정돼 있으면 목록 맨 위에 보여줘야 현재 상태가 보인다.
      const outsideAssigned = matchedMd && !candidates.some((m) => m.id === matchedMd.id) ? [matchedMd] : [];
      return [...outsideAssigned, ...candidates];
    }
    return candidates.filter((m) => mdLabel(m).toLowerCase().includes(q));
  }, [mdQuery, candidates, matchedMd]);
  const filteredOthers = useMemo(() => matchOthers(others, mdQuery), [others, mdQuery]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (boxRef.current && !boxRef.current.contains(t)) {
        setMdOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const pick = async (m: MdCandidate | null) => {
    setSaving(true);
    const ok = await onAssign(m?.id ?? null);
    setSaving(false);
    if (ok) {
      setMdId(m?.id ?? "");
      setMdQuery("");
    }
    setMdOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setMdOpen((v) => !v)}
        disabled={saving}
        className="h-8 px-2.5 rounded-lg bg-background border border-border text-[12px] font-bold text-foreground disabled:opacity-50 max-w-[160px] truncate"
      >
        {matchedMd ? mdLabel(matchedMd) : "MD 선택"}
      </button>
      {mdOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 sm:hidden"
          onClick={() => setMdOpen(false)}
        />
      )}
      {mdOpen && (
        <div
          ref={panelRef}
          className="fixed inset-x-0 bottom-0 z-[61] max-h-[70vh] rounded-t-2xl border-t border-border bg-background shadow-lg overflow-hidden sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:z-10 sm:mt-1 sm:w-56 sm:max-h-none sm:rounded-lg sm:border"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 pt-3 pb-1 text-[12px] font-bold text-muted-foreground sm:hidden">
            받는 MD 선택
          </div>
          <input
            autoFocus
            value={mdQuery}
            onChange={(e) => setMdQuery(e.target.value)}
            placeholder="이름 검색 · 다른 클럽 MD 포함"
            className="w-full h-11 px-3 border-b border-border bg-background text-foreground text-[14px] outline-none focus:border-amber-500 sm:h-9 sm:text-[12.5px]"
          />
          <div className="max-h-[46vh] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] sm:max-h-48 sm:pb-0">
            {filtered.length === 0 && filteredOthers.length === 0 ? (
              <div className="px-3 py-3 text-[13px] text-muted-foreground sm:py-2 sm:text-[12px]">
                {mdQuery.trim() ? "일치하는 MD 없음" : "이 클럽 MD 없음"}
              </div>
            ) : (
              <>
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(m)}
                    className={`w-full text-left px-3 py-3 hover:bg-muted text-[14px] truncate sm:py-2 sm:text-[12.5px] ${
                      m.id === mdId ? "text-brand-amber font-bold" : "text-foreground"
                    }`}
                  >
                    {mdLabel(m)}
                  </button>
                ))}
                {filteredOthers.length > 0 && (
                  <div className="px-3 pt-2.5 pb-1 border-t border-border text-[11px] font-bold text-muted-foreground">
                    다른 클럽 MD
                  </div>
                )}
                {filteredOthers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(m)}
                    className={`w-full text-left px-3 py-3 hover:bg-muted text-[14px] truncate sm:py-2 sm:text-[12.5px] ${
                      m.id === mdId ? "text-brand-amber font-bold" : "text-foreground"
                    }`}
                  >
                    {mdLabel(m)}
                  </button>
                ))}
              </>
            )}
            {!mdQuery.trim() && others.length > 0 && (
              <div className="px-3 py-2.5 border-t border-border text-[11.5px] text-muted-foreground sm:py-2">
                다른 클럽 MD는 이름을 입력하면 나와요
              </div>
            )}
            {mdId && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="w-full text-left px-3 py-3 border-t border-border text-[13px] text-muted-foreground hover:text-foreground sm:py-2 sm:text-[12px]"
              >
                지정 해제
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SEND_ERROR: Record<string, string> = {
  md_required: "받는 MD를 먼저 지정하세요",
  no_confirmation: "확정서를 먼저 저장하세요",
  cancelled: "취소된 요청이에요",
  no_channel: "이 MD는 앱 알림도 번호도 없어요 — 링크를 복사해 직접 보내주세요",
};

// 담당 MD에게 제안서/확정서를 앱 푸시로 보낸다(푸시가 없으면 서버가 SMS로 대신 보낸다).
// 링크를 복사해 DM으로 붙이던 걸 버튼 하나로 바꾼다(2026-09-30). 다시 누르면 다시 보낸다 —
// MD가 알림을 지웠거나 못 봤을 때 재촉용.
function SendToMdButton({
  requestType,
  requestId,
  kind,
  disabled,
  onSent,
}: {
  requestType: RequestType;
  requestId: string;
  kind: "proposal" | "confirmation";
  disabled?: boolean;
  onSent?: (guestChannel: GuestChannel | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/notify-md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_type: requestType, request_id: requestId, kind }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(SEND_ERROR[j.error] ?? j.error ?? "보내기 실패");
        return;
      }
      toast.success(j.channel === "sms" ? "앱 알림이 없어 문자로 보냈어요" : "MD에게 앱 알림을 보냈어요");
      // 손님 결과는 따로 알린다 — 앱이 없는 손님은 아무것도 못 받는데 운영자는
      // MD 성공 토스트만 보고 손님도 받은 줄 알았다(2026-10-01).
      if (j.guest_channel === "push") toast.success("손님에게 앱 푸시를 보냈어요");
      else if (j.guest_channel === "sms") toast.success("손님은 앱이 없어 문자로 링크를 보냈어요");
      else if (j.guest_channel === "none")
        toast.error("손님은 앱이 없어 알림이 안 갔어요 — 손님 링크를 복사해 직접 보내주세요", { duration: 8000 });
      onSent?.(j.guest_channel ?? null);
      setSentAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setBusy(false);
    }
  };
  const label = kind === "proposal" ? "제안서 보내기" : "확정서 보내기";
  return (
    <button
      type="button"
      onClick={send}
      disabled={disabled || busy}
      title={disabled ? "받는 MD를 먼저 지정하세요" : `담당 MD에게 ${kind === "proposal" ? "제안서" : "확정서"} 앱 알림 보내기`}
      className="ml-auto shrink-0 h-8 px-3 rounded-lg bg-white text-black text-[12px] font-black flex items-center gap-1.5 disabled:opacity-40"
    >
      <Send className="w-3.5 h-3.5" />
      {busy ? "보내는 중…" : sentAt ? `다시 보내기 · ${sentAt} 보냄` : label}
    </button>
  );
}

function normalizeIncludeLine(line: string): string {
  return line.trim().replace(/^(\d+)\s*/, "$1 ");
}

/** 제안서 카드 — 링크 + 카톡용 요약 복사 + 받는 MD 지정. */
export function ProposalCard({
  req,
  allMds = [],
  onAssignMd,
}: {
  req: ProposalReq;
  allMds?: MdCandidate[];
  onAssignMd: (mdId: string | null) => Promise<boolean>;
}) {
  const others = useMemo(() => otherMdsOf(req.mdCandidates, allMds), [req.mdCandidates, allMds]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 bg-card rounded-lg px-3 py-2 border border-border">
        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-[12px] font-bold text-foreground/80 shrink-0">제안서</span>
        <span className="text-[11px] text-muted-foreground truncate">MD에게 보낼 링크</span>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <a
            href={`/booking/proposal/${req.proposalToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground p-2 -m-0.5"
            title="제안서 열기"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => copy(`${window.location.origin}/booking/proposal/${req.proposalToken}`)}
            className="text-muted-foreground hover:text-foreground p-2 -m-0.5"
            title="제안서 링크만 복사"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="w-full flex items-center gap-2 pt-2 mt-1 border-t border-border/60">
          <span className="text-[11px] text-muted-foreground shrink-0">받는 MD</span>
          <MdPicker candidates={req.mdCandidates} others={others} assignedId={req.assignedMdId} onAssign={onAssignMd} />
          <SendToMdButton requestType={req.requestType} requestId={req.id} kind="proposal" disabled={!req.assignedMdId} />
        </div>
      </div>

      {/* 링크만 보내면 MD는 열기 전엔 뭔지 모른다 — 피크타임엔 그런 링크를
          안 연다. 클럽·날짜·인원·금액을 카톡에 그대로 붙일 수 있게 한 덩어리로. */}
      <button
        type="button"
        onClick={() => {
          const club = req.clubNames[0] ?? "클럽 미정";
          const amount = req.selectedMenuTotal != null ? `${req.selectedMenuTotal.toLocaleString()}원` : "금액 협의";
          const msg = `[나플 제안서]
${club} · ${req.groupSize}명 · ${amount}
${window.location.origin}/booking/proposal/${req.proposalToken}`;
          copy(msg);
        }}
        className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground bg-card rounded-lg px-3 py-2 border border-dashed border-border"
      >
        📋 클럽·인원·금액 포함해서 복사 (카톡용)
      </button>
    </>
  );
}

const GUEST_NOTICE_TEMPLATE: Record<string, (req: ProposalReq) => string> = {
  budget: (req) =>
    req.mdRequiredAmount
      ? `요청하신 클럽은 ${req.mdRequiredAmount.toLocaleString()}원부터 예약이 가능해요. 이 금액으로 진행할까요?`
      : "요청하신 예산으로는 그날 자리가 어렵대요. 예산을 조금 올려서 다시 주문해주시겠어요?",
  absent: () => "죄송해요, 그날은 담당자가 자리를 비워 예약이 어려워요. 다른 날짜로 다시 주문해주시겠어요?",
  expired: () => "죄송해요, 그날은 예약이 마감됐어요. 다른 날짜로 다시 주문해주시겠어요?",
  other: (req) => req.mdRejectNote ?? "그날은 예약이 어렵다고 해요. 다시 주문해주시겠어요?",
};

/** 거절된 한국 예약에 운영자가 손님용 안내를 보내는 패널. 이미 보냈으면 보낸 문장 + 다시 보내기. */
function GuestNoticeBox({ req }: { req: ProposalReq }) {
  const [msg, setMsg] = useState(
    GUEST_NOTICE_TEMPLATE[req.mdRejectReason ?? ""]?.(req) ?? "그날은 예약이 어렵다고 해요. 다시 주문해주시겠어요?"
  );
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState(req.guestNoticeAt ?? null);

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);
    const res = await fetch("/api/admin/guest-notice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: req.id, message: msg.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) return toast.error(j.error === "not_rejected" ? "이미 상태가 바뀌었어요 — 새로고침해주세요" : "전송 실패");
    setSentAt(j.guest_notice_at);
    toast.success(
      j.channel === "push" ? "손님에게 앱 알림을 보냈어요" : j.channel === "sms" ? "앱 알림이 없어 문자로 보냈어요" : "저장했어요 — 손님이 앱을 열면 보여요"
    );
  };

  return (
    <div className="mt-2 pt-2 border-t border-red-500/20">
      <span className="text-[11px] font-bold text-muted-foreground">손님에게 안내</span>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={2}
        maxLength={300}
        className="w-full mt-1 px-2.5 py-2 rounded-lg bg-background border border-border text-[12.5px] text-foreground outline-none focus:border-amber-500 resize-none"
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button
          type="button"
          onClick={send}
          disabled={sending || !msg.trim()}
          className="h-8 px-3 rounded-lg bg-white text-black text-[12px] font-black disabled:opacity-40"
        >
          {sending ? "보내는 중…" : sentAt ? "다시 보내기" : "손님에게 보내기"}
        </button>
        {sentAt && (
          <span className="text-[11px] text-muted-foreground">
            {new Date(sentAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 보냄
          </span>
        )}
      </div>
    </div>
  );
}

/** MD 응답 카드 — 승인/거절 + 응답한 MD 이름. */
export function MdResponseCard({ req, allMds = [] }: { req: ProposalReq; allMds?: MdCandidate[] }) {
  if (!req.mdResponse) return null;
  const assignedName = [...req.mdCandidates, ...allMds].find((m) => m.id === req.assignedMdId)?.name;
  const approved = req.mdResponse === "approved";
  return (
    <div
      className={`rounded-lg px-3 py-2 border ${
        approved ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[12px] font-black ${approved ? "text-money" : "text-red-400"}`}>
          {approved ? "✅ MD 승인" : "❌ MD 거절"}
        </span>
        {req.mdRespondedAt && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            {new Date(req.mdRespondedAt).toLocaleString("ko-KR", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      {/* 제안서 카드에서 미리 지정해둔 담당 MD 이름 — 없으면(제안서를 누구에게
          보냈는지 안 정해뒀으면) 안내만 표시한다(2026-09-06). */}
      <p className="text-[11.5px] text-muted-foreground mt-1">
        {req.assignedMdId
          ? `${assignedName ?? "알 수 없는 MD"} 님이 응답`
          : "제안서에 담당 MD가 지정되지 않았어요"}
      </p>
      {approved && (
        <p className="text-[12.5px] text-foreground/80 mt-1">
          {req.mdTableChoosable
            ? `테이블 선택 가능${req.mdTableOptions ? ` — ${req.mdTableOptions}` : ""}`
            : "랜덤 / 당일배정"}
        </p>
      )}
      {approved && req.mdProposedItems && (
        <div className="mt-1.5 pt-1.5 border-t border-green-500/20">
          <span className="text-[11px] font-bold text-muted-foreground">MD 제안 구성</span>
          <p className="text-[12.5px] text-foreground/90 whitespace-pre-line">{req.mdProposedItems}</p>
        </div>
      )}
      {!approved && (
        <p className="text-[12.5px] text-foreground/80 mt-1">
          {req.mdRejectReason === "other" && req.mdRejectNote
            ? req.mdRejectNote
            : MD_REJECT_LABEL[req.mdRejectReason ?? ""] ?? req.mdRejectReason}
          {req.mdRejectReason === "budget" && req.mdRequiredAmount
            ? ` — ${req.mdRequiredAmount.toLocaleString()}원이면 가능`
            : ""}
        </p>
      )}
      {/* 손님 재주문(/api/booking-rerequest)이 거절이 아니면 막으므로, 이 패널도 같은
          조건(!approved)에서만 보인다. 외국인 요청은 손님 로그인이 없어 아직 범위 밖. */}
      {!approved && req.requestType === "korean" && <GuestNoticeBox req={req} />}
    </div>
  );
}

/** 확정서 카드 — ref_no + 손님/MD용 링크 + MD에게 확정서 보내기. */
export function ConfirmationCard({
  conf,
  requestType,
  hasMd,
  guestContactType,
}: {
  conf: ProposalConf;
  requestType: RequestType;
  hasMd: boolean;
  /** 손님 연락 수단(phone·instagram·openchat·whatsapp·email…) — 미전달 시 안내 문구용 */
  guestContactType?: string | null;
}) {
  // "보내기"를 누르면 새로고침 없이 바로 손님 상태 줄이 바뀌게 로컬로 들고 있는다.
  const [notifiedAt, setNotifiedAt] = useState(conf.guest_notified_at ?? null);
  const [channel, setChannel] = useState(conf.guest_notify_channel ?? null);
  return (
    <div className="flex flex-wrap items-center gap-2 bg-card rounded-lg px-3 py-2 border border-amber-500/25">
      <FileText className="w-3.5 h-3.5 text-brand-amber shrink-0" />
      <span className="text-[13px] font-black text-brand-amber shrink-0">{conf.ref_no}</span>
      {conf.total_price != null && (
        <span className="text-[12px] text-money font-bold shrink-0">{conf.total_price.toLocaleString()}원</span>
      )}
      {/* 손님용/MD용 아이콘 4개가 4px 간격으로 붙어 있으면 모바일에서 오탭으로
          MD에게 손님 화면(도착 버튼·리뷰) 링크가 나간다. 두 그룹을 카드로
          분리하고 간격·터치 영역을 넓혔다. */}
      <div className="ml-auto flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg px-1">
          <span className="text-[10px] text-muted-foreground pr-0.5">손님</span>
          <a
            href={`/booking/${conf.public_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground p-2"
            title="손님용 확인서 열기"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => copy(`${window.location.origin}/booking/${conf.public_token}`)}
            className="text-muted-foreground hover:text-foreground p-2"
            title="손님용 링크 복사"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-0.5 bg-blue-500/10 rounded-lg px-1">
          <span className="text-[10px] text-blue-400 pr-0.5">MD</span>
          <a
            href={`/booking/md/${conf.md_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400/70 hover:text-blue-400 p-2"
            title="MD용 확인서 열기"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => copy(`${window.location.origin}/booking/md/${conf.md_token}`)}
            className="text-blue-400/70 hover:text-blue-400 p-2"
            title="MD용 링크 복사"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="w-full flex items-center gap-2 pt-2 mt-1 border-t border-border/60">
        <span className="text-[11px] text-muted-foreground">
          {hasMd ? "담당 MD 앱으로 확정서 알림" : "담당 MD가 지정되지 않았어요"}
        </span>
        {/* 확정서 폼에서 MD를 바꾸면 목록의 assigned_md_id는 새로고침 전까지 옛 값이라 막지 않는다 —
            MD가 정말 없으면 서버가 md_required로 돌려준다. */}
        <SendToMdButton
          requestType={requestType}
          requestId={conf.request_id}
          kind="confirmation"
          onSent={(g) => {
            setNotifiedAt(new Date().toISOString());
            setChannel(g);
          }}
        />
      </div>
      <GuestDeliveryLine
        notifiedAt={notifiedAt}
        channel={channel}
        bellRead={conf.guest_bell_read ?? null}
        viewedAt={conf.guest_viewed_at ?? null}
        guestUrlPath={`/booking/${conf.public_token}`}
        guestContactType={guestContactType ?? null}
      />
    </div>
  );
}

const GUEST_CONTACT_HINT: Record<string, string> = {
  instagram: "인스타 DM",
  openchat: "오픈채팅",
  phone: "문자",
  whatsapp: "WhatsApp",
  email: "이메일",
};

const shortTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * 손님 전달 상태 한 줄 — "손님: 앱 푸시 ✅ · 벨 안 읽음 · 확정서 미열람".
 * 앱이 없는 손님은 푸시가 안 가서 벨 알림만 남는데, 운영자가 이걸 몰라 두 건이
 * 미전달로 방치됐다(2026-10-01). 못 받은 게 확실하면 링크 복사 안내를 띄운다.
 */
function GuestDeliveryLine({
  notifiedAt,
  channel,
  bellRead,
  viewedAt,
  guestUrlPath,
  guestContactType,
}: {
  notifiedAt: string | null;
  channel: GuestChannel | null;
  bellRead: boolean | null;
  viewedAt: string | null;
  guestUrlPath: string;
  guestContactType: string | null;
}) {
  const sent = !!notifiedAt;
  const chip = "px-1.5 py-0.5 rounded-md text-[11px] font-bold";
  const undelivered = sent && channel === "none" && !viewedAt && !bellRead;
  const via = guestContactType ? GUEST_CONTACT_HINT[guestContactType] ?? "연락처" : "연락처";
  return (
    <div className="w-full space-y-1.5 pt-2 border-t border-border/60">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground mr-0.5">손님</span>
        {!sent ? (
          <span className={`${chip} bg-muted/50 text-muted-foreground`}>아직 안 보냄</span>
        ) : channel === "push" ? (
          <span className={`${chip} bg-green-500/15 text-green-500`}>앱 푸시 ✅</span>
        ) : channel === "sms" ? (
          <span className={`${chip} bg-green-500/15 text-green-500`}>문자 ✅</span>
        ) : (
          <span className={`${chip} bg-red-500/15 text-red-500`}>앱 알림 못 받음 ❌</span>
        )}
        {sent && bellRead !== null && (
          <span className={`${chip} ${bellRead ? "bg-green-500/15 text-green-500" : "bg-muted/50 text-muted-foreground"}`}>
            벨 {bellRead ? "읽음" : "안 읽음"}
          </span>
        )}
        <span className={`${chip} ${viewedAt ? "bg-green-500/15 text-green-500" : "bg-muted/50 text-muted-foreground"}`}>
          {viewedAt ? `확정서 열람 ${shortTime(viewedAt)}` : "확정서 미열람"}
        </span>
      </div>
      {undelivered && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/25 px-2.5 py-1.5">
          <span className="text-[11px] text-red-500 font-bold flex-1 break-keep">
            앱이 없어 알림이 안 갔어요 — 손님 링크를 복사해서 {via}로 보내주세요
          </span>
          <button
            onClick={() => copy(`${window.location.origin}${guestUrlPath}`)}
            className="shrink-0 h-7 px-2.5 rounded-md bg-white text-black text-[11px] font-black flex items-center gap-1"
          >
            <Copy className="w-3 h-3" />
            링크 복사
          </button>
        </div>
      )}
    </div>
  );
}

/** 확정서 작성/수정 폼 — 담당 MD·확정 클럽·자리·인원·확정가·포함 내역·요청·메모. */
export function ConfirmForm({
  req,
  allMds = [],
  onSaved,
}: {
  req: ProposalReq;
  allMds?: MdCandidate[];
  onSaved: (conf: ProposalConf) => void;
}) {
  const c = req.conf;
  const otherMds = useMemo(() => otherMdsOf(req.mdCandidates, allMds), [req.mdCandidates, allMds]);
  const mdPool = useMemo(() => [...req.mdCandidates, ...otherMds], [req.mdCandidates, otherMds]);
  const soleMd = req.mdCandidates.length === 1 ? req.mdCandidates[0] : null;
  const initialMd = mdPool.find((m) => m.id === req.assignedMdId) ?? soleMd ?? null;
  const [mdId, setMdId] = useState(initialMd?.id ?? "");
  const [mdQuery, setMdQuery] = useState(initialMd ? mdLabel(initialMd) : "");
  const [mdOpen, setMdOpen] = useState(false);
  const mdBoxRef = useRef<HTMLDivElement>(null);
  const matchedMd = mdPool.find((m) => m.id === mdId) ?? null;

  const mdFiltered = useMemo(() => {
    const q = mdQuery.trim().toLowerCase();
    if (!q) return req.mdCandidates;
    return req.mdCandidates.filter((m) => mdLabel(m).toLowerCase().includes(q));
  }, [mdQuery, req.mdCandidates]);
  const mdFilteredOthers = useMemo(() => matchOthers(otherMds, mdQuery), [otherMds, mdQuery]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (mdBoxRef.current && !mdBoxRef.current.contains(e.target as Node)) {
        setMdOpen(false);
        setMdQuery(matchedMd ? mdLabel(matchedMd) : "");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [matchedMd]);

  const [clubId, setClubId] = useState(c?.club_id ?? req.clubIds[0] ?? "");
  const [tableInfo, setTableInfo] = useState(
    c
      ? (c.table_info ?? "")
      : req.mdResponse === "approved"
      ? req.mdTableChoosable
        ? (req.mdTableOptions ?? "")
        : "당일 현장 배정"
      : ""
  );
  const [groupSize, setGroupSize] = useState(
    c ? (c.confirmed_group_size ? String(c.confirmed_group_size) : "") : String(req.groupSize)
  );
  // 주류 제안 요청이면 MD가 승인하며 적은 구성을 포함 내역 기본값으로 쓴다.
  const [includes, setIncludes] = useState(
    c ? (c.includes ?? []).join("\n") : req.mdResponse === "approved" ? (req.mdProposedItems ?? "") : ""
  );
  const [price, setPrice] = useState(
    c
      ? (c.total_price ? String(c.total_price) : "")
      : req.selectedMenuTotal
      ? String(req.selectedMenuTotal)
      : req.budget
      ? String(req.budget)
      : ""
  );
  const [request, setRequest] = useState(c ? (c.guest_request ?? "") : (req.notes ?? ""));
  const [memo, setMemo] = useState(c?.internal_memo ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/admin/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: req.requestType,
        request_id: req.id,
        assigned_md_id: mdQuery.trim() ? mdId || null : null,
        club_id: clubId || null,
        table_info: tableInfo.trim() || null,
        confirmed_group_size: groupSize.trim() || null,
        includes: includes.split("\n").map(normalizeIncludeLine).filter(Boolean),
        total_price: price ? Number(price.replace(/[^0-9]/g, "")) : null,
        guest_request: request.trim() || null,
        internal_memo: memo.trim() || null,
      }),
    });
    setSaving(false);
    const json = await res.json();
    if (!res.ok) return toast.error(json.error ?? "저장 실패");
    toast.success(`확정서 저장 — ${json.ref_no}`);
    onSaved({
      request_id: req.id,
      ref_no: json.ref_no,
      public_token: json.public_token,
      md_token: json.md_token,
      club_id: clubId || null,
      table_info: tableInfo.trim() || null,
      confirmed_group_size: groupSize.trim() || null,
      includes: includes.split("\n").map(normalizeIncludeLine).filter(Boolean),
      total_price: price ? Number(price.replace(/[^0-9]/g, "")) : null,
      guest_request: request.trim() || null,
      internal_memo: memo.trim() || null,
    });
  };

  const inputCls =
    "w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] focus:border-amber-500 outline-none";

  return (
    <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div ref={mdBoxRef} className="relative">
          <label className="text-[11px] text-muted-foreground">담당 MD</label>
          <input
            value={mdQuery}
            onChange={(e) => {
              setMdQuery(e.target.value);
              setMdId("");
              setMdOpen(true);
            }}
            onFocus={() => setMdOpen(true)}
            placeholder="이름 검색 · 목록에서 선택"
            className={`${inputCls} ${mdQuery && !mdId ? "border-red-500/50" : ""}`}
          />
          {mdQuery && !mdId && (
            <p className="text-[11px] text-red-400 mt-1">목록에서 선택해야 담당자로 지정됩니다</p>
          )}
          {mdOpen && (
            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
              {mdFiltered.length === 0 && mdFilteredOthers.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-muted-foreground">일치하는 MD 없음</div>
              ) : (
                [
                  ...mdFiltered.map((m) => ({ m, other: false })),
                  ...mdFilteredOthers.map((m) => ({ m, other: true })),
                ].map(({ m, other }, i, rows) => (
                  <div key={m.id}>
                  {other && !rows[i - 1]?.other && (
                    <div className="px-3 pt-2 pb-1 border-t border-border text-[11px] font-bold text-muted-foreground">
                      다른 클럽 MD
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted">
                    <button
                      type="button"
                      onClick={() => {
                        setMdId(m.id);
                        setMdQuery(mdLabel(m));
                        setMdOpen(false);
                      }}
                      className="flex-1 min-w-0 text-left text-[13px] text-foreground truncate"
                    >
                      {mdLabel(m)}
                    </button>
                    {m.phone && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard?.writeText(m.phone!).then(() => toast.success("번호 복사됨")).catch(() => {});
                        }}
                        className="shrink-0 text-[12px] font-mono text-muted-foreground hover:text-foreground px-1.5 py-1"
                        title="번호 복사"
                      >
                        {m.phone}
                      </button>
                    )}
                  </div>
                  </div>
                ))
              )}
              {mdId && (
                <button
                  type="button"
                  onClick={() => {
                    setMdId("");
                    setMdQuery("");
                    setMdOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-[12px] text-muted-foreground hover:bg-muted border-t border-border"
                >
                  선택 해제 (미지정)
                </button>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">확정 클럽</label>
          <select value={clubId} onChange={(e) => setClubId(e.target.value)} className={inputCls}>
            {req.clubIds.map((id, i) => (
              <option key={id} value={id}>{req.clubNames[i]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">인원</label>
          <input
            value={groupSize}
            onChange={(e) => setGroupSize(e.target.value)}
            placeholder={`${req.groupSize}명 · 범위도 가능 (예: 8~15명)`}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">자리</label>
          <input value={tableInfo} onChange={(e) => setTableInfo(e.target.value)} placeholder="R zone · 2 tables" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">확정가 (원)</label>
          <input
            value={price ? Number(price.replace(/[^0-9]/g, "")).toLocaleString("en-US") : ""}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="6,200,000"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">포함 내역 (한 줄에 하나)</label>
        <textarea
          value={includes}
          onChange={(e) => setIncludes(e.target.value)}
          rows={3}
          placeholder={"돔페리뇽 루미너스 2\n클라세 아술 레포사도 1"}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-[13px] focus:border-amber-500 outline-none resize-none"
        />
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">고객 요청</label>
        <input value={request} onChange={(e) => setRequest(e.target.value)} placeholder="VIP experience · 대기 없는 입장" className={inputCls} />
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">내부 메모 (손님·클럽 미노출)</label>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="w-full h-10 rounded-lg bg-white text-black text-[13px] font-black disabled:opacity-50"
      >
        {saving ? "저장 중…" : "확정서 저장 · 링크 발급"}
      </button>
    </div>
  );
}
