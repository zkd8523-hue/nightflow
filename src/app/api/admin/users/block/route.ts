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
    const { userId, block } = await req.json();

    if (!userId || typeof block !== "boolean") {
      return NextResponse.json(
        { error: "userId와 block은 필수입니다" },
        { status: 400 }
      );
    }

    // 3. 유저 차단/해제
    const updateData: Record<string, unknown> = {
      is_blocked: block,
    };

    if (block) {
      // 차단 시 7일 후 자동 해제
      updateData.blocked_until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      // 해제 시 blocked_until 제거
      updateData.blocked_until = null;
    }

    const { error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", userId);

    if (error) throw error;

    logger.log(`[Admin] User ${userId} ${block ? "blocked" : "unblocked"} by ${user.id}`);

    return NextResponse.json({ success: true, blocked: block });
  } catch (error) {
    logger.error("[Admin/Block] Error:", error);
    const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
