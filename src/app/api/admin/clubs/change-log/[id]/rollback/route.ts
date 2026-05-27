import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * admin이 club_change_log row를 보고 old_value 로 롤백.
 * - 롤백 자체도 새 log row 로 자동 기록됨 (trg_log_club_field_change 트리거)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      }
    );

    const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !authUser) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", authUser.id)
      .single();
    if (!userRow || userRow.role !== "admin") {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    const { data: logRow, error: logErr } = await supabaseAdmin
      .from("club_change_log")
      .select("club_id, field, old_value")
      .eq("id", id)
      .single();
    if (logErr || !logRow) {
      return NextResponse.json({ error: "로그를 찾을 수 없습니다." }, { status: 404 });
    }

    const field = logRow.field as string;
    if (!["tags", "operating_hours", "dresscode"].includes(field)) {
      return NextResponse.json({ error: "롤백 불가 필드" }, { status: 400 });
    }

    const oldValue = logRow.old_value;
    const patch: Record<string, unknown> = {};
    if (field === "tags") {
      patch.tags = Array.isArray(oldValue) ? oldValue : [];
    } else if (field === "operating_hours") {
      patch.operating_hours = typeof oldValue === "string" ? oldValue : null;
    } else if (field === "dresscode") {
      patch.dresscode = typeof oldValue === "string" ? oldValue : null;
    }

    const { error: updErr } = await supabaseAdmin
      .from("clubs")
      .update(patch)
      .eq("id", logRow.club_id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/clubs/change-log/rollback]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
