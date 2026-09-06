"use client";

// 제안서 · MD 응답 · 확정서 — 외국인 요청(foreign_requests)과 한국 예약
// 요청(korean_booking_requests) 두 트랙이 완전히 같은 UI/로직을 쓴다
// (2026-09-06). 예전엔 외국인 쪽에만 있고 한국 쪽은 MD 연락처 태그만
// 나열하는 원시 화면이었다 — 두 벌을 따로 만들지 않고 이 컴포넌트 하나를
// requestType으로 분기해 공유한다. API(/api/admin/booking,
// /api/proposal-response)도 같은 분기 방식을 쓴다.

import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Copy, FileText, ExternalLink } from "lucide-react";

export type RequestType = "foreign" | "korean";

export type MdCandidate = { id: string; name: string; phone: string | null };

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
  mdRequiredAmount: number | null;
  mdCandidates: MdCandidate[];
  conf: ProposalConf | null;
};

const MD_REJECT_LABEL: Record<string, string> = {
  budget: "금액 부족",
  absent: "당일 미출근",
  expired: "예약 만료",
};

const copy = (text: string) => {
  navigator.clipboard?.writeText(text).then(() => toast.success("복사됨")).catch(() => {});
};

// 번호 없는 MD는 도착 알림 SMS가 안 가므로 라벨에 표시한다.
function mdLabel(m: { name: string; phone: string | null }): string {
  return m.phone ? m.name : `${m.name} (번호없음)`;
}

// 담당 MD 검색·선택 — 처음부터 검색창만 있으면 "타이핑해야 뭐가 나오는" 인풋으로만
// 보여서, 후보가 몇 명인지도 모르는 상태로 이름을 정확히 쳐야 했다. 버튼을 누르면
// 검색창 + 전체 목록이 같이 펼쳐지는 구조로 한다 — 검색은 그 목록을 좁히는
// 보조 수단일 뿐, 기본은 목록에서 고르는 것이다(2026-09-06).
function MdPicker({
  candidates,
  assignedId,
  onAssign,
}: {
  candidates: MdCandidate[];
  assignedId: string | null;
  onAssign: (mdId: string | null) => Promise<boolean>;
}) {
  const soleMd = candidates.length === 1 ? candidates[0] : null;
  const initialMd = candidates.find((m) => m.id === assignedId) ?? soleMd ?? null;
  const [mdId, setMdId] = useState(initialMd?.id ?? "");
  const [mdQuery, setMdQuery] = useState("");
  const [mdOpen, setMdOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // 모바일에선 목록이 fixed 하단 시트로 boxRef 밖에 그려지므로 별도 ref로 바깥클릭을 판정한다.
  const panelRef = useRef<HTMLDivElement>(null);
  const matchedMd = candidates.find((m) => m.id === mdId) ?? null;

  const filtered = useMemo(() => {
    const q = mdQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((m) => mdLabel(m).toLowerCase().includes(q));
  }, [mdQuery, candidates]);

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
            placeholder="이름으로 좁히기"
            className="w-full h-11 px-3 border-b border-border bg-background text-foreground text-[14px] outline-none focus:border-amber-500 sm:h-9 sm:text-[12.5px]"
          />
          <div className="max-h-[46vh] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] sm:max-h-48 sm:pb-0">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[13px] text-muted-foreground sm:py-2 sm:text-[12px]">일치하는 MD 없음</div>
            ) : (
              filtered.map((m) => (
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
              ))
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

function normalizeIncludeLine(line: string): string {
  return line.trim().replace(/^(\d+)\s*/, "$1 ");
}

/** 제안서 카드 — 링크 + 카톡용 요약 복사 + 받는 MD 지정. */
export function ProposalCard({
  req,
  onAssignMd,
}: {
  req: ProposalReq;
  onAssignMd: (mdId: string | null) => Promise<boolean>;
}) {
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
          <MdPicker candidates={req.mdCandidates} assignedId={req.assignedMdId} onAssign={onAssignMd} />
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

/** MD 응답 카드 — 승인/거절 + 응답한 MD 이름. */
export function MdResponseCard({ req }: { req: ProposalReq }) {
  if (!req.mdResponse) return null;
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
          ? `${req.mdCandidates.find((m) => m.id === req.assignedMdId)?.name ?? "알 수 없는 MD"} 님이 응답`
          : "제안서에 담당 MD가 지정되지 않았어요"}
      </p>
      {approved && (
        <p className="text-[12.5px] text-foreground/80 mt-1">
          {req.mdTableChoosable
            ? `테이블 선택 가능${req.mdTableOptions ? ` — ${req.mdTableOptions}` : ""}`
            : "랜덤 / 당일배정"}
        </p>
      )}
      {!approved && (
        <p className="text-[12.5px] text-foreground/80 mt-1">
          {MD_REJECT_LABEL[req.mdRejectReason ?? ""] ?? req.mdRejectReason}
          {req.mdRejectReason === "budget" && req.mdRequiredAmount
            ? ` — ${req.mdRequiredAmount.toLocaleString()}원이면 가능`
            : ""}
        </p>
      )}
    </div>
  );
}

/** 확정서 카드 — ref_no + 손님/MD용 링크. */
export function ConfirmationCard({ conf }: { conf: ProposalConf }) {
  return (
    <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 border border-amber-500/25">
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
    </div>
  );
}

/** 확정서 작성/수정 폼 — 담당 MD·확정 클럽·자리·인원·확정가·포함 내역·요청·메모. */
export function ConfirmForm({
  req,
  onSaved,
}: {
  req: ProposalReq;
  onSaved: (conf: ProposalConf) => void;
}) {
  const c = req.conf;
  const soleMd = req.mdCandidates.length === 1 ? req.mdCandidates[0] : null;
  const initialMd = req.mdCandidates.find((m) => m.id === req.assignedMdId) ?? soleMd ?? null;
  const [mdId, setMdId] = useState(initialMd?.id ?? "");
  const [mdQuery, setMdQuery] = useState(initialMd ? mdLabel(initialMd) : "");
  const [mdOpen, setMdOpen] = useState(false);
  const mdBoxRef = useRef<HTMLDivElement>(null);
  const matchedMd = req.mdCandidates.find((m) => m.id === mdId) ?? null;

  const mdFiltered = useMemo(() => {
    const q = mdQuery.trim().toLowerCase();
    if (!q) return req.mdCandidates;
    return req.mdCandidates.filter((m) => mdLabel(m).toLowerCase().includes(q));
  }, [mdQuery, req.mdCandidates]);

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
  const [includes, setIncludes] = useState(c ? (c.includes ?? []).join("\n") : "");
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
              {mdFiltered.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-muted-foreground">일치하는 MD 없음</div>
              ) : (
                mdFiltered.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted">
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
