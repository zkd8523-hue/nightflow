// 외국인 손님 "예약 확정" 메일(2026-10-24).
//
// 접수 확인·D-3 리마인더는 Edge Function(foreign-guest-emails)이 보내지만, 확정은 운영자가
// "확정서 보내기"를 누르는 순간(notifyAssignedMd)이라 그 요청 안에서 바로 보낸다. 외국인은
// 앱 푸시도 한국 휴대폰도 없어 확정 알림을 하나도 못 받았다 — 확정서 링크는 운영자가 메신저로
// 직접 보내고, 이 메일은 남는 기록 한 통이다. 레이아웃은 그 Edge Function과 같은 다크 카드.

import { CONTACT_EMAIL, CONTACT_INSTAGRAM, CONTACT_WHATSAPP } from "@/lib/foreign/contact";

type Lang = "en" | "ja" | "zh" | "zh-tw";

const normLang = (raw: string | null | undefined): Lang => {
  const v = (raw || "en").toLowerCase();
  if (v === "ja") return "ja";
  if (v === "zh-tw" || v === "zh-hant" || v === "zh-hk") return "zh-tw";
  if (v.startsWith("zh")) return "zh";
  return "en";
};
const LOCALE: Record<Lang, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN", "zh-tw": "zh-TW" };
const fmtDate = (iso: string, lang: Lang) =>
  new Date(iso + "T12:00:00+09:00").toLocaleDateString(LOCALE[lang], {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Seoul",
  });

// 클럽 줄은 "Club Ace · Gangnam"처럼 지역을 붙인다 — 접수 메일(foreign-guest-emails)과 같은 표.
const AREA: Record<string, Record<Lang, string>> = {
  이태원: { en: "Itaewon", ja: "梨泰院", zh: "梨泰院", "zh-tw": "梨泰院" },
  홍대: { en: "Hongdae", ja: "弘大", zh: "弘大", "zh-tw": "弘大" },
  강남: { en: "Gangnam", ja: "江南", zh: "江南", "zh-tw": "江南" },
  부산: { en: "Busan", ja: "釜山", zh: "釜山", "zh-tw": "釜山" },
  대구: { en: "Daegu", ja: "大邱", zh: "大邱", "zh-tw": "大邱" },
  광주: { en: "Gwangju", ja: "光州", zh: "光州", "zh-tw": "光州" },
};

const BRAND = "#0A0A0A", CARD = "#1C1C1E", GREEN = "#22c55e", AMBER = "#f59e0b", MUTED = "#9ca3af";

const COPY: Record<Lang, {
  subject: (club: string | null, date: string) => string;
  badge: string;
  heading: (club: string | null) => string;
  intro: string;
  date: string; club: string; group: string; name: string; host: string; total: string;
  guests: (n: string) => string;
  pay: string;
  cta: string;
  questions: (wa: string, ig: string) => string;
  why: string;
}> = {
  en: {
    subject: (club, date) => `Confirmed: your table${club ? ` at ${club}` : ""} — ${date}`,
    badge: "CONFIRMED",
    heading: (club) => (club ? `Your table at ${club} is confirmed` : "Your table is confirmed"),
    intro: "Show your booking pass at the door with your passport (19+).",
    date: "Date", club: "Club", group: "Group", name: "Name at the door", host: "Your host", total: "Total",
    guests: (n) => `${n} guests`,
    pay: "Pay the club on the night, card or cash.",
    cta: "Open booking pass",
    questions: (wa, ig) => `Questions before your night? ${wa} · ${ig} · or reply to this email.`,
    why: "You're getting this because you booked a table through NightFlow.",
  },
  ja: {
    subject: (club, date) => `予約確定：${club ? `${club}・` : ""}${date}`,
    badge: "予約確定",
    heading: (club) => (club ? `${club}のテーブルが確定しました` : "テーブルが確定しました"),
    intro: "入口でパスポートと一緒に予約パスをお見せください（19歳以上）。",
    date: "日付", club: "クラブ", group: "人数", name: "入口でのお名前", host: "担当", total: "合計",
    guests: (n) => `${n}名`,
    pay: "お支払いは当日クラブで。カード・現金どちらも可。",
    cta: "予約パスを開く",
    questions: (wa, ig) => `当日までのご質問は ${wa}・${ig}、またはこのメールへの返信でどうぞ。`,
    why: "NightFlow でテーブルを予約されたためお送りしています。",
  },
  zh: {
    subject: (club, date) => `预订已确认：${club ? `${club} · ` : ""}${date}`,
    badge: "已确认",
    heading: (club) => (club ? `${club} 的卡座已确认` : "你的卡座已确认"),
    intro: "入场时请出示预订凭证和护照（19岁以上）。",
    date: "日期", club: "夜店", group: "人数", name: "入场登记姓名", host: "负责人", total: "总额",
    guests: (n) => `${n}人`,
    pay: "当晚在夜店付款，刷卡或现金均可。",
    cta: "打开预订凭证",
    questions: (wa, ig) => `到店前有问题？${wa} · ${ig}，或直接回复本邮件。`,
    why: "你收到此邮件，是因为你通过 NightFlow 预订了卡座。",
  },
  "zh-tw": {
    subject: (club, date) => `訂位已確認：${club ? `${club} · ` : ""}${date}`,
    badge: "已確認",
    heading: (club) => (club ? `${club} 的包廂已確認` : "你的包廂已確認"),
    intro: "入場時請出示入場憑證和護照（19歲以上）。",
    date: "日期", club: "夜店", group: "人數", name: "入場登記姓名", host: "負責人", total: "總額",
    guests: (n) => `${n}人`,
    pay: "當晚在夜店付款，刷卡或現金皆可。",
    cta: "打開入場憑證",
    questions: (wa, ig) => `到店前有問題？${wa} · ${ig}，或直接回覆本郵件。`,
    why: "你收到此郵件，是因為你透過 NightFlow 訂了包廂。",
  },
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const row = (label: string, value: string, color = "#fff") =>
  `<tr><td style="font-size:13px;color:${MUTED};padding:4px 0;">${label}</td><td align="right" style="font-size:14px;color:${color};font-weight:700;padding:4px 0;">${value}</td></tr>`;

export type ForeignConfirmedEmail = {
  lang: string | null;
  refNo: string;
  passUrl: string;
  clubName: string | null;
  /** clubs.area 원문(한글 지역명) */
  area: string | null;
  eventDate: string;
  /** 확정 인원(자유 텍스트일 수 있다) — 숫자만이면 "N guests"로 적는다 */
  groupSize: string;
  guestName: string | null;
  /** 담당 MD 표시 이름 — "확정서 보내기"는 MD가 확인한 뒤라 이때는 정해져 있다 */
  hostName: string | null;
  totalPrice: number | null;
};

export function buildForeignConfirmedEmail(o: ForeignConfirmedEmail): { subject: string; html: string } {
  const lang = normLang(o.lang);
  const c = COPY[lang];
  const date = fmtDate(o.eventDate, lang);
  const club = o.clubName ? esc(o.clubName) : null;
  const area = o.area ? (AREA[o.area]?.[lang] ?? o.area) : null;
  const group = /^\d+$/.test(o.groupSize) ? c.guests(o.groupSize) : esc(o.groupSize);
  const wa = `<a href="https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(`Hi! About my booking ${o.refNo}`)}" style="color:#fff;">WhatsApp</a>`;
  const ig = `<a href="https://ig.me/m/${CONTACT_INSTAGRAM}" style="color:#fff;">Instagram</a>`;

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${c.intro}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND};padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
<tr><td style="padding:0 20px 20px;"><span style="font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px;">NightFlow</span></td></tr>
<tr><td style="background:${CARD};border-radius:20px;padding:28px 24px;">
<p style="margin:0 0 12px;"><span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:1px;color:${GREEN};border:1px solid #166534;border-radius:999px;padding:4px 12px;">${c.badge}</span></p>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:900;color:#fff;letter-spacing:-0.5px;">${c.heading(club)}</h1>
<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${MUTED};">${c.intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;">
${row(c.date, esc(date))}
${club ? row(c.club, area ? `${club} · ${esc(area)}` : club) : ""}
${row(c.group, group)}
${o.guestName ? row(c.name, esc(o.guestName)) : ""}
${o.hostName ? row(c.host, esc(o.hostName)) : ""}
${o.totalPrice ? row(c.total, `₩${o.totalPrice.toLocaleString("en-US")}`, GREEN) : ""}
</table>
<p style="margin:0;font-size:12px;color:${MUTED};">#${esc(o.refNo)} · ${c.pay}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr><td style="border-radius:14px;background:${AMBER};">
<a href="${o.passUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#000;text-decoration:none;border-radius:14px;">${c.cta}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:18px 20px 0;"><p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED};">${c.questions(wa, ig)}</p>
<p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};">${c.why}</p></td></tr>
</table></td></tr></table></body></html>`;

  return { subject: c.subject(o.clubName, date), html };
}

/** Resend로 1통. 답장은 운영 지메일로 받는다 — nightflow.kr엔 받는 메일함(MX)이 없다. */
export async function sendForeignConfirmedEmail(to: string, o: ForeignConfirmedEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY 미설정");
  const { subject, html } = buildForeignConfirmedEmail(o);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "NightFlow <team@nightflow.kr>",
      to: [to],
      subject,
      html,
      reply_to: process.env.RESEND_REPLY_TO || CONTACT_EMAIL,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}
