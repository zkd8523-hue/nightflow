import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

type TestRole = "user";

// MD/Admin 테스트 계정 제거: 이 엔드포인트로는 일반 유저 외의 권한을 부여할 수 없다
const TEST_ACCOUNTS: Record<string, { role: TestRole; displayName: string }> = {
  "test-user@nightflow.test": { role: "user", displayName: "TestUser" },
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
    display_name: preset.displayName,
    gender: "male" as const,
    role: preset.role,
    md_status: null,
    alimtalk_consent: false,
    alimtalk_consent_at: null,
  };

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
