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
// 공포를 먼저 판다: 시장별 1순위 검색이 가격이 아니라 "들어갈 수 있나"다
// (ja 顔審査 / zh-tw 被卡·卡顏 / zh 通过率 / en "can foreigners get in").
// 그 공포를 짧게 때리고 해결을 붙인 뒤 버튼을 준다. 문장 대신 조각으로 — 텍스트 많으면 떠난다.
//
// 절대 쓰지 않는 것:
//   - "입장 보장" — 여권 원본·강남 복장은 면제되지 않고, 만석이면 입장이 멈춘다.
//   - 담당자 입구 마중 — 22곳 중 1곳은 담당 MD가 없고, 이 페이지는 클럽이 미정이다.
//   - "MD" 용어 — 한국 업계 내부어. en=our local team, ja=担当者, zh-tw=公關.
//   - "real menu/real price" — "진짜"라고 하면 가짜가 있다는 뜻이 된다.
//   - 후기 인용 — 승인된 고객 후기가 0건이다. 구글 실평점만 쓴다.

import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { BusinessInfo } from "@/components/layout/BusinessInfo";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";

const BASE = "https://nightflow.kr";
const SLUG = "book";

const OG_LOCALE: Record<SeoLang, string> = { en: "en_US", ja: "ja_JP", zh: "zh_CN", "zh-tw": "zh_TW" };

type Fear = { hit: string; fix: string };

type Copy = {
  title: string;
  description: string;
  ogTitle: string;
  ogSub: string;
  keywords: string[];
  h1: string;
  fears: Fear[];
  terms: string;
  clubs: string;
  cta: string;
  buysH2: string;
  buys: { h: string; p: string }[];
  askH2: string;
  asks: { q: string; a: string }[];
  priceH2: string;
  priceRows: { label: string; value: string }[];
  priceNote: string;
  rating: string;
  navHome: string;
  navFaq: string;
  navTerms: string;
  navPrivacy: string;
};

const COPY: Record<SeoLang, Copy> = {
  en: {
    title: "Book a VIP Table in Seoul Clubs — Real Prices, No Deposit | NightFlow",
    description:
      "Skip the line at Seoul's clubs. A table booked under your name at 22 of Korea's best clubs — prices from the club's own drink list, no deposit, no booking fee. Gangnam, Hongdae, Itaewon.",
    ogTitle: "VIP night in Korea club?",
    ogSub: "Skip the line · 22 best clubs · no deposit",
    keywords: [
      "Seoul club table booking", "Gangnam club VIP table", "Seoul VIP table", "Hongdae club table",
      "Itaewon club booking", "Korea club reservation", "Seoul nightclub table price", "book Seoul club",
    ],
    h1: "VIP NIGHT IN KOREA CLUB?",
    fears: [
      { hit: "60 MIN waiting?", fix: "Skip the line." },
      { hit: "Refused at door?", fix: "No worries." },
      { hit: "Fully booked on the night?", fix: "Book ahead." },
      { hit: "No Korean?", fix: "No need." },
    ],
    terms: "No deposit, no booking fee · pay the venue.",
    clubs: "Only the 22 best clubs in Korea.",
    cta: "Book a table",
    buysH2: "What the money buys",
    buys: [
      {
        h: "Prices come from the club's own drink list",
        p: "You see each bottle and set with its price, and the minimum for that room, before you book. The total is what the club confirms.",
      },
      {
        h: "Overcharged? We refund 200%.",
        p: "If a club bills you above the list you were shown, we pay you double the difference. Send the receipt and we settle it.",
      },
      {
        h: "Booked without a word of Korean",
        p: "Our local team handles the club in Korean and answers you in English on WhatsApp, KakaoTalk or Line.",
      },
    ],
    askH2: "Before you ask",
    asks: [
      {
        q: "Will we get in?",
        a: "Your table is booked under your name — you give the name at the door instead of queueing. It isn't a guarantee: the original passport is required (a copy is refused), Gangnam dress code is never waived, and rooms stop admitting once full, often after 23:00 on Fri/Sat.",
      },
      {
        q: "How do we pay?",
        a: "Cash or card at the venue. Visa and Mastercard work; Alipay and WeChat Pay do not. Bring ₩20–30,000 cash for the entry fee.",
      },
      {
        q: "What if we change the date?",
        a: "Tell us before the night and we move it. Nothing was charged to reserve it.",
      },
    ],
    priceH2: "Table minimum",
    priceRows: [
      { label: "Hongdae / Itaewon", value: "₩500,000" },
      { label: "Gangnam", value: "₩1,000,000" },
    ],
    priceNote:
      "Per table, not per person — 4 people ≈ US$95–190 each. Entry fee ₩10–30,000, higher on Gangnam weekends.",
    rating: "Banyan Tree Pool Party 4.7 · 3,376 Google reviews",
    navHome: "Home",
    navFaq: "FAQ",
    navTerms: "Terms",
    navPrivacy: "Privacy",
  },

  ja: {
    title: "ソウルのクラブVIPテーブル予約 — 実際の価格・デポジット不要 | NightFlow",
    description:
      "行列に並ばない。韓国の人気クラブ22軒であなたの名前でテーブルを確保。価格はクラブの酒単そのまま、デポジットも予約手数料もなし。江南・弘大・梨泰院。",
    ogTitle: "韓国のクラブでVIPナイト？",
    ogSub: "行列なし · 人気22軒 · デポジット不要",
    keywords: [
      "ソウル クラブ 予約", "江南 クラブ VIP", "ソウル VIPテーブル", "弘大 クラブ テーブル",
      "梨泰院 クラブ 予約", "韓国 クラブ 予約", "ソウル クラブ 料金", "韓国 クラブ 顔審査",
    ],
    h1: "韓国のクラブでVIPナイト？",
    fears: [
      { hit: "60分待ち？", fix: "並びません。" },
      { hit: "顔審査が不安？", fix: "大丈夫です。" },
      { hit: "当日は満席？", fix: "先に押さえる。" },
      { hit: "韓国語が不安？", fix: "不要です。" },
    ],
    terms: "デポジットなし・予約手数料なし — お支払いは当日、店舗で。",
    clubs: "韓国で最高のクラブ22軒だけ。",
    cta: "テーブルを予約する",
    buysH2: "この金額に含まれるもの",
    buys: [
      {
        h: "価格はクラブの酒単のまま",
        p: "ボトルとセットの価格、その席の最低金額を予約前に確認できます。合計金額はクラブが確定します。",
      },
      {
        h: "請求が違っていたら200%返金します。",
        p: "提示した酒単より高く請求された場合、差額の2倍をお返しします。レシートを送っていただければ精算します。",
      },
      {
        h: "韓国語なしで予約できます",
        p: "クラブとのやり取りは担当者が韓国語で行い、お客様にはLINE・WhatsApp・カカオトークで日本語でご連絡します。",
      },
    ],
    askH2: "よくある質問",
    asks: [
      {
        q: "入れますか？",
        a: "テーブルはお名前で予約されているので、入口でお名前を伝えるだけ。行列には並びません。ただし保証ではありません — パスポートは原本が必須（コピーは断られます）、江南の服装規定は免除されず、満席になると入場が止まります（金・土は23時以降が多い）。",
      },
      {
        q: "支払い方法は？",
        a: "当日、店舗で現金またはカード。Visa・Mastercardは使えます。入場料用に現金2〜3万ウォンをお持ちください。",
      },
      {
        q: "日付を変更したい場合は？",
        a: "当日より前にご連絡いただければ変更します。予約時に請求は発生していません。",
      },
    ],
    priceH2: "テーブル最低金額",
    priceRows: [
      { label: "弘大 / 梨泰院", value: "₩500,000" },
      { label: "江南", value: "₩1,000,000" },
    ],
    priceNote:
      "1卓あたり（1人あたりではありません） — 4人なら1人約12〜25万ウォン。入場料は1万〜3万ウォン、江南の週末は高くなります。",
    rating: "Banyan Tree Pool Party 4.7 · Googleクチコミ3,376件",
    navHome: "ホーム",
    navFaq: "よくある質問",
    navTerms: "利用規約",
    navPrivacy: "プライバシー",
  },

  zh: {
    title: "首尔夜店卡座预订 — 真实价格、免订金 | NightFlow",
    description:
      "不用排队。在韩国22家最好的夜店用你的名字订卡座，价格直接来自夜店酒单，免订金、免预订手续费。江南、弘大、梨泰院。",
    ogTitle: "想在韩国夜店过VIP之夜？",
    ogSub: "免排队 · 22家精选 · 免订金",
    keywords: [
      "首尔夜店预订", "江南夜店卡座", "首尔卡座", "弘大夜店",
      "梨泰院夜店", "韩国夜店预订", "首尔夜店价格", "韩国夜店外国人能进吗",
    ],
    h1: "想在韩国夜店过VIP之夜？",
    fears: [
      { hit: "排队60分钟？", fix: "不用排。" },
      { hit: "怕门口被拦？", fix: "别担心。" },
      { hit: "当天已满座？", fix: "提前订好。" },
      { hit: "不会韩语？", fix: "不需要。" },
    ],
    terms: "免订金、免预订手续费 — 当天在店里付款。",
    clubs: "只有韩国最好的22家夜店。",
    cta: "预订卡座",
    buysH2: "这笔钱买到什么",
    buys: [
      {
        h: "价格直接来自夜店酒单",
        p: "预订前就能看到每瓶酒和套餐的价格，以及该座位的最低消费。总金额由夜店确认。",
      },
      {
        h: "被多收？我们退你200%。",
        p: "如果夜店按高于你看到的酒单收费，我们赔付差额的两倍。把收据发给我们就结算。",
      },
      {
        h: "不会韩语也能订",
        p: "我们的当地团队用韩语和夜店沟通，再用中文通过微信、WhatsApp 或 Line 回复你。",
      },
    ],
    askH2: "订之前想知道的",
    asks: [
      {
        q: "我们能进去吗？",
        a: "卡座是用你的名字订的，到门口说名字就能进，不用排队。但这不是保证 — 必须带护照原件（复印件会被拒），江南的着装要求不会通融，满座后就停止入场（周五六常见于23点后）。",
      },
      {
        q: "怎么付款？",
        a: "当天在店里付现金或刷卡。Visa 和 Mastercard 可以用，支付宝和微信支付不行。门票请准备 2–3 万韩元现金。",
      },
      {
        q: "想改日期怎么办？",
        a: "当天之前告诉我们就可以改。预订时没有收取任何费用。",
      },
    ],
    priceH2: "卡座最低消费",
    priceRows: [
      { label: "弘大 / 梨泰院", value: "₩500,000" },
      { label: "江南", value: "₩1,000,000" },
    ],
    priceNote:
      "按桌算不按人算 — 4个人一人约 12–25 万韩元。门票 1–3 万韩元，江南周末更高。",
    rating: "Banyan Tree Pool Party 4.7 · 3,376 条谷歌评价",
    navHome: "首页",
    navFaq: "常见问题",
    navTerms: "服务条款",
    navPrivacy: "隐私政策",
  },

  "zh-tw": {
    title: "首爾夜店包廂訂位 — 真實價格、免訂金 | NightFlow",
    description:
      "不用排隊。在韓國22家最好的夜店用你的名字訂包廂，價格直接來自夜店酒單，免訂金、免訂位手續費。江南、弘大、梨泰院。",
    ogTitle: "想在韓國夜店過VIP之夜？",
    ogSub: "免排隊 · 22家精選 · 免訂金",
    keywords: [
      "首爾夜店訂位", "江南夜店包廂", "首爾包廂", "弘大夜店",
      "梨泰院夜店", "韓國夜店訂位", "首爾夜店價格", "韓國夜店被卡",
    ],
    h1: "想在韓國夜店過VIP之夜？",
    fears: [
      { hit: "排隊60分鐘？", fix: "不用排。" },
      { hit: "怕在門口被卡？", fix: "別擔心。" },
      { hit: "當天已經滿了？", fix: "先訂好。" },
      { hit: "不會韓文？", fix: "不需要。" },
    ],
    terms: "免訂金、免訂位手續費 — 當天在店裡付款。",
    clubs: "只有韓國最好的22家夜店。",
    cta: "訂包廂",
    buysH2: "這筆錢買到什麼",
    buys: [
      {
        h: "價格直接來自夜店酒單",
        p: "訂之前就能看到每瓶酒和套餐的價格，以及那個位子的低消。總金額由夜店確認。",
      },
      {
        h: "被多收？我們退你200%。",
        p: "如果夜店收得比你看到的酒單高，我們賠你價差的兩倍。把收據傳給我們就結算。",
      },
      {
        h: "不會韓文也能訂",
        p: "我們的當地團隊用韓文跟夜店談，再用中文透過 Line、WhatsApp 或微信回覆你。",
      },
    ],
    askH2: "訂之前想知道的",
    asks: [
      {
        q: "我們進得去嗎？",
        a: "包廂是用你的名字訂的，到門口說名字就進去，不用排隊。但這不是保證 — 護照正本必備（影本會被拒），江南的服裝規定不會通融，滿了就停止入場（週五六常見於23點後）。",
      },
      {
        q: "怎麼付款？",
        a: "當天在店裡付現金或刷卡。Visa 和 Mastercard 可以用，支付寶和微信支付不行。入場費請準備 2–3 萬韓元現金。",
      },
      {
        q: "想改日期怎麼辦？",
        a: "當天之前告訴我們就可以改。訂位時沒有收取任何費用。",
      },
    ],
    priceH2: "包廂低消",
    priceRows: [
      { label: "弘大 / 梨泰院", value: "₩500,000" },
      { label: "江南", value: "₩1,000,000" },
    ],
    priceNote:
      "按桌計不按人計 — 4個人一人約 12–25 萬韓元。入場費 1–3 萬韓元，江南週末更高。",
    rating: "Banyan Tree Pool Party 4.7 · 3,376 則 Google 評論",
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

export function AdLanding({ lang }: { lang: SeoLang }) {
  const c = COPY[lang];

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      <ForeignPageTracker kind="info" lang={lang} meta={{ page: "ad-book" }} />

      {/* 상호 + 홈 링크 — 광고 랜딩에 운영 주체가 없으면 구글애즈 심사에서 신뢰성으로 걸린다.
          로고는 홈으로 가는 유일한 탈출구이기도 하다(본문엔 이탈 링크를 두지 않으므로). */}
      <header className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
        <Link href={`/${lang}`} className="text-[17px] font-black tracking-tight">
          Night<span className="text-brand-amber">Flow</span>
        </Link>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{lang}</span>
      </header>

      {/* 히어로 — 클럽 플로어. 헤드라인을 이미지 위에 얹어 첫 화면에서 공포 줄까지 보이게 한다.
          LCP라서 priority + webp(56KB). 하단 그라데이션은 글자 가독성용. */}
      <div className="relative max-w-lg mx-auto">
        <Image
          src="/ad-hero.webp"
          alt=""
          width={1200}
          height={956}
          priority
          sizes="(max-width: 512px) 100vw, 512px"
          className="block w-full h-[46vh] max-h-[340px] object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-background via-background/80 to-transparent" />
        <h1 className="absolute bottom-0 left-0 right-0 px-5 pb-3 text-[30px] font-black leading-[1.08] tracking-tight break-keep">
          {c.h1}
        </h1>
      </div>

      <div className="max-w-lg mx-auto">

        {/* 공포 → 해결. 조각으로 짧게 — 문장으로 쓰면 광고 클릭은 읽지 않고 나간다. */}
        <ul className="mt-3 border-y border-border divide-y divide-border">
          {c.fears.map((f) => (
            <li key={f.hit} className="flex items-baseline gap-2 px-5 py-2.5">
              <span className="text-[15px] font-black text-red-400 break-keep">{f.hit}</span>
              <span className="text-[13px] font-bold text-foreground break-keep">{f.fix}</span>
            </li>
          ))}
        </ul>

        <div className="px-5 pt-4 space-y-0.5">
          <p className="text-[15px] font-black break-keep">{c.terms}</p>
          <p className="text-[15px] font-black text-money break-keep">{c.clubs}</p>
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

        <p className="mt-6 px-5 text-[11px] text-muted-foreground tabular-nums">{c.rating}</p>

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
        <div className="max-w-lg mx-auto px-5 py-3">
          <Link
            data-nf-track="book_cta"
            href={`/flags/new?lang=${lang}`}
            className="block w-full py-4 rounded-xl bg-brand-amber text-black font-black text-center text-base hover:opacity-90 transition-opacity"
          >
            {c.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
