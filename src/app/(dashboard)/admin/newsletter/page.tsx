import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Mail, Users, UserMinus, MailWarning, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import dayjs from "dayjs";
import { WEEKLY_ISSUES } from "@/lib/weekly/issues";

// 뉴스레터 구독자 현황 — Migration 689/690.
//
// 왜 service_role 로 읽나: 689 의 RLS 는 INSERT 만 공개하고 SELECT 정책을 아예 안 만들었다
// (= 기본 거부). 쿠폰·인사이트 화면처럼 security_invoker 뷰를 쓰는 방식이 아니라서,
// 로그인한 admin 의 쿠키 클라이언트로 select 하면 조용히 0건이 나온다.
// 그래서 권한 확인은 쿠키 클라이언트로(헤더 스푸핑 방지), 데이터는 service_role 로 나눠 읽는다.
//
// 이메일은 기본적으로 가린다. 이 화면의 쓸모는 "몇 명 모였나 / 어느 자리가 전환을 만드나"지
// 주소 자체를 들여다보는 게 아니다. 실제 발송은 Resend 가 하므로 주소를 눈으로 볼 일이 없다.

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SubscriberRow {
  id: string;
  email: string;
  source: string | null;
  created_at: string;
  unsubscribed_at: string | null;
  bounced_at: string | null;
  welcome_sent_at: string | null;
}

/** a***@example.com — 도메인은 남긴다(어떤 메일 서비스로 모이는지는 봐야 한다). */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(local.length - 1, 2))}${domain}`;
}

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

export default async function AdminNewsletterPage() {
  const supabase = await createClient();

  // Auth + admin 체크 — 항상 서버에서 직접 검증 (헤더 스푸핑 방지).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: ud } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (ud?.role !== "admin") redirect("/");

  // 구독자는 발행 전 수집 단계라 수백 명 규모다. 통째로 읽어 메모리에서 집계한다 —
  // 집계 전용 뷰를 더 만들 만큼 모이면 그때 뷰로 옮긴다.
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("newsletter_subscribers")
    .select("id, email, source, created_at, unsubscribed_at, bounced_at, welcome_sent_at")
    .order("created_at", { ascending: false })
    .limit(2000);

  // 690 미적용이면 welcome_sent_at 이 없어서 통째로 실패한다. 그때는 그 컬럼만 빼고 다시 읽는다.
  let subscribers: SubscriberRow[] = (rows as SubscriberRow[] | null) ?? [];
  let migrationMissing = false;
  if (error) {
    migrationMissing = /welcome_sent_at|column/i.test(error.message);
    if (migrationMissing) {
      const { data: fallback } = await admin
        .from("newsletter_subscribers")
        .select("id, email, source, created_at, unsubscribed_at, bounced_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      subscribers = ((fallback as Omit<SubscriberRow, "welcome_sent_at">[] | null) ?? []).map((r) => ({
        ...r,
        welcome_sent_at: null,
      }));
    }
  }

  const total = subscribers.length;
  const active = subscribers.filter((s) => !s.unsubscribed_at).length;
  const unsubscribed = subscribers.filter((s) => s.unsubscribed_at).length;
  const bounced = subscribers.filter((s) => s.bounced_at).length;
  const notMailed = subscribers.filter((s) => !s.welcome_sent_at && !s.unsubscribed_at).length;
  const unsubRate = total > 0 ? Math.round((unsubscribed / total) * 1000) / 10 : 0;

  // 어느 자리가 구독을 만드나 — 689 의 source 컬럼이 이걸 보려고 있는 것이다.
  const bySource = new Map<string, { total: number; active: number }>();
  for (const s of subscribers) {
    const key = s.source || "(미상)";
    const cur = bySource.get(key) ?? { total: 0, active: 0 };
    cur.total += 1;
    if (!s.unsubscribed_at) cur.active += 1;
    bySource.set(key, cur);
  }
  const sourceRows = [...bySource.entries()].sort((a, b) => b[1].total - a[1].total);

  // 편별 조회수 — user_events 의 weekly_issue_view (WeeklyIssueTracker, 호 페이지 진입 시 1회).
  // 이 이벤트는 2026-10-05 에 붙였다. 그 전 조회는 어디에도 남아 있지 않아서 집계할 수 없다.
  //
  // PostgREST 는 한 번에 1000행까지만 돌려준다 — 페이지를 넘겨 가며 읽는다.
  // 호가 늘어도 이 화면은 "최근 호가 읽히나"를 보는 용도라 2만 건을 넘기면 잘라낸다.
  const PAGE = 1000;
  const MAX_ROWS = 20000;
  const viewRows: { anon_id: string; user_id: string | null; properties: { slug?: string } | null }[] = [];
  let viewsTruncated = false;
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data: chunk } = await admin
      .from("user_events")
      .select("anon_id, user_id, properties")
      .eq("event_name", "weekly_issue_view")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (!chunk || chunk.length === 0) break;
    viewRows.push(...(chunk as typeof viewRows));
    if (chunk.length < PAGE) break;
    if (from + PAGE >= MAX_ROWS) viewsTruncated = true;
  }

  // 관리자 본인이 미리보기로 연 조회는 뺀다 — 구독자 1명인 지금은 내 조회가 숫자를 좌우한다.
  // 로그인하지 않고 연 조회는 구분할 수 없다.
  const { data: adminUsers } = await admin.from("users").select("id").eq("role", "admin");
  const adminIds = new Set((adminUsers ?? []).map((u: { id: string }) => u.id));

  const viewsBySlug = new Map<string, { views: number; visitors: Set<string> }>();
  for (const r of viewRows) {
    if (r.user_id && adminIds.has(r.user_id)) continue;
    const slug = r.properties?.slug;
    if (!slug) continue;
    const cur = viewsBySlug.get(slug) ?? { views: 0, visitors: new Set<string>() };
    cur.views += 1;
    cur.visitors.add(r.anon_id);
    viewsBySlug.set(slug, cur);
  }

  // 구독 전환 — WeeklyIssueBody 가 source 를 `weekly_${slug}` 로 남긴다.
  const issueRows = WEEKLY_ISSUES.map((issue) => {
    const v = viewsBySlug.get(issue.slug);
    const visitors = v?.visitors.size ?? 0;
    const subs = subscribers.filter((x) => x.source === `weekly_${issue.slug}`).length;
    return {
      slug: issue.slug,
      volume: issue.volume,
      title: issue.title.replace(/\n/g, " "),
      views: v?.views ?? 0,
      visitors,
      subs,
      // 방문자 기준 — 같은 사람이 여러 번 열어도 한 명으로 센다.
      rate: visitors > 0 ? Math.round((subs / visitors) * 1000) / 10 : null,
    };
  });

  // 판정 기준(689 주석): 4주 안에 200명이면 발행 시작, 50명 미만이면 접는다.
  const first = subscribers.length > 0 ? subscribers[subscribers.length - 1].created_at : null;
  const daysSinceFirst = first ? dayjs().diff(dayjs(first), "day") : 0;

  return (
    <div className="min-h-screen bg-background text-foreground pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        <header className="flex items-center gap-3">
          <Link
            href="/admin"
            className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border hover:opacity-80 transition-opacity"
            aria-label="관리자 홈으로"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Mail className="w-6 h-6 text-[#DFFF00]" />
              아티클 구독자
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              아티클. 아직 한 호도 발행하지 않았고, 신청 확인 메일만 나간다.
            </p>
          </div>
        </header>

        {migrationMissing && (
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-foreground font-bold mb-2">수신거부 마이그레이션이 아직 적용되지 않았습니다</p>
            <p className="text-sm text-muted-foreground">
              Supabase 대시보드에서{" "}
              <code className="text-amber-500">690_newsletter_unsubscribe_token.sql</code> 을
              먼저 실행해주세요. 적용 전까지 신청 확인 메일은 발송되지 않습니다
              (수신거부 링크를 넣을 수 없어서입니다).
            </p>
          </div>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="전체 신청"
            value={total.toLocaleString()}
            sub={first ? `첫 구독 ${daysSinceFirst}일 전` : "아직 없음"}
            icon={<Mail className="w-3.5 h-3.5" />}
          />
          <StatCard
            label="구독 중"
            value={active.toLocaleString()}
            sub="발송 대상"
            tone="good"
            icon={<Users className="w-3.5 h-3.5" />}
          />
          <StatCard
            label="수신거부"
            value={unsubscribed.toLocaleString()}
            sub={`전체의 ${unsubRate}%`}
            tone={unsubRate >= 5 ? "warn" : "default"}
            icon={<UserMinus className="w-3.5 h-3.5" />}
          />
          <StatCard
            label="확인 메일 미발송"
            value={notMailed.toLocaleString()}
            sub={bounced > 0 ? `반송 ${bounced}건` : "반송 없음"}
            tone={notMailed > 0 ? "warn" : "default"}
            icon={<MailWarning className="w-3.5 h-3.5" />}
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-black flex items-center gap-2">
              <Eye className="w-5 h-5 text-muted-foreground" />
              편별 조회수
            </h2>
            <p className="text-xs text-muted-foreground text-right">
              10/05 이후 조회만 집계됩니다. 관리자 계정 조회는 제외.
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs font-bold border-b border-border">
                  <th className="text-left px-4 py-3">호</th>
                  <th className="text-right px-4 py-3">조회</th>
                  <th className="text-right px-4 py-3">방문자</th>
                  <th className="text-right px-4 py-3">구독</th>
                  <th className="text-right px-4 py-3">전환율</th>
                </tr>
              </thead>
              <tbody>
                {issueRows.map((r) => (
                  <tr key={r.slug} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/weekly/${r.slug}`} className="font-bold hover:underline">
                        {r.volume} · {r.title}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-black">{r.views.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-black">{r.visitors.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-500 font-black">{r.subs.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-black">
                      {r.rate === null ? <span className="text-muted-foreground">-</span> : `${r.rate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            조회 = 페이지를 연 횟수, 방문자 = 브라우저 기준 순방문자. 전환율 = 구독 ÷ 방문자.
            {viewsTruncated && " (조회 로그가 2만 건을 넘어 일부만 집계됨)"}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black">어디서 들어왔나</h2>
          {sourceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 구독자가 없습니다.</p>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs font-bold border-b border-border">
                    <th className="text-left px-4 py-3">자리</th>
                    <th className="text-right px-4 py-3">전체</th>
                    <th className="text-right px-4 py-3">구독 중</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map(([source, stat]) => (
                    <tr key={source} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-bold">{source}</td>
                      <td className="px-4 py-3 text-right font-black">{stat.total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-green-500 font-black">
                        {stat.active.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-black">최근 신청</h2>
            <p className="text-xs text-muted-foreground">
              주소는 가려서 보여줍니다. 발송은 Resend 가 하므로 여기서 볼 일이 없습니다.
            </p>
          </div>
          {subscribers.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 구독자가 없습니다.</p>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs font-bold border-b border-border">
                    <th className="text-left px-4 py-3">이메일</th>
                    <th className="text-left px-4 py-3">자리</th>
                    <th className="text-left px-4 py-3">신청</th>
                    <th className="text-right px-4 py-3">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.slice(0, 100).map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">{maskEmail(s.email)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.source || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {dayjs(s.created_at).format("MM/DD HH:mm")}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold">
                        {s.unsubscribed_at ? (
                          <span className="text-red-500">수신거부</span>
                        ) : s.bounced_at ? (
                          <span className="text-brand-amber">반송</span>
                        ) : s.welcome_sent_at ? (
                          <span className="text-green-500">구독 중</span>
                        ) : (
                          <span className="text-muted-foreground">메일 미발송</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {subscribers.length > 100 && (
                <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
                  최근 100건만 표시 (전체 {subscribers.length.toLocaleString()}건)
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
