"use client";

import { Fragment, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Download, Ticket, Users, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import type {
  CouponOverview,
  CouponFunnelRow,
  CouponDailyRow,
  CouponClaimRow,
} from "./types";

const BENEFIT_LABEL: Record<string, string> = {
  free_entry: "무료입장",
  free_drink: "프리드링크",
  free_pass: "프리패스",
  liquor_set: "주류세트",
  table_discount: "테이블할인",
  etc: "기타",
};

const STATUS_LABEL: Record<string, string> = {
  active: "진행중",
  sold_out: "소진",
  cancelled: "취소됨",
  expired: "만료",
};

function StatCard({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn";
  icon?: React.ReactNode;
}) {
  const valueColor =
    tone === "good" ? "text-green-500" : tone === "warn" ? "text-red-500" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-bold mb-1.5">
        {icon}
        {label}
      </div>
      <div className={`text-3xl font-black ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

/** 퍼널 단계 바 — recharts 없이 CSS 폭으로 표현 */
function FunnelBar({
  label,
  value,
  max,
  pctOfPrev,
  color,
}: {
  label: string;
  value: number;
  max: number;
  pctOfPrev?: number | null;
  color: string;
}) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-bold text-foreground">{label}</span>
        <span className="text-sm text-foreground">
          <strong className="font-black">{value.toLocaleString()}</strong>
          {pctOfPrev != null && (
            <span className="text-muted-foreground text-xs ml-2">
              전 단계의 {pctOfPrev}%
            </span>
          )}
        </span>
      </div>
      <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function CouponStatsClient({
  overview,
  funnel,
  daily,
  claims,
}: {
  overview: CouponOverview | null;
  funnel: CouponFunnelRow[];
  daily: CouponDailyRow[];
  claims: CouponClaimRow[];
}) {
  const [onlyLive, setOnlyLive] = useState(false);
  const [openIssue, setOpenIssue] = useState<string | null>(null);

  // 발행물별 클레임 묶음 (행 펼침용)
  const claimsByIssue = useMemo(() => {
    const m = new Map<string, CouponClaimRow[]>();
    for (const c of claims) {
      const arr = m.get(c.issue_id);
      if (arr) arr.push(c);
      else m.set(c.issue_id, [c]);
    }
    return m;
  }, [claims]);

  const rows = useMemo(
    () => (onlyLive ? funnel.filter((r) => r.status === "active" || r.status === "sold_out") : funnel),
    [funnel, onlyLive]
  );

  const maxDaily = useMemo(
    () => Math.max(1, ...daily.map((d) => Math.max(d.claims, d.redeems, d.issues_created))),
    [daily]
  );

  const downloadCsv = () => {
    const header = [
      "issue_id", "title", "club", "area", "md", "benefit_type", "status",
      "total_count", "claims", "redeems", "claim_rate", "redeem_rate",
      "claim_span_hours", "redeem_fail_total", "created_at", "redeem_ends_at",
    ];
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const body = rows.map((r) =>
      [
        r.issue_id, r.title, r.club_name, r.club_area, r.md_name, r.benefit_type, r.status,
        r.total_count, r.claims, r.redeems, r.claim_rate, r.redeem_rate,
        r.claim_span_hours, r.redeem_fail_total, r.created_at, r.redeem_ends_at,
      ].map(escape).join(",")
    );
    const csv = "﻿" + [header.join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coupon_stats_${dayjs().format("YYYYMMDD_HHmm")}_${rows.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!overview) {
    return <p className="text-muted-foreground">데이터가 없습니다.</p>;
  }

  const claimPct =
    overview.total_claims > 0
      ? Math.round((overview.total_claims / Math.max(overview.total_claims, 1)) * 100)
      : 0;

  return (
    <div className="space-y-10">
      {/* KPI */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="발행"
          value={overview.total_issues.toLocaleString()}
          sub={`진행 ${overview.active_issues} · 취소 ${overview.cancelled_issues}`}
          icon={<Ticket className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="받음"
          value={overview.total_claims.toLocaleString()}
          sub={`받은 사람 ${overview.unique_claimers}명`}
          icon={<Users className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="현장 사용"
          value={overview.total_redeems.toLocaleString()}
          sub={`사용률 ${overview.redeem_rate ?? 0}%`}
          tone={(overview.redeem_rate ?? 0) >= 30 ? "good" : "warn"}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="아무도 안 받음"
          value={`${overview.zero_claim_issues}`}
          sub={`전체 ${overview.total_issues}건 중`}
          tone={overview.zero_claim_issues > 0 ? "warn" : "default"}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
        />
      </section>

      {/* 퍼널 */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-black text-lg">전환 퍼널</h2>
        <FunnelBar
          label="발행"
          value={overview.total_issues}
          max={Math.max(overview.total_issues, overview.total_claims)}
          color="bg-muted-foreground/50"
        />
        <FunnelBar
          label="받음 (claim)"
          value={overview.total_claims}
          max={Math.max(overview.total_issues, overview.total_claims)}
          pctOfPrev={claimPct}
          color="bg-amber-500"
        />
        <FunnelBar
          label="현장 사용 (redeem)"
          value={overview.total_redeems}
          max={Math.max(overview.total_issues, overview.total_claims)}
          pctOfPrev={overview.redeem_rate}
          color="bg-green-500"
        />
        <p className="text-xs text-muted-foreground pt-1">
          노출 → 클릭 단계는 아직 계측되지 않아 표시하지 않습니다 (Phase 2).
          회수 {overview.revoked_claims}건 · 미사용 만료 {overview.expired_claims}건.
        </p>
      </section>

      {/* 일자별 */}
      {daily.length > 0 && (
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-black text-lg mb-4">일자별 추이 (KST)</h2>
          <div className="space-y-2">
            {daily.map((d) => (
              <div key={d.day} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-muted-foreground">
                  {dayjs(d.day).format("MM/DD (ddd)")}
                </span>
                <div className="flex-1 flex items-center gap-1">
                  <div
                    className="h-4 bg-amber-500 rounded-sm"
                    style={{ width: `${(d.claims / maxDaily) * 100}%` }}
                    title={`받음 ${d.claims}`}
                  />
                  <div
                    className="h-4 bg-green-500 rounded-sm"
                    style={{ width: `${(d.redeems / maxDaily) * 100}%` }}
                    title={`사용 ${d.redeems}`}
                  />
                </div>
                <span className="w-32 shrink-0 text-right text-muted-foreground">
                  발행 {d.issues_created} · 받음 {d.claims} · 사용 {d.redeems}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-sm inline-block" /> 받음
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-sm inline-block" /> 사용
            </span>
          </div>
        </section>
      )}

      {/* 발행물별 테이블 */}
      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-black text-lg">발행물별 ({rows.length})</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyLive((v) => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                onlyLive
                  ? "bg-amber-500 text-black border-amber-500"
                  : "bg-card text-muted-foreground border-border"
              }`}
            >
              살아있는 것만
            </button>
            <button
              onClick={downloadCsv}
              className="px-3 py-1.5 rounded-full text-xs font-bold border border-border text-foreground flex items-center gap-1.5 hover:opacity-80"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-muted-foreground text-xs border-b border-border">
                <th className="text-left font-bold py-2 pr-3">쿠폰</th>
                <th className="text-left font-bold py-2 pr-3">클럽</th>
                <th className="text-right font-bold py-2 pr-3">재고</th>
                <th className="text-right font-bold py-2 pr-3">받음</th>
                <th className="text-right font-bold py-2 pr-3">사용</th>
                <th className="text-right font-bold py-2 pr-3">사용률</th>
                <th className="text-right font-bold py-2 pr-3">소진시간</th>
                <th className="text-left font-bold py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const issueClaims = claimsByIssue.get(r.issue_id) ?? [];
                const isOpen = openIssue === r.issue_id;
                return (
                <Fragment key={r.issue_id}>
                <tr
                  onClick={() => setOpenIssue(isOpen ? null : r.issue_id)}
                  className="border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors"
                >
                  <td className="py-2.5 pr-3">
                    <div className="font-bold text-foreground line-clamp-1 flex items-center gap-1">
                      <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                      {r.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground pl-[18px]">
                      {BENEFIT_LABEL[r.benefit_type] ?? r.benefit_type}
                      {r.md_name ? ` · ${r.md_name}` : ""}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground text-xs">
                    {r.club_name ?? "-"}
                    {r.club_area ? ` (${r.club_area})` : ""}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-muted-foreground">
                    {r.total_count ?? "무제한"}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-bold">
                    {r.claims}
                    {r.claim_rate != null && (
                      <span className="text-[11px] text-muted-foreground ml-1">
                        {r.claim_rate}%
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-bold">{r.redeems}</td>
                  <td
                    className={`py-2.5 pr-3 text-right font-bold ${
                      (r.redeem_rate ?? 0) > 0 ? "text-green-500" : "text-muted-foreground"
                    }`}
                  >
                    {r.claims > 0 ? `${r.redeem_rate ?? 0}%` : "-"}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-muted-foreground text-xs">
                    {r.claim_span_hours != null ? `${r.claim_span_hours}h` : "-"}
                  </td>
                  <td className="py-2.5 text-xs">
                    <span
                      className={
                        r.status === "active"
                          ? "text-green-500"
                          : r.status === "cancelled"
                            ? "text-red-500"
                            : "text-muted-foreground"
                      }
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-border/50">
                    <td colSpan={8} className="bg-muted/10 px-3 py-3">
                      {issueClaims.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          아직 아무도 받지 않았습니다.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-muted-foreground mb-2">
                            받아간 사람 {issueClaims.length}명
                          </p>
                          {issueClaims.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate">
                                  {c.display_name ?? "알 수 없음"}
                                  {c.is_test && (
                                    <span className="ml-1 text-[10px] text-muted-foreground font-medium">
                                      (테스트)
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {dayjs(c.claimed_at).format("M/D HH:mm")} 받음
                                  {c.redeemed_at &&
                                    ` · ${dayjs(c.redeemed_at).format("M/D HH:mm")} 사용`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                {c.status === "redeemed" ? (
                                  <>
                                    <span className="text-[11px] font-black text-green-500">
                                      사용 완료
                                    </span>
                                    {/* 분쟁 시 유저 화면의 6자리 코드와 대조 */}
                                    {c.redeem_nonce && (
                                      <p className="text-[10px] text-muted-foreground font-mono">
                                        {c.redeem_nonce}
                                      </p>
                                    )}
                                  </>
                                ) : c.status === "revoked" ? (
                                  <span className="text-[11px] font-bold text-red-500">무효</span>
                                ) : c.status === "expired" ? (
                                  <span className="text-[11px] font-bold text-muted-foreground">
                                    만료
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold text-muted-foreground">
                                    미사용
                                  </span>
                                )}
                                {c.admin_voided_at && (
                                  <p className="text-[10px] text-red-500">admin 정정</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="text-muted-foreground text-sm py-6 text-center">데이터가 없습니다.</p>
        )}
      </section>
    </div>
  );
}
