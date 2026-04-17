import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// PATCH /api/admin/appeals/[id] — Admin이 이의제기 처리
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // Admin 권한 확인
    const { data: adminUser } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (adminUser?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { status, admin_response } = await req.json();

    if (!status || !["accepted", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'accepted' or 'rejected'" },
        { status: 400 }
      );
    }

    if (!admin_response || typeof admin_response !== "string" || admin_response.trim().length < 5) {
      return NextResponse.json(
        { error: "관리자 답변을 5자 이상 입력해주세요." },
        { status: 400 }
      );
    }

    // 이의제기 정보 조회
    const { data: appeal } = await supabaseAdmin
      .from("penalty_appeals")
      .select("id, status, user_id, noshow_history_id")
      .eq("id", params.id)
      .single();

    if (!appeal) {
      return NextResponse.json({ error: "이의제기를 찾을 수 없습니다." }, { status: 404 });
    }

    if (appeal.status !== "pending") {
      return NextResponse.json(
        { error: "이미 처리된 이의제기입니다." },
        { status: 409 }
      );
    }

    // 이의제기 상태 업데이트
    const { error: updateError } = await supabaseAdmin
      .from("penalty_appeals")
      .update({
        status,
        admin_id: user.id,
        admin_response: admin_response.trim(),
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (updateError) throw updateError;

    // 인용(accepted) 시: 스트라이크 1 감소 + 정지 해제
    if (status === "accepted") {
      const { data: targetUser } = await supabaseAdmin
        .from("users")
        .select("strike_count, is_blocked, blocked_until")
        .eq("id", appeal.user_id)
        .single();

      if (targetUser) {
        const newStrikeCount = Math.max(0, (targetUser.strike_count || 0) - 1);
        const shouldUnblock = newStrikeCount === 0;

        await supabaseAdmin
          .from("users")
          .update({
            strike_count: newStrikeCount,
            ...(shouldUnblock ? { blocked_until: null, is_blocked: false } : {}),
          })
          .eq("id", appeal.user_id);
      }

      // 유저에게 인용 알림
      await supabaseAdmin
        .from("in_app_notifications")
        .insert({
          user_id: appeal.user_id,
          type: "noshow_dismissed",
          title: "이의제기가 인용되었습니다",
          message: `검토 결과 이의제기가 인용되었습니다. 관리자 답변: ${admin_response.trim()}`,
          action_url: "/my-penalties",
        });
    } else {
      // 기각 알림
      await supabaseAdmin
        .from("in_app_notifications")
        .insert({
          user_id: appeal.user_id,
          type: "noshow_dismissed",
          title: "이의제기가 기각되었습니다",
          message: `검토 결과 이의제기가 기각되었습니다. 관리자 답변: ${admin_response.trim()}`,
          action_url: "/my-penalties",
        });
    }

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[API admin/appeals] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
