// 서버 전용 - 알림톡 발송 + notification_logs 기록
// 중복 방지 (idempotency) + 에러 시 메인 로직 차단 안 함

import { createAdminClient } from "@/lib/supabase/admin";
import { sendAlimtalk } from "./alimtalk";
import type { NotificationEventType } from "@/types/database";
import { logger } from "@/lib/utils/logger";

interface SendAndLogParams {
  eventType: NotificationEventType;
  auctionId: string;
  recipientUserId: string | null;
  recipientPhone: string;
  templateId: string;
  variables: Record<string, string>;
}

export async function sendAlimtalkAndLog(
  params: SendAndLogParams
): Promise<void> {
  const supabase = createAdminClient();

  // 중복 발송 방지: 같은 이벤트+경매+수신자 조합으로 이미 발송된 기록이 있으면 skip
  const { data: existing } = await supabase
    .from("notification_logs")
    .select("id")
    .eq("event_type", params.eventType)
    .eq("auction_id", params.auctionId)
    .eq("recipient_phone", params.recipientPhone)
    .eq("status", "sent")
    .limit(1);

  if (existing && existing.length > 0) {
    logger.log(
      `[Alimtalk] Skipping duplicate: ${params.eventType} for auction ${params.auctionId}`
    );
    return;
  }

  try {
    const result = await sendAlimtalk({
      to: params.recipientPhone,
      templateId: params.templateId,
      variables: params.variables,
    });

    await supabase.from("notification_logs").insert({
      event_type: params.eventType,
      auction_id: params.auctionId,
      recipient_user_id: params.recipientUserId,
      recipient_phone: params.recipientPhone,
      template_id: params.templateId,
      solapi_message_id:
        (result as Record<string, unknown>)?.groupId?.toString() || null,
      status: "sent",
    });
  } catch (error) {
    logger.error(`[Alimtalk] Failed to send ${params.eventType}:`, error);

    await supabase.from("notification_logs").insert({
      event_type: params.eventType,
      auction_id: params.auctionId,
      recipient_user_id: params.recipientUserId,
      recipient_phone: params.recipientPhone,
      template_id: params.templateId,
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
    });
    // 메인 로직 차단 안 함 - throw하지 않음
  }
}
