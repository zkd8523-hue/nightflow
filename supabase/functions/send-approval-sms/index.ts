// MD 승인 시 자동 SMS 발송
// Coolsms API 사용

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const COOLSMS_API_KEY = Deno.env.get("COOLSMS_API_KEY");
const COOLSMS_API_SECRET = Deno.env.get("COOLSMS_API_SECRET");
const COOLSMS_SENDER = Deno.env.get("COOLSMS_SENDER"); // 발신번호 (등록된 번호)

interface WebhookPayload {
  type: "UPDATE";
  table: string;
  record: {
    id: string;
    name: string;
    phone: string;
    role: string;
    md_status: string;
  };
  old_record: {
    md_status: string;
  };
}

serve(async (req) => {
  try {
    // 1. Webhook 데이터 파싱
    const payload: WebhookPayload = await req.json();
    console.log("Webhook received:", payload);

    // 2. md_status가 'approved'로 변경되었는지 확인
    if (
      payload.old_record.md_status !== "approved" &&
      payload.record.md_status === "approved"
    ) {
      const { name, phone } = payload.record;

      // 3. SMS 메시지 작성
      const message = `[NightFlow] ${name}님, MD 승인이 완료되었습니다! 이제 경매를 등록하고 수수료를 받으세요. https://nightflow.kr/md/dashboard`;

      // 4. Coolsms API 호출
      const response = await fetch("https://api.coolsms.co.kr/messages/v4/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${COOLSMS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            to: phone.replace(/-/g, ""), // 하이픈 제거
            from: COOLSMS_SENDER,
            text: message,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Coolsms API error:", error);
        throw new Error(`SMS 발송 실패: ${error}`);
      }

      const result = await response.json();
      console.log("SMS sent successfully:", result);

      return new Response(
        JSON.stringify({ success: true, message: "SMS 발송 완료", result }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // md_status 변경이 아니면 무시
    return new Response(
      JSON.stringify({ success: true, message: "No action needed" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
