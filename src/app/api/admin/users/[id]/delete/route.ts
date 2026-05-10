import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/utils/logger";

// Admin: 유저 강제 hard delete (테스트 계정 정리 등)
// - 30일 grace period 없이 즉시 영구 삭제
// - admin_delete_user() RPC가 권한·자기삭제·admin 대상 가드 처리
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const supabase = await createClient();

    // 1. 호출자 admin 검증 (RPC 안에서도 검증하지만 빠른 fail-fast)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: adminUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (adminUser?.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (!userId) {
      return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });
    }

    // 2. RPC 호출 (auth.uid()가 실행 컨텍스트의 admin id)
    const { data, error } = await supabase.rpc("admin_delete_user", { p_user_id: userId });

    if (error) {
      logger.error("[Admin/DeleteUser] RPC error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logger.log(`[Admin] User ${userId} hard-deleted by ${user.id}`);
    return NextResponse.json(data);
  } catch (error) {
    logger.error("[Admin/DeleteUser] Error:", error);
    const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
