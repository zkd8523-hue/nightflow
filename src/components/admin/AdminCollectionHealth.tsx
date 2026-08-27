"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, Link2Off, RefreshCw, CheckCircle2 } from "lucide-react";

/**
 * 인스타 수집 현황 — "조용한 실패"를 사람 눈이 아니라 숫자가 알려주게 한다.
 *
 * 설계 원칙 하나: 매일 울리는 경보는 경보가 아니다.
 *   전체 계정 100여 곳 중 대부분은 매일 "새 글 없음"이다(정상). 그걸 다 나열하면
 *   진짜 문제가 묻힌다. 그래서 조치가 필요한 것만 위로 올리고, 정상은 접어둔다.
 */

type Run = {
  id: string;
  started_at: string;
  duration_ms: number | null;
  sources_attempted: number;
  sources_ok: number;
  sources_failed: number;
  media_seen: number;
  media_new: number;
  auto_published: number;
  queued_for_review: number;
  not_timetable: number;
  no_date_dropped: number;
  parse_failures: number;
  events_saved: number;
};

type Account = {
  ig_handle: string;
  club_id: string | null;
  club_name: string | null;
  outcome: string;
  posts_received: number;
  posts_own: number;
  posts_processed: number;
  lineups_saved: number;
  no_date_dropped: number;
  detail: string | null;
  last_checked_at: string;
  last_lineup_at: string | null;
};

const OUTCOME: Record<string, { label: string; desc: string; tone: string; action: string | null }> = {
  restricted: {
    label: "인스타 차단",
    desc: "인스타가 로그인 없는 접근을 막았습니다. 코드로 못 고칩니다.",
    tone: "text-red-400 border-red-500/35 bg-red-500/8",
    action: "수동 업로드",
  },
  not_found: {
    label: "계정 없음",
    desc: "핸들이 틀렸거나 폐업했습니다.",
    tone: "text-orange-400 border-orange-500/35 bg-orange-500/8",
    action: "핸들 수정",
  },
  tagged_only: {
    label: "태그된 글만",
    desc: "본인 계정이 안 열려 남이 태그한 글만 옵니다. 그건 살려서 씁니다.",
    tone: "text-amber-400 border-amber-500/35 bg-amber-500/8",
    action: null,
  },
  no_lineup: {
    label: "라인업 없음",
    desc: "새 글을 봤는데 라인업이 아니었습니다. 계속 반복되면 감시 해제 후보입니다.",
    tone: "text-muted-foreground border-border bg-card",
    action: null,
  },
  error: {
    label: "오류",
    desc: "수집 중 오류가 났습니다.",
    tone: "text-red-400 border-red-500/35 bg-red-500/8",
    action: null,
  },
  ok: {
    label: "정상",
    desc: "",
    tone: "text-green-400 border-green-500/30 bg-green-500/8",
    action: null,
  },
};

// 조치가 필요한 순서. no_lineup 은 한 번으로는 판단 못 하므로 아래로.
const PRIORITY = ["restricted", "not_found", "error", "tagged_only", "no_lineup", "ok"];

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60000))}분 전`;
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function AdminCollectionHealth({ runs, accounts }: { runs: Run[]; accounts: Account[] }) {
  const [showOk, setShowOk] = useState(false);

  const latest = runs[0] ?? null;
  const prev = runs[1] ?? null;

  // 전날 대비 급락 감지. 오늘 겪은 실패들은 전부 "결과가 갑자기 줄었다"로 나타났다.
  const drop = useMemo(() => {
    if (!latest || !prev) return null;
    const now = latest.auto_published + latest.queued_for_review;
    const before = prev.auto_published + prev.queued_for_review;
    if (before < 3) return null; // 표본이 작으면 비율이 의미 없다
    const ratio = now / before;
    return ratio < 0.5 ? { now, before, pct: Math.round((1 - ratio) * 100) } : null;
  }, [latest, prev]);

  const grouped = useMemo(() => {
    const g: Record<string, Account[]> = {};
    for (const a of accounts) (g[a.outcome] ??= []).push(a);
    for (const k of Object.keys(g)) g[k].sort((x, y) => x.ig_handle.localeCompare(y.ig_handle));
    return g;
  }, [accounts]);

  const needsAction = PRIORITY.filter((k) => k !== "ok" && k !== "no_lineup" && grouped[k]?.length);

  if (!latest) {
    return (
      <div className="min-h-screen bg-background p-5 max-w-3xl mx-auto">
        <h1 className="text-xl font-black">수집 현황</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          아직 기록된 수집 실행이 없습니다. 다음 실행(매일 09시) 후에 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-3xl mx-auto p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tight">수집 현황</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              마지막 실행 {fmtTime(latest.started_at)} · {Math.round((latest.duration_ms ?? 0) / 1000)}초
            </p>
          </div>
          <Link
            href="/admin/lineups"
            className="text-xs font-bold px-3 py-2 rounded-full bg-card border border-border"
          >
            검토 큐 →
          </Link>
        </div>

        {drop && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[13px] leading-relaxed">
              <b className="text-amber-400">결과가 {drop.pct}% 줄었습니다</b>
              <div className="text-muted-foreground mt-0.5">
                직전 {drop.before}건 → 이번 {drop.now}건. 파싱이 조용히 깨졌을 수 있으니 아래 숫자를 확인하세요.
              </div>
            </div>
          </div>
        )}

        {/* 이번 실행 요약 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { k: "게시물", v: latest.media_seen, sub: `새 글 ${latest.media_new}` },
            { k: "라인업 게시", v: latest.auto_published, sub: `검토 대기 ${latest.queued_for_review}` },
            { k: "공연 저장", v: latest.events_saved, sub: null },
            {
              k: "날짜 없어 버림",
              v: latest.no_date_dropped,
              sub: latest.parse_failures ? `파싱 실패 ${latest.parse_failures}` : null,
              warn: latest.no_date_dropped > 5 || latest.parse_failures > 0,
            },
          ].map((s) => (
            <div
              key={s.k}
              className={`rounded-xl border p-3 ${
                s.warn ? "border-amber-500/40 bg-amber-500/8" : "border-border bg-card"
              }`}
            >
              <div className="text-[11px] text-muted-foreground">{s.k}</div>
              <div className={`text-xl font-black tabular-nums mt-0.5 ${s.warn ? "text-amber-400" : ""}`}>
                {s.v}
              </div>
              {s.sub && <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* 조치 필요 */}
        {needsAction.length === 0 ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/8 p-4 flex gap-3 items-center">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <div className="text-[13px]">조치가 필요한 계정이 없습니다.</div>
          </div>
        ) : (
          needsAction.map((key) => {
            const meta = OUTCOME[key];
            const list = grouped[key];
            return (
              <div key={key} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
                  {key === "restricted" && <Camera className="w-3.5 h-3.5 text-red-400" />}
                  {key === "not_found" && <Link2Off className="w-3.5 h-3.5 text-orange-400" />}
                  {key === "tagged_only" && <RefreshCw className="w-3.5 h-3.5 text-amber-400" />}
                  <span className="text-[13px] font-bold">{meta.label}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{list.length}곳</span>
                  <span className="text-[11px] text-muted-foreground w-full">{meta.desc}</span>
                </div>
                <div className="divide-y divide-border">
                  {list.map((a) => (
                    <div key={a.ig_handle} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate">
                          {a.club_name ?? a.ig_handle}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">
                          @{a.ig_handle}
                          {a.last_lineup_at && ` · 마지막 라인업 ${fmtTime(a.last_lineup_at)}`}
                        </div>
                      </div>
                      {meta.action === "수동 업로드" && (
                        <Link
                          href="/admin/lineups"
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500 text-black shrink-0"
                        >
                          수동 등록
                        </Link>
                      )}
                      {meta.action === "핸들 수정" && a.club_id && (
                        <Link
                          href={`/admin/clubs?highlight=${a.club_id}`}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-card border border-border shrink-0"
                        >
                          핸들 수정
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* 라인업 없음 — 한 번으로는 판단 못 하므로 참고용 */}
        {grouped.no_lineup?.length ? (
          <details className="rounded-xl border border-border bg-card">
            <summary className="px-4 py-3 text-[13px] font-bold cursor-pointer">
              라인업 없음{" "}
              <span className="text-muted-foreground font-normal tabular-nums">
                {grouped.no_lineup.length}곳
              </span>
              <span className="block text-[11px] text-muted-foreground font-normal mt-0.5">
                새 글은 봤는데 라인업이 아니었습니다. 여러 번 반복되면 감시 해제를 검토하세요.
              </span>
            </summary>
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {grouped.no_lineup.map((a) => (
                <span
                  key={a.ig_handle}
                  className="text-[11px] font-mono px-2 py-1 rounded-md bg-background border border-border text-muted-foreground"
                >
                  {a.ig_handle}
                </span>
              ))}
            </div>
          </details>
        ) : null}

        {/* 정상 */}
        {grouped.ok?.length ? (
          <div>
            <button
              onClick={() => setShowOk((v) => !v)}
              className="text-[12px] text-muted-foreground"
            >
              정상 {grouped.ok.length}곳 {showOk ? "접기" : "펼치기"}
            </button>
            {showOk && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {grouped.ok.map((a) => (
                  <span
                    key={a.ig_handle}
                    className="text-[11px] font-mono px-2 py-1 rounded-md bg-card border border-border text-muted-foreground"
                  >
                    {a.ig_handle}
                    {a.lineups_saved > 0 && (
                      <b className="text-green-400 ml-1">+{a.lineups_saved}</b>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* 최근 실행 이력 */}
        {runs.length > 1 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-[13px] font-bold">최근 실행</div>
            <div className="divide-y divide-border">
              {runs.map((r) => (
                <div key={r.id} className="px-4 py-2 flex items-center gap-3 text-[12px]">
                  <span className="text-muted-foreground w-16 shrink-0">
                    {fmtTime(r.started_at)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    글 {r.media_seen} / 새 {r.media_new}
                  </span>
                  <span className="tabular-nums ml-auto">
                    <b className="text-green-400">+{r.auto_published + r.queued_for_review}</b>
                    {r.no_date_dropped > 0 && (
                      <span className="text-amber-400 ml-2">날짜없음 {r.no_date_dropped}</span>
                    )}
                    {r.sources_failed > 0 && (
                      <span className="text-red-400 ml-2">실패 {r.sources_failed}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
