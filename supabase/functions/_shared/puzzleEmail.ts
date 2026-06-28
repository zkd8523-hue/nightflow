// 외국인 알림 이메일 템플릿 (영어, 다크 테마 브랜드)
// 이메일 클라이언트 호환을 위해 모든 스타일은 인라인.
//
// 이벤트:
//   emailFirstOffer  — 첫 오퍼 도착 (최고 전환 모먼트)
//   emailMatched     — 오퍼 수락/매칭 (클럽에 연락 안내)
//   emailReminder    — D-3 / D-1 리마인더 (기대치 관리)

const BRAND = "#0A0A0A";
const CARD = "#1C1C1E";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const MUTED = "#9ca3af";

type EmailContent = { subject: string; html: string };

function layout(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  ctaColor?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${BRAND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
<tr><td style="padding:0 20px 20px;">
<span style="font-size:18px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">NightFlow</span>
</td></tr>
<tr><td style="background:${CARD};border-radius:20px;padding:28px 24px;">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">${opts.heading}</h1>
${opts.bodyHtml}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;">
<tr><td style="border-radius:14px;background:${opts.ctaColor || "#ffffff"};">
<a href="${opts.ctaUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#000000;text-decoration:none;border-radius:14px;">${opts.ctaText}</a>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:18px 20px 0;">
<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED};">
Questions? <a href="https://www.instagram.com/nightflow.kr" style="color:#ffffff;text-decoration:underline;">DM us on Instagram</a> or email <a href="mailto:zkd8523@gmail.com" style="color:#ffffff;text-decoration:underline;">zkd8523@gmail.com</a>
</p>
<p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};">
You're receiving this because you posted a request on NightFlow.<br>
NightFlow — the easiest way to book Seoul clubs.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function infoRow(dateEn: string, areaEn: string, budget: string, headcount: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 2px;">
<tr><td style="font-size:15px;color:#ffffff;font-weight:700;padding:2px 0;">📅 ${dateEn}</td></tr>
<tr><td style="font-size:15px;color:#ffffff;font-weight:700;padding:2px 0;">📍 ${areaEn} · ${headcount}</td></tr>
<tr><td style="font-size:15px;color:${GREEN};font-weight:900;padding:2px 0;">💰 ${budget}</td></tr>
</table>`;
}

export function emailFirstOffer(p: {
  dateEn: string;
  areaEn: string;
  budget: string;
  headcount: string;
  offerCount: number;
  url: string;
}): EmailContent {
  const offerLine =
    p.offerCount > 1
      ? `<strong style="color:#ffffff;">${p.offerCount} clubs</strong> have sent you offers`
      : `A top club just sent you an offer`;
  return {
    subject: "🎉 You got your first offer!",
    html: layout({
      preheader: "A Seoul club just sent you an offer — open to see the deal.",
      heading: "🎉 You got an offer!",
      bodyHtml:
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MUTED};">${offerLine}. Open your request to see the price &amp; what's included, then pick the one you like.</p>` +
        infoRow(p.dateEn, p.areaEn, p.budget, p.headcount),
      ctaText: "See your offer →",
      ctaUrl: p.url,
    }),
  };
}

export function emailMatched(p: {
  dateEn: string;
  areaEn: string;
  budget: string;
  headcount: string;
  clubName: string;
  url: string;
}): EmailContent {
  return {
    subject: `You're booked at ${p.clubName} 🎉`,
    html: layout({
      preheader: "Open NightFlow to message the club and finish your booking.",
      heading: "You picked an offer 🎉",
      bodyHtml:
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MUTED};">Nice — you're matched with <strong style="color:#ffffff;">${p.clubName}</strong>. Open your request to get the club's contact and a ready-to-send message. Just paste it to them!</p>` +
        infoRow(p.dateEn, p.areaEn, p.budget, p.headcount),
      ctaText: "Contact the club →",
      ctaUrl: p.url,
      ctaColor: AMBER,
    }),
  };
}

export function emailReminder(p: {
  daysLeft: number; // 3 or 1
  dateEn: string;
  areaEn: string;
  budget: string;
  headcount: string;
  url: string;
}): EmailContent {
  const isTomorrow = p.daysLeft <= 1;
  const heading = isTomorrow ? "Tomorrow's the night 🎉" : `Your night is in ${p.daysLeft} days`;
  const body = isTomorrow
    ? `Top clubs send their offers on the day. Keep an eye on your inbox — we'll email you the moment one arrives.`
    : `Top clubs send their offers on the day of your event. We'll email you the moment your first offer arrives — nothing to do for now.`;
  return {
    subject: isTomorrow ? "Tomorrow's the night 🎉 — offers open soon" : `Your Seoul night is in ${p.daysLeft} days`,
    html: layout({
      preheader: body,
      heading,
      bodyHtml:
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MUTED};">${body}</p>` +
        infoRow(p.dateEn, p.areaEn, p.budget, p.headcount),
      ctaText: "View your request →",
      ctaUrl: p.url,
    }),
  };
}

// YYYY-MM-DD → "Wed, Jul 1" (Deno, KST 기준 날짜만 사용하므로 로컬 변환)
export function formatDateEn(eventDate: string): string {
  const [y, m, d] = eventDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const AREA_EN: Record<string, string> = {
  "강남": "Gangnam",
  "홍대": "Hongdae",
  "이태원": "Itaewon",
  "서울 어디든": "Anywhere in Seoul",
  "부산": "Busan",
  "대구": "Daegu",
  "인천": "Incheon",
};

export function areaEn(area: string): string {
  return AREA_EN[area] ?? area;
}
