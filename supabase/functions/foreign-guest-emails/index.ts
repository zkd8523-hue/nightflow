// Deno Edge Function: 외국인 손님 이메일 2종 (Resend)
//
//   { mode: "received", request_id }  — foreign_requests INSERT 트리거(Migration 664)가 호출.
//                                        contact_type='email'인 손님에게 접수 확인 메일.
//   { mode: "reminders" }              — pg_cron 매일 19:00 KST(Migration 664).
//                                        foreign_trip_reminders에서 tentative_date = 오늘+3 이고
//                                        아직 안 보낸 행에 "이제 예약할 때" 메일 + 폼 링크.
//
// 인증: 두 호출 모두 service_role 키를 Bearer로 싣는다(다른 cron 함수와 동일). 그 외 호출은 401.
// 실패 원칙: 한 통이 실패해도 나머지는 계속 보낸다. sent_at은 성공한 행에만 찍는다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resendSend } from "../_shared/resend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = (Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://nightflow.kr").replace(/\/$/, "");

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
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
const AREA: Record<string, Record<Lang, string>> = {
  이태원: { en: "Itaewon", ja: "梨泰院", zh: "梨泰院", "zh-tw": "梨泰院" },
  홍대: { en: "Hongdae", ja: "弘大", zh: "弘大", "zh-tw": "弘大" },
  강남: { en: "Gangnam", ja: "江南", zh: "江南", "zh-tw": "江南" },
  부산: { en: "Busan", ja: "釜山", zh: "釜山", "zh-tw": "釜山" },
  대구: { en: "Daegu", ja: "大邱", zh: "大邱", "zh-tw": "大邱" },
  광주: { en: "Gwangju", ja: "光州", zh: "光州", "zh-tw": "光州" },
};
const areaLabel = (a: string | null | undefined, lang: Lang) =>
  a ? (AREA[a]?.[lang] ?? a) : { en: "Seoul", ja: "ソウル", zh: "首尔", "zh-tw": "首爾" }[lang];

// ── 공통 레이아웃 (다크 브랜드, 인라인 스타일) ──────────────────────────────
const BRAND = "#0A0A0A", CARD = "#1C1C1E", GREEN = "#22c55e", AMBER = "#f59e0b", MUTED = "#9ca3af";
const FOOT: Record<Lang, { q: string; why: string }> = {
  en: { q: `Questions? Reply to this email or <a href="https://www.instagram.com/nightflow.kr" style="color:#fff;">DM us on Instagram</a>.`, why: "You're getting this because you used NightFlow's Seoul club booking." },
  ja: { q: `ご質問はこのメールに返信、または <a href="https://www.instagram.com/nightflow.kr" style="color:#fff;">Instagram の DM</a> へ。`, why: "NightFlow のソウルクラブ予約をご利用いただいたため送信しています。" },
  zh: { q: `有问题？直接回复本邮件，或 <a href="https://www.instagram.com/nightflow.kr" style="color:#fff;">在 Instagram 私信我们</a>。`, why: "你收到此邮件，是因为你使用了 NightFlow 的首尔夜店预订。" },
  "zh-tw": { q: `有問題？直接回覆本郵件，或 <a href="https://www.instagram.com/nightflow.kr" style="color:#fff;">在 Instagram 私訊我們</a>。`, why: "你收到此郵件，是因為你使用了 NightFlow 的首爾夜店預訂。" },
};
function layout(lang: Lang, o: { preheader: string; heading: string; body: string; cta: string; url: string; ctaColor?: string }) {
  const f = FOOT[lang];
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${o.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND};padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
<tr><td style="padding:0 20px 20px;"><span style="font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px;">NightFlow</span></td></tr>
<tr><td style="background:${CARD};border-radius:20px;padding:28px 24px;">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:900;color:#fff;letter-spacing:-0.5px;">${o.heading}</h1>
${o.body}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr><td style="border-radius:14px;background:${o.ctaColor || "#fff"};">
<a href="${o.url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#000;text-decoration:none;border-radius:14px;">${o.cta}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:18px 20px 0;"><p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED};">${f.q}</p>
<p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};">${f.why}</p></td></tr>
</table></td></tr></table></body></html>`;
}
const row = (label: string, value: string, color = "#fff") =>
  `<tr><td style="font-size:13px;color:${MUTED};padding:4px 0;">${label}</td><td align="right" style="font-size:14px;color:${color};font-weight:700;padding:4px 0;">${value}</td></tr>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// ── 접수 확인 ────────────────────────────────────────────────────────────────
const RECEIVED: Record<Lang, { subject: (ref: string) => string; heading: string; intro: string; next: string[]; cta: string; date: string; club: string; people: string; total: string }> = {
  en: {
    subject: (ref) => `Got your request ${ref} — the club is checking now`,
    heading: "Got it — the club is checking now",
    intro: "Most requests get a reply within hours. We'll write back at this address the moment your table is confirmed.",
    next: ["Club confirms your table and checks the price against its menu.", "You get a booking pass to show at the door with your passport (19+).", "You pay the club directly — nothing to NightFlow."],
    cta: "See Seoul clubs", date: "Date", club: "Club", people: "Group", total: "Your drinks",
  },
  ja: {
    subject: (ref) => `リクエスト ${ref} を受け付けました — クラブが確認中です`,
    heading: "受け付けました — クラブが確認中です",
    intro: "多くの場合、数時間以内にご返信します。テーブルが確定したらすぐこのアドレスにお知らせします。",
    next: ["クラブがテーブルを確認し、価格をメニューと照合します。", "入口でパスポートと一緒に見せる予約パスをお送りします（19歳以上）。", "お支払いはクラブに直接。NightFlow への支払いはありません。"],
    cta: "ソウルのクラブを見る", date: "日付", club: "クラブ", people: "人数", total: "ドリンク",
  },
  zh: {
    subject: (ref) => `已收到请求 ${ref} — 夜店正在确认`,
    heading: "已收到 — 夜店正在确认",
    intro: "大多数请求会在几小时内得到回复。桌位一确认，我们会立即发到这个邮箱。",
    next: ["夜店确认桌位，并按酒单核对价格。", "你会收到入场凭证，入口出示护照即可（19岁以上）。", "费用直接付给夜店，不经 NightFlow。"],
    cta: "浏览首尔夜店", date: "日期", club: "夜店", people: "人数", total: "酒水",
  },
  "zh-tw": {
    subject: (ref) => `已收到請求 ${ref} — 夜店正在確認`,
    heading: "已收到 — 夜店正在確認",
    intro: "大多數請求會在幾小時內得到回覆。包廂一確認，我們會立即寄到這個信箱。",
    next: ["夜店確認包廂，並依酒單核對價格。", "你會收到入場憑證，入口出示護照即可（19歲以上）。", "費用直接付給夜店，不經 NightFlow。"],
    cta: "瀏覽首爾夜店", date: "日期", club: "夜店", people: "人數", total: "酒水",
  },
};

async function sendReceived(sb: ReturnType<typeof createClient>, requestId: string) {
  const { data: fr, error } = await sb
    .from("foreign_requests")
    .select("id, ref_code, lang, event_date, group_size, club_ids, contact_type, contact_value, selected_menu_total")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !fr) throw new Error(`request not found: ${error?.message ?? requestId}`);
  if (fr.contact_type !== "email" || !fr.contact_value) return { skipped: "not_email" };
  const lang = normLang(fr.lang);
  const c = RECEIVED[lang];
  let clubName = "";
  let area: string | null = null;
  const clubId = Array.isArray(fr.club_ids) ? fr.club_ids[0] : null;
  if (clubId) {
    const { data: club } = await sb.from("clubs").select("name, name_en, area").eq("id", clubId).maybeSingle();
    if (club) { clubName = (club.name_en || club.name) as string; area = club.area as string; }
  }
  const ref = `#${fr.ref_code ?? `NF-${String(fr.id).slice(0, 6).toUpperCase()}`}`;
  const total = fr.selected_menu_total ? `₩${Number(fr.selected_menu_total).toLocaleString("en-US")}` : "";
  const body = `
<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${MUTED};">${c.intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;">
${row(c.date, esc(fmtDate(fr.event_date, lang)))}
${clubName ? row(c.club, `${esc(clubName)} · ${esc(areaLabel(area, lang))}`) : ""}
${row(c.people, String(fr.group_size))}
${total ? row(c.total, total, GREEN) : ""}
</table>
<p style="margin:0 0 6px;font-size:12px;color:${MUTED};">${ref}</p>
<ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#fff;">${c.next.map((n) => `<li>${n}</li>`).join("")}</ol>`;
  const html = layout(lang, {
    preheader: c.intro, heading: c.heading, body, cta: c.cta,
    url: `${SITE}/${lang}/clubs`, ctaColor: AMBER,
  });
  await resendSend({ to: fr.contact_value, subject: c.subject(ref), html });
  return { sent: 1 };
}

// ── D-3 리마인더 ─────────────────────────────────────────────────────────────
const REMIND: Record<Lang, { subject: (d: string) => string; heading: string; intro: string; cta: string; ps: string }> = {
  en: {
    subject: (d) => `Your Seoul night is in 3 days (${d}) — lock in a table now`,
    heading: "3 days to go — time to book",
    intro: "You asked us to remind you when your trip got closer. Tables fill up on weekends, so this is the moment: pick a club, choose your drinks from its real menu, and we'll confirm with the club. No deposit, pay at the club.",
    cta: "Finish my request", ps: "Trip changed? Just ignore this — we won't email again.",
  },
  ja: {
    subject: (d) => `ソウルの夜まであと3日（${d}）— 今すぐテーブルを確保`,
    heading: "あと3日 — 予約のタイミングです",
    intro: "旅行が近づいたらお知らせするようご希望でした。週末はテーブルが埋まりやすいので今が最適です。クラブを選び、実際のメニューからドリンクを選ぶだけで、クラブに確認します。デポジット不要、お支払いは現地で。",
    cta: "リクエストを完了する", ps: "予定が変わった場合は無視してください。再送はしません。",
  },
  zh: {
    subject: (d) => `距离你的首尔之夜还有3天（${d}）— 现在锁定桌位`,
    heading: "还有3天 — 该预订了",
    intro: "你让我们在行程临近时提醒你。周末桌位很快订满，现在正是时候：选一家夜店，从真实酒单选酒，我们帮你向夜店确认。无需订金，到店付款。",
    cta: "完成我的请求", ps: "行程有变？忽略即可，我们不会再发邮件。",
  },
  "zh-tw": {
    subject: (d) => `距離你的首爾之夜還有3天（${d}）— 現在鎖定包廂`,
    heading: "還有3天 — 該預訂了",
    intro: "你讓我們在行程臨近時提醒你。週末包廂很快訂滿，現在正是時候：選一家夜店，從真實酒單選酒，我們幫你向夜店確認。無需訂金，到店付款。",
    cta: "完成我的請求", ps: "行程有變？忽略即可，我們不會再寄信。",
  },
};

async function sendReminders(sb: ReturnType<typeof createClient>) {
  // KST 기준 오늘 ~ 오늘+3일. "= 오늘+3"으로만 보면 크론이 하루 빠졌을 때 그날 코호트가 영영 안 나간다 —
  // 아직 안 보낸 행이면 D-2·D-1이라도 보낸다(방문일이 지난 건 제외).
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const today = kst.toISOString().slice(0, 10);
  kst.setUTCDate(kst.getUTCDate() + 3);
  const target = kst.toISOString().slice(0, 10);
  const { data: rows, error } = await sb
    .from("foreign_trip_reminders")
    .select("id, email, lang, area, tentative_date, group_size, utm_source, utm_medium, utm_campaign")
    .lte("tentative_date", target)
    .gte("tentative_date", today)
    .is("sent_at", null)
    .limit(200);
  if (error) throw error;
  let sent = 0, failed = 0;
  for (const r of rows ?? []) {
    const lang = normLang(r.lang);
    const c = REMIND[lang];
    const params = new URLSearchParams({ lang, from: "reminder" });
    if (r.area) params.set("area", r.area);
    // 원래 유입 채널을 그대로 싣는다 — 폼이 세션 UTM으로 foreign_requests에 기록한다.
    if (r.utm_source) params.set("utm_source", r.utm_source);
    if (r.utm_medium) params.set("utm_medium", r.utm_medium);
    if (r.utm_campaign) params.set("utm_campaign", r.utm_campaign);
    const url = `${SITE}/flags/new?${params.toString()}`;
    const dateStr = fmtDate(r.tentative_date, lang);
    const body = `
<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${MUTED};">${c.intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px;">
${row("📅", esc(dateStr))}
${r.area ? row("📍", esc(areaLabel(r.area, lang))) : ""}
${r.group_size ? row("👥", String(r.group_size)) : ""}
</table>
<p style="margin:0;font-size:12px;color:${MUTED};">${c.ps}</p>`;
    try {
      await resendSend({
        to: r.email,
        subject: c.subject(dateStr),
        html: layout(lang, { preheader: c.intro, heading: c.heading, body, cta: c.cta, url, ctaColor: AMBER }),
      });
      await sb.from("foreign_trip_reminders").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
      sent++;
    } catch (e) {
      failed++;
      console.error("reminder failed", r.id, (e as Error).message);
    }
  }
  return { target, sent, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    let result: unknown;
    if (mode === "received" && typeof body.request_id === "string") {
      result = await sendReceived(sb, body.request_id);
    } else if (mode === "reminders") {
      result = await sendReminders(sb);
    } else {
      return new Response(JSON.stringify({ error: "unknown mode" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, ...(result as object) }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
