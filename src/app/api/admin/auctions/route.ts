import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: adminUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminUser || adminUser.role !== "admin") {
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }

  return { user };
}

// PATCH: 경매 강제 취소
export async function PATCH(req: Request) {
  try {
    const result = await verifyAdmin();
    if (result.error) return result.error;

    const { auctionId, action, reason } = await req.json();

    if (!auctionId) {
      return NextResponse.json({ error: "auctionId는 필수입니다" }, { status: 400 });
    }
    if (action !== "cancel") {
      return NextResponse.json({ error: "지원하지 않는 액션입니다" }, { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "취소 사유를 입력해주세요" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 경매 존재 및 상태 확인
    const { data: auction, error: fetchError } = await admin
      .from("auctions")
      .select("id, status, title, md_id")
      .eq("id", auctionId)
      .single();

    if (fetchError || !auction) {
      return NextResponse.json({ error: "경매를 찾을 수 없습니다" }, { status: 404 });
    }

    if (!["active", "scheduled"].includes(auction.status)) {
      return NextResponse.json(
        { error: "active 또는 scheduled 상태의 경매만 취소할 수 있습니다" },
        { status: 400 }
      );
    }

    // 1. 경매 상태 변경
    const { error: auctionError } = await admin
      .from("auctions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", auctionId);

    if (auctionError) throw auctionError;

    // 2. 활성 입찰 전부 취소
    await admin
      .from("bids")
      .update({ status: "cancelled" })
      .eq("auction_id", auctionId)
      .in("status", ["active", "outbid"]);

    logger.log(
      `[Admin] Auction ${auctionId} ("${auction.title}") force-cancelled by ${result.user!.id}. Reason: ${reason.trim()}`
    );

    // MD에게 인앱 알림 발송
    if (auction.md_id) {
      const { error: notificationError } = await admin.from("in_app_notifications").insert({
        user_id: auction.md_id,
        type: "auction_admin_cancelled",
        title: "경매가 관리자에 의해 취소되었습니다",
        message: `"${auction.title}" 경매가 관리자에 의해 강제 취소되었습니다. 사유: ${reason.trim()}`,
        action_url: "/md/dashboard",
      });
      if (notificationError) {
        logger.error(`[Admin] Failed to send cancellation notification to MD ${auction.md_id}`, notificationError);
      }
    }

    return NextResponse.json({ success: true, auctionId, action: "cancel" });
  } catch (error) {
    logger.error("[Admin/Auctions] PATCH Error:", error);
    const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: draft 경매 삭제
export async function DELETE(req: Request) {
  try {
    const result = await verifyAdmin();
    if (result.error) return result.error;

    const { searchParams } = new URL(req.url);
    const auctionId = searchParams.get("auctionId");

    if (!auctionId) {
      return NextResponse.json({ error: "auctionId는 필수입니다" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: auction, error: fetchError } = await admin
      .from("auctions")
      .select("id, status, title, md_id")
      .eq("id", auctionId)
      .single();

    if (fetchError || !auction) {
      return NextResponse.json({ error: "경매를 찾을 수 없습니다" }, { status: 404 });
    }

    if (auction.status !== "draft") {
      return NextResponse.json(
        { error: "draft 상태의 경매만 삭제할 수 있습니다" },
        { status: 400 }
      );
    }

    // bids 먼저 삭제 (CASCADE 없음)
    await admin.from("bids").delete().eq("auction_id", auctionId);
    const { error: deleteError } = await admin.from("auctions").delete().eq("id", auctionId);

    if (deleteError) throw deleteError;

    logger.log(`[Admin] Auction ${auctionId} ("${auction.title}") deleted by ${result.user!.id}`);

    // MD에게 인앱 알림 발송
    if (auction.md_id) {
      const { error: notificationError } = await admin.from("in_app_notifications").insert({
        user_id: auction.md_id,
        type: "auction_admin_deleted",
        title: "경매 초안이 관리자에 의해 삭제되었습니다",
        message: `"${auction.title}" 경매 초안이 관리자에 의해 삭제되었습니다.`,
        action_url: "/md/dashboard",
      });
      if (notificationError) {
        logger.error(`[Admin] Failed to send deletion notification to MD ${auction.md_id}`, notificationError);
      }
    }

    return NextResponse.json({ success: true, auctionId, action: "delete" });
  } catch (error) {
    logger.error("[Admin/Auctions] DELETE Error:", error);
    const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
