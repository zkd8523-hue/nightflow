// Resend 이메일 발송 공유 모듈
// 외국인(카카오 알림톡 불가) 알림을 이메일로 발송.
//
// 사용법:
//   import { resendSend } from "../_shared/resend.ts";
//   await resendSend({ to, subject, html });
//
// 환경변수 (Supabase secrets):
//   RESEND_API_KEY   — Resend API 키 (re_...)
//   RESEND_FROM      — 발신 주소 (기본 "NightFlow <team@nightflow.kr>")
//   RESEND_REPLY_TO  — 답장 받을 주소 (기본 문의용 이메일)

const DEFAULT_REPLY_TO = "zkd8523@gmail.com";

export async function resendSend(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("RESEND_API_KEY 미설정");
  }
  const from = Deno.env.get("RESEND_FROM") || "NightFlow <team@nightflow.kr>";
  const replyTo = opts.replyTo || Deno.env.get("RESEND_REPLY_TO") || DEFAULT_REPLY_TO;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}
