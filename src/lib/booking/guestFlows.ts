// 손님 자동 흐름(2026-11-01) — 운영자가 중간에서 옮겨 적던 단계를 버튼으로 바꾼다.
//
//   자리 고르기   담당자 "예약 가능 · 이 자리들" → 손님 메일(테이블맵 + 자리 버튼) → 손님 선택
//                → 담당자 재확인("이 자리 지금도 되나요?") → 예약 확인서 자동 발급
//   금액 안내     담당자 "받기 어려워요 · 금액 부족" → 손님 메일(이 금액으로 진행 / WhatsApp / 취소)
//   밀림          담당자 "자리가 밀릴 것 같아요" → 손님 메일(이 금액으로 유지 / 비용 없이 취소) → 유지면 확인서 자동 갱신
//   변경 안내     확인서 금액·자리·구성이 바뀌면 손님에게 "Updated" 메일
//
// 손님 메일은 외국인 요청만(폼에서 이메일 필수). 한국 예약은 기존 흐름(내 예약·알림톡)을 그대로 쓴다.
// 손님에게 행동을 요청한 메일은 guest_action_*에 기록해, 답이 없으면 cron이 운영자에게 알린다
// (메일을 못 보는 손님 → 운영자가 WhatsApp으로 한 번 더).

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/notifications/alimtalk";
import { notifyAssignedMd } from "@/lib/booking/notifyMd";
import { saveConfirmation } from "@/lib/booking/confirmations";
import { parseSeatZones, seatOptions, seatValueLabel, type SeatZone } from "@/lib/booking/seats";
import {
  COLOR, esc, fmtGuestDate, guestEmailOf, guestLayout, mailButton, mapImage, normLang, p, sendGuestEmail, waLink, type GuestLang,
} from "@/lib/email/foreignGuest";

export const SITE = "https://nightflow.kr";

export type FlowReq = {
  id: string;
  guest_name: string | null;
  event_date: string;
  group_size: number;
  status: string;
  lang: string | null;
  club_ids: string[] | null;
  contact_type: string | null;
  contact_value: string | null;
  backup_email: string | null;
  selected_menu: { items?: { qty: number; name_en: string; label_en?: string | null }[]; md_recommend?: { budget: number } } | null;
  selected_menu_total: number | null;
  budget: number | null;
  notes: string | null;
  assigned_md_id: string | null;
  proposal_token: string;
  guest_token: string;
  md_seats: string[] | null;
  md_proposed_items: string | null;
  md_required_amount: number | null;
  md_conditions: string | null;
  guest_choice: string | null;
  guest_action_kind: string | null;
  guest_action_payload: Record<string, unknown> | null;
};

const REQ_COLS =
  "id, guest_name, event_date, group_size, status, lang, club_ids, contact_type, contact_value, backup_email, selected_menu, selected_menu_total, budget, notes, assigned_md_id, proposal_token, guest_token, md_seats, md_proposed_items, md_required_amount, md_conditions, guest_choice, guest_action_kind, guest_action_payload";

export async function loadForeignReq(sb: SupabaseClient, by: { id?: string; guestToken?: string; proposalToken?: string }): Promise<FlowReq | null> {
  let q = sb.from("foreign_requests").select(REQ_COLS);
  if (by.id) q = q.eq("id", by.id);
  else if (by.guestToken) q = q.eq("guest_token", by.guestToken);
  else if (by.proposalToken) q = q.eq("proposal_token", by.proposalToken);
  else return null;
  const { data } = await q.maybeSingle();
  return (data as unknown as FlowReq) ?? null;
}

export type FlowClub = { id: string; name: string; name_en: string | null; seat_zones: SeatZone[]; floorPlanUrls: string[] };

export async function loadClub(sb: SupabaseClient, clubId: string | null | undefined): Promise<FlowClub | null> {
  if (!clubId) return null;
  const { data } = await sb.from("clubs").select("id, name, name_en, seat_zones, floor_plan_url, floor_plan_urls").eq("id", clubId).maybeSingle();
  if (!data) return null;
  const plans = (data.floor_plan_urls as string[] | null)?.length ? (data.floor_plan_urls as string[]) : data.floor_plan_url ? [data.floor_plan_url as string] : [];
  return { id: data.id, name: data.name, name_en: data.name_en, seat_zones: parseSeatZones(data.seat_zones), floorPlanUrls: plans };
}

/** 손님이 낸 금액 — 메뉴를 담았으면 그 합계, MD 추천이면 예산. */
export const guestAmount = (r: Pick<FlowReq, "selected_menu_total" | "budget">) => r.selected_menu_total ?? r.budget ?? null;

export const respondUrl = (r: Pick<FlowReq, "guest_token">, query = "") => `${SITE}/booking/respond/${r.guest_token}${query}`;

export async function pushAdmins(sb: SupabaseClient, title: string, body: string, requestId: string, kind: string): Promise<void> {
  const { data: admins } = await sb.from("users").select("id").eq("role", "admin");
  for (const a of admins ?? []) {
    const { error } = await sb.rpc("notify_user_push", {
      p_user_id: a.id, p_title: title, p_body: body,
      p_data: { type: kind, request_id: requestId }, p_url: "/admin/foreign", p_category: "transaction",
    });
    if (error) console.error("[guestFlows] admin push 실패", kind, error);
  }
}

/** 담당 MD에게 짧은 알림 — 벨 + 앱 푸시, 앱이 없으면 문자. */
export async function notifyMd(sb: SupabaseClient, mdId: string, title: string, text: string, path: string): Promise<boolean> {
  try {
    await sb.from("in_app_notifications").insert({ user_id: mdId, type: "md_new_booking_proposal", title, message: text, action_url: path });
  } catch (e) {
    console.error("[guestFlows] MD 벨 알림 실패", e);
  }
  const { count } = await sb.from("push_tokens").select("*", { count: "exact", head: true }).eq("user_id", mdId);
  if ((count ?? 0) > 0) {
    const { error } = await sb.rpc("notify_user_push", {
      p_user_id: mdId, p_title: title, p_body: text, p_data: { type: "booking_proposal" }, p_url: path, p_category: "transaction",
    });
    if (!error) return true;
  }
  const { data: md } = await sb.from("users").select("phone").eq("id", mdId).single();
  if (!md?.phone) return false;
  try {
    await sendSms(md.phone, `[나이트플로우] ${title.replace(/^\S+\s/, "")}\n${text}\n${SITE}${path}`);
    return true;
  } catch (e) {
    console.error("[guestFlows] MD 문자 실패", e);
    return false;
  }
}

/** 손님에게 행동을 요청한 메일을 보냈다고 기록 — 답이 없으면 cron이 운영자에게 알린다. */
async function markGuestAction(sb: SupabaseClient, id: string, kind: string, payload: Record<string, unknown>) {
  await sb.from("foreign_requests").update({
    guest_action_kind: kind,
    guest_action_payload: payload,
    guest_action_sent_at: new Date().toISOString(),
    guest_responded_at: null,
    guest_alerts: 0,
  }).eq("id", id);
}

const clubTitle = (c: FlowClub | null) => c?.name_en || c?.name || "the club";
const who = (r: FlowReq, c: FlowClub | null) =>
  `${c?.name ?? "클럽"} · ${r.guest_name?.trim() || "게스트"}님 ${r.group_size}명 ${r.event_date.slice(5).replace("-", "/")}`;

// ── 자리 고르기 ───────────────────────────────────────────────────────────────
const PICK: Record<GuestLang, { subject: (c: string, d: string) => string; badge: string; heading: string; lead: (c: string, d: string, n: number, amt: string) => string; filled: (prev: string) => string; choose: string; within: string; notSure: string; chat: string; map: string }> = {
  en: {
    subject: (c, d) => `${c} on ${d}: pick your table`,
    badge: "PICK YOUR TABLE",
    heading: "Good news! The club can take your booking 🎉",
    lead: (c, d, n, amt) => `<b>${c}</b> · <b>${d}</b> · ${n} guests${amt ? ` · ${amt}` : ""}`,
    filled: (prev) => `Sorry, <b>${prev}</b> was just taken. These are still open:`,
    choose: "Please choose your table:",
    within: "Please choose within 2 hours.",
    notSure: "Not sure which one?",
    chat: "Chat with us on WhatsApp",
    map: "Table map · tap to enlarge",
  },
  ja: {
    subject: (c, d) => `${c}（${d}）：テーブルを選んでください`,
    badge: "テーブルを選ぶ",
    heading: "クラブで予約できます 🎉",
    lead: (c, d, n, amt) => `<b>${c}</b> · <b>${d}</b> · ${n}名${amt ? ` · ${amt}` : ""}`,
    filled: (prev) => `申し訳ありません、<b>${prev}</b> はちょうど埋まりました。こちらはまだ空いています：`,
    choose: "テーブルを選んでください：",
    within: "2時間以内にお選びください。",
    notSure: "迷ったら",
    chat: "WhatsAppで相談する",
    map: "テーブルマップ · タップで拡大",
  },
  zh: {
    subject: (c, d) => `${c}（${d}）：请选择卡座`,
    badge: "选择卡座",
    heading: "好消息！夜店可以接你的预订 🎉",
    lead: (c, d, n, amt) => `<b>${c}</b> · <b>${d}</b> · ${n}人${amt ? ` · ${amt}` : ""}`,
    filled: (prev) => `抱歉，<b>${prev}</b> 刚被订走了。这些还空着：`,
    choose: "请选择你的卡座：",
    within: "请在 2 小时内选择。",
    notSure: "不知道选哪个？",
    chat: "WhatsApp 联系我们",
    map: "卡座图 · 点击放大",
  },
  "zh-tw": {
    subject: (c, d) => `${c}（${d}）：請選擇包廂`,
    badge: "選擇包廂",
    heading: "好消息！夜店可以接你的訂位 🎉",
    lead: (c, d, n, amt) => `<b>${c}</b> · <b>${d}</b> · ${n}人${amt ? ` · ${amt}` : ""}`,
    filled: (prev) => `抱歉，<b>${prev}</b> 剛被訂走了。這些還空著：`,
    choose: "請選擇你的包廂：",
    within: "請在 2 小時內選擇。",
    notSure: "不知道選哪個？",
    chat: "WhatsApp 聯絡我們",
    map: "包廂圖 · 點擊放大",
  },
};

/** 자리 고르기 메일. previousChoice가 있으면 "고르신 자리가 방금 찼어요" 안내로 시작한다. */
export async function sendSeatChoiceEmail(sb: SupabaseClient, requestId: string, previousChoice?: string | null): Promise<boolean> {
  const r = await loadForeignReq(sb, { id: requestId });
  if (!r || r.status === "cancelled") return false;
  const club = await loadClub(sb, r.club_ids?.[0]);
  const zones = club?.seat_zones ?? [];
  const opts = seatOptions(zones, r.md_seats ?? []);
  if (opts.length === 0) return false;
  await markGuestAction(sb, r.id, "pick_seat", { options: opts.map((o) => o.value) });

  const to = guestEmailOf(r);
  if (!to) return false;
  const lang = normLang(r.lang);
  const c = PICK[lang];
  const name = clubTitle(club);
  const date = fmtGuestDate(r.event_date, lang);
  const amt = guestAmount(r);
  const waText = `Hi! About my booking at ${name} on ${r.event_date}.`;
  const body =
    p(c.lead(esc(name), esc(date), r.group_size, amt ? `₩${amt.toLocaleString("en-US")}` : "")) +
    p(previousChoice ? c.filled(esc(seatValueLabel(zones, previousChoice))) : c.choose) +
    (club?.floorPlanUrls ?? []).map((u) => mapImage(u, c.map)).join("") +
    opts.map((o) => mailButton(respondUrl(r, `?pick=${encodeURIComponent(o.value)}`), o.label, "#111111", "#ffffff")).join("") +
    `<p style="margin:14px 0 0;font-size:12px;color:#9ca3af;">${c.within}</p>` +
    `<p style="margin:12px 0 0;font-size:13px;color:#e5e5e5;">${c.notSure}</p>` +
    mailButton(waLink(waText), c.chat, COLOR.wa, "#fff");
  try {
    await sendGuestEmail(to, c.subject(name, date), guestLayout({ lang, preheader: c.heading, badge: c.badge, badgeColor: COLOR.green, heading: c.heading, body, waText }));
    return true;
  } catch (e) {
    console.error("[guestFlows] 자리 고르기 메일 실패", e);
    return false;
  }
}

// ── 금액 안내 (받기 어려워요 · 금액 부족) ──────────────────────────────────────
const BUDGET: Record<GuestLang, { subject: (c: string, d: string) => string; badge: string; heading: string; body: (c: string, d: string, mine: string, need: string) => string; go: (need: string) => string; chat: string; cancel: string; nothing: string }> = {
  en: {
    subject: (c, d) => `${c} on ${d}: here's what's available`,
    badge: "UPDATE",
    heading: "Here's what the club can do",
    body: (c, d, mine, need) => `We checked with <b>${c}</b> for <b>${d}</b>. Unfortunately the club can't do ${mine} for that night. The closest option is <b>${need}</b>.`,
    go: (need) => `Go ahead with ${need}`,
    chat: "Chat with us about other options",
    cancel: "No thanks, cancel",
    nothing: "Nothing is booked until you choose, and there's no payment upfront: you pay at the club on the night.",
  },
  ja: {
    subject: (c, d) => `${c}（${d}）：ご案内`,
    badge: "ご案内",
    heading: "クラブからのご提案です",
    body: (c, d, mine, need) => `<b>${d}</b> の <b>${c}</b> に確認しました。あいにく ${mine} では難しく、最も近いのは <b>${need}</b> です。`,
    go: (need) => `${need} で進める`,
    chat: "WhatsAppで他の案を相談",
    cancel: "キャンセルする",
    nothing: "お選びいただくまで予約は確定しません。前払いもなく、当日クラブでお支払いです。",
  },
  zh: {
    subject: (c, d) => `${c}（${d}）：可选方案`,
    badge: "方案更新",
    heading: "夜店可以这样安排",
    body: (c, d, mine, need) => `我们向 <b>${c}</b> 确认了 <b>${d}</b> 的情况。很抱歉 ${mine} 无法安排，最接近的方案是 <b>${need}</b>。`,
    go: (need) => `按 ${need} 进行`,
    chat: "WhatsApp 咨询其他方案",
    cancel: "不用了，取消",
    nothing: "你确认之前不会预订，也无需预付，当晚在夜店付款。",
  },
  "zh-tw": {
    subject: (c, d) => `${c}（${d}）：可選方案`,
    badge: "方案更新",
    heading: "夜店可以這樣安排",
    body: (c, d, mine, need) => `我們向 <b>${c}</b> 確認了 <b>${d}</b> 的狀況。很抱歉 ${mine} 無法安排，最接近的方案是 <b>${need}</b>。`,
    go: (need) => `以 ${need} 進行`,
    chat: "WhatsApp 詢問其他方案",
    cancel: "不用了，取消",
    nothing: "你確認之前不會訂位，也不需預付，當晚在夜店付款。",
  },
};

export async function sendBudgetEmail(sb: SupabaseClient, requestId: string): Promise<boolean> {
  const r = await loadForeignReq(sb, { id: requestId });
  if (!r || r.status === "cancelled" || !r.md_required_amount) return false;
  const club = await loadClub(sb, r.club_ids?.[0]);
  await markGuestAction(sb, r.id, "budget", { amount: r.md_required_amount, conditions: r.md_conditions });

  const to = guestEmailOf(r);
  if (!to) return false;
  const lang = normLang(r.lang);
  const c = BUDGET[lang];
  const name = clubTitle(club);
  const date = fmtGuestDate(r.event_date, lang);
  const mine = guestAmount(r);
  const need = `₩${r.md_required_amount.toLocaleString("en-US")}`;
  const waText = `Hi! About my booking at ${name} on ${r.event_date}. Can we talk about other options?`;
  const conds = (r.md_conditions ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const body =
    p(c.body(esc(name), esc(date), mine ? `₩${mine.toLocaleString("en-US")}` : "your budget", need)) +
    (conds.length ? p(conds.map((l) => `• ${esc(l)}`).join("<br>"), true) : "") +
    mailButton(respondUrl(r, "?a=accept"), c.go(need), "#111111", "#ffffff") +
    mailButton(waLink(waText), c.chat, COLOR.wa, "#fff") +
    mailButton(respondUrl(r, "?a=cancel"), c.cancel, "#2a2a2e", "#bbbbbb") +
    `<p style="margin:14px 0 0;font-size:12px;color:#9ca3af;">${c.nothing}</p>`;
  try {
    await sendGuestEmail(to, c.subject(name, date), guestLayout({ lang, preheader: c.heading, badge: c.badge, badgeColor: COLOR.amber, heading: c.heading, body, waText }));
    return true;
  } catch (e) {
    console.error("[guestFlows] 금액 안내 메일 실패", e);
    return false;
  }
}

// ── 밀림 (유지 / 취소) ───────────────────────────────────────────────────────
const BUMP: Record<GuestLang, { subject: (c: string, d: string) => string; badge: string; heading: string; body: (c: string, d: string) => string; keep: (amt: string) => string; cancel: string; within: (t: string) => string }> = {
  en: {
    subject: (c, d) => `Action needed: your table at ${c} (${d})`,
    badge: "ACTION NEEDED",
    heading: "Someone offered more for your table",
    body: (c, d) => `On busy nights, tables at <b>${c}</b> go to higher offers. For <b>${d}</b>, you can keep your table by adding a little more, or cancel at no cost. You get the first chance before anyone else.`,
    keep: (amt) => `Keep my table · ${amt}`,
    cancel: "Cancel at no cost",
    within: (t) => `Please reply ${t}.`,
  },
  ja: {
    subject: (c, d) => `ご確認ください：${c}（${d}）のテーブル`,
    badge: "ご確認ください",
    heading: "あなたのテーブルにより高い金額の申し込みがありました",
    body: (c, d) => `混雑する夜の <b>${c}</b> では、より高い金額の申し込みが優先されます。<b>${d}</b> のテーブルは、少し追加して確保するか、無料でキャンセルできます。あなたに先にお知らせしています。`,
    keep: (amt) => `テーブルを確保 · ${amt}`,
    cancel: "無料でキャンセル",
    within: (t) => `${t}にご返信ください。`,
  },
  zh: {
    subject: (c, d) => `请确认：你在 ${c}（${d}）的卡座`,
    badge: "请确认",
    heading: "有人对你的卡座出了更高价",
    body: (c, d) => `热门夜晚 <b>${c}</b> 的卡座会给出价更高的客人。<b>${d}</b> 的卡座，你可以加一点保留，或免费取消。我们先通知你。`,
    keep: (amt) => `保留卡座 · ${amt}`,
    cancel: "免费取消",
    within: (t) => `请在${t}回复。`,
  },
  "zh-tw": {
    subject: (c, d) => `請確認：你在 ${c}（${d}）的包廂`,
    badge: "請確認",
    heading: "有人對你的包廂出了更高價",
    body: (c, d) => `熱門夜晚 <b>${c}</b> 的包廂會給出價更高的客人。<b>${d}</b> 的包廂，你可以加一點保留，或免費取消。我們先通知你。`,
    keep: (amt) => `保留包廂 · ${amt}`,
    cancel: "免費取消",
    within: (t) => `請在${t}回覆。`,
  },
};

const withinText = (lang: GuestLang, deadline: Date): string => {
  const min = Math.max(5, Math.round((deadline.getTime() - Date.now()) / 60000));
  const seoul = deadline.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
  const dur = min >= 60 ? `${Math.round(min / 60)} hour${Math.round(min / 60) > 1 ? "s" : ""}` : `${min} minutes`;
  if (lang === "en") return `within ${dur} (by ${seoul} Seoul time)`;
  if (lang === "ja") return `${min >= 60 ? `${Math.round(min / 60)}時間` : `${min}分`}以内（ソウル時間 ${seoul} まで）`;
  return `${min >= 60 ? `${Math.round(min / 60)} 小时` : `${min} 分钟`}内（首尔时间 ${seoul} 前）`;
};

export async function sendBumpEmail(sb: SupabaseClient, requestId: string): Promise<boolean> {
  const r = await loadForeignReq(sb, { id: requestId });
  if (!r || r.status === "cancelled") return false;
  const { data: conf } = await sb.from("booking_confirmations").select("bump_amount, bump_items, bump_deadline").eq("request_type", "foreign").eq("request_id", r.id).maybeSingle();
  if (!conf?.bump_amount) return false;
  const club = await loadClub(sb, r.club_ids?.[0]);
  await markGuestAction(sb, r.id, "bump", { amount: conf.bump_amount });

  const to = guestEmailOf(r);
  if (!to) return false;
  const lang = normLang(r.lang);
  const c = BUMP[lang];
  const name = clubTitle(club);
  const date = fmtGuestDate(r.event_date, lang);
  const amt = `₩${conf.bump_amount.toLocaleString("en-US")}`;
  const items = (conf.bump_items ?? "").split("\n").map((l: string) => l.trim()).filter(Boolean);
  const waText = `Hi! About my table at ${name} on ${r.event_date}.`;
  const body =
    p(c.body(esc(name), esc(date))) +
    (items.length ? p(items.map((l: string) => `• ${esc(l)}`).join("<br>"), true) : "") +
    mailButton(respondUrl(r, "?a=keep"), c.keep(amt), COLOR.amber) +
    mailButton(respondUrl(r, "?a=cancel"), c.cancel, "#2a2a2e", "#bbbbbb") +
    (conf.bump_deadline ? `<p style="margin:14px 0 0;font-size:12px;color:#9ca3af;">${c.within(withinText(lang, new Date(conf.bump_deadline)))}</p>` : "");
  try {
    await sendGuestEmail(to, c.subject(name, date), guestLayout({ lang, preheader: c.heading, badge: c.badge, badgeColor: COLOR.amber, heading: c.heading, body, waText }));
    return true;
  } catch (e) {
    console.error("[guestFlows] 밀림 메일 실패", e);
    return false;
  }
}

// ── 확인서 변경 안내 ─────────────────────────────────────────────────────────
const CHANGE: Record<GuestLang, { subject: (c: string, d: string) => string; badge: string; heading: string; body: (c: string, d: string) => string; cta: string }> = {
  en: { subject: (c, d) => `Updated: your booking at ${c} (${d})`, badge: "UPDATED", heading: "Your booking details were updated", body: (c, d) => `Your booking at <b>${c}</b> on <b>${d}</b> has changed. Please check the latest details below.`, cta: "See updated booking" },
  ja: { subject: (c, d) => `更新：${c}（${d}）のご予約`, badge: "更新", heading: "予約内容が更新されました", body: (c, d) => `<b>${d}</b> の <b>${c}</b> のご予約内容が変わりました。最新の内容をご確認ください。`, cta: "更新内容を見る" },
  zh: { subject: (c, d) => `已更新：你在 ${c}（${d}）的预订`, badge: "已更新", heading: "你的预订详情已更新", body: (c, d) => `你在 <b>${d}</b> 的 <b>${c}</b> 预订有变动，请查看最新内容。`, cta: "查看更新" },
  "zh-tw": { subject: (c, d) => `已更新：你在 ${c}（${d}）的訂位`, badge: "已更新", heading: "你的訂位資訊已更新", body: (c, d) => `你在 <b>${d}</b> 的 <b>${c}</b> 訂位有變動，請查看最新內容。`, cta: "查看更新" },
};

/** 확인서가 바뀌었다고 손님에게 알린다. 외국인은 메일, 한국 예약은 벨 + 앱 푸시. */
export async function notifyConfirmationChanged(sb: SupabaseClient, requestType: "foreign" | "korean", requestId: string): Promise<boolean> {
  const { data: conf } = await sb.from("booking_confirmations").select("public_token, last_change_note").eq("request_type", requestType).eq("request_id", requestId).maybeSingle();
  if (!conf) return false;
  if (requestType === "korean") {
    const { data: kr } = await sb.from("korean_booking_requests").select("user_id").eq("id", requestId).maybeSingle();
    if (!kr?.user_id) return false;
    const text = conf.last_change_note || "예약 내용이 바뀌었어요. 예약 확인서를 확인해 주세요.";
    await sb.from("in_app_notifications").insert({ user_id: kr.user_id, type: "korean_booking_confirmed", title: "📝 예약 내용이 바뀌었어요", message: text, action_url: `/booking/${conf.public_token}` });
    const { error } = await sb.rpc("notify_user_push", { p_user_id: kr.user_id, p_title: "📝 예약 내용이 바뀌었어요", p_body: text, p_data: { type: "booking_changed", request_id: requestId }, p_url: `/booking/${conf.public_token}`, p_category: "transaction" });
    return !error;
  }
  const r = await loadForeignReq(sb, { id: requestId });
  const to = r ? guestEmailOf(r) : null;
  if (!r || !to) return false;
  const club = await loadClub(sb, r.club_ids?.[0]);
  const lang = normLang(r.lang);
  const c = CHANGE[lang];
  const name = clubTitle(club);
  const date = fmtGuestDate(r.event_date, lang);
  const waText = `Hi! About my updated booking at ${name} on ${r.event_date}.`;
  const body =
    p(c.body(esc(name), esc(date))) +
    (conf.last_change_note ? p(esc(conf.last_change_note), true) : "") +
    mailButton(`${SITE}/booking/${conf.public_token}`, c.cta, COLOR.amber);
  try {
    await sendGuestEmail(to, c.subject(name, date), guestLayout({ lang, preheader: c.heading, badge: c.badge, badgeColor: COLOR.amber, heading: c.heading, body, waText }));
    return true;
  } catch (e) {
    console.error("[guestFlows] 변경 안내 메일 실패", e);
    return false;
  }
}

// ── 예약 확인서 자동 발급 ─────────────────────────────────────────────────────
/** 손님 금액 그대로 확인서를 만들고 담당 MD·손님에게 보낸다(notifyAssignedMd kind=confirmation —
 *  MD 앱 알림 + 외국인 손님 예약 메일). 운영자에게는 확인용 푸시만. */
export async function autoIssueConfirmation(sb: SupabaseClient, requestId: string, tableInfo: string): Promise<{ ok: boolean; refNo?: string }> {
  const r = await loadForeignReq(sb, { id: requestId });
  if (!r || r.status === "cancelled") return { ok: false };
  const club = await loadClub(sb, r.club_ids?.[0]);
  const items = r.md_proposed_items
    ? r.md_proposed_items.split("\n").map((l) => l.trim()).filter(Boolean)
    : (r.selected_menu?.items ?? []).map((it) => `${it.qty} ${it.name_en}${it.label_en ? ` ${it.label_en}` : ""}`);
  const saved = await saveConfirmation(sb, {
    requestType: "foreign",
    requestId: r.id,
    createdBy: null,
    source: "auto",
    fields: {
      club_id: club?.id ?? r.club_ids?.[0] ?? null,
      table_info: tableInfo,
      confirmed_group_size: String(r.group_size),
      includes: items,
      total_price: guestAmount(r),
      guest_request: r.notes,
    },
  });
  const sent = await notifyAssignedMd(sb, { requestType: "foreign", requestId: r.id, kind: "confirmation" });
  await pushAdmins(
    sb,
    "📄 예약 확인서 자동 발급",
    `${who(r, club)} · ${tableInfo} · ${guestAmount(r)?.toLocaleString("ko-KR") ?? "-"}원 · ${saved.ref_no}${sent.ok ? "" : " · ⚠️ 담당자 알림 실패"}`,
    r.id,
    "auto_confirmation",
  );
  return { ok: true, refNo: saved.ref_no };
}

export { who as flowWho };
