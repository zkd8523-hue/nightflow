"use client";

// 손님 메일 버튼 확인 페이지 본체(2026-11-01) — 자리 고르기 / 금액 수락 / 밀림 유지 / 취소.
// 한 번 더 눌러야 서버가 처리한다(메일 링크 미리 열기 대비). 4개 언어.

import { useState } from "react";
import Link from "next/link";
import { CONTACT_WHATSAPP } from "@/lib/foreign/contact";
import { MenuPhotosOverlay } from "@/components/booking/MenuPhotosOverlay";

export type RespondView = {
  token: string;
  lang: string;
  clubName: string;
  eventDate: string;
  /** 손님 언어로 적은 날짜("Sat, Nov 14") */
  dateLabel: string;
  guests: number;
  cancelled: boolean;
  passUrl: string | null;
  floorPlanUrls: string[];
  /** confirmed: 예약 확인서가 이미 나간 뒤 / sent: 금액 수락을 이미 보냄 / status: 지금 진행 상태 */
  mode: "pick" | "accept" | "keep" | "cancel" | "confirmed" | "sent" | "status";
  pickValue: string | null;
  pickLabel: string | null;
  alreadyPicked: string | null;
  pickValid: boolean;
  /** 구역 묶음을 골랐을 때 그 안의 번호들 — 비어 있으면 번호 선택 없음 */
  zoneSeats: string[];
  /** 담당자가 고를 수 있다고 한 자리 전체(2순위 자리 선택용) */
  allSeats: string[];
  amount: number | null;
  currentTotal: number | null;
  /** 자리 고르는 화면에 보여줄 "받는 구성" — 확인서가 나갈 때와 같은 줄·합계 */
  included: { lines: string[]; total: number | null } | null;
  confirmedTable: string | null;
  steps: { key: string; arg: string | null; state: "done" | "active" | "todo" }[];
  bumpExpired: boolean;
  bumpItems: string[];
};

type L = "en" | "ja" | "zh" | "zh-tw";
const norm = (v: string): L => (v === "ja" ? "ja" : v === "zh-tw" || v === "zh-hant" || v === "zh-hk" ? "zh-tw" : v.startsWith("zh") ? "zh" : "en");

const T: Record<L, Record<string, string>> = {
  en: {
    pickTitle: "You picked", confirm: "Confirm", change: "Choose a different table", tableMap: "Table map",
    payNote: "Pay the club on the night · no payment now",
    acceptTitle: "Go ahead with", keepTitle: "Keep your table for", cancelTitle: "Cancel this booking?", cancelBody: "No cost. The club will be told right away.",
    yesCancel: "Yes, cancel", keepBook: "Keep booking", chatUs: "Chat with us on WhatsApp",
    donePick: "Got it!\nThe club is double-checking this table for you.\nWe'll email your booking details shortly.",
    doneAccept: "Thanks! We sent this to the club. We'll email you once it's arranged.",
    doneKeep: "Your table is kept! Your booking details were updated.", doneCancel: "Your booking was cancelled. Hope to see you another time.",
    seeBooking: "See booking details", expired: "This offer has expired. Message us and we'll help right away.",
    invalid: "This link is no longer valid. Message us and we'll help right away.", cancelled: "This booking was cancelled.",
    already: "You already chose", fail: "Something went wrong. Please try again or message us.", updating: "Sending…",
    nothingTitle: "Nothing to do here", nothingBody: "This request was already handled. Message us if you need anything.",
    tapZoom: "Tap the map to enlarge",
    pickNumber: "Pick a table number (optional)", anyTable: "Any table", pickNumberNote: "The club will do its best to give you the one you pick. Otherwise it's assigned on the night.",
    yourBooking: "Your booking", s_received: "Request received", s_club_wait: "The club is checking your request", s_club_ok: "The club can take your booking",
    s_club_other: "The club suggested another option", s_club_no: "The club couldn't take this request", s_pick: "Pick your table", s_picked: "You picked table {x}",
    s_recheck: "The club is checking {x}", s_details: "Booking details", s_details_done: "Booking details are ready",
    detailsReady: "Your booking details are ready", viewDetails: "View booking details", noChange: "This link can't change your table. To change it, message us.",
    sentTitle: "Already sent to the club", sentBody: "We'll email you once it's arranged.",
    included: "What's included", total: "Total", changeDrinks: "You can change your drinks on the night.", confirmWith: "Confirm table {x}",
    backupTitle: "If this table isn't available, which would you prefer?", backupSub: "Optional. We'll pass it to the club.", backupAny: "Any open table", backupSave: "Save", backupSaved: "Saved ✓",
  },
  ja: {
    pickTitle: "選んだテーブル", confirm: "確定する", change: "別のテーブルを選ぶ", tableMap: "テーブルマップ",
    payNote: "お支払いは当日クラブで · 今は支払い不要",
    acceptTitle: "この金額で進める", keepTitle: "テーブルを確保する", cancelTitle: "このご予約をキャンセルしますか？", cancelBody: "無料です。クラブにすぐ伝わります。",
    yesCancel: "キャンセルする", keepBook: "予約を続ける", chatUs: "WhatsAppで相談する",
    donePick: "受け付けました！\nクラブがこのテーブルを再確認中です。\nまもなく予約内容をメールでお送りします。",
    doneAccept: "ありがとうございます！クラブに送りました。手配できたらメールします。",
    doneKeep: "テーブルを確保しました！予約内容が更新されました。", doneCancel: "キャンセルしました。またの機会に。",
    seeBooking: "予約内容を見る", expired: "この提案は期限切れです。WhatsAppでご連絡ください。",
    invalid: "このリンクは無効です。WhatsAppでご連絡ください。", cancelled: "このご予約はキャンセル済みです。",
    already: "選択済み", fail: "エラーが発生しました。もう一度お試しいただくか、ご連絡ください。", updating: "送信中…",
    nothingTitle: "操作は不要です", nothingBody: "このリクエストは処理済みです。ご質問はご連絡ください。",
    tapZoom: "マップをタップで拡大",
    pickNumber: "テーブル番号を選ぶ（任意）", anyTable: "どれでもOK", pickNumberNote: "ご希望の番号になるようクラブが努めますが、難しい場合は当日の割り当てになります。",
    yourBooking: "ご予約の状況", s_received: "受付完了", s_club_wait: "クラブがリクエストを確認中です", s_club_ok: "クラブで予約を受けられます",
    s_club_other: "クラブから別のご提案があります", s_club_no: "クラブでは受けられませんでした", s_pick: "テーブルを選んでください", s_picked: "{x} を選びました",
    s_recheck: "クラブが {x} を確認中です", s_details: "予約内容", s_details_done: "予約内容が届きました",
    detailsReady: "予約内容が届きました", viewDetails: "予約内容を見る", noChange: "このリンクではテーブルを変更できません。変更はご連絡ください。",
    sentTitle: "クラブに送信済みです", sentBody: "手配できたらメールでお知らせします。",
    included: "含まれる内容", total: "合計", changeDrinks: "お飲み物は当日変更できます。", confirmWith: "{x} で進める",
    backupTitle: "このテーブルが難しい場合、第2希望はどれですか？", backupSub: "任意です。クラブにお伝えします。", backupAny: "空いているテーブルでOK", backupSave: "保存", backupSaved: "保存しました ✓",
  },
  zh: {
    pickTitle: "你选择了", confirm: "确认", change: "选择其他卡座", tableMap: "卡座图",
    payNote: "当晚在夜店付款 · 现在无需付款",
    acceptTitle: "按此金额进行", keepTitle: "保留卡座", cancelTitle: "取消这个预订？", cancelBody: "免费取消，夜店会立刻收到通知。",
    yesCancel: "确认取消", keepBook: "继续预订", chatUs: "WhatsApp 联系我们",
    donePick: "收到！\n夜店正在为你再次确认这个卡座。\n稍后会邮件发送预订详情。",
    doneAccept: "谢谢！已发给夜店，安排好后会邮件通知你。",
    doneKeep: "已保留卡座！预订详情已更新。", doneCancel: "预订已取消，期待下次。",
    seeBooking: "查看预订详情", expired: "此方案已过期，请 WhatsApp 联系我们。",
    invalid: "此链接已失效，请 WhatsApp 联系我们。", cancelled: "该预订已取消。",
    already: "已选择", fail: "出错了，请重试或联系我们。", updating: "发送中…",
    nothingTitle: "无需操作", nothingBody: "此请求已处理，有问题请联系我们。",
    tapZoom: "点击地图放大",
    pickNumber: "选择卡座编号（可选）", anyTable: "任意卡座", pickNumberNote: "夜店会尽量安排你选的编号，否则当晚分配。",
    yourBooking: "你的预订", s_received: "已收到请求", s_club_wait: "夜店正在确认你的请求", s_club_ok: "夜店可以接你的预订",
    s_club_other: "夜店建议了其他方案", s_club_no: "夜店无法接此请求", s_pick: "请选择卡座", s_picked: "你选择了 {x}",
    s_recheck: "夜店正在确认 {x}", s_details: "预订详情", s_details_done: "预订详情已就绪",
    detailsReady: "预订详情已就绪", viewDetails: "查看预订详情", noChange: "此链接无法更改卡座，如需更改请联系我们。",
    sentTitle: "已发给夜店", sentBody: "安排好后会邮件通知你。",
    included: "包含内容", total: "合计", changeDrinks: "当晚可以更换酒水。", confirmWith: "确认 {x}",
    backupTitle: "如果这个卡座不可用，你想要哪个备选？", backupSub: "选填，我们会转告夜店。", backupAny: "任意空位", backupSave: "保存", backupSaved: "已保存 ✓",
  },
  "zh-tw": {
    pickTitle: "你選擇了", confirm: "確認", change: "選擇其他包廂", tableMap: "包廂圖",
    payNote: "當晚在夜店付款 · 現在無需付款",
    acceptTitle: "以此金額進行", keepTitle: "保留包廂", cancelTitle: "取消這個訂位？", cancelBody: "免費取消，夜店會立刻收到通知。",
    yesCancel: "確認取消", keepBook: "繼續訂位", chatUs: "WhatsApp 聯絡我們",
    donePick: "收到！\n夜店正在為你再次確認這個包廂。\n稍後會以郵件寄送訂位資訊。",
    doneAccept: "謝謝！已傳給夜店，安排好後會以郵件通知你。",
    doneKeep: "已保留包廂！訂位資訊已更新。", doneCancel: "訂位已取消，期待下次。",
    seeBooking: "查看訂位資訊", expired: "此方案已過期，請 WhatsApp 聯絡我們。",
    invalid: "此連結已失效，請 WhatsApp 聯絡我們。", cancelled: "該訂位已取消。",
    already: "已選擇", fail: "發生錯誤，請重試或聯絡我們。", updating: "傳送中…",
    nothingTitle: "無需操作", nothingBody: "此請求已處理，有問題請聯絡我們。",
    tapZoom: "點擊地圖放大",
    pickNumber: "選擇包廂編號（選填）", anyTable: "任意包廂", pickNumberNote: "夜店會盡量安排你選的編號，否則當晚分配。",
    yourBooking: "你的訂位", s_received: "已收到請求", s_club_wait: "夜店正在確認你的請求", s_club_ok: "夜店可以接你的訂位",
    s_club_other: "夜店建議了其他方案", s_club_no: "夜店無法接此請求", s_pick: "請選擇包廂", s_picked: "你選擇了 {x}",
    s_recheck: "夜店正在確認 {x}", s_details: "訂位資訊", s_details_done: "訂位資訊已備妥",
    detailsReady: "訂位資訊已備妥", viewDetails: "查看訂位資訊", noChange: "此連結無法更改包廂，如需更改請聯絡我們。",
    sentTitle: "已傳給夜店", sentBody: "安排好後會以郵件通知你。",
    included: "包含內容", total: "合計", changeDrinks: "當晚可以更換酒水。", confirmWith: "確認 {x}",
    backupTitle: "如果這個包廂不可用，你想要哪個備選？", backupSub: "選填，我們會轉告夜店。", backupAny: "任意空位", backupSave: "儲存", backupSaved: "已儲存 ✓",
  },
};

const won = (n: number) => `₩${n.toLocaleString("en-US")}`;

export function GuestRespond({ v }: { v: RespondView }) {
  const t = T[norm(v.lang)];
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "pick" | "accept" | "keep" | "cancel">("");
  const [err, setErr] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  // 지도를 누르면 핀치·더블탭으로 확대되는 전체 화면 뷰어(확인서의 테이블맵 버튼과 같은 것) — 글자가 작아 확대가 필요하다.
  const [zoomMap, setZoomMap] = useState(false);
  // 묶음(T1–T12)을 골랐으면 그 안에서 원하는 번호를 고를 수 있다. null = 아무 자리나(당일 배정).
  const [seat, setSeat] = useState<string | null>(null);
  const L = norm(v.lang);
  const guestsText = L === "ja" ? `${v.guests}名` : L === "en" ? `${v.guests} guests` : `${v.guests}人`;
  const fill = (tpl: string, x: string | null) => tpl.replace("{x}", x ?? "");
  const [backup, setBackup] = useState<string | null>(null);
  const [backupSaved, setBackupSaved] = useState(false);
  const wa = `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(`Hi! About my booking at ${v.clubName} on ${v.eventDate}.`)}`;

  // 2순위 후보 — 담당자가 고를 수 있다고 한 자리에서 방금 고른 자리만 뺀다.
  const pickedNow = seat ?? v.pickValue;
  // 구역 묶음(T1–T12)만 고르고 번호를 안 정했으면 그 구역 번호 전부가 "이미 고른 자리"다 — 서버도 같은 기준으로 거른다.
  const mineSeats = seat ? [seat] : v.pickValue?.startsWith("zone:") ? v.zoneSeats : pickedNow ? [pickedNow] : [];
  const backupChoices = v.allSeats.filter((x) => !mineSeats.includes(x)).slice(0, 12);

  const submit = async (action: "pick" | "accept" | "keep" | "cancel" | "backup") => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/guest-respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: v.token, action, value: action === "pick" ? seat ?? v.pickValue : action === "backup" ? backup : undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error === "expired" ? t.expired : j.error === "cancelled" ? t.cancelled : j.error === "invalid_choice" || j.error === "confirmed" ? t.invalid : t.fail);
        return;
      }
      if (action === "backup") { setBackupSaved(true); return; }
      setDone(action);
    } catch {
      setErr(t.fail);
    } finally {
      setBusy(false);
    }
  };

  // chat=false: 방금 처리가 끝난 완료 화면엔 문의 버튼이 필요 없다(2026-11-01).
  const Shell = ({ children, chat = true }: { children: React.ReactNode; chat?: boolean }) => (
    <div className="min-h-screen bg-background text-foreground py-7 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-[10.5px] font-bold tracking-[0.22em] uppercase text-muted-foreground text-center mb-4">NightFlow</div>
        <div className="rounded-3xl bg-card border border-border p-5 space-y-3">
          <div className="text-[12.5px] text-muted-foreground">
            {v.clubName} · {v.dateLabel} · {guestsText}
          </div>
          {children}
          {chat && (
            <a href={wa} className="flex items-center justify-center h-11 rounded-xl text-[13.5px] font-bold text-white" style={{ background: "#25D366" }}>
              {t.chatUs}
            </a>
          )}
        </div>
      </div>
    </div>
  );

  if (v.cancelled && done !== "cancel") {
    return (
      <Shell>
        <p className="text-[15px] font-bold">{t.cancelled}</p>
      </Shell>
    );
  }

  if (done) {
    const msg = { pick: t.donePick, accept: t.doneAccept, keep: t.doneKeep, cancel: t.doneCancel }[done];
    return (
      <Shell chat={false}>
        <p className="text-[16px] font-black leading-relaxed whitespace-pre-line">{msg}</p>
        {done === "pick" && backupChoices.length > 0 && (
          <div className="rounded-xl border border-border px-3.5 py-3 space-y-2">
            <p className="text-[13.5px] font-bold">{t.backupTitle}</p>
            <p className="text-[12px] text-muted-foreground">{t.backupSub}</p>
            <div className="flex flex-wrap gap-1.5">
              {backupChoices.map((s2) => (
                <button key={s2} type="button" onClick={() => { setBackup(s2); setBackupSaved(false); }}
                  className={`min-w-[44px] h-9 px-2 rounded-lg border text-[13px] font-bold ${backup === s2 ? "border-amber-500 bg-amber-500/15 text-brand-amber" : "border-border text-foreground/80"}`}>{s2}</button>
              ))}
              <button type="button" onClick={() => { setBackup("any"); setBackupSaved(false); }}
                className={`h-9 px-3 rounded-lg border text-[13px] font-bold ${backup === "any" ? "border-amber-500 bg-amber-500/15 text-brand-amber" : "border-border text-foreground/80"}`}>{t.backupAny}</button>
            </div>
            {err && <p className="text-[12.5px] text-red-400">{err}</p>}
            {backup && (
              <button type="button" disabled={busy || backupSaved} onClick={() => submit("backup")}
                className="w-full h-10 rounded-xl bg-white text-black text-[14px] font-black disabled:opacity-60">{backupSaved ? t.backupSaved : busy ? t.updating : t.backupSave}</button>
            )}
          </div>
        )}
        {done === "keep" && v.passUrl && (
          <Link href={v.passUrl} className="flex items-center justify-center h-12 rounded-xl bg-white text-black text-[15px] font-black">
            {t.seeBooking}
          </Link>
        )}
      </Shell>
    );
  }

  if (v.mode === "confirmed") {
    return (
      <Shell>
        <p className="text-[12px] font-bold text-muted-foreground">{t.detailsReady}</p>
        {v.confirmedTable && <p className="text-[22px] font-black leading-tight">{v.confirmedTable}</p>}
        <p className="text-[13px] text-muted-foreground">{t.noChange}</p>
        {v.passUrl && (
          <Link href={v.passUrl} className="flex items-center justify-center h-12 rounded-xl bg-white text-black text-[15px] font-black">
            {t.viewDetails}
          </Link>
        )}
      </Shell>
    );
  }

  if (v.mode === "sent") {
    return (
      <Shell>
        <p className="text-[16px] font-black">{t.sentTitle}</p>
        <p className="text-[13px] text-muted-foreground">{t.sentBody}</p>
      </Shell>
    );
  }

  if (v.mode === "status" || (v.mode === "pick" && !v.pickValid)) {
    return (
      <Shell>
        <p className="text-[16px] font-black">{t.yourBooking}</p>
        <ol className="space-y-0.5">
          {v.steps.map((st) => {
            const label = st.key === "details" && st.state === "done" ? t.s_details_done : fill(t["s_" + st.key] ?? st.key, st.arg);
            return (
              <li key={st.key} className="flex items-start gap-2.5 py-1.5">
                <span
                  className={`shrink-0 w-[22px] h-[22px] rounded-full grid place-items-center text-[11px] font-black border ${
                    st.state === "done" ? "bg-green-500/15 text-money border-green-500/40" : st.state === "active" ? "bg-amber-500/15 text-brand-amber border-amber-500" : "bg-card text-muted-foreground border-border"
                  }`}
                  aria-hidden="true"
                >
                  {st.state === "done" ? "✓" : st.state === "active" ? "…" : "·"}
                </span>
                <span className={`text-[14px] leading-snug ${st.state === "todo" ? "text-muted-foreground font-medium" : st.state === "active" ? "font-black text-brand-amber" : "font-bold"}`}>{label}</span>
              </li>
            );
          })}
        </ol>
      </Shell>
    );
  }

  if (v.mode === "pick") {
    return (
      <Shell>
        <p className="text-[12px] font-bold text-muted-foreground">{t.pickTitle}</p>
        <p className="text-[22px] font-black leading-tight">{seat ? `Table ${seat}` : v.pickLabel}</p>
        {v.zoneSeats.length > 0 && (
          <div>
            <p className="text-[12.5px] font-bold text-muted-foreground mb-1.5">{t.pickNumber}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSeat(null)}
                className={`h-9 px-3 rounded-lg border text-[13px] font-bold ${seat === null ? "border-amber-500 bg-amber-500/15 text-brand-amber" : "border-border text-foreground/80"}`}
              >
                {t.anyTable}
              </button>
              {v.zoneSeats.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeat(s)}
                  className={`min-w-[44px] h-9 px-2 rounded-lg border text-[13px] font-bold ${seat === s ? "border-amber-500 bg-amber-500/15 text-brand-amber" : "border-border text-foreground/80"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-1.5">{t.pickNumberNote}</p>
          </div>
        )}
        {v.included ? (
          <div className="rounded-xl border border-border px-3.5 py-3">
            <p className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted-foreground mb-1">{t.included}</p>
            <ul className="space-y-0.5">
              {v.included.lines.map((l, i) => (
                <li key={i} className="text-[13.5px] leading-snug">{l}</li>
              ))}
            </ul>
            {v.included.total != null && (
              <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-border">
                <span className="text-[12.5px] font-bold text-muted-foreground">{t.total}</span>
                <span className="text-[18px] font-black text-money" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{won(v.included.total)}</span>
              </div>
            )}
            <p className="text-[11.5px] text-muted-foreground mt-1.5">{t.changeDrinks}</p>
          </div>
        ) : (
          v.currentTotal != null && (
            <p className="text-[18px] font-black text-money" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{won(v.currentTotal)}</p>
          )
        )}
        <p className="text-[12px] text-muted-foreground">{t.payNote}</p>
        {v.floorPlanUrls.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <button type="button" onClick={() => setMapOpen((o) => !o)} className="w-full flex items-center justify-between px-3.5 h-11 text-[13px] font-bold">
              🗺️ {t.tableMap}
              <span className="text-[12px] text-muted-foreground">{mapOpen ? "▴" : "▾"}</span>
            </button>
            {mapOpen && v.floorPlanUrls.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt={t.tableMap} onClick={() => setZoomMap(true)} className="w-full block bg-black cursor-zoom-in" />
            ))}
            {mapOpen && <p className="text-[11px] text-muted-foreground px-3.5 py-1.5 border-t border-border">{t.tapZoom}</p>}
            {zoomMap && <MenuPhotosOverlay urls={v.floorPlanUrls} clubName={v.clubName} onClose={() => setZoomMap(false)} />}
          </div>
        )}
        {err && <p className="text-[12.5px] text-red-400">{err}</p>}
        <button type="button" disabled={busy} onClick={() => submit("pick")} className="w-full h-14 rounded-full bg-amber-500 text-black text-[16px] font-black disabled:opacity-50">
          {busy ? t.updating : seat || !v.pickValue?.startsWith("zone:") ? fill(t.confirmWith, pickedNow ?? "") : t.confirm}
        </button>
        <p className="text-[12.5px] text-muted-foreground text-center underline">
          <Link href="javascript:history.back()">{t.change}</Link>
        </p>
      </Shell>
    );
  }

  if (v.mode === "accept" || v.mode === "keep") {
    const keep = v.mode === "keep";
    if (keep && v.bumpExpired) {
      return (
        <Shell>
          <p className="text-[15px] font-bold">{t.expired}</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <p className="text-[12px] font-bold text-muted-foreground">{keep ? t.keepTitle : t.acceptTitle}</p>
        {v.amount != null && (
          <p className="text-[26px] font-black text-money" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{won(v.amount)}</p>
        )}
        {keep && v.bumpItems.length > 0 && <p className="text-[13px] text-foreground/80">{v.bumpItems.map((l) => `• ${l}`).join("\n")}</p>}
        <p className="text-[12px] text-muted-foreground">{t.payNote}</p>
        {err && <p className="text-[12.5px] text-red-400">{err}</p>}
        <button type="button" disabled={busy} onClick={() => submit(keep ? "keep" : "accept")} className="w-full h-14 rounded-full bg-amber-500 text-black text-[16px] font-black disabled:opacity-50">
          {busy ? t.updating : t.confirm}
        </button>
      </Shell>
    );
  }

  // cancel
  return (
    <Shell>
      <p className="text-[20px] font-black">{t.cancelTitle}</p>
      <p className="text-[13px] text-muted-foreground">{t.cancelBody}</p>
      {err && <p className="text-[12.5px] text-red-400">{err}</p>}
      <button type="button" disabled={busy} onClick={() => submit("cancel")} className="w-full h-12 rounded-xl bg-red-500 text-white text-[15px] font-black disabled:opacity-50">
        {busy ? t.updating : t.yesCancel}
      </button>
      <Link href={v.passUrl ?? "/"} className="flex items-center justify-center h-11 rounded-xl border border-border text-[14px] font-bold">
        {t.keepBook}
      </Link>
    </Shell>
  );
}
