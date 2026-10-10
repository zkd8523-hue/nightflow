// MD 정산(수수료) 계산 — /admin/settlements 화면과 발송 API가 같은 숫자를 쓰도록 한 곳에서 계산한다.
//
// 규칙(운영자 결정 2026-10-04):
//  · 대상: 확정서(booking_confirmations)가 있고 원본 요청이 살아 있는(삭제·취소 아님) 건.
//    테스트 계정 MD·테스트 클럽(is_test) 건은 제외
//  · 기본 포함: 외국인 확정은 포함, 한국 확정은 제외 — settlement_items 행으로 건별로 바꿀 수 있다
//  · 정산월: 방문일(event_date) 기준 YYYY-MM
//  · 금액: settlement_items.amount가 있으면 그것, 없으면 확정서 total_price
//  · 수수료: 금액 × 그 달 수수료율(기본 5%, settlement_month_rates로 달별 변경 — 2026-09는 4%),
//    원 단위 반올림. 지급기한: 익월 10일. 정산 완료는 settlement_payments(월·MD)
//  · 7일·10일 자동 리마인드: 아래 planSettlementReminders(2026-10-10)
// Migration 682(settlement_items·settlement_notices)·685(수수료율·정산 완료) 기준.

import type { SupabaseClient } from "@supabase/supabase-js";

export const SETTLEMENT_FEE_RATE = 0.05;
export const SETTLEMENT_DUE_DAY = 10;

export type SettlementRow = {
  confirmationId: string;
  refNo: string;
  requestType: "foreign" | "korean";
  eventDate: string;
  month: string;
  clubName: string;
  mdId: string | null;
  mdName: string;
  guestName: string | null;
  baseAmount: number | null;
  amount: number | null;
  amountOverridden: boolean;
  included: boolean;
  note: string | null;
  /** 실제 방문했는지 판단 근거(2026-10-04) — 예약 확정 ≠ 방문. 확정서 열람·도착 신호·MD 입장 확인. */
  signals: {
    notifiedAt: string | null;
    viewedAt: string | null;
    soonAt: string | null;
    arrivedAt: string | null;
    checkedInAt: string | null;
    /** 발송·열람 기록이 생기기 전(Migration 680 배포 2026-10-02 00:18 KST) 확정 — 신호가 없어도 "안 했다"가 아니다. */
    beforeTracking: boolean;
  };
};

export type SettlementNotice = {
  month: string;
  md_id: string;
  channel: string;
  sent_at: string;
  fee_amount: number;
  /** NULL = 7·10일 자동 리마인드(2026-10-10). */
  sent_by?: string | null;
};

export type SettlementPayment = { month: string; md_id: string; paid_at: string };

/** 월별 수수료율 — settlement_month_rates에 없는 달은 기본 5%(2026-09는 4%, Migration 685). */
export async function loadMonthRates(sb: SupabaseClient): Promise<Record<string, number>> {
  const { data } = await sb.from("settlement_month_rates").select("month, rate");
  return Object.fromEntries((data ?? []).map((r) => [r.month as string, Number(r.rate)]));
}
export function rateOf(rates: Record<string, number>, month: string): number {
  return rates[month] ?? SETTLEMENT_FEE_RATE;
}

export function feeOf(amount: number, rate: number = SETTLEMENT_FEE_RATE): number {
  return Math.round(amount * rate);
}

/** "2026-10" → "2026-11-10" (익월 지급기한). */
export function dueDateOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, SETTLEMENT_DUE_DAY));
  return d.toISOString().slice(0, 10);
}

export async function loadSettlementRows(sb: SupabaseClient): Promise<SettlementRow[]> {
  const { data: confs } = await sb
    .from("booking_confirmations")
    .select("id, ref_no, request_type, request_id, club_id, total_price, created_at, guest_notified_at, guest_viewed_at, md_checked_in_at");
  const list = confs ?? [];
  if (list.length === 0) return [];

  const idsOf = (t: string) => list.filter((c) => c.request_type === t).map((c) => c.request_id as string);
  const pad = (a: string[]) => (a.length ? a : ["00000000-0000-0000-0000-000000000000"]);
  const [fr, kr, items, pings] = await Promise.all([
    sb.from("foreign_requests").select("id, event_date, status, assigned_md_id, guest_name").in("id", pad(idsOf("foreign"))),
    sb.from("korean_booking_requests").select("id, event_date, status, assigned_md_id, guest_name").in("id", pad(idsOf("korean"))),
    sb.from("settlement_items").select("confirmation_id, included, amount, note"),
    sb.from("arrival_pings").select("request_type, request_id, kind, created_at").in("request_id", pad(list.map((c) => c.request_id as string))),
  ]);
  // 같은 종류는 5분 쿨다운 후 재발송될 수 있어 가장 이른 시각만 쓴다.
  const pingAt = new Map<string, string>();
  for (const p of pings.data ?? []) {
    const k = `${p.request_type}|${p.request_id}|${p.kind}`;
    const prev = pingAt.get(k);
    if (!prev || (p.created_at as string) < prev) pingAt.set(k, p.created_at as string);
  }
  type Req = { id: string; event_date: string | null; status: string | null; assigned_md_id: string | null; guest_name: string | null };
  const reqById = new Map<string, Req>();
  for (const r of [...((fr.data ?? []) as Req[]), ...((kr.data ?? []) as Req[])]) reqById.set(r.id, r);
  const itemById = new Map((items.data ?? []).map((i) => [i.confirmation_id as string, i]));

  const live = list.filter((c) => {
    const r = reqById.get(c.request_id as string);
    return r && r.event_date && r.status !== "cancelled";
  });
  const clubIds = [...new Set(live.map((c) => c.club_id).filter(Boolean))] as string[];
  const mdIds = [...new Set(live.map((c) => reqById.get(c.request_id as string)?.assigned_md_id).filter(Boolean))] as string[];
  const [clubs, mds] = await Promise.all([
    clubIds.length ? sb.from("clubs").select("id, name, is_test").in("id", clubIds) : Promise.resolve({ data: [] as { id: string; name: string; is_test: boolean | null }[] }),
    mdIds.length ? sb.from("users").select("id, display_name, is_test").in("id", mdIds) : Promise.resolve({ data: [] as { id: string; display_name: string | null; is_test: boolean | null }[] }),
  ]);
  // 테스트 계정 MD·테스트 클럽 건은 정산에서 아예 뺀다(is_test 기준 — project_test_data_hiding).
  const testClub = new Set((clubs.data ?? []).filter((c) => c.is_test).map((c) => c.id));
  const testMd = new Set((mds.data ?? []).filter((m) => m.is_test).map((m) => m.id));
  const clubName = new Map((clubs.data ?? []).map((c) => [c.id, c.name as string]));
  const mdName = new Map((mds.data ?? []).map((m) => [m.id, (m.display_name as string | null) ?? "(이름없음)"]));

  return live
    .filter((c) => {
      const md = reqById.get(c.request_id as string)?.assigned_md_id;
      return !(c.club_id && testClub.has(c.club_id as string)) && !(md && testMd.has(md));
    })
    .map((c): SettlementRow => {
      const r = reqById.get(c.request_id as string)!;
      const item = itemById.get(c.id as string);
      const type = c.request_type === "korean" ? "korean" : "foreign";
      const base = (c.total_price as number | null) ?? null;
      const override = (item?.amount as number | null | undefined) ?? null;
      return {
        confirmationId: c.id as string,
        refNo: c.ref_no as string,
        requestType: type,
        eventDate: r.event_date!,
        month: r.event_date!.slice(0, 7),
        clubName: (c.club_id && clubName.get(c.club_id as string)) || "클럽 미정",
        mdId: r.assigned_md_id,
        mdName: r.assigned_md_id ? mdName.get(r.assigned_md_id) ?? "(이름없음)" : "담당 MD 없음",
        guestName: r.guest_name,
        baseAmount: base,
        amount: override ?? base,
        amountOverridden: override != null,
        included: item ? !!item.included : type === "foreign",
        note: (item?.note as string | null | undefined) ?? null,
        signals: {
          notifiedAt: (c.guest_notified_at as string | null) ?? null,
          viewedAt: (c.guest_viewed_at as string | null) ?? null,
          soonAt: pingAt.get(`${type}|${c.request_id}|soon`) ?? null,
          arrivedAt: pingAt.get(`${type}|${c.request_id}|arrived`) ?? null,
          checkedInAt: (c.md_checked_in_at as string | null) ?? null,
          beforeTracking: (c.created_at as string) < "2026-10-01T15:18:00Z",
        },
      };
    })
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

/** 정산 입금 계좌 — MD 문자에 그대로 들어간다(운영자 제공 2026-10-10). */
export const SETTLEMENT_BANK_ACCOUNT = "카카오뱅크 3333-37-4374607 (김민기(매드다윗))";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const mmdd = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const rateLabel = (rate: number) => `${+(rate * 100).toFixed(2)}%`;

/** MD 안내 문구 기본값 — 운영자가 화면에서 고친 뒤 보낸다. MD에게는 "수수료" 대신 "중개료"(운영자 결정 2026-10-10). */
export function defaultSettlementMessage(month: string, clubName: string, rows: SettlementRow[], rate: number = SETTLEMENT_FEE_RATE): string {
  const [, m] = month.split("-");
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const due = dueDateOf(month);
  const lines = rows.map((r) => `· ${mmdd(r.eventDate)} ${r.guestName ?? ""} ${won(r.amount ?? 0)}`.replace(/\s+/g, " "));
  return [
    `[나이트플로우] ${Number(m)}월 정산 안내`,
    `${clubName} · ${rows.length}건 · 확정 ${won(total)}`,
    ...lines,
    `중개료(${rateLabel(rate)}) ${won(feeOf(total, rate))}`,
    `${Number(due.slice(5, 7))}월 ${Number(due.slice(8, 10))}일까지 입금 부탁드립니다.`,
    `입금: ${SETTLEMENT_BANK_ACCOUNT}`,
    "",
    `${Number(m)}월 한 달 고생 많으셨습니다.`,
  ].join("\n");
}

// ── 자동 리마인드(2026-10-10) ────────────────────────────────────────────
// 매월 7일(due_soon)·10일(due_today) 10:00 KST에 /api/cron/settlement-reminders가 지난달분을 MD에게 문자로 보낸다.
//  · 운영자가 이 달 안내(①)를 직접 보낸 MD만 — 금액은 사람이 확인한 뒤에만 자동으로 나간다
//  · 정산 완료(settlement_payments) 체크된 MD는 건너뛴다
//  · 자동 발송은 settlement_notices.sent_by = NULL로 남는다. 같은 날 자동 발송이 이미 있으면 건너뛴다(재실행 안전)
//  · 13일 입금 미확인 알림은 아직 없다(운영자에게 푸시만 하기로 함 — 미구현)

export type SettlementReminderKind = "due_soon" | "due_today";

export type SettlementReminder = {
  mdId: string;
  mdName: string;
  month: string;
  rows: SettlementRow[];
  total: number;
  fee: number;
  message: string;
};

export function reminderSettlementMessage(kind: SettlementReminderKind, month: string, rows: SettlementRow[], rate: number): string {
  const m = Number(month.slice(5, 7));
  const due = dueDateOf(month);
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const fee = feeOf(total, rate);
  if (kind === "due_soon") {
    return [
      `[나이트플로우] ${m}월 정산 미리 안내`,
      `${m}월 중개료 ${won(fee)} 입금 기한이 ${Number(due.slice(5, 7))}월 ${Number(due.slice(8, 10))}일이라 미리 알려드려요.`,
      `입금: ${SETTLEMENT_BANK_ACCOUNT}`,
      "이미 보내셨다면 넘기셔도 됩니다.",
      "",
      "지난달 고생 많으셨습니다.",
    ].join("\n");
  }
  return [
    `[나이트플로우] ${m}월 정산 기한 안내`,
    `오늘(${mmdd(due)})이 ${m}월 중개료 입금 기한입니다.`,
    ...rows.map((r) => `· ${mmdd(r.eventDate)} ${won(r.amount ?? 0)}`),
    `중개료(${rateLabel(rate)}) ${won(fee)}`,
    `입금: ${SETTLEMENT_BANK_ACCOUNT}`,
    "보내셨다면 무시해주세요.",
    "",
    `${m}월에도 함께해주셔서 감사합니다.`,
  ].join("\n");
}

/** 오늘(KST, YYYY-MM-DD) 보낼 리마인드 목록과 건너뛴 이유. 발송은 하지 않는다. */
export async function planSettlementReminders(
  sb: SupabaseClient,
  kind: SettlementReminderKind,
  month: string,
  todayKst: string,
): Promise<{ send: SettlementReminder[]; skipped: { mdId: string; mdName: string; reason: string }[] }> {
  const [rows, rates, notices, payments] = await Promise.all([
    loadSettlementRows(sb),
    loadMonthRates(sb),
    sb.from("settlement_notices").select("md_id, sent_by, sent_at").eq("month", month),
    sb.from("settlement_payments").select("md_id").eq("month", month),
  ]);
  const rate = rateOf(rates, month);
  const paid = new Set((payments.data ?? []).map((p) => p.md_id as string));
  const kstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const manual = new Set((notices.data ?? []).filter((n) => n.sent_by).map((n) => n.md_id as string));
  const autoToday = new Set(
    (notices.data ?? []).filter((n) => !n.sent_by && kstDate(n.sent_at as string) === todayKst).map((n) => n.md_id as string),
  );

  const byMd = new Map<string, SettlementRow[]>();
  for (const r of rows) {
    if (r.month !== month || !r.included || !r.mdId) continue;
    byMd.set(r.mdId, [...(byMd.get(r.mdId) ?? []), r]);
  }

  const send: SettlementReminder[] = [];
  const skipped: { mdId: string; mdName: string; reason: string }[] = [];
  for (const [mdId, list] of byMd) {
    const mdName = list[0].mdName;
    const total = list.reduce((s, r) => s + (r.amount ?? 0), 0);
    const fee = feeOf(total, rate);
    const reason = paid.has(mdId) ? "정산 완료"
      : fee <= 0 ? "중개료 0원"
      : !manual.has(mdId) ? "운영자 안내(①) 미발송"
      : autoToday.has(mdId) ? "오늘 이미 자동 발송"
      : null;
    if (reason) {
      skipped.push({ mdId, mdName, reason });
      continue;
    }
    send.push({ mdId, mdName, month, rows: list, total, fee, message: reminderSettlementMessage(kind, month, list, rate) });
  }
  return { send, skipped };
}
