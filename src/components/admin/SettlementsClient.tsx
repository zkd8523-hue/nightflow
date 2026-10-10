"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Send, ChevronDown } from "lucide-react";
import {
  type SettlementRow,
  type SettlementNotice,
  type SettlementPayment,
  feeOf,
  rateOf,
  dueDateOf,
  defaultSettlementMessage,
} from "@/lib/booking/settlements";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function SettlementsClient({
  rows: initialRows,
  notices: initialNotices,
  rates,
  payments: initialPayments,
}: {
  rows: SettlementRow[];
  notices: SettlementNotice[];
  rates: Record<string, number>;
  payments: SettlementPayment[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [notices, setNotices] = useState(initialNotices);
  const [payments, setPayments] = useState(initialPayments);
  const months = useMemo(() => [...new Set(rows.map((r) => r.month))].sort().reverse(), [rows]);
  // 기본은 "지난달"이 있으면 지난달(이번 달 10일 전에 받을 돈), 없으면 가장 최근 달.
  const lastMonth = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const [month, setMonth] = useState(months.includes(lastMonth) ? lastMonth : months[0] ?? "");
  const [composer, setComposer] = useState<{ key: string; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  const inMonth = rows.filter((r) => r.month === month);
  const included = inMonth.filter((r) => r.included);
  const excluded = inMonth.filter((r) => !r.included);
  // 클럽 · MD 묶음
  const groups = (() => {
    const m = new Map<string, { clubName: string; mdId: string | null; mdName: string; rows: SettlementRow[] }>();
    for (const r of included) {
      const key = `${r.mdId ?? "none"}|${r.clubName}`;
      if (!m.has(key)) m.set(key, { clubName: r.clubName, mdId: r.mdId, mdName: r.mdName, rows: [] });
      m.get(key)!.rows.push(r);
    }
    return [...m.entries()];
  })();
  const monthTotal = included.reduce((s, r) => s + (r.amount ?? 0), 0);
  const rate = rateOf(rates, month);
  const pct = `${+(rate * 100).toFixed(2)}%`;

  const togglePaid = async (mdId: string, paid: boolean) => {
    const res = await fetch("/api/admin/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "paid", month, md_id: mdId, paid }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(j.error ?? "저장 실패");
    setPayments((prev) => [
      ...prev.filter((p) => !(p.month === month && p.md_id === mdId)),
      ...(paid ? [{ month, md_id: mdId, paid_at: j.paid_at as string }] : []),
    ]);
    toast.success(paid ? "정산 완료로 표시했어요" : "정산 완료를 해제했어요");
  };

  const saveItem = async (r: SettlementRow, patch: { included?: boolean; amount?: number | null }) => {
    const res = await fetch("/api/admin/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "item", confirmation_id: r.confirmationId, ...patch }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(j.error ?? "저장 실패");
    setRows((prev) =>
      prev.map((x) =>
        x.confirmationId !== r.confirmationId
          ? x
          : {
              ...x,
              included: patch.included ?? x.included,
              ...(patch.amount !== undefined
                ? { amount: patch.amount ?? x.baseAmount, amountOverridden: patch.amount != null }
                : {}),
            }
      )
    );
    toast.success("저장됨");
  };

  const send = async (mdId: string, message: string) => {
    setSending(true);
    const res = await fetch("/api/admin/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", month, md_id: mdId, message }),
    });
    const j = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) return toast.error(j.error === "no_channel" ? "푸시·문자 모두 보낼 수 없어요(전화번호 없음)" : j.error ?? "발송 실패");
    toast.success(j.channel === "push" ? "앱 푸시로 보냈어요" : "문자로 보냈어요");
    setNotices((prev) => [{ month, md_id: mdId, channel: j.channel, sent_at: j.sent_at, fee_amount: j.fee }, ...prev]);
    setComposer(null);
  };

  if (months.length === 0) return <p className="text-center text-muted-foreground py-16 text-[14px]">정산할 확정 건이 없어요.</p>;

  return (
    <div className="space-y-4">
      {/* 월 선택 */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
        {months.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMonth(m); setComposer(null); }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold ${m === month ? "bg-inverse text-inverse-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {Number(m.slice(5, 7))}월 {m.slice(0, 4) !== String(new Date().getFullYear()) ? `(${m.slice(0, 4)})` : ""}
          </button>
        ))}
      </div>

      {/* 월 요약 */}
      <div className="rounded-2xl bg-card border border-border p-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[11px] text-muted-foreground">확정 금액</p>
          <p className="text-[16px] font-black tabular-nums">{won(monthTotal)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">수수료 {pct}</p>
          <p className="text-[16px] font-black text-money tabular-nums">{won(feeOf(monthTotal, rate))}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">지급기한</p>
          <p className="text-[16px] font-black tabular-nums">{dueDateOf(month).slice(5).replace("-", "/")}</p>
        </div>
      </div>

      {groups.length === 0 && <p className="text-center text-muted-foreground text-[13px] py-6">이 달에 정산에 포함된 건이 없어요.</p>}

      {/* 클럽 · MD별 */}
      {groups.map(([key, g]) => {
        const total = g.rows.reduce((s, r) => s + (r.amount ?? 0), 0);
        const last = notices.find((n) => n.month === month && n.md_id === g.mdId);
        const paid = payments.find((p) => p.month === month && p.md_id === g.mdId);
        const open = composer?.key === key;
        return (
          <div key={key} className={`rounded-2xl bg-card border p-4 space-y-3 ${paid ? "border-green-500/40" : "border-border"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-black truncate">{g.clubName}</p>
                <p className="text-[12px] text-muted-foreground truncate">{g.mdName}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[12px] text-muted-foreground">{g.rows.length}건 · {won(total)}</p>
                <p className="text-[17px] font-black text-money tabular-nums">수수료 {won(feeOf(total, rate))}</p>
              </div>
            </div>

            <div className="divide-y divide-border border-y border-border">
              {g.rows.map((r) => (
                <RowLine key={r.confirmationId} r={r} onSave={saveItem} />
              ))}
            </div>

            {/* 정산 완료 체크(2026-10-04) — 입금 확인 후 운영자가 직접 체크. 월·MD 단위. */}
            {g.mdId && (
              <label className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer ${paid ? "border-green-500/40 bg-green-500/[0.06]" : "border-border"}`}>
                <input
                  type="checkbox"
                  checked={!!paid}
                  onChange={(e) => togglePaid(g.mdId!, e.target.checked)}
                  className="w-4 h-4 accent-green-500 shrink-0"
                />
                <span className={`text-[13px] font-bold ${paid ? "text-money" : ""}`}>
                  {paid
                    ? `정산 완료 · ${new Date(paid.paid_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                    : "정산 완료(입금 확인) 체크"}
                </span>
              </label>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {last
                  ? `${new Date(last.sent_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} ${last.sent_by === null ? "자동 " : ""}${last.channel === "push" ? "앱 푸시" : "문자"}로 보냄 · ${won(last.fee_amount)}`
                  : "아직 안 보냄"}
              </p>
              {g.mdId ? (
                <button
                  type="button"
                  onClick={() => setComposer(open ? null : { key, message: defaultSettlementMessage(month, g.clubName, g.rows, rate) })}
                  className="shrink-0 h-9 px-3.5 rounded-lg bg-white text-black text-[13px] font-black flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {last ? "다시 보내기" : "MD에게 보내기"}
                </button>
              ) : (
                <span className="text-[11px] text-red-400">담당 MD가 없어 보낼 수 없어요</span>
              )}
            </div>

            {open && g.mdId && (
              <div className="space-y-2">
                <textarea
                  value={composer!.message}
                  onChange={(e) => setComposer({ key, message: e.target.value })}
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-[13px] leading-relaxed outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-muted-foreground">앱 푸시가 있으면 푸시, 없으면 문자(솔라피)로 갑니다. 이걸 보낸 MD에게만 7일·10일 리마인드 문자가 자동으로 나가요(정산 완료 체크하면 멈춤).</p>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => send(g.mdId!, composer!.message)}
                  className="w-full h-10 rounded-lg bg-amber-500 text-black text-[13px] font-black disabled:opacity-50"
                >
                  {sending ? "보내는 중…" : "이 내용으로 보내기"}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* 제외된 건(한국 확정 기본 제외 등) */}
      {excluded.length > 0 && (
        <div className="rounded-2xl border border-border">
          <button type="button" onClick={() => setShowExcluded((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-[13px] font-bold text-muted-foreground">
            정산에서 제외된 건 {excluded.length}
            <ChevronDown className={`w-4 h-4 transition-transform ${showExcluded ? "rotate-180" : ""}`} />
          </button>
          {showExcluded && (
            <div className="divide-y divide-border border-t border-border px-4">
              {excluded.map((r) => (
                <RowLine key={r.confirmationId} r={r} onSave={saveItem} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RowLine({ r, onSave }: { r: SettlementRow; onSave: (r: SettlementRow, p: { included?: boolean; amount?: number | null }) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(r.amount != null ? String(r.amount) : "");
  const d = new Date(r.eventDate + "T00:00:00");
  return (
    <div className="py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={r.included}
          onChange={(e) => onSave(r, { included: e.target.checked })}
          className="w-4 h-4 accent-amber-500 shrink-0"
          aria-label="정산 포함"
        />
        <span className="text-[13px] font-bold tabular-nums shrink-0">{d.getMonth() + 1}/{d.getDate()}</span>
        <span className="text-[13px] truncate min-w-0 flex-1">
          {r.guestName ?? "-"} <span className="text-muted-foreground">· {r.refNo} · {r.requestType === "foreign" ? "외국인" : "한국"}</span>
          {!r.included && <span className="text-muted-foreground"> · {r.clubName} · {r.mdName}</span>}
        </span>
        <button type="button" onClick={() => setEditing((v) => !v)} className="shrink-0 text-[13px] font-black tabular-nums hover:text-brand-amber">
          {r.amount != null ? won(r.amount) : "금액 없음"}
        </button>
      </div>
      <Signals r={r} />
      {r.amountOverridden && r.baseAmount !== r.amount && (
        <p className="pl-6 text-[11px] text-muted-foreground">확정서 금액 {r.baseAmount != null ? won(r.baseAmount) : "없음"} → 정산 금액으로 수정됨</p>
      )}
      {editing && (
        <div className="pl-6 flex gap-2">
          <input
            value={val ? Number(val).toLocaleString("ko-KR") : ""}
            onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="정산 금액(원)"
            className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-background border border-border text-[13px] tabular-nums outline-none focus:border-amber-500"
          />
          <button type="button" onClick={() => { onSave(r, { amount: val ? Number(val) : null }); setEditing(false); }} className="h-9 px-3 rounded-lg bg-white text-black text-[12px] font-black">저장</button>
          {r.amountOverridden && (
            <button type="button" onClick={() => { onSave(r, { amount: null }); setVal(r.baseAmount != null ? String(r.baseAmount) : ""); setEditing(false); }} className="h-9 px-3 rounded-lg bg-muted text-[12px] font-bold">
              확정서 금액으로
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// 방문 근거 칩(2026-10-04) — 확정됐다고 실제로 갔다는 보장은 없다. 확정서 열람, 손님이 누른 "10분 전"·"도착",
// MD가 누른 "입장 확인"을 건마다 보여주고, 아무 신호도 없으면 경고한다.
function Signals({ r }: { r: SettlementRow }) {
  const s = r.signals;
  const t = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const chips: { label: string; at: string | null }[] = [
    { label: "확정서 열람", at: s.viewedAt },
    { label: "10분 전", at: s.soonAt },
    { label: "도착", at: s.arrivedAt },
    { label: "입장 확인(MD)", at: s.checkedInAt },
  ];
  const none = chips.every((c) => !c.at);
  return (
    <div className="pl-6 flex flex-wrap items-center gap-1">
      {chips.map((c) => (
        <span
          key={c.label}
          title={c.at ? t(c.at) ?? "" : "기록 없음"}
          className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold border ${c.at ? "border-green-500/40 text-money bg-green-500/[0.06]" : "border-border text-muted-foreground"}`}
        >
          {c.at ? "✓" : "–"} {c.label}
        </span>
      ))}
      {none &&
        (s.beforeTracking && !s.notifiedAt ? (
          <span className="text-[10.5px] font-bold text-muted-foreground">기록 없음(10/2 이전 확정 — DM 등으로 직접 확인)</span>
        ) : (
          <span className="text-[10.5px] font-bold text-red-400">접촉 신호 없음{s.notifiedAt ? "" : " · 확정서 미발송"}</span>
        ))}
    </div>
  );
}
