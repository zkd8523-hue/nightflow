// MD 본인 정산 화면(2026-11-01) — /md/settlements(로그인 필수). 정산 문자 링크(/booking/settle)도 여기로 온다.
// 숫자는 관리자 정산 화면·정산 문자와 같은 계산(loadMdSettlement → settlements.ts)이라 셋이 항상 같다.
//
// 보여주지 않는 것:
//  · 운영자 메모(settlement_items.note) — 내부 메모라 MD에게 그대로 보이면 안 된다. 제외 건은 "정산 제외"만
//  · 손님 연락처 — 예약 확인서와 같은 원칙(문제가 생기면 운영자를 거친다)

import Link from "next/link";
import { ChevronLeft, Check, Phone, Receipt } from "lucide-react";
import { CopyTextButton } from "@/components/md/CopyTextButton";
import { SETTLEMENT_BANK as BANK, feeOf, type MdSettlementMonth, type MdSettlementStatus } from "@/lib/booking/settlements";

const OPS_PHONE = { tel: "01022051052", label: "010-2205-1052" };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const monthNum = (month: string) => Number(month.slice(5, 7));
const DOW = "일월화수목금토";
const dayLabel = (ymd: string) =>
  `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))} (${DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()]})`;
const longDate = (ymd: string) =>
  `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일 (${DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()]})`;
const rateLabel = (rate: number) => `${+(rate * 100).toFixed(2)}%`;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const kstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

const TAB_LABEL: Record<MdSettlementStatus, string> = {
  paid: "입금 완료",
  due: "입금 전",
  checking: "확인 중",
  open: "진행 중",
  none: "중개료 없음",
};

/** 대시보드 카드·탭이 같이 쓰는 D-day 배지 문구 */
export function dueBadge(due: string, todayKst: string): { label: string; late: boolean } {
  const d = daysBetween(todayKst, due);
  if (d < 0) return { label: "기한 지남", late: true };
  if (d === 0) return { label: "오늘까지", late: false };
  return { label: `D-${d}`, late: false };
}

export function MdSettlementView({
  months,
  selected,
  basePath,
  backHref,
  todayKst,
}: {
  months: MdSettlementMonth[];
  selected: string | null;
  /** 월 탭 링크의 앞부분 */
  basePath: string;
  backHref?: string;
  todayKst: string;
}) {
  const tabs = months.slice(-6);
  const cur = months.find((m) => m.month === selected) ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-lg mx-auto pb-24">
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-border">
          {backHref && (
            <Link href={backHref} aria-label="대시보드로" className="-ml-2 w-11 h-11 flex items-center justify-center">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}
          <h1 className="text-[18px] font-black">정산</h1>
        </div>

        <div className="px-4 pt-4 space-y-4">
          {tabs.length > 0 && (
            <nav aria-label="정산 월" className="flex gap-2">
              {tabs.map((m) => {
                const on = m.month === cur?.month;
                return (
                  <Link
                    key={m.month}
                    href={`${basePath}?month=${m.month}`}
                    aria-current={on ? "page" : undefined}
                    replace
                    scroll={false}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-xl ${
                      on ? "bg-inverse text-inverse-foreground" : "bg-card text-muted-foreground"
                    }`}
                  >
                    <span className={`text-[14px] ${on ? "font-black" : "font-bold"}`}>{monthNum(m.month)}월</span>
                    <span className={`text-[11px] ${on ? "font-bold" : ""}`}>{TAB_LABEL[m.status]}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          {!cur ? (
            <div className="bg-card border border-dashed border-border rounded-2xl px-4 py-8 text-center">
              <p className="text-[14px] font-bold">아직 정산할 예약이 없어요</p>
              <p className="text-[12px] text-muted-foreground mt-1 break-keep">
                나플로 받은 예약이 확정되면 방문한 달 기준으로 여기에 쌓여요.
              </p>
            </div>
          ) : (
            <>
              <SummaryCard m={cur} todayKst={todayKst} />
              <RowList m={cur} />
            </>
          )}

          <a
            href={`tel:${OPS_PHONE.tel}`}
            className="flex items-center justify-center gap-1.5 h-12 rounded-2xl border border-border text-[14px] font-bold"
          >
            <Phone className="w-4 h-4 text-muted-foreground" />
            금액이 다르면 담당자에게 연락주세요
          </a>
          <p className="text-[12px] text-muted-foreground leading-relaxed text-center break-keep">
            정산은 방문일이 속한 달 기준이고, 다음 달 10일까지 입금합니다.
            <br />
            매월 7일·10일에 문자로도 안내드려요.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ m, todayKst }: { m: MdSettlementMonth; todayKst: string }) {
  const n = monthNum(m.month);
  const breakdown = (
    <div className="space-y-1.5 text-[13px] text-muted-foreground tabular-nums">
      <div className="flex justify-between">
        <span>예약받은 금액 ({m.count}건)</span>
        <span className="text-foreground">{won(m.total)}</span>
      </div>
      <div className="flex justify-between">
        <span>중개료율</span>
        <span className="text-foreground">{rateLabel(m.rate)}</span>
      </div>
      {m.status === "paid" && m.paidAt ? (
        <div className="flex justify-between">
          <span>입금 확인</span>
          <span className="text-foreground">{longDate(kstDate(m.paidAt))}</span>
        </div>
      ) : m.status !== "open" && m.status !== "none" ? (
        <div className="flex justify-between">
          <span>입금 기한</span>
          <span className="text-foreground">{longDate(m.due)}</span>
        </div>
      ) : null}
    </div>
  );

  if (m.status === "due") {
    const b = dueBadge(m.due, todayKst);
    return (
      <section className="bg-card border border-amber-500 rounded-[20px] p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-muted-foreground">{n}월 보내주실 중개료</span>
          <span className={`text-[12px] font-black px-2.5 py-1 rounded-full ${b.late ? "bg-red-500 text-white" : "bg-amber-500 text-black"}`}>
            입금 전 · {b.label}
          </span>
        </div>
        <p className="text-[36px] font-black tracking-tight tabular-nums leading-none">{won(m.fee)}</p>
        {breakdown}
        <div className="h-px bg-border" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">입금 계좌</p>
            <p className="text-[14px] font-bold tabular-nums break-keep">
              {BANK.name} {BANK.number}
            </p>
            <p className="text-[12px] text-muted-foreground">예금주 {BANK.holder}</p>
          </div>
          <CopyTextButton text={BANK.number} label="계좌 복사" />
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed break-keep">
          입금이 확인되면 이 화면이 &apos;입금 완료&apos;로 바뀝니다.
        </p>
      </section>
    );
  }

  const head =
    m.status === "paid"
      ? { title: `${n}월 중개료`, badge: "입금 완료", badgeCls: "bg-green-500 text-black", amountCls: "text-muted-foreground" }
      : m.status === "checking"
        ? { title: `${n}월 중개료 (예상)`, badge: "금액 확인 중", badgeCls: "bg-muted text-foreground", amountCls: "text-foreground" }
        : m.status === "open"
          ? { title: `${n}월 지금까지 예상 중개료`, badge: "진행 중", badgeCls: "bg-muted text-foreground", amountCls: "text-foreground" }
          : { title: `${n}월 중개료`, badge: "중개료 없음", badgeCls: "bg-muted text-foreground", amountCls: "text-muted-foreground" };
  const note =
    m.status === "checking"
      ? "운영자가 금액을 확인하고 있어요. 확정되면 문자로 안내드리고, 그때 입금 계좌가 이 화면에 떠요."
      : m.status === "open"
        ? `${n}월 정산은 ${n === 12 ? 1 : n + 1}월 초에 안내드려요. 그 전까지 금액이 바뀔 수 있어요.`
        : m.status === "none"
          ? "이 달은 중개료가 붙는 예약이 없어요."
          : null;

  return (
    <section className="bg-card border border-border rounded-[20px] p-5 space-y-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{head.title}</span>
        <span className={`inline-flex items-center gap-1 text-[12px] font-black px-2.5 py-1 rounded-full ${head.badgeCls}`}>
          {m.status === "paid" && <Check className="w-3 h-3" strokeWidth={3} />}
          {head.badge}
        </span>
      </div>
      <p className={`text-[36px] font-black tracking-tight tabular-nums leading-none ${head.amountCls}`}>{won(m.fee)}</p>
      {breakdown}
      {note && <p className="text-[12px] text-muted-foreground leading-relaxed break-keep">{note}</p>}
    </section>
  );
}

function RowList({ m }: { m: MdSettlementMonth }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[16px] font-black flex items-center gap-1.5">
          <Receipt className="w-4 h-4" />
          {monthNum(m.month)}월에 받은 예약
        </h2>
        <span className="text-[12px] text-muted-foreground">방문일 기준 · {m.rows.length}건</span>
      </div>
      {m.rows.map((r) =>
        r.included ? (
          <div key={r.confirmationId} className="bg-card rounded-2xl px-4 py-3.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-bold truncate">
                {dayLabel(r.eventDate)} · {r.clubName}
              </span>
              <span className="text-[14px] font-black text-money tabular-nums shrink-0">{won(r.amount ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
              <span className="truncate">
                {[r.guestName, r.requestType === "foreign" ? "외국인" : "국내"].filter(Boolean).join(" · ")}
              </span>
              <span className="tabular-nums shrink-0">중개료 {won(feeOf(r.amount ?? 0, m.rate))}</span>
            </div>
            {r.amountOverridden && r.baseAmount != null && r.baseAmount !== r.amount && (
              <span className="inline-block text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                금액 조정됨 · 확인서 {won(r.baseAmount)} → 실제 {won(r.amount ?? 0)}
              </span>
            )}
          </div>
        ) : (
          <div key={r.confirmationId} className="border border-dashed border-border rounded-2xl px-4 py-3.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-bold text-muted-foreground truncate">
                {dayLabel(r.eventDate)} · {r.clubName}
              </span>
              <span className="text-[14px] font-bold text-muted-foreground line-through tabular-nums shrink-0">
                {won(r.amount ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
              <span className="truncate">
                {[r.guestName, r.requestType === "foreign" ? "외국인" : "국내"].filter(Boolean).join(" · ")}
              </span>
              <span className="shrink-0">{r.requestType === "korean" ? "국내 예약 · 중개료 없음" : "정산 제외"}</span>
            </div>
          </div>
        ),
      )}
    </section>
  );
}

/** 처음 열 때 고를 달: 입금 전 → 확인 중 → 가장 최근 달. */
export function defaultSettlementMonth(months: MdSettlementMonth[]): string | null {
  return (
    months.find((m) => m.status === "due")?.month ??
    months.find((m) => m.status === "checking")?.month ??
    months.at(-1)?.month ??
    null
  );
}
