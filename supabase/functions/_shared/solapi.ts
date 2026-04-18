// SOLAPI 알림톡 발송 공유 모듈
// 3개 Edge Function (close-expired-auctions, expire-contacts, notify-contact-deadline)에서
// 복붙되어 있던 SOLAPI 발송 로직을 단일 모듈로 추출
//
// 사용법:
//   import { solapiSendAlimtalk } from "../_shared/solapi.ts";
//   await solapiSendAlimtalk(phone, templateId, { var1: "value1" });
//
// 환경변수 (각 Edge Function 호출 시점에 Deno.env.get으로 읽음):
//   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER, SOLAPI_PFID

export async function solapiSendAlimtalk(
  to: string,
  templateId: string,
  vars: Record<string, string>
): Promise<void> {
  const apiKey = Deno.env.get("SOLAPI_API_KEY");
  const apiSecret = Deno.env.get("SOLAPI_API_SECRET") || "";
  const sender = Deno.env.get("SOLAPI_SENDER_NUMBER");
  const pfId = Deno.env.get("SOLAPI_PFID");

  if (!apiKey || !apiSecret || !sender || !pfId) {
    throw new Error("SOLAPI 환경변수 미설정 (API_KEY/SECRET/SENDER/PFID)");
  }

  const timestamp = new Date().toISOString();
  const salt = crypto.randomUUID();

  // HMAC-SHA256 서명 생성
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = encoder.encode(timestamp + salt);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const signature = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // SOLAPI 변수 포맷 (#{key} 형식)
  const formattedVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    formattedVars[`#{${k}}`] = v;
  }

  const res = await fetch("https://api.solapi.com/messages/v4/send-many", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${timestamp}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({
      messages: [
        {
          to: to.replace(/[^0-9]/g, ""),
          from: sender.replace(/[^0-9]/g, ""),
          kakaoOptions: {
            pfId,
            templateId,
            variables: formattedVars,
            disableSms: true,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SOLAPI error ${res.status}: ${body}`);
  }
}
