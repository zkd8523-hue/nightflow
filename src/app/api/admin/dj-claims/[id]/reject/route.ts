import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

// Admin: DJ 인증 신청 거절. MD는 거절 시 무음이지만(기존 약점), 여기선 그
// 약점을 복제하지 않고 신청자에게 푸시를 보낸다(사용자 결정).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: claimId } = await params;
    const body = await req.json().catch(() => ({}));
    const reason: string = body.reason || "";

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAdmin = createAdminClient();
    const { data: admin } = await supabaseAdmin.from("users").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") {
      return NextResponse.json({ error: "Admin 권한이 필요합니다." }, { status: 403 });
    }

    const { data: claim } = await supabaseAdmin
      .from("dj_claims")
      .select("id, status, claimant_id")
      .eq("id", claimId)
      .single();

    if (!claim || claim.status !== "pending") {
      return NextResponse.json({ error: "pending 상태의 신청만 거절할 수 있습니다." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("dj_claims")
      .update({
        status: "rejected",
        reject_reason: reason || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", claimId);
    if (error) throw error;

    try {
      await supabaseAdmin.rpc("notify_user_push", {
        p_user_id: claim.claimant_id,
        p_title: "DJ 인증 신청이 반려됐어요",
        p_body: reason || "자세한 사유는 앱에서 확인해주세요.",
        p_data: { type: "dj_claim_rejected" },
        p_url: "/dj/apply",
      });
    } catch (notifyErr) {
      logger.error("[Admin dj-claims reject] 알림 발송 실패:", notifyErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Admin dj-claims reject] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
