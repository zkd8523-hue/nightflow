import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/utils/logger";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // 1. Admin 권한 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: adminUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!adminUser || adminUser.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    // 2. 요청 데이터 파싱
    const { userId, type } = await req.json();

    if (!userId || !type || !["noshow", "strike"].includes(type)) {
      return NextResponse.json(
        { error: "userId와 type(noshow, strike)은 필수입니다" },
        { status: 400 }
      );
    }

    // 3. 패널티 초기화
    const updateData: Record<string, unknown> = {};

    if (type === "noshow") {
      updateData.noshow_count = 0;
    } else if (type === "strike") {
      // Model B: 스트라이크 및 관련 차단 상태 초기화
      updateData.strike_count = 0;
      updateData.strike_updated_at = null;
      updateData.blocked_until = null;
      updateData.banned_until = null;
      updateData.is_blocked = false;  // 스트라이크로 인한 차단 해제
    }

    const { error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", userId);

    if (error) throw error;

    logger.log(`[Admin] User ${userId} penalty reset (${type}) by ${user.id} | strikeCount: ${updateData.strike_count !== undefined ? updateData.strike_count : 'unchanged'}`);

    return NextResponse.json({ success: true, type });
  } catch (error) {
    logger.error("[Admin/ResetPenalty] Error:", error);
    const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
