import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// MD: 인증코드 입력 → DB 코드 비교 → instagram_verified_at 설정
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json({ error: "6자리 인증코드를 입력해주세요." }, { status: 400 });
    }

    // 1. 인증
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAdmin = createAdminClient();

    // 2. 사용자 조회
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("md_status, instagram_verify_code, instagram_verified_at")
      .eq("id", user.id)
      .single();

    if (!userData || userData.md_status !== "pending") {
      return NextResponse.json({ error: "심사 중인 MD만 인증코드를 입력할 수 있습니다." }, { status: 400 });
    }

    if (userData.instagram_verified_at) {
      return NextResponse.json({ error: "이미 인증이 완료되었습니다." }, { status: 400 });
    }

    if (!userData.instagram_verify_code) {
      return NextResponse.json({ error: "아직 인증코드가 발급되지 않았습니다. 잠시 후 다시 시도해주세요." }, { status: 400 });
    }

    // 3. 코드 비교
    if (userData.instagram_verify_code !== code) {
      return NextResponse.json({ error: "인증코드가 일치하지 않습니다." }, { status: 400 });
    }

    // 4. 인증 완료 → 자동 승인
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        instagram_verified_at: new Date().toISOString(),
        instagram_verify_code: null,
        md_status: "approved",
        role: "md",
      })
      .eq("id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MD verify-instagram] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
