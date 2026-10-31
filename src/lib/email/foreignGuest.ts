// 외국인 손님 메일 공용 레이아웃·발송(2026-11-01).
//
// 예약 메일(foreignConfirmed.ts)과 같은 다크 카드에, 운영자 손을 덜 타는 자동 메일들이 올라간다:
// 담당자 취소 안내, 금액 안내(거절 → 이 조건이면 가능), 자리 고르기, 밀림(유지/취소), 확인서 변경.
// 버튼은 전부 사이트의 확인 페이지(/booking/respond/...)로만 연결한다 — 메일 서비스가 링크를 미리
// 열어보는 일이 있어서, 링크를 여는 것만으로 처리되면 손님이 누르지도 않은 취소가 생긴다.

import { CONTACT_EMAIL, CONTACT_INSTAGRAM, CONTACT_WHATSAPP } from "@/lib/foreign/contact";

export type GuestLang = "en" | "ja" | "zh" | "zh-tw";

export const normLang = (raw: string | null | undefined): GuestLang => {
  const v = (raw || "en").toLowerCase();
  if (v === "ja") return "ja";
  if (v === "zh-tw" || v === "zh-hant" || v === "zh-hk") return "zh-tw";
  if (v.startsWith("zh")) return "zh";
  return "en";
};

const LOCALE: Record<GuestLang, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN", "zh-tw": "zh-TW" };
export const fmtGuestDate = (iso: string, lang: GuestLang) =>
  new Date(iso + "T12:00:00+09:00").toLocaleDateString(LOCALE[lang], {
    weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Seoul",
  });

export const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const BRAND = "#0A0A0A", CARD = "#1C1C1E", MUTED = "#9ca3af";
export const COLOR = { green: "#22c55e", amber: "#f59e0b", red: "#f87171", wa: "#25D366" };

/** 메일 버튼 — 표 셀 안의 링크(Outlook에서도 버튼 모양 유지). */
export function mailButton(href: string, label: string, bg: string, fg = "#000"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;"><tr><td align="center" style="border-radius:12px;background:${bg};">
<a href="${href}" style="display:block;padding:13px 16px;font-size:15px;font-weight:900;color:${fg};text-decoration:none;border-radius:12px;">${esc(label)}</a></td></tr></table>`;
}

export function waLink(refOrText: string): string {
  return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(refOrText)}`;
}

const FOOT: Record<GuestLang, (wa: string, ig: string) => string> = {
  en: (wa, ig) => `Questions? ${wa} · ${ig} · or reply to this email.`,
  ja: (wa, ig) => `ご質問は ${wa}・${ig}、またはこのメールへの返信でどうぞ。`,
  zh: (wa, ig) => `有问题？${wa} · ${ig}，或直接回复本邮件。`,
  "zh-tw": (wa, ig) => `有問題？${wa} · ${ig}，或直接回覆本郵件。`,
};

/** 공통 다크 카드. body는 이미 escape된 HTML이어야 한다. */
export function guestLayout(o: {
  lang: GuestLang;
  preheader: string;
  badge: string;
  badgeColor: string;
  heading: string;
  body: string;
  waText: string;
}): string {
  const wa = `<a href="${waLink(o.waText)}" style="color:#fff;">WhatsApp</a>`;
  const ig = `<a href="https://ig.me/m/${CONTACT_INSTAGRAM}" style="color:#fff;">Instagram</a>`;
  return `<!DOCTYPE html><html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND};padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
<tr><td style="padding:0 20px 20px;"><span style="font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px;">NightFlow</span></td></tr>
<tr><td style="background:${CARD};border-radius:20px;padding:26px 22px;">
<p style="margin:0 0 12px;"><span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:1px;color:${o.badgeColor};border:1px solid ${o.badgeColor};border-radius:999px;padding:4px 12px;">${esc(o.badge)}</span></p>
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;font-weight:900;color:#fff;letter-spacing:-0.5px;">${esc(o.heading)}</h1>
${o.body}
</td></tr>
<tr><td style="padding:18px 20px 0;"><p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">${FOOT[o.lang](wa, ig)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

export const p = (html: string, muted = false) =>
  `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${muted ? MUTED : "#e5e5e5"};">${html}</p>`;

/** 테이블맵 사진 — 이미지를 막는 메일 앱을 위해 아래에 링크를 같이 둔다. */
export function mapImage(url: string, label: string): string {
  return `<a href="${url}" style="display:block;margin:4px 0 6px;"><img src="${url}" alt="${esc(label)}" width="436" style="width:100%;max-width:436px;border-radius:12px;display:block;border:0;background:#000;"></a>
<p style="margin:0 0 10px;font-size:11px;color:${MUTED};"><a href="${url}" style="color:${MUTED};">🗺️ ${esc(label)}</a></p>`;
}

/** Resend로 1통. 답장은 운영 지메일로 받는다 — nightflow.kr엔 받는 메일함(MX)이 없다. */
export async function sendGuestEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY 미설정");
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

/** 외국인 요청의 메일 수신 주소 — 이메일로 접수했으면 그 주소, 메신저로 접수했으면 예비 이메일. */
export function guestEmailOf(r: { contact_type?: string | null; contact_value?: string | null; backup_email?: string | null }): string | null {
  if (r.contact_type === "email" && r.contact_value?.includes("@")) return r.contact_value.trim();
  return r.backup_email?.trim() || null;
}

// ── 담당자(클럽) 취소 안내 ─────────────────────────────────────────────────
const CANCEL: Record<GuestLang, { subject: (c: string, d: string) => string; badge: string; heading: string; body: (c: string, d: string) => string; cta: string }> = {
  en: {
    subject: (c, d) => `Your table at ${c} (${d}) was cancelled`,
    badge: "CANCELLED BY CLUB",
    heading: "We're sorry, the club had to cancel",
    body: (c, d) => `Your table at <b>${c}</b> on <b>${d}</b> was cancelled by the club. Message us and we'll help you find another table.`,
    cta: "Message us on WhatsApp",
  },
  ja: {
    subject: (c, d) => `${c}（${d}）のご予約がキャンセルされました`,
    badge: "クラブ都合のキャンセル",
    heading: "申し訳ありません。クラブ側の都合でキャンセルになりました",
    body: (c, d) => `<b>${d}</b> の <b>${c}</b> のテーブルがクラブ側の都合でキャンセルになりました。メッセージをいただければ、別のテーブルをお探しします。`,
    cta: "WhatsAppで相談する",
  },
  zh: {
    subject: (c, d) => `你在 ${c}（${d}）的卡座已被取消`,
    badge: "夜店取消",
    heading: "很抱歉，夜店取消了你的预订",
    body: (c, d) => `你在 <b>${d}</b> 的 <b>${c}</b> 卡座因夜店原因被取消。联系我们，我们帮你找别的卡座。`,
    cta: "WhatsApp 联系我们",
  },
  "zh-tw": {
    subject: (c, d) => `你在 ${c}（${d}）的包廂已被取消`,
    badge: "夜店取消",
    heading: "很抱歉，夜店取消了你的訂位",
    body: (c, d) => `你在 <b>${d}</b> 的 <b>${c}</b> 包廂因夜店原因被取消。聯絡我們，我們幫你找別的包廂。`,
    cta: "WhatsApp 聯絡我們",
  },
};

export function buildCancelledByClubEmail(o: { lang: string | null; clubName: string; eventDate: string; refNo: string | null }) {
  const lang = normLang(o.lang);
  const c = CANCEL[lang];
  const club = esc(o.clubName);
  const date = fmtGuestDate(o.eventDate, lang);
  const waText = `Hi! My booking${o.refNo ? ` ${o.refNo}` : ""} at ${o.clubName} on ${o.eventDate} was cancelled.`;
  const html = guestLayout({
    lang, preheader: c.heading, badge: c.badge, badgeColor: COLOR.red, heading: c.heading, waText,
    body: p(c.body(club, esc(date))) + mailButton(waLink(waText), c.cta, COLOR.wa, "#fff"),
  });
  return { subject: c.subject(o.clubName, date), html };
}
