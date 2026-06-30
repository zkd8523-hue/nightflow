import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { verifyAndCreditPayment } from "@/lib/payments/verify";

export const runtime = "nodejs";

/**
 * 포트원 V2 웹훅 수신.
 * 결제 완료 시 포트원이 서버로 직접 통보 → 가장 신뢰할 수 있는 적립 경로.
 * (클라이언트가 창을 닫아도 적립이 누락되지 않게 하는 안전망)
 *
 * 보안 (2중 방어):
 *  1) PORTONE_WEBHOOK_SECRET 으로 서명 검증 (Standard Webhooks 규격).
 *  2) verifyAndCreditPayment 가 포트원 API 로 금액을 재대조 → 위조 webhook 으로는 적립 불가.
 * 시크릿 미설정 시에는 1) 을 스킵하되 2) 가 안전망으로 동작한다.
 */

// 포트원 V2 웹훅은 Standard Webhooks 규격(=Svix 호환): webhook-id/-timestamp/-signature 헤더,
// 시크릿은 whsec_ 접두사 base64. (Svix 호환 별칭 헤더도 함께 허용)
function verifyWebhookSignature(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get("webhook-id") ?? headers.get("svix-id");
  const timestamp = headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
  const sigHeader = headers.get("webhook-signature") ?? headers.get("svix-signature");
  if (!id || !timestamp || !sigHeader) return false;

  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Buffer.from(keyB64, "base64");
  const signedContent = `${id}.${timestamp}.${body}`;
  const expected = createHmac("sha256", keyBytes).update(signedContent).digest("base64");

  // "v1,<sig> v1,<sig2>" 형태 (공백 구분), timingSafeEqual 로 타이밍 공격 방어
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

export async function POST(req: Request) {
  try {
    const raw = await req.text();

    const secret = process.env.PORTONE_WEBHOOK_SECRET;
    if (secret && !verifyWebhookSignature(secret, req.headers, raw)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    // 포트원 V2 웹훅 페이로드: { type, data: { paymentId, ... } }
    let body: { data?: { paymentId?: string }; payment_id?: string; paymentId?: string };
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const paymentId: string | undefined =
      body?.data?.paymentId ?? body?.payment_id ?? body?.paymentId;

    if (!paymentId) {
      // 웹훅 형식이 예상과 다르면 200 으로 응답(재시도 폭주 방지)하되 무시
      return NextResponse.json({ ok: true, ignored: true });
    }

    // 금액·상태 재대조 후 멱등 적립
    const result = await verifyAndCreditPayment(paymentId);

    // 웹훅은 항상 200 계열로 응답 (실패 시 포트원이 재시도 — 멱등이라 안전)
    return NextResponse.json({ ok: result.success });
  } catch {
    // 파싱 실패 등도 200 으로 응답해 무한 재시도 방지
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
