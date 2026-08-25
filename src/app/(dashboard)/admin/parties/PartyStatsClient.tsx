"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import Link from "next/link";
import { Download, PartyPopper, UserPlus, Handshake, AlertTriangle } from "lucide-react";
import type { PartyOverview, PartyWeeklyRow, PartyByClubRow, PartyOfferRow } from "./types";

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

function FunnelBar({
  label,
  value,
  max,
  pctOfPrev,
  color,
  note,
}: {
  label: string;
  value: number | null;
  max: number;
  pctOfPrev?: number | null;
  color: string;
  note?: string;
}) {
  // value=null → 미계측 단계. 0으로 위장하지 않고 명시한다.
  if (value === null) {
    return (
      <div className="opacity-50">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm font-bold text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">미계측</span>
        </div>
        <div className="h-3 bg-muted/20 rounded-full border border-dashed border-border" />
        {note && <p className="text-[11px] text-muted-foreground mt-1">{note}</p>}
      </div>
    );
  }
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-bold text-foreground">{label}</span>
        <span className="text-sm text-foreground">
          <strong className="font-black">{value.toLocaleString()}</strong>
          {pctOfPrev != null && (
            <span className="text-muted-foreground text-xs ml-2">전 단계의 {pctOfPrev}%</span>
          )}
        </span>
      </div>
      <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function PartyStatsClient({
  overview,
  weekly,
  byClub,
  offers,
}: {
  overview: PartyOverview | null;
  weekly: PartyWeeklyRow[];
  byClub: PartyByClubRow[];
  offers: PartyOfferRow[];
}) {
  const [onlyWaste, setOnlyWaste] = useState(false);

  const clubRows = useMemo(
    () => (onlyWaste ? byClub.filter((r) => (r.with_joiner ?? 0) === 0) : byClub),
    [byClub, onlyWaste]
  );

  const maxWeekly = useMemo(
    () => Math.max(1, ...weekly.map((w) => w.published)),
    [weekly]
  );

  const downloadCsv = () => {
    const header = [
      "club_id", "club_name", "area", "published", "auto_published",
      "with_joiner", "total_joiners", "matched", "join_rate", "avg_budget",
      "first_published_at", "last_published_at",
    ];
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const body = clubRows.map((r) =>
      [
        r.club_id, r.club_name, r.area, r.published, r.auto_published,
        r.with_joiner, r.total_joiners, r.matched, r.join_rate, r.avg_budget,
        r.first_published_at, r.last_published_at,
      ].map(escape).join(",")
    );
    const csv = "﻿" + [header.join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `party_by_club_${dayjs().format("YYYYMMDD_HHmm")}_${clubRows.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!overview) {
    return <p className="text-muted-foreground">데이터가 없습니다.</p>;
  }

  const maxFunnel = overview.total_parties;

  return (
    <div className="space-y-10">
      {/* KPI */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="발행"
          value={overview.total_parties.toLocaleString()}
          sub={`자동발행 ${overview.auto_published} · MD ${overview.md_hosted}`}
          icon={<PartyPopper className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="참여자 붙음"
          value={`${overview.parties_with_joiner}`}
          sub={`참여율 ${overview.join_rate ?? 0}%`}
          tone={(overview.join_rate ?? 0) >= 20 ? "good" : "warn"}
          icon={<UserPlus className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="성사"
          value={`${overview.matched_count}`}
          sub={`성사율 ${overview.match_rate ?? 0}%`}
          tone={overview.matched_count > 0 ? "good" : "warn"}
          icon={<Handshake className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="빈 채로 소멸"
          value={`${overview.parties_empty}`}
          sub={`소멸률 ${overview.churn_rate ?? 0}%`}
          tone={overview.parties_empty > overview.parties_with_joiner ? "warn" : "default"}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
        />
      </section>

      {/* 퍼널 */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-black text-lg">전환 퍼널</h2>
        <FunnelBar
          label="발행"
          value={overview.total_parties}
          max={maxFunnel}
          color="bg-muted-foreground/50"
        />
        <FunnelBar
          label="노출 (홈 파티 섹션)"
          value={null}
          max={maxFunnel}
          color=""
          note="party_section_view 이벤트 미계측 — Phase 2에서 추가"
        />
        <FunnelBar
          label="카드 클릭"
          value={null}
          max={maxFunnel}
          color=""
          note="party_card_click 이벤트 미계측 — Phase 2에서 추가"
        />
        <FunnelBar
          label="첫 참여자 붙음"
          value={overview.parties_with_joiner}
          max={maxFunnel}
          pctOfPrev={overview.join_rate}
          color="bg-amber-500"
        />
        <FunnelBar
          label="성사 (matched/accepted)"
          value={overview.matched_count}
          max={maxFunnel}
          pctOfPrev={
            overview.parties_with_joiner > 0
              ? Math.round((overview.matched_count / overview.parties_with_joiner) * 1000) / 10
              : null
          }
          color="bg-green-500"
        />
        <p className="text-xs text-muted-foreground pt-1">
          참여 판정은 puzzle_members 실측(방장 제외) 기준.
          진행중 {overview.open_count} · 선택중 {overview.selecting_count} ·
          취소 {overview.cancelled_count} · 만료 {overview.expired_count}.
        </p>
      </section>

      {/* 주차별 추세 */}
      {weekly.length > 0 && (
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-black text-lg mb-1">주차별 추세 (KST)</h2>
          <p className="text-xs text-muted-foreground mb-4">
            발행량이 튀는 주에 참여율이 어떻게 되는지 보세요.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="text-muted-foreground text-xs border-b border-border">
                  <th className="text-left font-bold py-2 pr-3">주 시작</th>
                  <th className="text-left font-bold py-2 pr-3 w-1/3">발행량</th>
                  <th className="text-right font-bold py-2 pr-3">발행</th>
                  <th className="text-right font-bold py-2 pr-3">자동</th>
                  <th className="text-right font-bold py-2 pr-3">참여붙음</th>
                  <th className="text-right font-bold py-2 pr-3">참여율</th>
                  <th className="text-right font-bold py-2">성사</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((w) => (
                  <tr key={w.week_start} className="border-b border-border/50">
                    <td className="py-2.5 pr-3 text-muted-foreground text-xs">
                      {dayjs(w.week_start).format("MM/DD")}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500/70 rounded-full"
                          style={{ width: `${(w.published / maxWeekly) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold">{w.published}</td>
                    <td className="py-2.5 pr-3 text-right text-muted-foreground">
                      {w.auto_published}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold">{w.with_joiner}</td>
                    <td
                      className={`py-2.5 pr-3 text-right font-bold ${
                        (w.join_rate ?? 0) >= 20 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {w.join_rate ?? 0}%
                    </td>
                    <td className="py-2.5 text-right">{w.matched}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 클럽별 */}
      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className="font-black text-lg">클럽별 ({clubRows.length})</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              참여 0건 클럽 = 자동발행이 낭비되는 곳
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyWaste((v) => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                onlyWaste
                  ? "bg-red-500 text-white border-red-500"
                  : "bg-card text-muted-foreground border-border"
              }`}
            >
              참여 0건만
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
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-muted-foreground text-xs border-b border-border">
                <th className="text-left font-bold py-2 pr-3">클럽</th>
                <th className="text-left font-bold py-2 pr-3">지역</th>
                <th className="text-right font-bold py-2 pr-3">발행</th>
                <th className="text-right font-bold py-2 pr-3">자동</th>
                <th className="text-right font-bold py-2 pr-3">참여붙음</th>
                <th className="text-right font-bold py-2 pr-3">참여율</th>
                <th className="text-right font-bold py-2 pr-3">성사</th>
                <th className="text-right font-bold py-2">평균예산</th>
              </tr>
            </thead>
            <tbody>
              {clubRows.map((r, i) => (
                <tr key={r.club_id ?? `noclub-${i}`} className="border-b border-border/50">
                  <td className="py-2.5 pr-3 font-bold">
                    {r.club_name ?? <span className="text-muted-foreground">클럽 미지정</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground text-xs">{r.area}</td>
                  <td className="py-2.5 pr-3 text-right font-bold">{r.published}</td>
                  <td className="py-2.5 pr-3 text-right text-muted-foreground">
                    {r.auto_published}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-bold">{r.with_joiner}</td>
                  <td
                    className={`py-2.5 pr-3 text-right font-bold ${
                      (r.join_rate ?? 0) > 0 ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    {r.join_rate ?? 0}%
                  </td>
                  <td className="py-2.5 pr-3 text-right">{r.matched}</td>
                  <td className="py-2.5 text-right text-muted-foreground text-xs">
                    {r.avg_budget ? `${Math.round(r.avg_budget / 10000)}만` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {clubRows.length === 0 && (
          <p className="text-muted-foreground text-sm py-6 text-center">데이터가 없습니다.</p>
        )}
      </section>

      {/* 오퍼 퍼널 */}
      {offers.length > 0 && (
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-black text-lg mb-1">MD 오퍼 응답 (주차별)</h2>
          <p className="text-xs text-muted-foreground mb-4">
            만료 비율이 높으면 유저가 오퍼를 안 보고 있다는 신호입니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-muted-foreground text-xs border-b border-border">
                  <th className="text-left font-bold py-2 pr-3">주 시작</th>
                  <th className="text-right font-bold py-2 pr-3">오퍼</th>
                  <th className="text-right font-bold py-2 pr-3">대기</th>
                  <th className="text-right font-bold py-2 pr-3">수락</th>
                  <th className="text-right font-bold py-2 pr-3">거절</th>
                  <th className="text-right font-bold py-2 pr-3">만료</th>
                  <th className="text-right font-bold py-2">만료율</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.week_start} className="border-b border-border/50">
                    <td className="py-2.5 pr-3 text-muted-foreground text-xs">
                      {dayjs(o.week_start).format("MM/DD")}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold">{o.offers}</td>
                    <td className="py-2.5 pr-3 text-right text-muted-foreground">{o.pending}</td>
                    <td className="py-2.5 pr-3 text-right text-green-500 font-bold">
                      {o.accepted}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted-foreground">{o.rejected}</td>
                    <td className="py-2.5 pr-3 text-right text-muted-foreground">{o.expired}</td>
                    <td
                      className={`py-2.5 text-right font-bold ${
                        (o.expire_rate ?? 0) >= 30 ? "text-red-500" : "text-muted-foreground"
                      }`}
                    >
                      {o.expire_rate ?? 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
