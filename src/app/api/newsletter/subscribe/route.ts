import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEWSLETTER_SUBJECT, newsletterWelcomeHtml } from "@/lib/email/newsletterWelcome";

// 뉴스레터 구독 접수 + 신청 확인 메일 1통.
//
// 왜 서버로 옮겼나: 폼이 클라이언트에서 바로 Supabase INSERT 를 하고 있었는데,
// 그 자리에서는 메일을 못 보낸다(RESEND_API_KEY 가 서버 전용). 저장과 발송을
// 한 요청 안에서 끝내려고 Route Handler 로 뺐다. 폼 UI·동의 구조는 그대로다.
//
// 왜 Edge Function 이 아닌가: RESEND_API_KEY 가 Next.js 쪽 환경변수에도 이미 있고
// (.env.local / Vercel), Edge Function 을 거치면 요청이 한 번 더 튀면서
// "저장은 됐는데 메일은 안 갔다"를 볼 자리가 둘로 늘어난다. 호 발송(매주 목요일)을
// 시작할 때는 그쪽이 cron 이 붙는 Edge Function 으로 가는 게 맞지만, 지금은
// 사람이 폼을 누르는 순간 1통이 전부라 요청-응답 안에서 끝내는 게 단순하다.
//
// 왜 service_role 인가: 689 의 RLS 는 INSERT 만 공개하고 SELECT 를 막는다.
// 중복 판정과 토큰 조회를 하려면 읽어야 하는데 anon 키로는 0건이 나온다.
//
// ⚠️ 690 미적용 상태에서도 구독 저장은 살아 있어야 한다 — unsubscribe_token /
//    welcome_sent_at 이 없으면 메일만 건너뛴다. 저장이 죽으면 수집 자체가 멈춘다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_APP_URL || "https://nightflow.kr").replace(/\/$/, "");

// 폼과 같은 검사. 클라이언트 검증만 믿지 않는다.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// anon_id 컬럼이 UUID 라 형식이 안 맞으면 INSERT 가 통째로 실패한다. 걸러서 버린다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resend REST 직접 호출. supabase/functions/_shared/resend.ts 의 Node 판. */
async function resendSend(opts: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY 미설정");
  const from = process.env.RESEND_FROM || "NightFlow <team@nightflow.kr>";
  const replyTo = process.env.RESEND_REPLY_TO || "team@nightflow.kr";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, reply_to: replyTo }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

export async function POST(req: NextRequest) {
  let body: { email?: string; source?: string; anon_id?: string | null; agreed_marketing?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "이메일 주소를 다시 확인해 주세요." }, { status: 400 });
  }
  // 둘 다 필수다(689 의 CHECK 와 같은 기준). 수신 동의 없이는 보낼 게 없다.
  if (body.agreed_marketing !== true) {
    return NextResponse.json({ error: "광고성 정보 수신 동의가 필요합니다." }, { status: 400 });
  }

  const source = (body.source || "home").slice(0, 60);
  const anonId = body.anon_id && UUID_RE.test(body.anon_id) ? body.anon_id : null;

  const supabase = createAdminClient();

  // 이미 있는 주소인지 먼저 본다. 중복이면 메일을 다시 보내지 않는다 —
  // 폼은 중복을 성공으로 처리하므로, 같은 사람이 여러 번 눌러도 받은편지함이 쌓이면 안 된다.
  const { data: existing } = await supabase
    .from("newsletter_subscribers")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("newsletter_subscribers")
    .insert({
      email,
      source,
      anon_id: anonId,
      agreed_privacy: true,
      agreed_marketing: true,
      agreed_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    // 위 중복 검사와 INSERT 사이에 같은 주소가 끼어든 경우(경합). 성공으로 본다.
    if (/duplicate|unique/i.test(insertError.message)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[newsletter] insert 실패:", insertError.message);
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  // ── 여기서부터는 실패해도 구독을 되돌리지 않는다 ────────────────────────────
  // 저장은 끝났다. 메일이 안 가는 건 나중에 다시 보낼 수 있지만,
  // 저장을 롤백하면 사람이 남긴 의사표시 자체가 사라진다.
  try {
    const { data: row } = await supabase
      .from("newsletter_subscribers")
      .select("unsubscribe_token")
      .eq("id", inserted?.id ?? "")
      .maybeSingle();

    const token = (row as { unsubscribe_token?: string } | null)?.unsubscribe_token;
    if (!token) {
      // Migration 690 미적용. 수신거부 링크를 못 넣으면 광고성 메일을 보낼 수 없다
      // (정보통신망법 제50조 제4항). 저장만 해두고 발송은 건너뛴다.
      console.warn("[newsletter] unsubscribe_token 없음 — 690 미적용? 확인 메일 건너뜀");
      return NextResponse.json({ ok: true, mailed: false });
    }

    await resendSend({
      to: email,
      subject: NEWSLETTER_SUBJECT,
      html: newsletterWelcomeHtml({
        email,
        unsubscribeUrl: `${SITE}/newsletter/unsubscribe?t=${encodeURIComponent(token)}`,
      }),
    });

    await supabase
      .from("newsletter_subscribers")
      .update({ welcome_sent_at: new Date().toISOString() })
      .eq("id", inserted?.id ?? "");

    return NextResponse.json({ ok: true, mailed: true });
  } catch (e) {
    // welcome_sent_at 이 NULL 로 남는다. 나중에 미발송분만 골라 다시 보낼 수 있다.
    console.error("[newsletter] 확인 메일 실패:", e);
    return NextResponse.json({ ok: true, mailed: false });
  }
}
