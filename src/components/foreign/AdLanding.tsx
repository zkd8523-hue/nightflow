// /{en,ja,zh,zh-tw}/book — 구글애즈 전용 랜딩. SEO 페이지가 아니다(광고 클릭만 온다).
//
// 왜 따로 만드나(2026-09-16 실측):
//   - 광고 클릭을 /en(홈)에 떨어뜨리니 89세션 중 CTA 클릭 2%(오가닉 10%), 90%가 0초 단일이벤트 이탈.
//   - 홈은 지역·클럽·가이드로 갈리는 이탈 경로가 6개다. 전용 랜딩은 목적이 하나여야 한다.
//   - vip-tables를 광고용으로 고치면 FAQPage·Offer 스키마(SEO 자산)가 망가진다 → 새 라우트.
//
// 여기서 폼을 받지 않는다: 랜딩에서 3필드 받아 예약폼으로 넘기면 같은 걸 두 번 묻게 된다.
// 버튼 하나로 기존 예약 플로우(/flags/new)로 넘기고, 저장·전환태그는 거기서 이미 돈다.
//
// 첫 약속은 "이름으로 예약된 테이블": 시장별 1순위 검색이 가격이 아니라 "들어갈 수 있나"다
// (ja 顔審査 / zh-tw 被卡·卡顏 / zh 通过率 / en "can foreigners get in"). 입장 보장은 못 하니
// "이름으로 예약 → 입구에서 이름"이라는 방식을 약속하고, 막힐 수 있는 조건은 FAQ에 정직하게 둔다.
//
// 절대 쓰지 않는 것:
//   - "입장 보장" — 여권 원본·강남 복장은 면제되지 않고, 만석이면 입장이 멈춘다.
//   - 담당자 입구 마중 — 22곳 중 1곳은 담당 MD가 없고, 이 페이지는 클럽이 미정이다.
//   - "MD" 용어 — 한국 업계 내부어. en=our local team, ja=担当者, zh-tw=公關.
//   - "real menu/real price" — "진짜"라고 하면 가짜가 있다는 뜻이 된다.
//   - 후기 인용·남의 업장 평점 — 승인된 고객 후기가 0건이다(Banyan Tree 평점 줄도 2026-10-04 뺐다).
//   - 금액 보장(200% 환불 등) — 부가세·추가 주문·정원 초과까지 분쟁이 생긴다(2026-10-04 삭제).

import Link from "next/link";
import { VipPriceCards } from "@/components/foreign/VipPriceCards";
import type { Metadata } from "next";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { BusinessInfo } from "@/components/layout/BusinessInfo";
import { ContactButtons } from "@/components/foreign/ContactButtons";
import { MessageCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMenuClubIds, isBookable } from "@/lib/clubs/bookable";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";

const BASE = "https://nightflow.kr";
const SLUG = "book";

const OG_LOCALE: Record<SeoLang, string> = { en: "en_US", ja: "ja_JP", zh: "zh_CN", "zh-tw": "zh_TW" };

// 2026-10-04 개편 — 광고 방문 11명 중 6명이 75%까지 읽고 1명만 버튼을 눌렀다. 전문가 검토 3건(UX·전략·MD)의
// 공통 지적을 반영했다:
//  · H1 "VIP NIGHT IN KOREA CLUB?" — 영어 비문 + "VIP night"가 접대업소 광고처럼 읽힘 → "이름으로 예약된 테이블"
//  · 빨간 공포 목록의 "Refused at door? No worries." — FAQ의 "보장 아님"과 모순 → 진행 3단계(폼과 1:1)
//  · "200% 환불" — 부가세·추가 주문·정원 초과까지 분쟁이 생겨 MD가 외국인을 피하게 됨 → 삭제(운영자 결정).
//    대신 지킬 수 있는 사실(확정가를 미리 서면으로)만 쓴다.
//  · "22 best clubs" 근거 없는 최상급 → 실제 예약 가능한 클럽 이름(서버에서 읽음)
//  · 남의 업장 평점(Banyan Tree) 삭제, 입장료 숫자 통일, 채널 약속을 실제 버튼(WhatsApp·IG·Email)과 맞춤

type Copy = {
  title: string;
  description: string;
  ogTitle: string;
  ogSub: string;
  keywords: string[];
  h1: string;
  sub: string;
  stepsH2: string;
  steps: string[];
  clubsLead: (n: number) => string;
  cta: string;
  barNote: string;
  buysH2: string;
  buys: { h: string; p: string }[];
  askH2: string;
  asks: { q: string; a: string }[];
  priceH2: string;
  priceRows: { label: string; value: string }[];
  priceNote: string;
  navHome: string;
  navFaq: string;
  navTerms: string;
  navPrivacy: string;
};

const COPY: Record<SeoLang, Copy> = {
  en: {
    title: "Book a Club Table in Seoul — Prices Up Front, No Deposit | NightFlow",
    description:
      "Skip the line at Seoul's clubs. A table booked under your name — prices from the club's own drink list, no deposit, no booking fee. Gangnam, Hongdae, Itaewon.",
    ogTitle: "Seoul club tables, booked under your name",
    ogSub: "Skip the line · prices up front · no deposit",
    keywords: [
      "Seoul club table booking", "Gangnam club VIP table", "Seoul VIP table", "Hongdae club table",
      "Itaewon club booking", "Korea club reservation", "Seoul nightclub table price", "book Seoul club",
    ],
    h1: "Seoul club tables for foreigners — booked under your name.",
    sub: "Gangnam · Hongdae · Itaewon. We book it in Korean — you pay the club on the night.",
    stepsH2: "How it works",
    steps: [
      "Tell us your date, group size and area.",
      "We book the table in Korean and message you to confirm the price.",
      "Give your name at the door — no queue. Bring your original passport and pay the club.",
    ],
    clubsLead: (n) => `${n} clubs we book, including`,
    cta: "Book your table",
    barNote: "No card · no deposit · 3 short steps",
    buysH2: "What the money buys",
    buys: [
      {
        h: "Prices come from the club's own drink list",
        p: "You see each bottle and set with its price before you book. The total is what the club confirms.",
      },
      {
        h: "Your price is confirmed before the night",
        p: "We send your total in writing before you go. You pay the club when you're seated — nothing before.",
      },
      {
        h: "Booked without a word of Korean",
        p: "Our local team handles the club in Korean and answers you in English on WhatsApp, Instagram or email.",
      },
    ],
    askH2: "Before you ask",
    asks: [
      {
        q: "Will we get in?",
        a: "Your name is on the club's table list, so you skip the queue. Three things can still stop you at the door: no original passport (copies are refused), the Gangnam dress code, and arriving after the room fills — often after 23:00 on Fri/Sat.",
      },
      {
        q: "Men-only group, or going solo?",
        a: "Yes — booking a table is the usual way for men-only groups to get in. ID and dress code still apply.",
      },
      {
        q: "What should we wear?",
        a: "Men: no shorts, sleeveless tops, sandals or sportswear. Gangnam: dark smart-casual.",
      },
      {
        q: "How do we pay?",
        a: "You pay the club when you're seated, cash or card. Visa and Mastercard usually work — bring some cash as backup. Alipay and WeChat Pay don't work.",
      },
      {
        q: "What if we change the date?",
        a: "Message us as early as you can — we'll move it if the new night has a table. Nothing was charged to reserve it.",
      },
    ],
    priceH2: "Table price",
    priceRows: [
      { label: "Hongdae / Itaewon", value: "from ₩500,000" },
      { label: "Gangnam", value: "from ₩1,000,000" },
    ],
    priceNote:
      "Per table, not per person — 4 people ≈ ₩125,000–250,000 each. Entry is often included for table guests; carry ₩30,000 cash just in case.",
    navHome: "Home",
    navFaq: "FAQ",
    navTerms: "Terms",
    navPrivacy: "Privacy",
  },

  ja: {
    title: "ソウルのクラブ テーブル予約 — 料金は事前確認・デポジット不要 | NightFlow",
    description:
      "行列に並ばない。ソウルのクラブであなたの名前でテーブルを確保。価格はクラブの酒単そのまま、デポジットも予約手数料もなし。江南・弘大・梨泰院。",
    ogTitle: "ソウルのナイトクラブ、テーブルはお名前で予約",
    ogSub: "行列なし · 料金は事前確認 · デポジット不要",
    keywords: [
      "ソウル クラブ 予約", "江南 クラブ VIP", "ソウル VIPテーブル", "弘大 クラブ テーブル",
      "梨泰院 クラブ 予約", "韓国 クラブ 予約", "ソウル クラブ 料金", "韓国 クラブ 顔審査",
    ],
    h1: "ソウルのナイトクラブ、テーブルはお名前で予約",
    sub: "江南・弘大・梨泰院。予約は私たちが韓国語で — お支払いは当日クラブで。",
    stepsH2: "ご利用の流れ",
    steps: [
      "日付・人数・エリアを教えてください。",
      "韓国語でテーブルを予約し、料金を確認してご連絡します。",
      "入口でお名前を伝えるだけ — 並びません。パスポート原本を持参し、お支払いはクラブで。",
    ],
    clubsLead: (n) => `予約できるクラブ${n}軒（一部）`,
    cta: "テーブルを予約する",
    barNote: "カード不要・デポジットなし・3ステップ",
    buysH2: "この金額に含まれるもの",
    buys: [
      {
        h: "価格はクラブの酒単のまま",
        p: "ボトルとセットの価格を予約前に確認できます。合計金額はクラブが確定します。",
      },
      {
        h: "料金は当日前に確定します",
        p: "合計金額を事前に書面でお送りします。お支払いは着席してからクラブへ — 事前のお支払いはありません。",
      },
      {
        h: "韓国語なしで予約できます",
        p: "クラブとのやり取りは担当者が韓国語で行い、お客様にはWhatsApp・Instagram・メールで日本語でご連絡します。",
      },
    ],
    askH2: "よくある質問",
    asks: [
      {
        q: "入れますか？",
        a: "テーブルはお名前で予約されているので、行列に並ばずに入れます。ただし入口で止められることがあるのは3つ — パスポート原本がない（コピーは不可）、江南の服装規定、満席後の到着（金・土は23時以降が多い）。",
      },
      {
        q: "男性だけ・一人でも大丈夫？",
        a: "はい。男性だけのグループはテーブル予約で入るのが一般的です。身分証と服装規定は同じく必要です。",
      },
      {
        q: "服装は？",
        a: "男性はハーフパンツ・ノースリーブ・サンダル・スポーツウェア不可。江南は黒系のきれいめカジュアルがおすすめです。",
      },
      {
        q: "支払い方法は？",
        a: "着席したらクラブにお支払い。現金またはカード。Visa・Mastercardはたいてい使えますが、念のため現金もお持ちください。Alipay・WeChat Payは使えません。",
      },
      {
        q: "日付を変更したい場合は？",
        a: "できるだけ早くご連絡ください。変更先の日に空きがあれば移します。予約時に請求は発生していません。",
      },
    ],
    priceH2: "テーブル料金",
    priceRows: [
      { label: "弘大 / 梨泰院", value: "₩500,000〜" },
      { label: "江南", value: "₩1,000,000〜" },
    ],
    priceNote:
      "1卓あたり（1人あたりではありません） — 4人なら1人約12.5〜25万ウォン。テーブル客は入場料込みのことが多いですが、念のため現金3万ウォンをお持ちください。",
    navHome: "ホーム",
    navFaq: "よくある質問",
    navTerms: "利用規約",
    navPrivacy: "プライバシー",
  },

  zh: {
    title: "首尔夜店卡座预订 — 价格提前确认、免订金 | NightFlow",
    description:
      "不用排队。用你的名字预订首尔夜店卡座，价格直接来自夜店酒单，免订金、免预订手续费。江南、弘大、梨泰院。",
    ogTitle: "首尔夜店卡座，用你的名字先订好",
    ogSub: "免排队 · 价格先确认 · 免订金",
    keywords: [
      "首尔夜店预订", "江南夜店卡座", "首尔卡座", "弘大夜店",
      "梨泰院夜店", "韩国夜店预订", "首尔夜店价格", "韩国夜店外国人能进吗",
    ],
    h1: "首尔夜店卡座，用你的名字先订好",
    sub: "江南 · 弘大 · 梨泰院。我们用韩语帮你订 — 当晚在夜店付款。",
    stepsH2: "怎么订",
    steps: [
      "告诉我们日期、人数和区域。",
      "我们用韩语订好卡座，并发消息跟你确认价格。",
      "到门口报名字就能进，不用排队。带护照原件，在夜店付款。",
    ],
    clubsLead: (n) => `我们能订的 ${n} 家夜店（部分）`,
    cta: "预订卡座",
    barNote: "无需绑卡 · 免订金 · 3步完成",
    buysH2: "这笔钱买到什么",
    buys: [
      {
        h: "价格直接来自夜店酒单",
        p: "预订前就能看到每瓶酒和套餐的价格。总金额由夜店确认。",
      },
      {
        h: "当晚之前就确认好价格",
        p: "去之前我们会以书面形式发给你总价。入座后再付给夜店 — 之前不收任何钱。",
      },
      {
        h: "不会韩语也能订",
        p: "我们的当地团队用韩语和夜店沟通，再用中文通过 WhatsApp、Instagram 或邮件回复你。",
      },
    ],
    askH2: "订之前想知道的",
    asks: [
      {
        q: "我们能进去吗？",
        a: "卡座是用你的名字订的，不用排队。但门口仍可能被拦的三种情况：没带护照原件（复印件不行）、江南的着装要求、满座后才到（周五六常见于23点后）。",
      },
      {
        q: "全是男生或一个人也行吗？",
        a: "可以。全男生的团体一般就是通过订卡座入场。证件和着装要求照样适用。",
      },
      {
        q: "穿什么？",
        a: "男生不能穿短裤、无袖、拖鞋或运动服。江南建议深色的休闲正装。",
      },
      {
        q: "怎么付款？",
        a: "入座后付给夜店，现金或刷卡都行。Visa 和 Mastercard 一般可以用，建议也带点现金。支付宝和微信支付不行。",
      },
      {
        q: "想改日期怎么办？",
        a: "请尽早告诉我们，新日期有位子就帮你改。预订时没有收取任何费用。",
      },
    ],
    priceH2: "卡座价格",
    priceRows: [
      { label: "弘大 / 梨泰院", value: "₩500,000 起" },
      { label: "江南", value: "₩1,000,000 起" },
    ],
    priceNote:
      "按桌算不按人算 — 4个人一人约 12.5–25 万韩元。订卡座的客人通常含门票，但建议带 3 万韩元现金备用。",
    navHome: "首页",
    navFaq: "常见问题",
    navTerms: "服务条款",
    navPrivacy: "隐私政策",
  },

  "zh-tw": {
    title: "首爾夜店包廂訂位 — 價格先講好、免訂金 | NightFlow",
    description:
      "不用排隊。用你的名字訂首爾夜店包廂，價格直接來自夜店酒單，免訂金、免訂位手續費。江南、弘大、梨泰院。",
    ogTitle: "首爾夜店包廂，用你的名字先訂好",
    ogSub: "免排隊 · 價格先講好 · 免訂金",
    keywords: [
      "首爾夜店訂位", "江南夜店包廂", "首爾包廂", "弘大夜店",
      "梨泰院夜店", "韓國夜店訂位", "首爾夜店價格", "韓國夜店被卡",
    ],
    h1: "首爾夜店包廂，用你的名字先訂好",
    sub: "江南 · 弘大 · 梨泰院。我們用韓文幫你訂 — 當晚在夜店付款。",
    stepsH2: "怎麼訂",
    steps: [
      "告訴我們日期、人數和區域。",
      "我們用韓文訂好包廂，並傳訊息跟你確認價格。",
      "到門口報名字就能進，不用排隊。帶護照正本，在夜店付款。",
    ],
    clubsLead: (n) => `我們能訂的 ${n} 家夜店（部分）`,
    cta: "訂包廂",
    barNote: "免綁卡 · 免訂金 · 3個步驟",
    buysH2: "這筆錢買到什麼",
    buys: [
      {
        h: "價格直接來自夜店酒單",
        p: "訂之前就能看到每瓶酒和套餐的價格。總金額由夜店確認。",
      },
      {
        h: "當晚之前就把價格講好",
        p: "去之前我們會用書面傳給你總價。入座後再付給夜店 — 之前不收任何錢。",
      },
      {
        h: "不會韓文也能訂",
        p: "我們的當地團隊用韓文跟夜店談，再用中文透過 WhatsApp、Instagram 或 Email 回覆你。",
      },
    ],
    askH2: "訂之前想知道的",
    asks: [
      {
        q: "我們進得去嗎？",
        a: "包廂是用你的名字訂的，不用排隊。但門口還是可能被擋的三種情況：沒帶護照正本（影本不行）、江南的服裝規定、滿了之後才到（週五六常見於23點後）。",
      },
      {
        q: "全是男生或一個人也可以嗎？",
        a: "可以。全男生的團通常就是靠訂包廂入場。證件和服裝規定一樣要遵守。",
      },
      {
        q: "要穿什麼？",
        a: "男生不能穿短褲、無袖、拖鞋或運動服。江南建議深色的休閒正裝。",
      },
      {
        q: "怎麼付款？",
        a: "入座後付給夜店，現金或刷卡都可以。Visa 和 Mastercard 通常能用，建議也帶點現金。支付寶和微信支付不行。",
      },
      {
        q: "想改日期怎麼辦？",
        a: "請盡早告訴我們，新日期有位子就幫你改。訂位時沒有收取任何費用。",
      },
    ],
    priceH2: "包廂價格",
    priceRows: [
      { label: "弘大 / 梨泰院", value: "₩500,000 起" },
      { label: "江南", value: "₩1,000,000 起" },
    ],
    priceNote:
      "按桌計不按人計 — 4個人一人約 12.5–25 萬韓元。訂包廂的客人通常含入場費，但建議帶 3 萬韓元現金備用。",
    navHome: "首頁",
    navFaq: "常見問題",
    navTerms: "服務條款",
    navPrivacy: "隱私政策",
  },
};

export function adLandingMetadata(lang: SeoLang): Metadata {
  const c = COPY[lang];
  const url = `${BASE}/${lang}/${SLUG}`;
  const og = `${BASE}/api/og?title=${encodeURIComponent(c.ogTitle)}&sub=${encodeURIComponent(c.ogSub)}&lang=${lang}`;
  return {
    title: { absolute: c.title },
    description: c.description,
    keywords: c.keywords,
    // 광고 전용이라 색인에서 뺀다 — 같은 키워드를 vip-tables와 경쟁하면 SEO 자산이 갈린다.
    // 광고 심사 봇은 robots 메타를 보지 않으므로 랜딩 승인에는 영향 없다.
    robots: { index: false, follow: true },
    alternates: {
      canonical: url,
      languages: {
        "en-US": `${BASE}/en/${SLUG}`,
        "zh-CN": `${BASE}/zh/${SLUG}`,
        "zh-TW": `${BASE}/zh-tw/${SLUG}`,
        "ja-JP": `${BASE}/ja/${SLUG}`,
        "x-default": `${BASE}/en/${SLUG}`,
      },
    },
    openGraph: {
      title: c.title,
      description: c.description,
      url,
      locale: OG_LOCALE[lang],
      type: "website",
      images: [{ url: og, width: 1200, height: 630 }],
    },
  };
}

const CONTACT_H2: Record<SeoLang, string> = {
  en: "Contact us",
  ja: "お問い合わせ",
  zh: "联系我们",
  "zh-tw": "聯絡我們",
};
const CONTACT_MSG: Record<SeoLang, string> = {
  en: "Hi! I'd like to ask about booking a club table in Korea.",
  ja: "こんにちは！韓国のクラブのテーブル予約について相談したいです。",
  zh: "你好！想咨询一下韩国夜店订卡座。",
  "zh-tw": "你好！想詢問一下韓國夜店訂包廂。",
};

// "22 best clubs" 대신 실제로 예약 가능한 클럽 이름(2026-10-04) — 검색자는 클럽 이름을 직접 친다
// (octagon·face·b1 seoul). 폼과 같은 isBookable 기준. 서울 지역만, 리뷰 많은 순, 영문 이름 있는 곳.
// 실패하면 이름 줄 없이 그린다(랜딩이 DB 때문에 깨지면 안 된다). 페이지는 1시간 단위 재생성(revalidate).
async function bookableClubNames(): Promise<{ total: number; names: string[] } | null> {
  try {
    const sb = createAdminClient();
    const menuIds = await fetchMenuClubIds(sb);
    const { data } = await sb
      .from("clubs")
      .select("id, name, name_en, area, foreign_booking_agreed, google_review_count, partners:club_partners(md_id)")
      .is("deleted_at", null)
      .eq("is_test", false)
      .eq("hidden_from_guide", false)
      .not("thumbnail_url", "is", null)
      .order("google_review_count", { ascending: false, nullsFirst: false });
    const bookable = (data ?? []).filter((c) =>
      isBookable({
        name: c.name,
        has_md: ((c.partners as { md_id: string }[] | null)?.length ?? 0) > 0,
        agreed: !!c.foreign_booking_agreed,
        has_menu: menuIds.has(c.id),
      })
    );
    const names = bookable
      .filter((c) => ["강남", "홍대", "이태원"].includes(c.area ?? ""))
      .map((c) => (c.name_en || c.name || "").trim())
      .filter((n) => /^[\x20-\x7E]+$/.test(n))
      .slice(0, 6);
    return bookable.length ? { total: bookable.length, names } : null;
  } catch {
    return null;
  }
}

export async function AdLanding({ lang }: { lang: SeoLang }) {
  const c = COPY[lang];
  const clubs = await bookableClubNames();

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      <ForeignPageTracker kind="info" lang={lang} meta={{ page: "ad-book" }} />
      <style>{"html{scroll-behavior:smooth}"}</style>

      {/* 상호 + 홈 링크 — 광고 랜딩에 운영 주체가 없으면 구글애즈 심사에서 신뢰성으로 걸린다.
          로고는 홈으로 가는 유일한 탈출구이기도 하다(본문엔 이탈 링크를 두지 않으므로). */}
      <header className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
        <Link href={`/${lang}`} className="text-[17px] font-black tracking-tight">
          Night<span className="text-brand-amber">Flow</span>
        </Link>
      </header>

      {/* 히어로 — 헤드라인 + VIP 테이블 시작가 카드(/en 홈과 같은 카드).
          예전엔 여성 클럽 사진(ad-hero.webp) 위에 헤드라인을 얹었는데 뺐다(2026-09-29, 운영자 결정).
          "VIP之夜" 헤드라인 + 여성 사진이 대만 검색자에게 酒店(호스티스 술집) 광고처럼 읽힐 수 있고,
          9/28 tw_hk 광고 클릭 4명이 전부 4~8초 만에 나갔다. 사진 자리에 실제 가격을 올려 첫 화면에서 보이게 한다. */}
      <div className="max-w-lg mx-auto px-5 pt-3">
        <h1 className="text-[28px] font-black leading-[1.12] tracking-tight break-keep text-balance">
          {c.h1}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground leading-snug break-keep">{c.sub}</p>
      </div>
      <VipPriceCards lang={lang} className="max-w-lg mx-auto px-4 pt-4" />

      <div className="max-w-lg mx-auto">

        {/* 진행 3단계 — 예약 폼의 3단계와 1:1(2026-10-04). 예전 빨간 공포 목록("Refused at door? No worries.")은
            FAQ의 "보장 아님"과 모순이라 뺐다. */}
        <section className="mt-5 px-5 space-y-2.5">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{c.stepsH2}</h2>
          <ol className="space-y-2">
            {c.steps.map((st, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-muted text-foreground text-[12px] font-black flex items-center justify-center tabular-nums">{i + 1}</span>
                <span className="text-[14px] font-bold leading-snug break-keep pt-0.5">{st}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="px-5 pt-4 space-y-2">
          {/* "Free to request · no deposit · pay on the night" 줄은 뺐다 — 부제·하단 바와 같은 말(중복 점검, 2026-10-04). */}
          {clubs && clubs.names.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[12px] font-bold text-muted-foreground">{c.clubsLead(clubs.total)}</p>
              <div className="flex flex-wrap gap-1.5">
                {clubs.names.map((n) => (
                  <span key={n} className="px-2.5 py-1 rounded-full bg-card border border-border text-[12px] font-bold">{n}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <section className="mt-6 px-5 pt-5 border-t border-border space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {c.buysH2}
          </h2>
          {c.buys.map((b, i) => (
            <div key={b.h}>
              <p className={`text-[14px] font-black break-keep ${i === 1 ? "text-money" : ""}`}>{b.h}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed break-keep">{b.p}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 px-5 pt-5 border-t border-border space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {c.priceH2}
          </h2>
          <dl className="space-y-1">
            {c.priceRows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 text-[14px]">
                <dt className="text-muted-foreground break-keep">{r.label}</dt>
                <dd className="font-black tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12px] text-muted-foreground leading-relaxed break-keep">{c.priceNote}</p>
        </section>

        <section className="mt-6 px-5 pt-5 border-t border-border space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {c.askH2}
          </h2>
          {c.asks.map((a) => (
            <div key={a.q}>
              <p className="text-[14px] font-black break-keep">{a.q}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed break-keep">{a.a}</p>
            </div>
          ))}
        </section>

        {/* 문의하기(2026-10-02, 운영자 결정) — 하단 버튼이 "예약" 하나뿐이라 아직 마음을 못 정한 광고
            방문자가 끝까지 읽고 그냥 나갔다(10/3: 실제 광고 방문 11 → 버튼 1). 예약보다 부담이 작은 출구.
            예약 폼·외국어 홈과 같은 ContactButtons, 계측 source=ad_landing. */}
        <section id="contact" className="mt-6 px-5 pt-5 border-t border-border space-y-3 scroll-mt-4">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {CONTACT_H2[lang]}
          </h2>
          <ContactButtons lang={lang} message={CONTACT_MSG[lang]} source="ad_landing" />
        </section>


        {/* 사업자 정보 — 전자상거래법 표시 의무 + 구글애즈 랜딩 심사 요건.
            값은 법적 데이터라 번역하지 않고, 라벨만 BusinessInfo가 언어별로 낸다. */}
        <footer className="mt-8 px-5 pt-5 border-t border-border space-y-3">
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <Link href={`/${lang}`} className="hover:text-foreground">{c.navHome}</Link>
            <Link href={`/${lang}/faq`} className="hover:text-foreground">{c.navFaq}</Link>
            <Link href={`/${lang}/terms`} className="hover:text-foreground">{c.navTerms}</Link>
            <Link href={`/${lang}/privacy`} className="hover:text-foreground">{c.navPrivacy}</Link>
          </nav>
          <BusinessInfo lang={lang} className="!text-left" />
        </footer>
      </div>

      {/* 유일한 CTA. 기존 예약 플로우로 넘긴다 — 여기서 데이터를 받지 않는다. */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        {/* 안내 한 줄 + WhatsApp 보조 버튼(2026-10-04) — "Book"이 결제·확정처럼 읽히지 않게 하고,
            아직 정하지 못한 방문자에게 엄지 자리에 부담 작은 출구를 둔다. 클릭은 data-nf-track으로 집계. */}
        <div className="max-w-lg mx-auto px-5 pt-2 pb-3 space-y-1.5">
          <p className="text-center text-[11px] font-bold text-muted-foreground">{c.barNote}</p>
          <div className="flex gap-2">
            {/* 채널을 하나로 정하지 않는다(2026-10-04, 운영자 결정) — 누르면 아래 "Contact us"(WhatsApp·IG·Email)로
                스크롤한다. 이 페이지에서만 html에 smooth scroll을 건다(아래 style). */}
            <a
              data-nf-track="chat_bar_scroll"
              href="#contact"
              aria-label={CONTACT_H2[lang]}
              className="w-14 shrink-0 rounded-xl bg-card border border-border flex items-center justify-center"
            >
              <MessageCircle className="w-6 h-6 text-foreground" />
            </a>
            <Link rel="nofollow"
              data-nf-track="book_cta"
              data-nf-label="bar"
              href={`/flags/new?lang=${lang}`}
              className="flex-1 py-4 rounded-xl bg-brand-amber text-black font-black text-center text-base hover:opacity-90 transition-opacity"
            >
              {c.cta}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
