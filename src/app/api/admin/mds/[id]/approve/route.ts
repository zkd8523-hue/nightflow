import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sendMDApprovedNotification, ALIMTALK_TEMPLATES } from "@/lib/notifications/alimtalk";
import { logger } from "@/lib/utils/logger";

// Admin: MD 최종 승인 (approved + role='md')
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mdId } = await params;

    // 1. Admin 권한 확인
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

    // 2. 대상 MD 확인
    const { data: md } = await supabaseAdmin
      .from("users")
      .select("md_status, name, phone")
      .eq("id", mdId)
      .single();

    if (!md || md.md_status !== "pending") {
      return NextResponse.json({ error: "pending 상태의 MD만 승인할 수 있습니다." }, { status: 400 });
    }

    // 3. 승인 처리
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        md_status: "approved",
        role: "md",
      })
      .eq("id", mdId);

    if (error) throw error;

    // 4. 승인 알림톡 발송
    if (md.phone) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nightflow.co";
        await sendMDApprovedNotification(md.phone, {
          name: md.name || "파트너",
          dashboardUrl: `${appUrl}/md`,
        });

        await supabaseAdmin.from("notification_logs").insert({
          event_type: "md_approved" as const,
          auction_id: mdId,
          recipient_user_id: mdId,
          recipient_phone: md.phone,
          template_id: ALIMTALK_TEMPLATES.MD_APPROVED,
          status: "sent",
        });
      } catch (notifError) {
        logger.error("[Admin approve] 알림톡 발송 실패:", notifError);
        await supabaseAdmin.from("notification_logs").insert({
          event_type: "md_approved" as const,
          auction_id: mdId,
          recipient_user_id: mdId,
          recipient_phone: md.phone,
          template_id: ALIMTALK_TEMPLATES.MD_APPROVED,
          status: "failed",
          error_message: notifError instanceof Error ? notifError.message : String(notifError),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin approve] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
