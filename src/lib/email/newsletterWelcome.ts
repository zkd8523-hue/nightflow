// 뉴스레터 "신청 확인" 메일 1통.
//
// 왜 Edge Function 이 아니라 Next.js 쪽에 두나:
// RESEND_API_KEY 가 Vercel 환경변수(.env.local 기준)에도 이미 들어 있고,
// 구독 INSERT 자체를 서버로 옮기면서(/api/newsletter/subscribe) 같은 요청 안에서
// 보내는 게 가장 짧다. Edge Function 을 거치면 요청이 한 번 더 튀고,
// "저장은 됐는데 메일은 안 갔다"를 추적할 자리가 둘로 늘어난다.
// supabase/functions/_shared/resend.ts 는 Deno 전용이라 그대로 못 쓰고,
// 같은 Resend REST 호출을 Node 쪽에 한 벌 둔다(로직은 동일).
//
// HTML 작성 규칙은 foreign-guest-emails / notify-puzzle-events 와 맞춘다 —
// 메일 클라이언트가 외부 CSS·iframe·audio 를 막으므로 인라인 스타일 + table 레이아웃.

const BRAND = "#0A0A0A";
const CARD = "#1C1C1E";
const LIME = "#DFFF00";
const MUTED = "#9ca3af";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export const NEWSLETTER_SUBJECT = "아티클 구독 신청이 접수됐습니다";

/**
 * 아직 **한 호도 발행하지 않았다.** 그래서 "이번 주 호를 보내드립니다"가 아니라
 * 발행 직전이라 "아직 안 나갔다"는 문구는 쓰지 않는다 — 곧 첫 호가 나간다.
 *
 * 수신거부 링크는 필수다(정보통신망법 제50조 제4항) — 광고성 정보에는
 * 수신거부 방법을 명시해야 하고, 수신자가 쉽게 쓸 수 있어야 한다.
 */
export function newsletterWelcomeHtml(opts: { email: string; unsubscribeUrl: string }): string {
  const { email, unsubscribeUrl } = opts;
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND};font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI',Roboto,'Malgun Gothic',sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">매주 목요일 저녁에 한 통씩 보내드려요.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND};padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">

<tr><td style="padding:0 20px 20px;">
<span style="font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px;">NightFlow</span>
</td></tr>

<tr><td style="background:${CARD};border-radius:20px;padding:28px 24px;">
<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.6px;color:${LIME};">매주 목요일 저녁</p>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:900;color:#fff;letter-spacing:-0.5px;">아티클 구독 신청이 접수됐습니다</h1>

<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#e5e7eb;">
주말 제일 핫한 곳, 매주 깔끔하게 정리해드릴게요.
</p>

<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#e5e7eb;">
<strong style="color:#fff;">${esc(email)}</strong> 로 보내드릴게요.
매주 목요일 저녁에 한 통씩 보내드립니다.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;background:#141416;border-radius:14px;">
<tr><td style="padding:14px 16px;">
<p style="margin:0 0 4px;font-size:12px;color:${MUTED};">지난 호 보관함</p>
<a href="https://nightflow.kr/weekly" style="font-size:14px;font-weight:700;color:#fff;text-decoration:none;">nightflow.kr/weekly</a>
</td></tr></table>

<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr><td style="border-radius:14px;background:${LIME};">
<a href="https://nightflow.kr/weekly" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#0A0A0A;text-decoration:none;border-radius:14px;">웹에서 읽기</a>
</td></tr></table>
</td></tr>

<tr><td style="padding:18px 20px 0;">
<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED};">
제보·광고 문의는 <a href="mailto:maddawids@gmail.com" style="color:#fff;">maddawids@gmail.com</a> 으로 보내주세요.
</p>
<p style="margin:0 0 8px;font-size:11px;line-height:1.6;color:${MUTED};">
NightFlow 구독 폼에서 광고성 정보 수신에 동의하셔서 보내드립니다.
</p>
<p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};">
더 이상 받고 싶지 않으시면 <a href="${unsubscribeUrl}" style="color:#fff;text-decoration:underline;">수신거부</a>를 눌러주세요. 한 번 누르면 바로 처리되고 다시 확인하지 않습니다.
</p>
</td></tr>

</table></td></tr></table></body></html>`;
}
