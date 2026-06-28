// 외국인 알림 이메일 템플릿 (en/ja/zh, 다크 테마 브랜드)
// 이메일 클라이언트 호환을 위해 모든 스타일은 인라인.
// 유저의 users.lang 으로 발송 언어 결정.
//
// 이벤트:
//   emailFirstOffer  — 첫 오퍼 도착 (최고 전환 모먼트)
//   emailMatched     — 오퍼 수락/매칭 (클럽에 연락 안내)
//   emailReminder    — D-7 / D-1 리마인더 (기대치 관리)

export type MailLang = "en" | "ja" | "zh";

const BRAND = "#0A0A0A";
const CARD = "#1C1C1E";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const MUTED = "#9ca3af";

type EmailContent = { subject: string; html: string };

// ── 공통 문구 (언어별) ─────────────────────────────────
const FOOTER = {
  en: {
    q: `Questions? <a href="https://www.instagram.com/nightflow.kr" style="color:#ffffff;text-decoration:underline;">DM us on Instagram</a> or email <a href="mailto:zkd8523@gmail.com" style="color:#ffffff;text-decoration:underline;">zkd8523@gmail.com</a>`,
    why: "You're receiving this because you posted a request on NightFlow.",
    tag: "NightFlow — the easiest way to book Seoul clubs.",
  },
  ja: {
    q: `ご質問は <a href="https://www.instagram.com/nightflow.kr" style="color:#ffffff;text-decoration:underline;">Instagram の DM</a> または <a href="mailto:zkd8523@gmail.com" style="color:#ffffff;text-decoration:underline;">zkd8523@gmail.com</a> まで`,
    why: "NightFlowでリクエストを投稿したため、このメールをお送りしています。",
    tag: "NightFlow — ソウルのクラブを予約する一番カンタンな方法。",
  },
  zh: {
    q: `有问题？在 <a href="https://www.instagram.com/nightflow.kr" style="color:#ffffff;text-decoration:underline;">Instagram 私信我们</a> 或邮件 <a href="mailto:zkd8523@gmail.com" style="color:#ffffff;text-decoration:underline;">zkd8523@gmail.com</a>`,
    why: "你收到此邮件，是因为你在 NightFlow 发布了请求。",
    tag: "NightFlow — 预订首尔夜店最简单的方式。",
  },
};

function layout(lang: MailLang, opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  ctaColor?: string;
}): string {
  const f = FOOTER[lang];
  return `<!DOCTYPE html>
<html lang="${lang}">
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
<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED};">${f.q}</p>
<p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};">${f.why}<br>${f.tag}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function infoRow(dateStr: string, areaStr: string, budget: string, headcount: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 2px;">
<tr><td style="font-size:15px;color:#ffffff;font-weight:700;padding:2px 0;">📅 ${dateStr}</td></tr>
<tr><td style="font-size:15px;color:#ffffff;font-weight:700;padding:2px 0;">📍 ${areaStr} · ${headcount}</td></tr>
<tr><td style="font-size:15px;color:${GREEN};font-weight:900;padding:2px 0;">💰 ${budget}</td></tr>
</table>`;
}

// ── 날짜 / 지역 / 인원 현지화 ─────────────────────────────
const LOCALE: Record<MailLang, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };

export function formatDate(eventDate: string, lang: MailLang): string {
  const [y, m, d] = eventDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(LOCALE[lang], {
    weekday: "short",
    month: lang === "en" ? "short" : "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

const AREA_I18N: Record<string, { en: string; ja: string; zh: string }> = {
  "강남": { en: "Gangnam", ja: "江南", zh: "江南" },
  "홍대": { en: "Hongdae", ja: "弘大", zh: "弘大" },
  "이태원": { en: "Itaewon", ja: "梨泰院", zh: "梨泰院" },
  "건대": { en: "Konkuk", ja: "建大", zh: "建大" },
  "서울 어디든": { en: "Anywhere in Seoul", ja: "ソウルどこでも", zh: "首尔任意地区" },
  "부산": { en: "Busan", ja: "釜山", zh: "釜山" },
  "대구": { en: "Daegu", ja: "大邱", zh: "大邱" },
  "인천": { en: "Incheon", ja: "仁川", zh: "仁川" },
};

export function areaLabel(area: string, lang: MailLang): string {
  return AREA_I18N[area]?.[lang] ?? area;
}

function headcountLabel(n: number, lang: MailLang): string {
  return lang === "en" ? `${n} ppl` : lang === "ja" ? `${n}名` : `${n}人`;
}

type BaseParams = {
  lang: MailLang;
  eventDate: string;
  area: string;
  budget: string; // "₩500,000"
  headcount: number;
  url: string;
};

function row(p: BaseParams): string {
  return infoRow(formatDate(p.eventDate, p.lang), areaLabel(p.area, p.lang), p.budget, headcountLabel(p.headcount, p.lang));
}

const para = (html: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MUTED};">${html}</p>`;

// ── #1 첫 오퍼 ─────────────────────────────────────────
export function emailFirstOffer(p: BaseParams & { offerCount: number }): EmailContent {
  const many = p.offerCount > 1;
  const T = {
    en: {
      subject: "🎉 You got your first offer!",
      pre: "A Seoul club just sent you an offer — open to see the deal.",
      heading: "🎉 You got an offer!",
      body: `${many ? `<strong style="color:#ffffff;">${p.offerCount} clubs</strong> have sent you offers` : "A top club just sent you an offer"}. Open your request to see the price &amp; what's included, then pick the one you like.`,
      cta: "See your offer →",
    },
    ja: {
      subject: "🎉 初めてのオファーが届きました！",
      pre: "ソウルのクラブからオファーが届きました — 開いて確認しましょう。",
      heading: "🎉 オファーが届きました！",
      body: `${many ? `<strong style="color:#ffffff;">${p.offerCount}軒のクラブ</strong>からオファーが届きました` : "人気クラブからオファーが届きました"}。リクエストを開いて価格と内容を確認し、気に入ったものを選んでください。`,
      cta: "オファーを見る →",
    },
    zh: {
      subject: "🎉 你收到了第一个报价！",
      pre: "首尔的夜店刚给你发来报价——打开看看吧。",
      heading: "🎉 你收到了报价！",
      body: `${many ? `<strong style="color:#ffffff;">${p.offerCount}家夜店</strong>给你发来了报价` : "一家热门夜店刚给你发来报价"}。打开你的请求查看价格和包含内容，然后选你喜欢的。`,
      cta: "查看报价 →",
    },
  }[p.lang];
  return {
    subject: T.subject,
    html: layout(p.lang, { preheader: T.pre, heading: T.heading, bodyHtml: para(T.body) + row(p), ctaText: T.cta, ctaUrl: p.url }),
  };
}

// ── #2 매칭/수락 ───────────────────────────────────────
export function emailMatched(p: BaseParams & { clubName: string }): EmailContent {
  const c = p.clubName;
  const T = {
    en: {
      subject: `You're booked at ${c} 🎉`,
      pre: "Open NightFlow to message the club and finish your booking.",
      heading: "You picked an offer 🎉",
      body: `Nice — you're matched with <strong style="color:#ffffff;">${c}</strong>. Open your request to get the club's contact and a ready-to-send message. Just paste it to them!`,
      cta: "Contact the club →",
    },
    ja: {
      subject: `${c}で予約完了 🎉`,
      pre: "NightFlowを開いてクラブに連絡し、予約を完了しましょう。",
      heading: "オファーを選びました 🎉",
      body: `<strong style="color:#ffffff;">${c}</strong> とマッチしました。リクエストを開いてクラブの連絡先とそのまま送れるメッセージを受け取り、貼り付けて送ってください！`,
      cta: "クラブに連絡 →",
    },
    zh: {
      subject: `已在 ${c} 订好 🎉`,
      pre: "打开 NightFlow 联系夜店，完成你的预订。",
      heading: "你选好了报价 🎉",
      body: `你和 <strong style="color:#ffffff;">${c}</strong> 匹配成功。打开请求获取夜店联系方式和一条可直接发送的消息，粘贴发给对方即可！`,
      cta: "联系夜店 →",
    },
  }[p.lang];
  return {
    subject: T.subject,
    html: layout(p.lang, { preheader: T.pre, heading: T.heading, bodyHtml: para(T.body) + row(p), ctaText: T.cta, ctaUrl: p.url, ctaColor: AMBER }),
  };
}

// ── #3 D-7 / D-1 리마인더 ──────────────────────────────
export function emailReminder(p: BaseParams & { daysLeft: number }): EmailContent {
  const tom = p.daysLeft <= 1;
  const n = p.daysLeft;
  const T = {
    en: {
      subject: tom ? "Tomorrow's the night 🎉 — offers open soon" : `Your Seoul night is in ${n} days`,
      heading: tom ? "Tomorrow's the night 🎉" : `Your night is in ${n} days`,
      body: tom
        ? "Top clubs send their offers on the day. Keep an eye on your inbox — we'll email you the moment one arrives."
        : "Top clubs send their offers on the day of your event. We'll email you the moment your first offer arrives — nothing to do for now.",
      cta: "View your request →",
    },
    ja: {
      subject: tom ? "明日が本番です 🎉 — まもなくオファー開始" : `ソウルの夜まであと${n}日`,
      heading: tom ? "明日が本番です 🎉" : `あなたの夜まであと${n}日`,
      body: tom
        ? "人気クラブは当日にオファーを送ります。受信箱をチェックしてください — 届き次第メールでお知らせします。"
        : "人気クラブはイベント当日にオファーを送ります。最初のオファーが届き次第メールします — 今は何もしなくて大丈夫です。",
      cta: "リクエストを見る →",
    },
    zh: {
      subject: tom ? "明天就是你的夜晚 🎉 — 报价即将开始" : `离你的首尔之夜还有${n}天`,
      heading: tom ? "明天就是你的夜晚 🎉" : `离你的夜晚还有${n}天`,
      body: tom
        ? "热门夜店在当天发报价。留意你的收件箱——一有报价我们就邮件通知你。"
        : "热门夜店在活动当天发报价。一收到第一个报价我们就邮件通知你——现在无需做任何事。",
      cta: "查看请求 →",
    },
  }[p.lang];
  return {
    subject: T.subject,
    html: layout(p.lang, { preheader: T.body, heading: T.heading, bodyHtml: para(T.body) + row(p), ctaText: T.cta, ctaUrl: p.url }),
  };
}
