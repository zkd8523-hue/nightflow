// 단톡방 만들기 도우미(2026-11-01) — 확인서가 나오면 운영자가 WhatsApp에서 손님·담당 MD와 단톡방을 만든다.
// WhatsApp에는 사람을 넣은 채로 그룹을 만드는 링크가 없어서 방은 앱에서 직접 만들고,
// 여기서는 방 이름·번호·첫 메시지를 채워 준다(관리자 예약 카드 GroupChatBox, 확인서 발급 알림).
// 서버·클라이언트 둘 다 쓰므로 순수 함수만 둔다.

import { bottlesOfLabel } from "@/lib/booking/mdMenu";

export type ChatLang = "en" | "ja" | "zh" | "zh-tw";

export function chatLang(lang: string | null | undefined): ChatLang {
  const l = (lang ?? "").toLowerCase();
  if (l === "ja") return "ja";
  if (l === "zh-tw" || l === "zh_tw") return "zh-tw";
  if (l.startsWith("zh")) return "zh";
  return "en";
}

/** 한국 휴대폰 번호 → WhatsApp용(+82). "010-1234-5678" → { display: "+82 10-1234-5678", digits: "821012345678" } */
export function krPhoneToWa(phone: string | null | undefined): { display: string; digits: string } | null {
  const d = (phone ?? "").replace(/[^0-9]/g, "");
  if (!d) return null;
  const local = d.startsWith("82") ? d.slice(2) : d.startsWith("0") ? d.slice(1) : d;
  const digits = `82${local}`;
  const m = local.match(/^(\d{2})(\d{3,4})(\d{4})$/);
  return { display: m ? `+82 ${m[1]}-${m[2]}-${m[3]}` : `+${digits}`, digits };
}

/** 손님이 WhatsApp으로 신청했을 때만 번호를 돌려준다(다른 메신저·이메일은 null). */
export function guestWa(contactType: string, value: string): { display: string; digits: string } | null {
  if (contactType !== "whatsapp") return null;
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? { display: value.trim(), digits } : null;
}

export const waChatUrl = (digits: string) => `https://wa.me/${digits}`;
/** 번호 없이 문구만 — WhatsApp이 "보낼 대화"를 고르게 한다(방금 만든 단톡방을 고르면 된다). */
export const waShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// ── 호스트 영문 이름 추정 ─────────────────────────────────────────────────
// MD 테이블엔 영문 이름이 없다. display_name("레이스&사운드 우현 (에이스)")에서 한글 이름을 뽑아
// 흔히 쓰는 표기로 바꾼다(우현 → Woohyun, 강한별 → Hanbyul). 추정일 뿐이라 화면에서 고칠 수 있다.
const CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const JUNG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const JONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];

function romanizeSyllable(ch: string): string {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return ch;
  const cho = Math.floor(code / 588);
  const jung = Math.floor((code % 588) / 28);
  const jong = code % 28;
  let v = JUNG[jung];
  // 이름 표기 관용: 여 → yu(현 Hyun·별 Byul), 영 → young, 받침 없는 우 → oo(수 Soo), 초성 없는 우 → woo, 희 → hee
  if (v === "yeo") v = cho === 11 && jong === 21 ? "you" : "yu";
  if (v === "u" && jong === 0) v = cho === 11 ? "woo" : "oo";
  if (v === "ui" && cho !== 11) v = "ee";
  return CHO[cho] + v + JONG[jong];
}

// 세 글자 이름에서 성을 뺄지 — 흔한 성일 때만(게더링·마지막처럼 같은 닉네임은 그대로).
const SURNAMES = new Set([..."김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부"]);

export function hostNameGuess(displayName: string | null | undefined): string {
  const tokens = (displayName ?? "").replace(/\([^)]*\)/g, " ").split(/[\s&·,/]+/).filter((t) => /^[가-힣]{2,3}$/.test(t));
  let name = tokens[tokens.length - 1] ?? "";
  if (!name) return "";
  if (name.length === 3 && SURNAMES.has(name[0])) name = name.slice(1); // 성을 뺀 이름만
  const r = [...name].map(romanizeSyllable).join("");
  return r.charAt(0).toUpperCase() + r.slice(1);
}

// ── 방 이름 · 첫 메시지 ───────────────────────────────────────────────────
const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";

export function groupRoomName(o: { refNo: string; club: string; eventDate: string; guestName: string | null }): string {
  const [, m, d] = o.eventDate.split("-").map(Number);
  return `${o.refNo} · ${o.club} ${m}/${d}${o.guestName ? ` ${firstName(o.guestName)}` : ""}`;
}

const DOW: Record<ChatLang, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  "zh-tw": ["週日", "週一", "週二", "週三", "週四", "週五", "週六"],
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(ymd: string, lang: ChatLang): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = DOW[lang][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  if (lang === "en") return `${dow}, ${MON[m - 1]} ${d}`;
  return lang === "ja" ? `${m}月${d}日(${dow})` : `${m}月${d}日（${dow}）`;
}

/** 확인서 자리 표기를 손님 언어로 — "당일 배정"(한국어 섞인 값)은 문장으로 바꾼다. */
function tableText(info: string | null, lang: ChatLang): string {
  const t = (info ?? "").trim();
  if (!t || /당일 배정|on the night|on arrival/i.test(t)) {
    return { en: "Table assigned when you arrive", ja: "テーブルは当日ご案内", zh: "卡座当晚安排", "zh-tw": "包廂當晚安排" }[lang];
  }
  const clean = t.replace(/\s*\([^)]*[가-힣][^)]*\)/g, "").trim();
  const word = { en: "Table ", ja: "テーブル ", zh: "卡座 ", "zh-tw": "包廂 " }[lang];
  return clean.replace(/^table\s+/i, word);
}

const T: Record<ChatLang, {
  hi: (n: string) => string; made: (c: string) => string; details: string; guests: (n: string) => string;
  total: (a: string) => string; passport: string; host: (h: string, c: string) => string; care: (h: string) => string;
  care1: string; care2: string; care3: string; more: string; bye: string;
}> = {
  en: {
    hi: (n) => `👋 Hi${n ? ` ${n}` : ""}! This is Minki from NightFlow.`,
    made: (c) => `I made this chat for your night at ${c}.`,
    details: "📋 Booking Details",
    guests: (n) => `${n} guests`,
    total: (a) => `Total ${a} (pay at the club on the night)`,
    passport: "🛂 Bring your passport. Without it, you may be refused entry.",
    host: (h, c) => (h ? `👤 Your host: ${h} (${c})` : `👤 Your host (${c})`),
    care: (h) => `${h} will take care of your experience at the club:`,
    care1: "· Meeting you when you arrive",
    care2: "· Water, ice or mixers",
    care3: "· Ordering more drinks",
    more: "If you need anything else, just message us here anytime.",
    bye: "Have a great night! 🎉",
  },
  ja: {
    hi: (n) => `👋 ${n ? `${n}さん、` : ""}こんにちは！NightFlowのMinkiです。`,
    made: (c) => `${c}での夜のために、このチャットを作りました。`,
    details: "📋 予約内容",
    guests: (n) => `${n}名`,
    total: (a) => `合計 ${a}（当日クラブでお支払い）`,
    passport: "🛂 パスポートを必ずお持ちください。ない場合、入場をお断りされることがあります。",
    host: (h, c) => (h ? `👤 担当ホスト：${h}（${c}）` : `👤 担当ホスト（${c}）`),
    care: (h) => `${h}がクラブでの時間をサポートします：`,
    care1: "・到着時のお出迎え",
    care2: "・水、氷、ミキサー",
    care3: "・ドリンクの追加注文",
    more: "ほかに必要なことがあれば、いつでもこのチャットにメッセージしてください。",
    bye: "素敵な夜をお過ごしください！🎉",
  },
  zh: {
    hi: (n) => `👋 ${n ? `${n}，` : ""}你好！我是 NightFlow 的 Minki。`,
    made: (c) => `我为你在 ${c} 的夜晚建了这个群。`,
    details: "📋 预订信息",
    guests: (n) => `${n}人`,
    total: (a) => `合计 ${a}（当晚在夜店付款）`,
    passport: "🛂 请务必带护照，没有护照可能会被拒绝入场。",
    host: (h, c) => (h ? `👤 你的接待：${h}（${c}）` : `👤 你的接待（${c}）`),
    care: (h) => `${h} 会负责你在夜店的体验：`,
    care1: "· 到店时迎接你",
    care2: "· 水、冰块、调酒饮料",
    care3: "· 加点酒水",
    more: "如果还需要其他帮助，随时在群里留言。",
    bye: "祝你今晚玩得开心！🎉",
  },
  "zh-tw": {
    hi: (n) => `👋 ${n ? `${n}，` : ""}你好！我是 NightFlow 的 Minki。`,
    made: (c) => `我為你在 ${c} 的夜晚開了這個群組。`,
    details: "📋 訂位資訊",
    guests: (n) => `${n}人`,
    total: (a) => `合計 ${a}（當晚在夜店付款）`,
    passport: "🛂 請務必帶護照，沒有護照可能會被拒絕入場。",
    host: (h, c) => (h ? `👤 你的公關：${h}（${c}）` : `👤 你的公關（${c}）`),
    care: (h) => `${h} 會負責你在夜店的體驗：`,
    care1: "· 到場時迎接你",
    care2: "· 水、冰塊、調酒飲料",
    care3: "· 加點酒水",
    more: "如果還需要其他幫忙，隨時在群組裡留言。",
    bye: "祝你今晚玩得開心！🎉",
  },
};

export function firstGroupMessage(o: {
  lang: ChatLang;
  guestName: string | null;
  club: string;
  eventDate: string;
  groupSize: string;
  tableInfo: string | null;
  includes: string[];
  total: number | null;
  host: string;
}): string {
  const t = T[o.lang];
  const drinks = o.includes
    .filter((l) => !/^table charge/i.test(l.trim()))
    .map(fmtDrink)
    .join(" · ");
  const name = o.host.trim();
  // 이름을 모르면 "Your host: Your host"가 되지 않게 머리줄은 클럽만, 아래 문장은 "Your host"로 쓴다
  const host = name || { en: "Your host", ja: "担当ホスト", zh: "接待", "zh-tw": "公關" }[o.lang];
  return [
    t.hi(firstName(o.guestName)),
    t.made(o.club),
    "",
    t.details,
    `${fmtDate(o.eventDate, o.lang)} · ${t.guests(o.groupSize)}`,
    [tableText(o.tableInfo, o.lang), drinks].filter(Boolean).join(" · "),
    ...(o.total != null ? [t.total(`₩${o.total.toLocaleString("en-US")}`)] : []),
    t.passport,
    "",
    t.host(name, o.club),
    t.care(host),
    t.care1,
    t.care2,
    t.care3,
    "",
    t.more,
    t.bye,
  ].join("\n");
}

// ── 손님 첫 인사(2026-11-04) ──────────────────────────────────────────────
// 손님이 단톡방에 들어가자마자 붙여넣을 문구 — 확인서·확정 메일에 "복사" 버튼/박스로 나간다.
// 손님 언어 윗부분 + 아래에 한국어 한 줄(사장님·MD가 한눈에 알아보게). 예약번호·날짜·인원·자리·주류·금액이 다 들어 있어
// 누구 예약인지 되묻지 않아도 된다. 도착 시간이 확인서에 있으면 채우고, 없으면 그 줄은 뺀다(빈칸이 남지 않게).

/** "4 Illumi-Light Ice" · "Illumi-Light Ice x4" → "Illumi-Light Ice ×4" */
function fmtDrink(line: string): string {
  const l = line.trim();
  const lead = l.match(/^(\d+)\s+(.+)$/);
  if (lead) return lead[1] === "1" ? lead[2] : `${lead[2]} ×${lead[1]}`; // 1개는 ×1을 붙이지 않는다("5 bottle set ×1" 방지)
  return l.replace(/\s+x(\d+)$/i, " ×$1");
}

export type GreetLine = { qty: number; name_en: string; name_ko: string | null; label_en: string };

const KO_DOW = "일월화수목금토";
const dateKo = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}(${KO_DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};
const wonKo = (n: number) => (n % 10000 === 0 ? `${n / 10000}만원` : `${n.toLocaleString("ko-KR")}원`);
const tableKo = (info: string | null) => {
  const t = (info ?? "").trim();
  if (!t || /당일 배정|on the night|on arrival/i.test(t)) return "당일 배정";
  return t.replace(/^table\s+/i, "");
};
/** 메뉴판에서 고른 구성 → 한글 줄. 한글 이름이 없으면 영문 이름. 병/세트는 라벨로 읽는다. */
function drinkKo(l: GreetLine): string {
  const name = l.name_ko || l.name_en;
  const bottles = bottlesOfLabel(l.label_en);
  if (/set/i.test(l.label_en)) return `${name} ${bottles ? `${bottles}병 ` : ""}세트${l.qty > 1 ? ` ×${l.qty}` : ""}`;
  if (/bottle/i.test(l.label_en)) return `${name} ${l.qty}병`;
  return `${name} ×${l.qty}`;
}

const G: Record<ChatLang, { hi: (n: string) => string; booking: string; guests: (n: string) => string; arrive: (t: string) => string }> = {
  en: { hi: (n) => `Hi! This is ${n || "a guest"} 👋`, booking: "Booking", guests: (n) => `${n} guests`, arrive: (t) => `We'll arrive around ${t}` },
  ja: { hi: (n) => `こんにちは！${n || "ゲスト"}です👋`, booking: "予約", guests: (n) => `${n}名`, arrive: (t) => `到着は ${t} ごろの予定です` },
  zh: { hi: (n) => `你好！我是 ${n || "客人"} 👋`, booking: "预订", guests: (n) => `${n}人`, arrive: (t) => `我们大约 ${t} 到店` },
  "zh-tw": { hi: (n) => `你好！我是 ${n || "客人"} 👋`, booking: "預訂", guests: (n) => `${n}人`, arrive: (t) => `我們大約 ${t} 到場` },
};

export function guestGreeting(o: {
  lang: ChatLang;
  guestName: string | null;
  refNo: string;
  club: string;
  eventDate: string;
  groupSize: string;
  tableInfo: string | null;
  includes: string[];
  menuLines?: GreetLine[] | null;
  total: number | null;
  arrivalTime?: string | null;
}): string {
  const g = G[o.lang];
  const name = firstName(o.guestName);
  const size = o.groupSize.trim();
  const sizeText = /^\d+$/.test(size) ? g.guests(size) : size;
  const arrival = (o.arrivalTime ?? "").trim();
  const drinksEn = o.includes.filter((l) => !/^table charge/i.test(l.trim())).map(fmtDrink).join(" · ");
  const drinksKo = o.menuLines?.length ? o.menuLines.map(drinkKo).join(", ") : drinksEn;
  const sizeKo = /^\d+$/.test(size) ? `${size}명` : size;
  return [
    g.hi(name),
    `${g.booking} ${o.refNo} · ${o.club} · ${fmtDate(o.eventDate, o.lang)} · ${sizeText}`,
    [tableText(o.tableInfo, o.lang), drinksEn, o.total != null ? `₩${o.total.toLocaleString("en-US")}` : ""].filter(Boolean).join(" · "),
    ...(arrival ? [g.arrive(arrival)] : []),
    "",
    `(안녕하세요, ${name ? `${name}님 ` : ""}예약입니다.`,
    `${o.refNo} · ${dateKo(o.eventDate)} · ${sizeKo}`,
    `${[tableKo(o.tableInfo), drinksKo, o.total != null ? wonKo(o.total) : "", arrival ? `도착 ${arrival}` : ""].filter(Boolean).join(" · ")})`,
  ].join("\n");
}
