import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// POST /api/penalty/appeal — 이의제기 제출
export async function POST(req: Request) {
  try {
    const { noshow_history_id, reason } = await req.json();

    if (!noshow_history_id || !reason) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (typeof reason !== "string" || reason.trim().length < 20) {
      return NextResponse.json(
        { error: "이의제기 사유는 최소 20자 이상 작성해주세요." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 본인 노쇼 이력인지 서버사이드 검증
    const { data: history } = await supabaseAdmin
      .from("noshow_history")
      .select("id, user_id")
      .eq("id", noshow_history_id)
      .single();

    if (!history) {
      return NextResponse.json({ error: "노쇼 이력을 찾을 수 없습니다." }, { status: 404 });
    }

    if (history.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 이미 이의제기했는지 확인 (UNIQUE constraint 있지만 사전 체크로 더 명확한 에러 메시지)
    const { data: existing } = await supabaseAdmin
      .from("penalty_appeals")
      .select("id, status")
      .eq("noshow_history_id", noshow_history_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "이미 이의제기를 제출한 노쇼 이력입니다.", status: existing.status },
        { status: 409 }
      );
    }

    const { data: appeal, error } = await supabaseAdmin
      .from("penalty_appeals")
      .insert({
        user_id: user.id,
        noshow_history_id,
        reason: reason.trim(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, appeal });
  } catch (error) {
    console.error("[API penalty/appeal] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
