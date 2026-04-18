import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Admin: MD 최종 승인 (approved + role='md' + instagram_verified_at)
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
      .select("md_status, instagram_verified_at")
      .eq("id", mdId)
      .single();

    if (!md || md.md_status !== "pending") {
      return NextResponse.json({ error: "pending 상태의 MD만 승인할 수 있습니다." }, { status: 400 });
    }

    if (!md.instagram_verified_at) {
      return NextResponse.json({ error: "인스타그램 인증이 완료되지 않았습니다." }, { status: 400 });
    }

    // 3. 승인 처리
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        md_status: "approved",
        role: "md",
        instagram_verify_code: null, // 코드 정리
      })
      .eq("id", mdId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin approve] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
