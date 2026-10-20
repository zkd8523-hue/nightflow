"use client";

import { useState } from "react";
import { Send, Eye, FlaskConical, RefreshCw, AlertTriangle } from "lucide-react";

// 호 발송 조작판. 세 단계로 나눠 놨다 — 한 번의 클릭으로 전체 발송이 되는 길은 없다.
//
//   1) 미리보기      — 메일 HTML 을 새 탭에서 본다. 아무것도 안 나간다.
//   2) 대상 세기     — 지금 누르면 몇 통이 나가는지 숫자로 본다. 아무것도 안 나간다.
//   3) 테스트 1통    — 지정한 주소 하나로만 보낸다. 발송 기록에 남기지 않는다.
//   4) 전체 발송     — 확인 문구(슬러그)를 직접 타이핑해야 버튼이 열린다.
//
// 4번을 "정말 보내시겠습니까?" 한 줄로 막지 않은 이유: 그 창은 읽지 않고 엔터를 친다.
// 슬러그를 손으로 적게 하면 최소한 어느 호를 보내는지는 한 번 본다.

interface IssueOption {
  slug: string;
  volume: string;
  subject: string;
}

interface CountResult {
  active: number;
  alreadySent: number;
  pending: number;
  failed: number;
  subject: string;
}

export function NewsletterSendPanel({ issues }: { issues: IssueOption[] }) {
  const [slug, setSlug] = useState(issues[0]?.slug ?? "");
  const [testEmail, setTestEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [count, setCount] = useState<CountResult | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const issue = issues.find((i) => i.slug === slug);
  const say = (m: string) =>
    setLog((p) => [`${new Date().toLocaleTimeString("ko-KR")} ${m}`, ...p].slice(0, 12));

  async function call(mode: "count" | "test" | "live" | "retry", extra: Record<string, unknown> = {}) {
    setBusy(mode);
    try {
      const res = await fetch("/api/admin/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, mode, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) {
        say(`✕ ${json.error ?? res.status}`);
        return null;
      }
      return json;
    } catch (e) {
      say(`✕ ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const onCount = async () => {
    const r = await call("count");
    if (r) {
      setCount(r);
      say(`대상 ${r.pending}명 · 이미 보냄 ${r.alreadySent} · 실패 ${r.failed}`);
    }
  };

  const onTest = async () => {
    if (!testEmail.trim()) return;
    const r = await call("test", { testEmail: testEmail.trim() });
    if (r) say(`테스트 1통 발송 → ${r.to}`);
  };

  const onLive = async () => {
    if (confirmText !== slug) return;
    const r = await call("live", { confirm: slug });
    if (r) {
      say(`발송 ${r.sent}통 · 실패 ${r.failed} · 남음 ${r.remaining}`);
      if (r.errors?.length) r.errors.forEach((e: string) => say(`  ↳ ${e}`));
      setConfirmText("");
      void onCount();
    }
  };

  const onRetry = async () => {
    const r = await call("retry", { confirm: slug });
    if (r) say(`재시도 ${r.sent}통 · 실패 ${r.failed}`);
  };

  const liveReady = confirmText === slug && !busy;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-black">이번 호 발송</h2>
        <p className="text-xs text-muted-foreground">
          cron 없음. 사람이 눌러야 나갑니다.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-5">
        {/* 호 선택 */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground">호</label>
          <select
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setCount(null);
              setConfirmText("");
            }}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-bold"
          >
            {issues.map((i) => (
              <option key={i.slug} value={i.slug}>
                {i.volume} · {i.slug}
              </option>
            ))}
          </select>
          {issue && (
            <p className="text-xs text-muted-foreground pt-1">
              제목: <span className="text-foreground font-medium">{issue.subject}</span>
            </p>
          )}
        </div>

        {/* 1·2단계 — 아무것도 안 나간다 */}
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/admin/newsletter/preview?slug=${slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-border text-sm font-bold hover:opacity-80"
          >
            <Eye className="w-4 h-4" />
            미리보기
          </a>
          <button
            onClick={onCount}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-border text-sm font-bold hover:opacity-80 disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${busy === "count" ? "animate-spin" : ""}`} />
            대상 세기
          </button>
        </div>

        {count && (
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["구독 중", count.active, ""],
              ["보낼 대상", count.pending, "text-green-500"],
              ["이미 보냄", count.alreadySent, "text-muted-foreground"],
              ["실패", count.failed, count.failed > 0 ? "text-red-500" : "text-muted-foreground"],
            ].map(([label, v, cls]) => (
              <div key={label as string} className="bg-background border border-border rounded-lg py-2.5">
                <div className={`text-xl font-black ${cls as string}`}>{v as number}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{label as string}</div>
              </div>
            ))}
          </div>
        )}

        {/* 3단계 — 테스트 1통 */}
        <div className="space-y-1.5 pt-1 border-t border-border">
          <label className="text-xs font-bold text-muted-foreground pt-3 block">
            테스트 발송 (이 주소 한 곳에만)
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="zkd8523@gmail.com"
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm"
            />
            <button
              onClick={onTest}
              disabled={!!busy || !testEmail.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-black disabled:opacity-40"
            >
              <FlaskConical className="w-4 h-4" />
              테스트
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            제목·본문이 실제 발송과 글자 하나까지 같습니다. 발송 기록에는 남지 않습니다.
          </p>
        </div>

        {/* 4단계 — 전체 발송 */}
        <div className="space-y-2 pt-1 border-t border-border">
          <div className="flex items-start gap-2 pt-3">
            <AlertTriangle className="w-4 h-4 text-brand-amber flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              전체 발송은 되돌릴 수 없습니다. 미리보기 → 테스트 1통 → 대상 세기를 먼저 하세요.
              같은 호를 두 번 눌러도 이미 받은 사람에게는 가지 않습니다.
              한 번에 최대 300통까지 나가고, 남으면 버튼을 다시 누르면 됩니다.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`확인: ${slug} 을(를) 그대로 입력`}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono"
            />
            <button
              onClick={onLive}
              disabled={!liveReady}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-black disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
              {busy === "live" ? "발송 중..." : "전체 발송"}
            </button>
          </div>
          {count && count.failed > 0 && (
            <button
              onClick={onRetry}
              disabled={confirmText !== slug || !!busy}
              className="text-xs font-bold text-red-500 underline underline-offset-2 disabled:opacity-40"
            >
              실패한 {count.failed}건만 다시 보내기 (확인값 입력 필요)
            </button>
          )}
        </div>

        {log.length > 0 && (
          <div className="pt-3 border-t border-border space-y-1">
            {log.map((l, i) => (
              <p key={i} className="font-mono text-[11px] text-muted-foreground">
                {l}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
