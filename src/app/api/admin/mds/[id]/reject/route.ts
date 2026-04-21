import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mdId } = await params;
    const body = await req.json().catch(() => ({}));
    const reason: string = body.reason || "";

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

    const { data: md } = await supabaseAdmin
      .from("users")
      .select("md_status")
      .eq("id", mdId)
      .single();

    if (!md || md.md_status !== "pending") {
      return NextResponse.json({ error: "pending 상태의 MD만 거절할 수 있습니다." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({
        md_status: "rejected",
        md_rejection_reason: reason || null,
      })
      .eq("id", mdId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Admin reject] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
