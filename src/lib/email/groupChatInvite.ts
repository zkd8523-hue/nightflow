// 단톡방 초대 메일(2026-11-04) — 확정 메일에 못 실은 경우(확인서가 나올 때 빈 방이 없어 나중에 배정·직접 연결)에만 나간다.
// 확인서와 같이 자동 배정된 방은 확정 메일(foreignConfirmed.ts)에 버튼으로 실려 나가므로 이 메일은 없다.
// 확정 메일을 다시 보내면 "Confirmed"가 쌓여 손님이 헷갈려서(notifyMd 주석) 짧은 전용 메일로 나눴다.

import { COLOR, fmtGuestDate, guestLayout, mailButton, normLang, p, sendGuestEmail, type GuestLang } from "@/lib/email/foreignGuest";

const COPY: Record<GuestLang, {
  subject: (c: string, d: string) => string;
  badge: string;
  heading: string;
  benefits: string[];
  private: string;
  join: string;
  pass: string;
  say: string;
}> = {
  en: {
    subject: (c, d) => `${c} on ${d}: chat with your host`,
    badge: "CHAT WITH YOUR HOST",
    heading: "Chat with your host",
    private: "Just you, your host and NightFlow.",
    benefits: ["Get met at the door and guided to your table", "Ask for water, ice, mixers or more drinks", "Any other questions are welcome too"],
    join: "💬 Chat with your host",
    pass: "Open booking pass",
    say: "After you join, feel free to send this:",
  },
  ja: {
    subject: (c, d) => `${c}（${d}）：ホストとチャット`,
    badge: "ホストとチャット",
    heading: "ホストとチャット",
    private: "参加者はあなた、ホスト、NightFlowだけです。",
    benefits: ["到着時にお出迎えし、テーブルまでご案内", "水・氷・ミキサー、追加注文のご依頼", "その他のご質問もお気軽にどうぞ"],
    join: "💬 ホストとチャット",
    pass: "予約パスを開く",
    say: "参加したら、よければこちらを送ってください：",
  },
  zh: {
    subject: (c, d) => `${c}（${d}）：与接待聊天`,
    badge: "与接待聊天",
    heading: "与接待聊天",
    private: "只有你、接待和 NightFlow。",
    benefits: ["到店时有人迎接，并带你到座位", "可以要水、冰块或调酒饮料，也可以在桌边加点", "其他任何问题也都可以问我们"],
    join: "💬 与接待聊天",
    pass: "打开预订凭证",
    say: "加入后，欢迎发送这条消息：",
  },
  "zh-tw": {
    subject: (c, d) => `${c}（${d}）：與公關聊天`,
    badge: "與公關聊天",
    heading: "與公關聊天",
    private: "只有你、公關和 NightFlow。",
    benefits: ["到場時有人迎接，並帶你到座位", "可以要水、冰塊或調酒飲料，也可以在桌邊加點", "其他任何問題也都可以問我們"],
    join: "💬 與公關聊天",
    pass: "打開入場憑證",
    say: "加入後，歡迎傳送這則訊息：",
  },
};

export async function sendGroupChatInviteEmail(
  to: string,
  o: { lang: string | null; refNo: string; chatUrl: string; passUrl: string; clubName: string | null; eventDate: string; greeting?: string | null },
): Promise<void> {
  const lang = normLang(o.lang);
  const c = COPY[lang];
  const club = o.clubName ?? "the club";
  const date = fmtGuestDate(o.eventDate, lang);
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));
  const body =
    mailButton(o.chatUrl, c.join, COLOR.wa, "#000") +
    `<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">${c.private}</p><div style="margin:8px 0 0;font-size:12.5px;line-height:1.8;color:#e5e5e5;">${c.benefits.map((b) => `· ${b}`).join("<br>")}</div>` +
    (o.greeting
      ? `<p style="margin:14px 0 6px;font-size:12px;font-weight:700;color:#fff;">${c.say}</p><div style="margin:0 0 4px;padding:10px 12px;border-radius:12px;background:#0f0f10;border:1px solid #2c2c2e;font-size:12.5px;line-height:1.6;color:#e5e5e5;white-space:pre-wrap;">${esc(o.greeting)}</div>`
      : "") +
    mailButton(o.passUrl, c.pass, "#2a2a2d", "#fff");
  await sendGuestEmail(
    to,
    c.subject(club, date),
    guestLayout({ lang, preheader: c.heading, badge: c.badge, badgeColor: COLOR.green, heading: c.heading, body, waText: `Hi! About my booking ${o.refNo}.` }),
  );
}
