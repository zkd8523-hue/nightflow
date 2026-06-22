import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

const isDev = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";

export async function POST() {
  if (!isDev) {
    return NextResponse.json({ error: "dev_only" }, { status: 403 });
  }

  const serverSupabase = await createServerSupabase();
  const { data: { user }, error: authError } = await serverSupabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 테스트용: users 테이블에서 해당 유저 row 삭제 → signup 폼 처음부터 진행
  await admin.from("users").delete().eq("id", user.id);

  return NextResponse.json({ ok: true });
}
