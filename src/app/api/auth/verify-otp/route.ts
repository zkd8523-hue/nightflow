import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidKoreanPhone,
  normalizePhone,
  verifyOtpCode,
  OTP_CONFIG,
} from "@/lib/auth/otp";

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawPhone = body.phone ?? "";
  const code = (body.code ?? "").trim();

  if (!isValidKoreanPhone(rawPhone)) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);
  const supabase = createAdminClient();

  // 가장 최근 발송 기록 조회
  const { data: verification, error: fetchError } = await supabase
    .from("phone_verifications")
    .select("id, code_hash, attempts, expires_at, verified_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error("[verify-otp] fetch failed:", fetchError.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!verification) {
    return NextResponse.json({ error: "no_pending_verification" }, { status: 404 });
  }

  if (verification.verified_at) {
    return NextResponse.json({ error: "already_verified" }, { status: 409 });
  }

  if (new Date(verification.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  if (verification.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const isValid = verifyOtpCode(code, phone, verification.code_hash);

  if (!isValid) {
    // 오입력 카운트 증가
    await supabase
      .from("phone_verifications")
      .update({ attempts: verification.attempts + 1 })
      .eq("id", verification.id);

    return NextResponse.json(
      {
        error: "wrong_code",
        remaining_attempts: OTP_CONFIG.MAX_ATTEMPTS - verification.attempts - 1,
      },
      { status: 401 }
    );
  }

  // 성공: verified_at 기록
  const { error: updateError } = await supabase
    .from("phone_verifications")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", verification.id);

  if (updateError) {
    console.error("[verify-otp] mark verified failed:", updateError.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone });
}
