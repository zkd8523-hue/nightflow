import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sendMDApprovedNotification, ALIMTALK_TEMPLATES } from "@/lib/notifications/alimtalk";
import { logger } from "@/lib/utils/logger";

// Admin: MD 최종 승인 (approved + role='md')
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mdId } = await params;

    // body에 merge_club_id가 있으면 기존 클럽에 병합하여 승인
    const body = await req.json().catch(() => ({}));
    const merge_club_id: string | undefined = body.merge_club_id || undefined;
    // link_club_ids: MD가 여러 클럽 운영 시 기존 클럽들에 파트너로 연결
    const link_club_ids: string[] = Array.isArray(body.link_club_ids) ? body.link_club_ids.filter(Boolean) : [];

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
      .select("md_status, name, phone, default_club_id")
      .eq("id", mdId)
      .single();

    if (!md || md.md_status !== "pending") {
      return NextResponse.json({ error: "pending 상태의 파트너만 승인할 수 있습니다." }, { status: 400 });
    }

    // 2-1. 클럽 병합 처리 (merge_club_id 있을 때)
    //   - 같은 venue 통일을 위해 신청 클럽의 name만 기존 클럽 이름으로 교체
    //   - 신청 클럽 자체는 신청자 본인 명의로 active 유지 (soft-delete 안 함)
    //     → 신청자가 본인 명의 active 클럽을 잃지 않도록 (BLOCKED 방지)
    //   - default_club_id는 신청 클럽 그대로 유지
    if (merge_club_id) {
      const pendingClubId = md.default_club_id;
      if (pendingClubId && pendingClubId !== merge_club_id) {
        const { data: targetClub } = await supabaseAdmin
          .from("clubs")
          .select("name")
          .eq("id", merge_club_id)
          .is("deleted_at", null)
          .single();
        if (targetClub?.name) {
          await supabaseAdmin
            .from("clubs")
            .update({ name: targetClub.name })
            .eq("id", pendingClubId);
        }
      }
    }

    // 3. 승인 처리
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        md_status: "approved",
        role: "md",
        md_credits: 60,
      })
      .eq("id", mdId);

    if (error) throw error;

    // 3-1. 기존 클럽 연결 (신청 시 클럽을 생성하지 않으므로, 승인 때 실제 클럽에 연결).
    //      club_partners partner로 upsert + 첫 클럽을 기본 클럽으로 지정.
    //      연결 실패는 승인 자체를 막지 않고 로깅만.
    if (link_club_ids.length > 0) {
      const { error: linkErr } = await supabaseAdmin
        .from("club_partners")
        .upsert(
          link_club_ids.map((cid) => ({ club_id: cid, md_id: mdId, role: "partner" as const })),
          { onConflict: "club_id,md_id", ignoreDuplicates: true }
        );
      if (linkErr) logger.error("[Admin approve] 클럽 연결 실패:", linkErr);

      // 첫 연결 클럽을 기본 클럽으로 지정 (신청 시 default_club_id = null).
      const { error: defErr } = await supabaseAdmin
        .from("users")
        .update({ default_club_id: link_club_ids[0] })
        .eq("id", mdId);
      if (defErr) logger.error("[Admin approve] 기본 클럽 지정 실패:", defErr);
    }

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
