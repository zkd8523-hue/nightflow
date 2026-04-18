import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Admin: 6자리 인증코드 생성 → DB 저장
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mdId } = await params;

    // 1. Admin 권한 확인
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAdmin = createAdminClient();
    const { data: admin } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (admin?.role !== "admin") {
      return NextResponse.json({ error: "Admin 권한이 필요합니다." }, { status: 403 });
    }

    // 2. 대상 MD 확인
    const { data: md } = await supabaseAdmin
      .from("users")
      .select("md_status, instagram")
      .eq("id", mdId)
      .single();

    if (!md || md.md_status !== "pending") {
      return NextResponse.json({ error: "pending 상태의 MD만 인증코드를 발급할 수 있습니다." }, { status: 400 });
    }

    if (!md.instagram) {
      return NextResponse.json({ error: "인스타그램 ID가 등록되지 않은 MD입니다." }, { status: 400 });
    }

    // 3. 6자리 인증코드 생성
    const code = String(Math.floor(100000 + Math.random() * 900000));

    const { error } = await supabaseAdmin
      .from("users")
      .update({ instagram_verify_code: code })
      .eq("id", mdId);

    if (error) throw error;

    return NextResponse.json({ success: true, code, instagram: md.instagram });
  } catch (error) {
    console.error("[Admin verify-code] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
