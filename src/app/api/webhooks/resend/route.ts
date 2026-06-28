import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Resend webhook: 이메일 bounce/complaint 감지 → users.email_bounced = true.
// 소프트 검증의 서버측 자동 감지기. 이후 방문 시 재입력 유도(UI에서 처리).
//
// 환경변수:
//   RESEND_WEBHOOK_SECRET — Svix 서명 검증 시크릿 (whsec_...). 설정 시 검증, 미설정 시 스킵.

export const runtime = "nodejs";

// Svix 서명 검증 (Resend는 Svix 사용). 실패 시 false.
function verifySvix(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !timestamp || !sigHeader) return false;

  // whsec_ 접두사 제거 후 base64 디코드한 바이트가 HMAC 키
  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Buffer.from(keyB64, "base64");
  const signedContent = `${id}.${timestamp}.${body}`;
  const expected = createHmac("sha256", keyBytes).update(signedContent).digest("base64");

  // svix-signature는 "v1,<sig> v1,<sig2>" 형태 (공백 구분)
  return sigHeader.split(" ").some((part) => {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !verifySvix(secret, req.headers, body)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: { type?: string; data?: { to?: string[] | string } };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // bounce(반송) + complaint(스팸 신고) → 도달 불가로 간주
  if (payload.type !== "email.bounced" && payload.type !== "email.complained") {
    return NextResponse.json({ ok: true, ignored: payload.type });
  }

  const to = payload.data?.to;
  const emails = (Array.isArray(to) ? to : to ? [to] : [])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    return NextResponse.json({ ok: true, marked: 0 });
  }

  const supabase = createAdminClient();
  const { error, count } = await supabase
    .from("users")
    .update({ email_bounced: true }, { count: "exact" })
    .in("email", emails);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type: payload.type, marked: count ?? 0 });
}
