import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MDSanctionAction } from "@/types/database";
import { logger } from "@/lib/utils/logger";

const VALID_ACTIONS: MDSanctionAction[] = ["warning", "suspend", "unsuspend", "revoke"];
const VALID_DURATIONS = [7, 30, 90];

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
    const { mdId, action, reason, durationDays } = await req.json();

    if (!mdId || !action || !reason?.trim()) {
      return NextResponse.json(
        { error: "mdId, action, reason은 필수입니다" },
        { status: 400 }
      );
    }

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `유효하지 않은 action: ${action}` },
        { status: 400 }
      );
    }

    if (action === "suspend" && (!durationDays || !VALID_DURATIONS.includes(durationDays))) {
      return NextResponse.json(
        { error: "정지 기간은 7, 30, 90일 중 선택해야 합니다" },
        { status: 400 }
      );
    }

    // 3. 대상 MD 확인
    const supabaseAdmin = createAdminClient();

    const { data: mdUser, error: mdError } = await supabaseAdmin
      .from("users")
      .select("id, role, md_status, name")
      .eq("id", mdId)
      .single();

    if (mdError || !mdUser) {
      return NextResponse.json({ error: "MD를 찾을 수 없습니다" }, { status: 404 });
    }

    // 4. 액션별 상태 검증
    if (action === "warning" && mdUser.md_status !== "approved" && mdUser.md_status !== "suspended") {
      return NextResponse.json(
        { error: "경고는 활동 중이거나 정지된 MD에게만 가능합니다" },
        { status: 400 }
      );
    }

    if (action === "suspend" && mdUser.md_status !== "approved") {
      return NextResponse.json(
        { error: "정지는 활동 중인 MD에게만 가능합니다" },
        { status: 400 }
      );
    }

    if (action === "unsuspend" && mdUser.md_status !== "suspended") {
      return NextResponse.json(
        { error: "정지 해제는 정지 상태인 MD에게만 가능합니다" },
        { status: 400 }
      );
    }

    if (action === "revoke" && mdUser.md_status !== "approved" && mdUser.md_status !== "suspended") {
      return NextResponse.json(
        { error: "자격 박탈은 활동 중이거나 정지된 MD에게만 가능합니다" },
        { status: 400 }
      );
    }

    // 5. 액션 실행
    let suspendedUntil: string | null = null;
    let cancelledCount = 0;

    if (action === "suspend") {
      suspendedUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

      // MD 상태 업데이트
      await supabaseAdmin
        .from("users")
        .update({
          md_status: "suspended",
          md_suspended_until: suspendedUntil,
        })
        .eq("id", mdId);

      // 진행중 경매 취소
      const { data: cancelled } = await supabaseAdmin
        .from("auctions")
        .update({ status: "cancelled" })
        .eq("md_id", mdId)
        .in("status", ["active", "scheduled", "draft"])
        .select("id");

      cancelledCount = cancelled?.length || 0;

      // 취소된 경매의 입찰도 취소
      if (cancelledCount > 0) {
        const cancelledIds = cancelled!.map((a: { id: string }) => a.id);
        await supabaseAdmin
          .from("bids")
          .update({ status: "cancelled" })
          .in("auction_id", cancelledIds)
          .in("status", ["active", "outbid"]);
      }
    }

    if (action === "unsuspend") {
      await supabaseAdmin
        .from("users")
        .update({
          md_status: "approved",
          md_suspended_until: null,
        })
        .eq("id", mdId);
    }

    if (action === "revoke") {
      // role을 user로 변경 → 미들웨어가 /md/* 접근 차단
      await supabaseAdmin
        .from("users")
        .update({
          role: "user",
          md_status: "revoked",
          md_suspended_until: null,
        })
        .eq("id", mdId);

      // 진행중 경매 취소
      const { data: cancelled } = await supabaseAdmin
        .from("auctions")
        .update({ status: "cancelled" })
        .eq("md_id", mdId)
        .in("status", ["active", "scheduled", "draft"])
        .select("id");

      cancelledCount = cancelled?.length || 0;

      if (cancelledCount > 0) {
        const cancelledIds = cancelled!.map((a: { id: string }) => a.id);
        await supabaseAdmin
          .from("bids")
          .update({ status: "cancelled" })
          .in("auction_id", cancelledIds)
          .in("status", ["active", "outbid"]);
      }
    }

    // 6. 제재 이력 기록
    await supabaseAdmin.from("md_sanctions").insert({
      md_id: mdId,
      admin_id: user.id,
      action,
      reason: reason.trim(),
      duration_days: action === "suspend" ? durationDays : null,
      suspended_until: suspendedUntil,
      active_auctions_cancelled: cancelledCount,
    });

    logger.log(
      `[Admin/MD Sanction] ${action} on MD ${mdUser.name}(${mdId}) by admin ${user.id}` +
      (cancelledCount > 0 ? ` — ${cancelledCount} auctions cancelled` : "")
    );

    return NextResponse.json({
      success: true,
      action,
      mdId,
      suspendedUntil,
      cancelledAuctions: cancelledCount,
    });
  } catch (error) {
    logger.error("[Admin/MD Sanction] Error:", error);
    const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
