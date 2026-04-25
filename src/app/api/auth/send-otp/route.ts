import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import {
  generateOtpCode,
  getOtpExpiresAt,
  hashOtpCode,
  isValidKoreanPhone,
  isTestEnv,
  normalizePhone,
  sendOtpSms,
} from "@/lib/auth/otp";

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

type Purpose = "signup" | "md_apply";

export async function POST(req: NextRequest) {
  let body: { phone?: string; purpose?: Purpose };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawPhone = body.phone ?? "";
  const purpose: Purpose = body.purpose === "md_apply" ? "md_apply" : "signup";

  if (!isValidKoreanPhone(rawPhone)) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? null;

  // md_apply 컨텍스트는 인증된 세션 필요 (본인 user.id로 중복 체크 우회)
  let sessionUserId: string | null = null;
  if (purpose === "md_apply") {
    const serverSupabase = await createServerSupabase();
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    sessionUserId = user.id;
  }

  const supabase = createAdminClient();

  // 1. Rate limit 체크
  const { data: limitResult, error: limitError } = await supabase.rpc(
    "check_otp_rate_limit",
    { p_phone: phone, p_ip: ip }
  );

  if (limitError) {
    console.error("[send-otp] rate limit check failed:", limitError.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const limit = limitResult as { ok: boolean; reason?: string; retry_after_sec?: number };
  if (!limit.ok) {
    const status = limit.reason === "phone_cooldown" ? 429 : 429;
    return NextResponse.json(
      {
        error: limit.reason ?? "rate_limited",
        retry_after_sec: limit.retry_after_sec,
      },
      { status }
    );
  }

  // 2. 중복 가입 방지: 이미 가입된 phone인지 확인
  const { data: existingUser, error: userLookupError } = await supabase
    .from("users")
    .select("id")
    .eq("phone", phone)
    .is("deleted_at", null)
    .maybeSingle();

  if (userLookupError) {
    console.error("[send-otp] user lookup failed:", userLookupError.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (existingUser) {
    // md_apply: 본인이 이미 등록한 phone이면 통과 (재인증 허용)
    // 테스트 환경: 중복 체크 스킵 (동일 번호 재사용 가능)
    const isSelf = purpose === "md_apply" && existingUser.id === sessionUserId;
    if (!isSelf && !isTestEnv()) {
      return NextResponse.json({ error: "phone_already_registered" }, { status: 409 });
    }
  }

  // 3. OTP 생성
  const code = generateOtpCode();
  const codeHash = hashOtpCode(code, phone);
  const expiresAt = getOtpExpiresAt();

  // 4. DB 기록 (SMS 발송 전에 저장해 중복 발송 방지)
  const { error: insertError } = await supabase.from("phone_verifications").insert({
    phone,
    code_hash: codeHash,
    expires_at: expiresAt.toISOString(),
    ip,
    user_agent: userAgent,
  });

  if (insertError) {
    console.error("[send-otp] insert failed:", insertError.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // 5. SMS 발송
  try {
    await sendOtpSms(phone, code);
  } catch (e) {
    console.error("[send-otp] SMS send failed:", e instanceof Error ? e.message : e);
    // 실패한 발송 기록은 남겨두고 rate limit은 소비된 상태로 유지 (남용 방지)
    return NextResponse.json({ error: "sms_send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, expires_at: expiresAt.toISOString() });
}
