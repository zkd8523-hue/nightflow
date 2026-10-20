import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeeklyEmailIssue } from "@/lib/email/weeklyIssue";

// 아티클 한 호를 구독자에게 보낸다. **사람이 버튼을 눌러야만** 돈다.
//
// 왜 Edge Function + cron 이 아닌가:
//   1) 원고(HTML)가 TypeScript 모듈이다. Edge Function 은 Deno 라 같은 파일을
//      한 벌 더 복사해야 하고, 그러면 "웹에 올린 원고"와 "메일로 나간 원고"가
//      조용히 갈라진다. 호마다 생기는 사고다.
//   2) RESEND_API_KEY 가 이미 Vercel 환경변수에 있다(구독 확인 메일이 쓰는 그것).
//      Supabase secrets 에 같은 키를 또 둘 이유가 없다.
//   3) 발행은 원고가 끝나야 나간다. 시각이 정해져 있어도 사람이 "지금 나가도 된다"를
//      판단하는 단계가 필요하다. cron 이 원고 완성 여부를 알 수 없다.
//
// 안전장치(이 순서대로 걸린다):
//   - admin 권한
//   - mode 를 명시해야 한다. 기본값이 live 인 경로는 만들지 않는다.
//   - live 는 confirm === slug 가 body 에 있어야 한다(오클릭 방지)
//   - newsletter_sends 의 유니크 제약으로 같은 호 중복 차단(DB 레벨)
//   - 수신거부·반송 주소 제외
//
// mode:
//   count — 아무것도 보내지 않고 대상 수만 센다. 실행 전 항상 이걸 먼저 본다.
//   test  — body.testEmail 한 곳에만 보낸다. 기록을 남기지 않는다.
//   live  — 실제 발송. 배치 100통씩, 한 요청당 최대 limit(기본 300)통.
//   retry — status='failed' 만 다시 보낸다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = (process.env.NEXT_PUBLIC_APP_URL || "https://nightflow.kr").replace(/\/$/, "");

/** Resend 배치 상한. 문서상 한 번에 100통까지다. */
const BATCH = 100;
/** 기본 요청당 상한. 서버리스 타임아웃 안에 끝나게 잡는다 — 남으면 버튼을 또 누르면 된다. */
const DEFAULT_LIMIT = 300;
/** Resend 기본 레이트리밋이 초당 2요청이다. 배치 사이에 쉰다. */
const BATCH_GAP_MS = 600;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const from = () => process.env.RESEND_FROM || "NightFlow <team@nightflow.kr>";
const replyTo = () => process.env.RESEND_REPLY_TO || "team@nightflow.kr";

const unsubUrl = (token: string) =>
  `${SITE}/newsletter/unsubscribe?t=${encodeURIComponent(token)}`;

/**
 * 수신거부 헤더. 지메일·네이버는 메일 상단에 "수신거부" 버튼을 띄워주고,
 * 그 버튼이 있으면 사람들이 스팸 신고 대신 그걸 누른다(발신 도메인 평판이 덜 깎인다).
 *
 * List-Unsubscribe-Post(원클릭)는 **일부러 넣지 않는다.** 그건 메일 클라이언트가
 * 그 주소로 POST 를 쏘는데, 우리 수신거부는 Next 페이지(GET)라 405 가 난다.
 * 그 자리를 라우트로 바꾸려면 지금 페이지를 들어내야 해서 이번에는 미룬다.
 */
const listHeaders = (token: string) => ({ "List-Unsubscribe": `<${unsubUrl(token)}>` });

interface Target {
  id: string;
  email: string;
  unsubscribe_token: string;
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const auth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(c) {
          c.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 }), admin: null };
  }

  const admin = createAdminClient();
  const { data: row } = await admin.from("users").select("role").eq("id", user.id).single();
  if (row?.role !== "admin") {
    return { error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }), admin: null };
  }
  return { error: null as NextResponse | null, admin };
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error || !gate.admin) return gate.error ?? NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = gate.admin;

  let body: {
    slug?: string;
    mode?: "count" | "test" | "live" | "retry";
    testEmail?: string;
    confirm?: string;
    limit?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const mode = body.mode;
  if (!mode || !["count", "test", "live", "retry"].includes(mode)) {
    // 기본값을 두지 않는다. mode 를 빼먹은 요청이 발송으로 이어지면 안 된다.
    return NextResponse.json({ error: "mode 를 count/test/live/retry 중에 지정해야 합니다." }, { status: 400 });
  }

  const issue = getWeeklyEmailIssue(body.slug || "");
  if (!issue) {
    return NextResponse.json(
      { error: "메일 조판이 끝난 호가 아닙니다. src/lib/email/weeklyIssue.ts 의 WEEKLY_EMAIL_ISSUES 를 확인하세요." },
      { status: 400 }
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY 미설정" }, { status: 500 });
  }

  /* ── 대상 집계 ─────────────────────────────────────────── */
  // 수신거부·반송은 뺀다. welcome_sent_at 은 보지 않는다 —
  // 확인 메일이 실패했어도 구독 의사는 유효하고, 호는 받을 자격이 있다.
  const { data: subs, error: subsErr } = await admin
    .from("newsletter_subscribers")
    .select("id, email, unsubscribe_token")
    .is("unsubscribed_at", null)
    .is("bounced_at", null)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (subsErr) {
    return NextResponse.json({ error: `구독자 조회 실패: ${subsErr.message}` }, { status: 500 });
  }

  const { data: sends, error: sendsErr } = await admin
    .from("newsletter_sends")
    .select("subscriber_id, status")
    .eq("issue_slug", issue.slug)
    .limit(5000);

  if (sendsErr) {
    // 695 미적용. 중복 방지 장치 없이 보내느니 멈춘다.
    return NextResponse.json(
      { error: `발송 기록 테이블을 읽을 수 없습니다(695 미적용?): ${sendsErr.message}` },
      { status: 500 }
    );
  }

  const sentOrClaimed = new Set(
    (sends ?? []).filter((s) => s.status !== "failed").map((s) => s.subscriber_id as string)
  );
  const failedIds = new Set(
    (sends ?? []).filter((s) => s.status === "failed").map((s) => s.subscriber_id as string)
  );

  const all = (subs ?? []) as Target[];
  const pending = all.filter((s) => !sentOrClaimed.has(s.id) && !failedIds.has(s.id));
  const retryable = all.filter((s) => failedIds.has(s.id));

  if (mode === "count") {
    return NextResponse.json({
      ok: true,
      slug: issue.slug,
      subject: issue.subject,
      active: all.length,
      alreadySent: sentOrClaimed.size,
      pending: pending.length,
      failed: retryable.length,
    });
  }

  /* ── 테스트 1통 ────────────────────────────────────────── */
  if (mode === "test") {
    const to = (body.testEmail || "").trim().toLowerCase();
    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ error: "테스트 주소를 입력하세요." }, { status: 400 });
    }
    // 그 주소가 구독자면 진짜 토큰을 쓴다(수신거부 링크까지 실제로 눌러볼 수 있다).
    // 아니면 더미 토큰 — 눌러도 "처리할 수 없는 주소입니다" 가 뜬다. 남의 구독을 끊지 않는다.
    const match = all.find((s) => s.email.toLowerCase() === to);
    const token = match?.unsubscribe_token || "preview-token-not-a-real-subscriber";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from(),
        to: [to],
        // 제목에 접두사를 붙이지 않는다. 진짜로 나갈 메일과 글자 하나까지 같아야
        // 스팸 판정·줄바꿈·제목 잘림을 여기서 확인할 수 있다.
        subject: issue.subject,
        html: issue.html({ unsubscribeUrl: unsubUrl(token) }),
        reply_to: replyTo(),
        headers: listHeaders(token),
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ error: `Resend ${res.status}: ${t}` }, { status: 502 });
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    // 기록하지 않는다. 테스트는 발송 이력이 아니다.
    return NextResponse.json({ ok: true, mode: "test", to, resendId: json.id ?? null });
  }

  /* ── 실제 발송 ─────────────────────────────────────────── */
  if (body.confirm !== issue.slug) {
    return NextResponse.json(
      { error: `확인값이 필요합니다. confirm 에 "${issue.slug}" 를 그대로 넣어야 발송됩니다.` },
      { status: 400 }
    );
  }

  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), 1000);
  const queue = (mode === "retry" ? retryable : pending).slice(0, limit);

  if (queue.length === 0) {
    return NextResponse.json({ ok: true, mode, sent: 0, failed: 0, remaining: 0, note: "보낼 대상이 없습니다." });
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < queue.length; i += BATCH) {
    const chunk = queue.slice(i, i + BATCH);

    // ── 1. 줄을 먼저 잡는다 ──────────────────────────────
    // 유니크 제약이 걸리는 줄은 조용히 빠진다(ignoreDuplicates). 돌아온 것만 보낸다.
    // 버튼이 동시에 두 번 눌려도 한쪽만 줄을 잡는다.
    let claimed: Target[];
    if (mode === "retry") {
      // 재시도는 이미 줄이 있다. failed → claimed 로 되돌려 잡는다.
      const ids = chunk.map((c) => c.id);
      const { data: re, error: reErr } = await admin
        .from("newsletter_sends")
        .update({ status: "claimed", claimed_at: new Date().toISOString(), error: null })
        .eq("issue_slug", issue.slug)
        .eq("status", "failed")
        .in("subscriber_id", ids)
        .select("subscriber_id");
      if (reErr) {
        errors.push(`재시도 선점 실패: ${reErr.message}`);
        break;
      }
      const got = new Set((re ?? []).map((r) => r.subscriber_id as string));
      claimed = chunk.filter((c) => got.has(c.id));
    } else {
      const { data: ins, error: insErr } = await admin
        .from("newsletter_sends")
        .upsert(
          chunk.map((c) => ({ subscriber_id: c.id, issue_slug: issue.slug, status: "claimed" })),
          { onConflict: "subscriber_id,issue_slug", ignoreDuplicates: true }
        )
        .select("subscriber_id");
      if (insErr) {
        errors.push(`선점 실패: ${insErr.message}`);
        break;
      }
      const got = new Set((ins ?? []).map((r) => r.subscriber_id as string));
      claimed = chunk.filter((c) => got.has(c.id));
    }

    if (claimed.length === 0) continue;

    // ── 2. 배치 발송 ─────────────────────────────────────
    const payload = claimed.map((c) => ({
      from: from(),
      to: [c.email],
      subject: issue.subject,
      html: issue.html({ unsubscribeUrl: unsubUrl(c.unsubscribe_token) }),
      reply_to: replyTo(),
      headers: listHeaders(c.unsubscribe_token),
    }));

    let ids: (string | null)[] = [];
    let batchError: string | null = null;
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        batchError = `Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
      } else {
        const json = (await res.json()) as { data?: { id?: string }[] };
        ids = (json.data ?? []).map((d) => d?.id ?? null);
      }
    } catch (e) {
      batchError = e instanceof Error ? e.message : String(e);
    }

    // ── 3. 결과 기록 ─────────────────────────────────────
    const now = new Date().toISOString();
    if (batchError) {
      failed += claimed.length;
      errors.push(batchError);
      await admin
        .from("newsletter_sends")
        .update({ status: "failed", error: batchError.slice(0, 500) })
        .eq("issue_slug", issue.slug)
        .in("subscriber_id", claimed.map((c) => c.id));
    } else {
      sent += claimed.length;
      // 배치 응답은 보낸 순서대로 온다. id 를 각 줄에 맞춰 적는다.
      // 줄마다 update 라 호출이 늘지만, 반송 웹훅을 이 id 로 이어 붙이려면 필요하다.
      await Promise.all(
        claimed.map((c, idx) =>
          admin
            .from("newsletter_sends")
            .update({ status: "sent", sent_at: now, resend_id: ids[idx] ?? null, error: null })
            .eq("issue_slug", issue.slug)
            .eq("subscriber_id", c.id)
        )
      );
    }

    if (i + BATCH < queue.length) await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
  }

  const remaining = (mode === "retry" ? retryable.length : pending.length) - sent - failed;

  return NextResponse.json({
    ok: true,
    mode,
    slug: issue.slug,
    sent,
    failed,
    remaining: Math.max(remaining, 0),
    errors: errors.slice(0, 5),
  });
}
