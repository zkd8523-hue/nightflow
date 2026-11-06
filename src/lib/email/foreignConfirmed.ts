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
  /** 여권 필참 띠 — 확인서 화면 맨 위 띠와 같은 문구(2026-11-01) */
  passport: string;
  date: string; club: string; group: string; name: string; host: string; total: string;
  guests: (n: string) => string;
  pay: string;
  cta: string;
  /** 단톡방 들어가기(Migration 707) — 방이 배정된 예약에만 */
  chat: string;
  /** 누가 있는 방인지 — "group chat"만 쓰면 낯선 사람이 있을까 꺼려진다 */
  chatPrivate: string;
  /** 단톡방에 들어가면 얻는 것 세 줄 */
  chatBenefits: string[];
  /** 방에 들어간 뒤 보낼 인사 안내 */
  chatSay: string;
  questions: (wa: string, ig: string) => string;
  why: string;
}> = {
  en: {
    subject: (club, date) => `Your booking details: table${club ? ` at ${club}` : ""} — ${date}`,
    badge: "BOOKING DETAILS",
    heading: (club) => (club ? `Here are your booking details for ${club}` : "Here are your booking details"),
    intro: "Show your booking pass at the door with your passport (19+).",
    passport: "Bring your passport — required",
    date: "Date", club: "Club", group: "Group", name: "Name at the door", host: "Your host", total: "Total",
    guests: (n) => `${n} guests`,
    pay: "Pay the club on the night, card or cash.",
    cta: "Open booking pass",
    chat: "Chat with your host",
    chatPrivate: "Just you, your host and NightFlow.",
    chatBenefits: ["Get met at the door and guided to your table", "Ask for water, ice, mixers or more drinks", "Any other questions are welcome too"],
    chatSay: "After you join, feel free to send this:",
    questions: (wa, ig) => `Questions before your night? ${wa} · ${ig} · or reply to this email.`,
    why: "You're getting this because you booked a table through NightFlow.",
  },
  ja: {
    subject: (club, date) => `予約内容：${club ? `${club}・` : ""}${date}`,
    badge: "予約内容",
    heading: (club) => (club ? `${club}の予約内容です` : "予約内容です"),
    intro: "入口でパスポートと一緒に予約パスをお見せください（19歳以上）。",
    passport: "パスポート必携（入場に必要）",
    date: "日付", club: "クラブ", group: "人数", name: "入口でのお名前", host: "担当", total: "合計",
    guests: (n) => `${n}名`,
    pay: "お支払いは当日クラブで。カード・現金どちらも可。",
    cta: "予約パスを開く",
    chat: "ホストとチャット",
    chatPrivate: "参加者はあなた、ホスト、NightFlowだけです。",
    chatBenefits: ["到着時にお出迎えし、テーブルまでご案内", "水・氷・ミキサー、追加注文のご依頼", "その他のご質問もお気軽にどうぞ"],
    chatSay: "参加したら、よければこちらを送ってください：",
    questions: (wa, ig) => `当日までのご質問は ${wa}・${ig}、またはこのメールへの返信でどうぞ。`,
    why: "NightFlow でテーブルを予約されたためお送りしています。",
  },
  zh: {
    subject: (club, date) => `预订详情：${club ? `${club} · ` : ""}${date}`,
    badge: "预订详情",
    heading: (club) => (club ? `${club} 的预订详情` : "你的预订详情"),
    intro: "入场时请出示预订凭证和护照（19岁以上）。",
    passport: "请带护照（入场必需）",
    date: "日期", club: "夜店", group: "人数", name: "入场登记姓名", host: "负责人", total: "总额",
    guests: (n) => `${n}人`,
    pay: "当晚在夜店付款，刷卡或现金均可。",
    cta: "打开预订凭证",
    chat: "与接待聊天",
    chatPrivate: "只有你、接待和 NightFlow。",
    chatBenefits: ["到店时有人迎接，并带你到座位", "可以要水、冰块或调酒饮料，也可以在桌边加点", "其他任何问题也都可以问我们"],
    chatSay: "加入后，欢迎发送这条消息：",
    questions: (wa, ig) => `到店前有问题？${wa} · ${ig}，或直接回复本邮件。`,
    why: "你收到此邮件，是因为你通过 NightFlow 预订了卡座。",
  },
  "zh-tw": {
    subject: (club, date) => `訂位資訊：${club ? `${club} · ` : ""}${date}`,
    badge: "訂位資訊",
    heading: (club) => (club ? `${club} 的訂位資訊` : "你的訂位資訊"),
    intro: "入場時請出示入場憑證和護照（19歲以上）。",
    passport: "請帶護照（入場必備）",
    date: "日期", club: "夜店", group: "人數", name: "入場登記姓名", host: "負責人", total: "總額",
    guests: (n) => `${n}人`,
    pay: "當晚在夜店付款，刷卡或現金皆可。",
    cta: "打開入場憑證",
    chat: "與公關聊天",
    chatPrivate: "只有你、公關和 NightFlow。",
    chatBenefits: ["到場時有人迎接，並帶你到座位", "可以要水、冰塊或調酒飲料，也可以在桌邊加點", "其他任何問題也都可以問我們"],
    chatSay: "加入後，歡迎傳送這則訊息：",
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
  /** 확인서에 붙은 안내 한 줄(예: 고른 자리가 안 돼 다른 자리로 잡았을 때) */
  note?: string | null;
  /** WhatsApp 단톡방 초대 링크(Migration 707) — 있으면 "단톡방 들어가기" 버튼을 붙인다 */
  chatUrl?: string | null;
  /** 방에 들어가 처음 보낼 인사 문구 — chatUrl과 같이 있을 때만 박스로 보여준다 */
  chatGreeting?: string | null;
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
<p style="margin:0 0 14px;padding:12px 8px;background:rgba(245,158,11,0.12);border-top:2px solid ${AMBER};border-bottom:2px solid ${AMBER};text-align:center;font-size:15px;line-height:1.4;font-weight:900;color:#fff;"><span style="color:${AMBER};">→</span> ${c.passport} <span style="color:${AMBER};">←</span></p>
<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${MUTED};">${c.intro}</p>
${o.note ? `<p style="margin:0 0 14px;padding:10px 12px;border-radius:12px;background:#0f0f10;border:1px solid #2c2c2e;font-size:13.5px;line-height:1.6;color:#e5e5e5;">${esc(o.note)}</p>` : ""}
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
${o.chatUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 0;"><tr><td style="border-radius:14px;background:#25D366;">
<a href="${esc(o.chatUrl)}" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:900;color:#000;text-decoration:none;border-radius:14px;">💬 ${c.chat}</a>
</td></tr></table>
<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">${c.chatPrivate}</p><div style="margin:8px 0 0;font-size:12.5px;line-height:1.8;color:#e5e5e5;">${c.chatBenefits.map((b) => `· ${b}`).join("<br>")}</div>${o.chatGreeting ? `<p style="margin:12px 0 6px;font-size:12px;font-weight:700;color:#fff;">${c.chatSay}</p>
<div style="margin:0;padding:10px 12px;border-radius:12px;background:#0f0f10;border:1px solid #2c2c2e;font-size:12.5px;line-height:1.6;color:#e5e5e5;white-space:pre-wrap;">${esc(o.chatGreeting)}</div>` : ""}` : ""}
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
