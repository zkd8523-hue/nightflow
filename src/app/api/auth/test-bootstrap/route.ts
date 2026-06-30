import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

type TestRole = "user" | "md" | "admin";

const TEST_ACCOUNTS: Record<string, { phone: string; role: TestRole; displayName: string }> = {
  "test-user@nightflow.test": { phone: "01099990001", role: "user", displayName: "TestUser" },
  "test-md@nightflow.test": { phone: "01099990002", role: "md", displayName: "TestMD" },
  "test-admin@nightflow.test": { phone: "01099990003", role: "admin", displayName: "TestAdmin" },
};

export async function POST() {
  // 프로덕션 차단: 이 엔드포인트는 호출자를 admin 으로 승격시킬 수 있으므로
  // 운영 환경에서는 절대 노출하지 않는다 (dev/preview/QA 전용).
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const serverSupabase = await createServerSupabase();
  const { data: { user }, error: authError } = await serverSupabase.auth.getUser();

  if (authError || !user || !user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const preset = TEST_ACCOUNTS[user.email];
  if (!preset) {
    return NextResponse.json({ error: "not_a_test_account" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Clean up any previous users squatting on the magic phone
  const { data: squatters } = await admin
    .from("users")
    .select("id")
    .eq("phone", preset.phone)
    .neq("id", user.id);

  for (const squatter of squatters ?? []) {
    try {
      await admin.auth.admin.deleteUser(squatter.id);
    } catch (e) {
      console.warn("[test-bootstrap] failed to remove squatter", squatter.id, e);
    }
  }

  const { data: existing } = await admin
    .from("users")
    .select("id, deleted_at")
    .eq("id", user.id)
    .maybeSingle();

  if (existing?.deleted_at) {
    await admin
      .from("users")
      .update({ deleted_at: null, deletion_scheduled_at: null })
      .eq("id", user.id);
  }

  const baseFields = {
    phone: preset.phone,
    display_name: preset.displayName,
    gender: "male" as const,
    role: preset.role,
    md_status: preset.role === "md" ? "approved" : null,
    alimtalk_consent: false,
    alimtalk_consent_at: null,
  };

  // INSERT 시 DB 트리거 validate_phone_otp_on_signup가 phone_verifications에
  // 10분 이내 verified 레코드를 요구함 → DEV 우회 위해 가짜 OTP 인증 박기
  if (!existing) {
    await admin.from("phone_verifications").insert({
      phone: preset.phone,
      code_hash: "test-bootstrap",
      verified_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  const { error: writeError } = existing
    ? await admin.from("users").update(baseFields).eq("id", user.id)
    : await admin.from("users").insert({
        id: user.id,
        kakao_id: user.id,
        signup_source: "test",
        profile_image: null,
        ...baseFields,
      });

  if (writeError) {
    console.error("[test-bootstrap] write failed:", writeError.message);
    return NextResponse.json({ error: "write_failed", message: writeError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role: preset.role });
}
