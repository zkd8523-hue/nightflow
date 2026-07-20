import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Admin: 이미 승인된 파트너에게 클럽을 추가로 연결 (club_partners upsert)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mdId } = await params;
    const body = await req.json().catch(() => ({}));
    const clubId: string | undefined = body.club_id || undefined;

    if (!clubId) {
      return NextResponse.json({ error: "club_id가 필요합니다." }, { status: 400 });
    }

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

    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, name, area, address, address_detail, thumbnail_url, floor_plan_url")
      .eq("id", clubId)
      .is("deleted_at", null)
      .single();

    if (!club) {
      return NextResponse.json({ error: "클럽을 찾을 수 없습니다." }, { status: 404 });
    }

    const { error: linkErr } = await supabaseAdmin
      .from("club_partners")
      .upsert(
        { club_id: clubId, md_id: mdId, role: "partner" },
        { onConflict: "club_id,md_id", ignoreDuplicates: true }
      );

    if (linkErr) throw linkErr;

    return NextResponse.json({ success: true, club });
  } catch (error) {
    console.error("[Admin link-club] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
