// 유흥 인접 검색어("korean room salon", "江南 ルームサロン 日本人", "booking club gangnam")를
// 클럽 테이블 예약으로 잇는 설명 페이지 2개. 검색자는 하룻밤 50만~200만 쓰는 층이라 강남
// 하한(₩1M)이 부담이 아닌 유일한 검색층인데, 구글 광고는 성인 서비스 정책상 불가라 SEO 본문으로만 잡는다.
//
// 브랜드 안전(절대):
//   - 성적 표현 0. "여자 보장"류 약속 없음. 불법 서비스 서술·안내 없음.
//   - 룸살롱은 "우리는 예약하지 않는다"를 본문과 FAQ에 명시. 설명은 검색자가 이미 아는 사실(밀폐 룸·
//     호스티스·비공개 가격·외국인 거절)까지만.
//   - 부킹은 "MD/웨이터가 자리를 소개하는 문화, 양쪽 다 거절 가능"으로. 특정 클럽이 부킹을 한다고 못 박지 않는다.
//
// 어휘: ja ルームサロン/キャバクラ, MD는 "MD（クラブの予約担当）". zh-tw는 酒店=호스티스바·酒店小姐,
// 클럽 MD는 公關(대만에선 호스티스 뜻도 있음)과 구분해 "MD（夜店的訂位窗口）". zh 房间沙龙/陪酒/卡座.
//
// 구조는 HalloweenSeoul2026와 같다: COPY + xMetadata(lang) + 11줄 라우트 ×4. JSON-LD Article+FAQ+Breadcrumb.

import Link from "next/link";
import type { Metadata } from "next";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";
import { bookingFloor, formatWon, wonCompact } from "@/lib/clubs/tablePricing";

const BASE = "https://nightflow.kr";
// 본문 "Updated …"와 JSON-LD dateModified가 어긋나지 않게 한 곳에서.
const PUBLISHED = "2026-09-14";
const MODIFIED = "2026-09-14";
const GANGNAM = bookingFloor("강남");
const HONGDAE = bookingFloor("홍대");

type Section = { h2: string; paras?: string[]; bullets?: string[] };
type Compare = { head: [string, string, string]; rows: [string, string, string][] };
type Copy = {
  title: string; description: string; ogTitle: string; ogSub: string; keywords: string[];
  eyebrow: string; h1: string; intro: string;
  sections: Section[];
  compareH2?: string;
  compare?: Compare;
  /** 헤더 CTA. 룸살롱 페이지는 설명 전에 CTA를 내밀면 미끼로 읽혀서 뺀다(크리틱 1차). */
  headerCta?: boolean;
  priceH2: string; priceBullets: string[];
  faqH2: string; faqs: { q: string; a: string }[];
  ctaH2: string; ctaBody: string; cta: string;
  moreH2: string; more: { label: string; href: string }[];
  breadcrumb: string; back: string; updated: string;
};

const won = (n: number, lang: SeoLang) => `${formatWon(n)}（≈ ${wonCompact(n, lang)}）`;

/* ─────────────────────────── 1. 강남 부킹 클럽 ─────────────────────────── */

const BOOKING: Record<SeoLang, Copy> = {
  en: {
    title: "Booking Clubs in Gangnam: Meaning, Prices, How to Join",
    description: "What a Korean 'booking club' actually is: staff introduce guests between tables, either side can decline, and the table is your ticket in. Gangnam table prices from ₩1,000,000, etiquette, and how foreigners book one.",
    ogTitle: "Korean Booking Clubs, Explained", ogSub: "Gangnam booking culture · prices · how to join",
    keywords: ["Korean booking club", "booking club Gangnam", "booking club Korea", "Korean club booking culture", "Korean nightclub booking meaning", "Gangnam club table price"],
    eyebrow: "GANGNAM NIGHTLIFE · CULTURE", headerCta: true,
    h1: "Korean booking clubs — what 'booking' means and how foreigners join",
    intro: "In Korea, 'booking' (부킹) doesn't mean a reservation. It's the Gangnam custom where club staff walk guests over to another table for a short introduction. It is consensual, either side can say no, and the venue earns from tables and bottles — not from the people. The one rule: you take part from a table, not from the bar. Here is how it works, what it costs, and how to book a table without speaking Korean.",
    sections: [
      { h2: "What actually happens", paras: [
        "You book a table, order from the club's menu, and a waiter or MD looks after your table for the night. If your group is open to meeting people, staff bring guests from other tables over for a few minutes. If it clicks, you keep talking or share a drink; if not, they walk back — no awkwardness, no cost, no obligation on either side.",
        "Booking happens between tables, so a group of any mix takes part by holding one. Guest-list entry gets you onto the floor; a table gets you into the conversation. That's why 'booking' and 'table' are the same topic in Gangnam.",
      ]},
      { h2: "Which clubs do this", paras: [
        "Booking culture lives in Gangnam's lounges and hip-hop clubs rather than the big EDM rooms. It changes by night and by MD, so we don't promise it for a specific club. Tell us what kind of night you want in the request notes and we'll match you with a club and an MD where it fits.",
      ]},
      { h2: "Etiquette that keeps the night good", bullets: [
        "It's a short intro. Say hi, offer a drink, let them decide. Nobody is obliged to stay.",
        "Decline politely if you're not interested — a smile and 'we're good' is enough.",
        "Don't grab, follow or block anyone. Staff will end your night for it.",
        "Tipping isn't expected. The MD earns when you come back, so being easy to host matters more than cash.",
        "Bring your passport (19+). Dress: no shorts, tank tops or slides in Gangnam.",
      ]},
    ],
    priceH2: "What it costs",
    priceBullets: [
      `Gangnam table: minimum spend ${won(GANGNAM, "en")} per table, filled from the club's printed menu — for the whole group, not per person. Four people ≈ ₩250,000 each.`,
      "Some clubs add a table charge on weekends (₩30,000–₩50,000) and entry (₩20,000–₩50,000). We tell you the final number in writing before you commit.",
      `Hongdae and Itaewon tables start at ${won(HONGDAE, "en")}, but booking culture is a Gangnam thing.`,
      "No deposit, no broker fee. You pay the club on the night.",
      "Friday and Saturday are busiest; doors stop admitting when full and tables are confirmed in the order requests arrive — ask early in the week.",
    ],
    faqH2: "Booking clubs — questions foreigners ask",
    faqs: [
      { q: "Is 'booking' in a Korean club the same as a reservation?", a: "No. In Korea 'booking' (부킹) is the custom of staff introducing guests between tables. A reservation is a table booking — which is what NightFlow arranges. You need the second to take part in the first." },
      { q: "Can foreigners join booking clubs in Gangnam?", a: "Yes. Some Gangnam doors are strict about dress and age, and a few venues prefer regulars, but with a table you walk in and the MD hosts you like any other guest. English is fine with the MDs we work with." },
      { q: "Is anyone paid to come to my table?", a: "No. Booking is between guests who both chose to be in the club. Nobody at the table is paid to be there, and nobody has to stay. That's also what makes it legal and ordinary in Korea." },
      { q: "What if we're a mixed group or just want to dance?", a: "Say so in the request notes. Booking is optional — plenty of tables in the same room just drink and dance. The MD will read your group and won't bring people over if you'd rather not." },
    ],
    ctaH2: "Book a Gangnam table", ctaBody: "Date, group size, what kind of night you want. We confirm with the club in Korean, send you the final price in writing, and you walk in. Free to request, no deposit.",
    cta: "🍾 Book a Gangnam table",
    moreH2: "Related",
    more: [
      { label: "Room salon vs club table — what foreigners can actually book →", href: "/en/room-salon-vs-club" },
      { label: "Gangnam clubs & real table prices →", href: "/en/clubs/gangnam" },
      { label: "All Seoul club table prices →", href: "/en/vip-tables" },
      { label: "Entry rules & dress code →", href: "/en/club-entry-rules" },
    ],
    breadcrumb: "Booking clubs", back: "← NightFlow", updated: "Updated September 2026",
  },

  ja: {
    title: "韓国ブッキングクラブとは｜江南の料金と参加方法",
    description: "韓国クラブの「ブッキング（부킹）」は予約のことではなく、スタッフが席同士を紹介する江南の文化。断るのも自由。参加にはテーブルが必要。江南テーブル100万ウォン〜、マナー、日本語での予約方法。",
    ogTitle: "韓国のブッキングクラブとは", ogSub: "江南のブッキング文化・料金・参加方法",
    keywords: ["韓国 ブッキングクラブ", "江南 ブッキング", "韓国 クラブ ブッキング とは", "江南 クラブ 日本人", "江南 クラブ テーブル 料金"],
    eyebrow: "江南のナイトライフ · 文化", headerCta: true,
    h1: "韓国のブッキングクラブ — 「ブッキング」の意味と日本人の参加方法",
    intro: "韓国で「ブッキング（부킹）」は予約のことではありません。クラブのスタッフが他のテーブルのお客さんを連れてきて短く紹介する、江南の習慣です。合意の上で、どちらが断ってもよく、店の収入源はテーブルとボトルで、人ではありません。ルールは一つ、参加はバーカウンターではなくテーブルから。仕組み、料金、韓国語なしで予約する方法をまとめました。",
    sections: [
      { h2: "実際に何が起きるか", paras: [
        "テーブルを予約し、店のメニューから注文すると、ウェイターかMD（クラブの予約担当）がその夜あなたのテーブルを担当します。グループが交流に前向きなら、スタッフが他のテーブルのお客さんを数分だけ連れてきます。話が合えばそのまま一緒に飲み、合わなければ戻る — 気まずさも費用も義務もありません。",
        "ブッキングはテーブル同士で起きるので、男女どんな構成のグループでもテーブルを持つことで参加します。ゲストリストで入れるのはフロアまで、会話に加わるのはテーブルから — だから江南では「ブッキング」と「テーブル」は同じ話です。",
      ]},
      { h2: "どのクラブでやっているか", paras: [
        "ブッキング文化があるのは大型EDMクラブより、江南のラウンジやヒップホップ系のクラブです。夜によって、MDによって変わるので、特定の店を「ここでできます」とは約束しません。リクエストの備考にどんな夜にしたいか書いてもらえれば、合うクラブとMDにつなぎます。",
      ]},
      { h2: "夜を台無しにしないマナー", bullets: [
        "紹介は数分。挨拶して一杯すすめ、相手に決めてもらう。誰も残る義務はない。",
        "興味がなければ笑顔で「大丈夫です」と断ればいい。",
        "腕をつかむ・追いかける・道をふさぐは即退場。",
        "チップは不要。MDはリピートで稼ぐので、現金より「また来たい客」であることが大事。",
        "パスポート必携（19歳以上）。江南では短パン・タンクトップ・サンダルは入れない。",
      ]},
    ],
    priceH2: "料金",
    priceBullets: [
      `江南のテーブル：1卓 ${won(GANGNAM, "ja")} の最低予約金額を店のメニューから埋める形。人数ではなくテーブル単位なので、4人なら一人約25万ウォン。`,
      "週末はテーブルチャージ（3〜5万ウォン）と入場料（2〜5万ウォン）がかかる店もあります。確定前に最終金額を書面でお伝えします。",
      `弘大・梨泰院は ${won(HONGDAE, "ja")} からですが、ブッキング文化は江南のものです。`,
      "デポジットなし、仲介手数料なし。当日クラブで支払い。",
      "金・土が一番賑わいますが、満員になると入場は止まり、テーブルはリクエスト順に確定します。週の前半に送るのが確実です。",
    ],
    faqH2: "ブッキングクラブ — 日本人からよくある質問",
    faqs: [
      { q: "韓国クラブの「ブッキング」は予約のことですか？", a: "違います。韓国の「ブッキング（부킹）」はスタッフが席同士を紹介する習慣です。予約はテーブル予約 — NightFlowが手配するのはこちらです。前者に参加するには後者が必要です。" },
      { q: "日本人でもブッキングクラブに入れますか？", a: "入れます。江南は服装と年齢に厳しい店があり常連優先の店もありますが、テーブルがあればそのまま入場でき、MDが他のお客さんと同じようにホストします。私たちが組むMDは英語で対応できます。" },
      { q: "テーブルに来る人はお金をもらっているのですか？", a: "いいえ。ブッキングは自分の意思でクラブに来たお客さん同士の紹介です。誰も報酬をもらっておらず、残る義務もありません。だからこそ韓国では合法で、ごく普通の文化です。" },
      { q: "男女混合グループや、ただ踊りたいだけの場合は？", a: "備考にそう書いてください。ブッキングは任意で、同じフロアで飲んで踊るだけのテーブルもたくさんあります。MDがグループの雰囲気を読み、望まなければ人を連れてきません。" },
    ],
    ctaH2: "江南のテーブルを予約", ctaBody: "日程・人数・どんな夜にしたいか。私たちが韓国語でクラブに確認し、最終価格を書面で送ります。当日はそのまま入場。リクエスト無料、デポジットなし。",
    cta: "🍾 江南のテーブルを予約",
    moreH2: "関連",
    more: [
      { label: "ルームサロンとクラブのテーブルの違い — 日本人が実際に予約できるのは →", href: "/ja/room-salon-vs-club" },
      { label: "江南のクラブと実際のテーブル料金 →", href: "/ja/clubs/gangnam" },
      { label: "ソウル全クラブのテーブル料金 →", href: "/ja/vip-tables" },
      { label: "入場ルール・ドレスコード →", href: "/ja/club-entry-rules" },
    ],
    breadcrumb: "ブッキングクラブ", back: "← NightFlow", updated: "2026年9月更新",
  },

  zh: {
    title: "韩国 Booking 夜店是什么｜江南 booking 文化、价格与参加方法",
    description: "韩国夜店的「booking（부킹）」不是预订，而是江南的习惯：店员把客人带到别桌做简短介绍，双方都可以拒绝，卡座是参与的门票。江南卡座 100 万韩元起、礼仪、不会韩语怎么订。",
    ogTitle: "韩国 Booking 夜店是什么", ogSub: "江南 booking 文化 · 价格 · 怎么参加",
    keywords: ["韩国 booking 夜店", "江南 booking", "韩国夜店 booking 是什么", "韩国夜店文化", "江南夜店 外国人", "江南夜店卡座价格"],
    eyebrow: "江南夜生活 · 文化", headerCta: true,
    h1: "韩国 Booking 夜店 — 「booking」是什么，外国人怎么参加",
    intro: "在韩国，「booking（부킹）」不是预订的意思，而是江南的习惯：夜店店员把客人带到另一桌做几分钟的介绍。这是双方自愿的，任何一方都可以拒绝，店家赚的是卡座和酒水的钱 — 不是人的钱。唯一的规则：你要从卡座参与，而不是站在吧台。这里说明它怎么运作、多少钱、不会韩语怎么订卡座。",
    sections: [
      { h2: "实际会发生什么", paras: [
        "你订好卡座，从夜店酒单点酒，当晚会有服务生或 MD（夜店的预订负责人）照顾你这桌。如果你们这组愿意认识新朋友，店员会把别桌的客人带过来几分钟。聊得来就继续聊、请喝一杯；聊不来就各自回去 — 不尴尬、不花钱、双方都没有义务。",
        "Booking 发生在桌与桌之间，所以不管男女怎么组合，一组人靠一个卡座参与。宾客名单只让你进到场内，卡座才让你进到对话里 — 所以在江南「booking」和「卡座」是同一件事。",
      ]},
      { h2: "哪些夜店有这种文化", paras: [
        "Booking 文化主要在江南的 lounge 和嘻哈夜店，大型 EDM 夜店比较少。它随当晚和 MD 而变，所以我们不为特定夜店做保证。在申请备注里告诉我们你想要什么样的夜晚，我们帮你匹配合适的夜店和 MD。",
      ]},
      { h2: "让夜晚顺利的礼仪", bullets: [
        "介绍只有几分钟。打个招呼、请一杯，让对方决定。没有人有义务留下。",
        "不感兴趣就礼貌拒绝 — 笑一下说「我们这样就好」就够了。",
        "不要拉、不要跟、不要挡。店员会直接请你离开。",
        "不用给小费。MD 靠回头客赚钱，好相处比现金更重要。",
        "带护照（19 岁以上）。江南穿搭：不要短裤、背心、拖鞋。",
      ]},
    ],
    priceH2: "多少钱",
    priceBullets: [
      `江南卡座：每桌最低消费 ${won(GANGNAM, "zh")}，从夜店印刷酒单里选酒凑满 — 按整桌算，不是每人。4 个人一人约 25 万韩元。`,
      "部分夜店周末加收台费（3〜5 万韩元）和入场费（2〜5 万韩元）。确认前我们会书面告知最终价格。",
      `弘大、梨泰院卡座 ${won(HONGDAE, "zh")} 起，但 booking 文化是江南的东西。`,
      "无押金、无中介费。当晚在夜店付款。",
      "周五周六最热闹，但满员就停止入场，卡座按申请顺序确认。周初就发申请最稳。",
    ],
    faqH2: "Booking 夜店 — 外国人常问的问题",
    faqs: [
      { q: "韩国夜店的「booking」和预订是一回事吗？", a: "不是。在韩国「booking（부킹）」是店员在桌与桌之间介绍客人的习惯。预订是订卡座 — NightFlow 安排的是这个。要参与前者，你需要后者。" },
      { q: "外国人可以参加江南的 booking 夜店吗？", a: "可以。江南有些店门口对穿搭和年龄很严，少数店偏好熟客，但有卡座你就直接进，MD 会像招待其他客人一样招待你。我们合作的 MD 可以用英语沟通。" },
      { q: "来我这桌的人是有报酬的吗？", a: "没有。Booking 是两边都自己选择来夜店的客人之间的介绍。桌上没有人是拿钱来的，也没有人必须留下。这也是它在韩国合法且普通的原因。" },
      { q: "我们是男女混合，或者只想跳舞怎么办？", a: "在申请备注里写明。Booking 是可选的 — 同一个场子里很多桌只是喝酒跳舞。MD 会看你们这组的氛围，你们不想要就不会带人过来。" },
    ],
    ctaH2: "预订江南卡座", ctaBody: "日期、人数、想要什么样的夜晚。我们用韩语向夜店确认，把最终价格书面发给你，当晚直接进场。免费申请，无押金。",
    cta: "🍾 预订江南卡座",
    moreH2: "相关",
    more: [
      { label: "房间沙龙 vs 夜店卡座 — 外国人实际能订的是什么 →", href: "/zh/room-salon-vs-club" },
      { label: "江南夜店与真实卡座价格 →", href: "/zh/clubs/gangnam" },
      { label: "首尔全部夜店卡座价格 →", href: "/zh/vip-tables" },
      { label: "入场规定与着装 →", href: "/zh/club-entry-rules" },
    ],
    breadcrumb: "Booking 夜店", back: "← NightFlow", updated: "2026 年 9 月更新",
  },

  "zh-tw": {
    title: "韓國 Booking 夜店是什麼｜江南文化、價格與參加",
    description: "韓國夜店的「booking（부킹）」不是訂位，而是江南的習慣：店員把客人帶到別桌做簡短介紹，雙方都可以拒絕，桌位是參與的門票。江南桌位 100 萬韓元起、禮儀、不會韓語怎麼訂。",
    ogTitle: "韓國 Booking 夜店是什麼", ogSub: "江南 booking 文化 · 價格 · 怎麼參加",
    keywords: ["韓國 booking 夜店", "江南 booking", "韓國夜店 booking 是什麼", "韓國夜店文化", "江南夜店 外國人", "江南夜店桌位價格", "首爾 夜店 桌位"],
    eyebrow: "江南夜生活 · 文化", headerCta: true,
    h1: "韓國 Booking 夜店 — 「booking」是什麼，外國人怎麼參加",
    intro: "在韓國，「booking（부킹）」不是訂位的意思，而是江南的習慣：夜店店員把客人帶到另一桌做幾分鐘的介紹。這是雙方自願的，任何一方都可以拒絕，店家賺的是桌位和酒的錢 — 不是人的錢。唯一的規則：你要從桌位參與，不是站在吧台。這裡說明它怎麼運作、多少錢、不會韓語怎麼訂桌位。",
    sections: [
      { h2: "實際會發生什麼", paras: [
        "你訂好桌位，從夜店酒單點酒，當晚會有服務生或 MD（夜店的訂位窗口）照顧你這桌。如果你們這組願意認識新朋友，店員會把別桌的客人帶過來幾分鐘。聊得來就繼續聊、請喝一杯；聊不來就各自回去 — 不尷尬、不花錢、雙方都沒有義務。",
        "Booking 發生在桌與桌之間，所以不管男女怎麼組合，一組人靠一個桌位參與。Guest list 只讓你進到場內，桌位才讓你進到對話裡 — 所以在江南「booking」和「桌位」是同一件事。",
      ]},
      { h2: "哪些夜店有這種文化", paras: [
        "Booking 文化主要在江南的 lounge 和嘻哈夜店，大型 EDM 夜店比較少。它隨當晚和 MD 而變，所以我們不為特定夜店掛保證。在申請備註裡告訴我們你想要什麼樣的夜晚，我們幫你配合適的夜店和 MD。",
      ]},
      { h2: "讓夜晚順利的禮儀", bullets: [
        "介紹只有幾分鐘。打個招呼、請一杯，讓對方決定。沒有人有義務留下。",
        "不感興趣就禮貌拒絕 — 笑一下說「我們這樣就好」就夠了。",
        "不要拉、不要跟、不要擋。店員會直接請你離開。",
        "不用給小費。MD 靠回頭客賺錢，好相處比現金更重要。",
        "帶護照（19 歲以上）。江南穿搭：不要短褲、背心、拖鞋，不然會被擋在門口。",
      ]},
    ],
    priceH2: "多少錢",
    priceBullets: [
      `江南桌位：每桌低消 ${won(GANGNAM, "zh-tw")}，從夜店印好的酒單選酒湊滿 — 按整桌算，不是每人。4 個人一人約 25 萬韓元（約 NT$5,700）。`,
      "部分夜店週末加收桌位費（3〜5 萬韓元）和入場費（2〜5 萬韓元）。確認前我們會書面告知最終價格。",
      `弘大、梨泰院桌位 ${won(HONGDAE, "zh-tw")} 起，但 booking 文化是江南的東西。`,
      "免訂金、無中介費。當晚在夜店付款。",
      "週五週六最熱鬧，但滿了就停止入場，桌位按申請順序確認。週初就送出申請最穩。",
    ],
    faqH2: "Booking 夜店 — 外國人常問的問題",
    faqs: [
      { q: "韓國夜店的「booking」和訂位是同一件事嗎？", a: "不是。在韓國「booking（부킹）」是店員在桌與桌之間介紹客人的習慣。訂位是訂桌位 — NightFlow 安排的是這個。要參與前者，你需要後者。" },
      { q: "外國人可以參加江南的 booking 夜店嗎？", a: "可以。江南有些店門口對穿搭和年齡很嚴，少數店偏好熟客，但有桌位你就直接進，MD 會像招待其他客人一樣招待你。我們合作的 MD 可以用英語溝通。" },
      { q: "來我這桌的人是有報酬的嗎？", a: "沒有。Booking 是兩邊都自己選擇來夜店的客人之間的介紹。桌上沒有人是拿錢來的，也沒有人必須留下。這也是它在韓國合法且普通的原因。" },
      { q: "我們是男女混合，或者只想跳舞怎麼辦？", a: "在申請備註裡寫明。Booking 是可選的 — 同一個場子裡很多桌只是喝酒跳舞。MD 會看你們這組的氣氛，你們不想要就不會帶人過來。" },
    ],
    ctaH2: "訂江南桌位", ctaBody: "日期、人數、想要什麼樣的夜晚。我們用韓語向夜店確認，把最終價格書面傳給你，當晚直接進場。免費申請，免訂金。",
    cta: "🍾 訂江南桌位",
    moreH2: "相關",
    more: [
      { label: "酒店 vs 夜店桌位 — 外國人實際能訂的是什麼 →", href: "/zh-tw/room-salon-vs-club" },
      { label: "江南夜店與真實桌位價格 →", href: "/zh-tw/clubs/gangnam" },
      { label: "首爾全部夜店桌位價格 →", href: "/zh-tw/vip-tables" },
      { label: "入場規定與服裝 →", href: "/zh-tw/club-entry-rules" },
    ],
    breadcrumb: "Booking 夜店", back: "← NightFlow", updated: "2026 年 9 月更新",
  },
};

/* ─────────────────────────── 2. 룸살롱 vs 클럽 테이블 ─────────────────────────── */

const ROOM_SALON: Record<SeoLang, Copy> = {
  en: {
    title: "Room Salon vs Club in Gangnam — Prices for Foreigners",
    description: "What a Korean room salon is, why most won't take a visitor, what it costs, and the legal alternative you can actually book: a Gangnam club table from ₩1,000,000 with a printed menu and an English-speaking host. NightFlow does not book room salons.",
    ogTitle: "Room Salon vs Club Table", ogSub: "What foreigners can actually book in Gangnam",
    keywords: ["Korean room salon", "room salon Korea", "room salon Gangnam", "Korean room salon price", "room salon foreigners", "Korea room salon vs club", "Gangnam club table price"],
    eyebrow: "GANGNAM NIGHTLIFE · WHAT YOU CAN BOOK",
    h1: "Room salon vs club table in Gangnam — what foreigners can actually book",
    intro: "If you searched 'Korean room salon', you already know the outline: private rooms, hostesses, whisky sets, Gangnam. What the search results don't tell you is that most of them won't take a visitor, and none of them publish a price. This page explains what a room salon is, why it rarely works for foreigners, and the legal alternative we do book: a Gangnam club table with a printed menu, an English-speaking host, and the same big-night energy.",
    sections: [
      { h2: "What a room salon is", paras: [
        "A room salon (룸살롱) is a Korean drinking venue with fully private rooms, typically licensed as an 'entertainment bar' (유흥주점): the group rents a room, buys whisky sets, and paid staff sit with them. It is a real part of Korean business culture, and this page is not here to judge it. It is here to tell you what actually happens when a foreign visitor tries to go.",
      ]},
      { h2: "Why it rarely works for foreigners", bullets: [
        "Invitation-only. Rooms go to regulars and their guests; there is no public booking channel.",
        "Most run in Korean only. A few advertise English or Japanese, but the price is still unpublished and the bill is decided on the night.",
        "No printed prices. Figures reported in Korean press and forums run from ₩300,000 to ₩1,000,000+ per person before service charges — but there is no menu to hold anyone to.",
        "Paid sexual services are illegal in Korea. Venues or 'guides' hinting at them are where visitors get into legal and financial trouble.",
        "NightFlow does not book room salons or any venue with paid companions, and we won't refer you to someone who does.",
      ]},
      { h2: "What we book instead — and why it's the better night", paras: [
        "A Gangnam club table gives you the parts of the night people are actually after — your own booth, bottles on the table, a host looking after you, a room full of people dressed up for Saturday — without the closed door. Prices are on a printed menu you see before you commit. The MD speaks English. And Gangnam's 'booking' culture means staff introduce guests between tables; nobody is paid to be there, and either side can decline.",
        "It's an ordinary licensed nightclub, it's public, and the bill is the number you agreed to.",
      ]},
    ],
    compareH2: "Side by side",
    compare: {
      head: ["", "Room salon", "Gangnam club table"],
      rows: [
        ["Who gets in", "Regulars and their guests", "Anyone 19+ with a table, passport and Gangnam-appropriate dress"],
        ["Price", "Quoted per person, unpublished; reported ₩300k–₩1M+ each", `${formatWon(GANGNAM)} per table (whole group), from a printed menu`],
        ["What you're paying for", "A private room and paid staff", "Booth, bottles, host, the crowd"],
        ["Language", "Mostly Korean", "English-speaking MD"],
        ["Meeting people", "Paid staff, by the hour", "Other guests via 'booking' — optional, unpaid, either side can decline"],
        ["Legal footing", "Depends on the venue", "Ordinary licensed nightclub — same rules as any bar"],
        ["Can NightFlow book it", "No", "Yes — free to request, no deposit"],
      ],
    },
    priceH2: "How the money compares",
    priceBullets: [
      `A Gangnam table is ${won(GANGNAM, "en")} minimum spend for the whole group, filled from the club's own menu. Four people ≈ ₩250,000 each — comparable to or below a single room-salon quote for one person.`,
      "Entry ₩20,000–₩50,000 and sometimes a weekend table charge. We put the final number in writing before you commit.",
      "No deposit, no broker fee. Pay the club on the night. If a club bills you above its printed menu, we refund 200%.",
    ],
    faqH2: "Room salons — questions visitors ask",
    faqs: [
      { q: "Can foreigners go to a Korean room salon?", a: "Sometimes, as the guest of a Korean regular. On your own, most Gangnam room salons decline visitors, and the few that advertise to tourists still don't publish prices. NightFlow does not book them." },
      { q: "How much does a room salon cost in Korea?", a: "There is no published price. Figures reported in Korean press and forums run from ₩300,000 to ₩1,000,000+ per person for the room, a whisky set and staff time, before service charges. The lack of a menu is the point — the number is set for you." },
      { q: "Is a room salon legal?", a: "The venue is typically a licensed entertainment bar, so drinking there is legal. Paid sexual services are not, and venues or middlemen hinting at them are where foreign visitors get into trouble. We stay out of that category entirely." },
      { q: "Are there hostesses or paid companions at a club table?", a: "No, and nobody should promise you that. Gangnam clubs have a booking culture — staff introduce guests who are there by choice, and either side can decline. It's social, not a service. If you want a paid-companion venue, we are not the right platform." },
    ],
    ctaH2: "Book a Gangnam table instead", ctaBody: "Printed prices, English-speaking host, no deposit. We confirm with the club in Korean and send you the final number in writing before you commit.",
    cta: "🍾 Book a Gangnam table",
    moreH2: "Related",
    more: [
      { label: "Korean booking clubs — what 'booking' means →", href: "/en/gangnam-booking-club" },
      { label: "Gangnam clubs & real table prices →", href: "/en/clubs/gangnam" },
      { label: "Safety & scams FAQ →", href: "/en/faq" },
      { label: "Entry rules & dress code →", href: "/en/club-entry-rules" },
    ],
    breadcrumb: "Room salon vs club", back: "← NightFlow", updated: "Updated September 2026",
  },

  ja: {
    title: "韓国ルームサロンの料金と日本人が予約できる代替案｜江南",
    description: "江南クラブのテーブル（100万ウォン〜、メニュー価格、英語対応MD）が日本人が実際に予約できる合法の選択肢。ルームサロンとは何か、なぜ入りにくいか、料金の実態も。NightFlowはルームサロンを手配しません。",
    ogTitle: "ルームサロン vs クラブのテーブル", ogSub: "江南で日本人が実際に予約できるもの",
    keywords: ["韓国 ルームサロン", "江南 ルームサロン", "ルームサロン 料金", "ルームサロン 日本人", "韓国 ルームサロン とは", "韓国 夜遊び 江南", "江南 クラブ テーブル 料金"],
    eyebrow: "江南のナイトライフ · 予約できるもの",
    h1: "ルームサロンとクラブのテーブルの違い — 江南で日本人が実際に予約できるもの",
    intro: "「韓国 ルームサロン」で検索したなら、輪郭はもうご存知でしょう：完全個室、ホステス、ウイスキーセット、江南。検索結果が教えてくれないのは、ほとんどの店は一見の旅行者を受け入れないこと、どの店も料金を公開していないことです。このページではルームサロンの仕組み、旅行者にはなぜ向かないか、そして私たちが実際に手配する合法の選択肢 — メニュー価格・英語対応のMD・同じ高揚感のある江南クラブのテーブル — を説明します。",
    sections: [
      { h2: "ルームサロンとは", paras: [
        "ルームサロン（룸살롱）は完全個室の韓国の酒場で、多くは「遊興酒店（유흥주점）」として許可を受けています。部屋を借り、ウイスキーセットを入れ、報酬をもらうスタッフが同席します。日本のキャバクラに近いですが、完全個室で料金は非公開です。韓国のビジネス文化の一部であり、このページはそれを裁くためのものではなく、日本人旅行者が実際に行こうとすると何が起きるかを伝えるためのものです。",
      ]},
      { h2: "なぜ旅行者には向かないか", bullets: [
        "紹介制。常連とその同伴者だけで、一般向けの予約窓口はありません。",
        "ほぼ韓国語だけで回っています。日本語対応をうたう店もありますが、料金は非公開で、請求額はその場で決まります。",
        "料金の掲示なし。韓国のメディアや掲示板で報告される相場は一人30万〜100万ウォン超で、これにサービス料が加わりますが、それを担保するメニューは存在しません。",
        "韓国では性的サービスの売買は違法です。それをほのめかす店や「案内人」こそ、旅行者が法的・金銭的トラブルに巻き込まれる場所です。",
        "NightFlowはルームサロンなど有償の同席を伴う店は一切手配せず、それを扱う業者の紹介もしません。",
      ]},
      { h2: "代わりに手配するもの — そしてそちらの方がいい夜になる理由", paras: [
        "江南クラブのテーブルは、人が本当に求めている夜の要素 — 自分たちのブース、テーブルの上のボトル、面倒を見てくれるホスト、土曜のために着飾った人でいっぱいのフロア — を、閉じたドアなしで揃えます。料金は確定前に見られる印刷メニュー。MDは英語対応。そして江南の「ブッキング」文化では、スタッフがテーブル同士のお客さんを紹介します。誰も報酬で座っておらず、どちらも断れます。",
        "通常の許可営業のナイトクラブで、公開の場で、請求額は合意した数字そのものです。",
      ]},
    ],
    compareH2: "比べると",
    compare: {
      head: ["", "ルームサロン", "江南クラブのテーブル"],
      rows: [
        ["入れる人", "常連とその同伴者", "19歳以上でテーブル・パスポート・江南向けの服装があれば誰でも"],
        ["料金", "一人単位の口頭見積、非公開。報告では一人30万〜100万ウォン超", `1卓 ${formatWon(GANGNAM)}（グループ全体）、印刷メニューから`],
        ["何に払うか", "個室＋有償の同席スタッフ", "ブース・ボトル・ホスト・フロアの客層"],
        ["言語", "ほぼ韓国語", "英語対応のMD"],
        ["出会い", "報酬で同席するスタッフ", "他のお客さんを「ブッキング」で紹介 — 任意・無償・どちらも断れる"],
        ["法的な位置づけ", "店次第", "通常の許可営業のナイトクラブ — 他のバーと同じルール"],
        ["NightFlowで予約", "不可", "可。リクエスト無料、デポジットなし"],
      ],
    },
    priceH2: "お金の比較",
    priceBullets: [
      `江南のテーブルは1卓 ${won(GANGNAM, "ja")} の最低予約金額をグループ全体で店のメニューから埋める形。4人なら一人約25万ウォン — ルームサロンの一人分の見積と同等かそれ以下です。`,
      "入場料2〜5万ウォン、週末はテーブルチャージがかかる店も。確定前に最終金額を書面でお伝えします。",
      "デポジットなし、仲介手数料なし。当日クラブで支払い。印刷メニューより高く請求されたら200%返金します。",
    ],
    faqH2: "ルームサロン — 旅行者からよくある質問",
    faqs: [
      { q: "日本人は韓国のルームサロンに行けますか？", a: "韓国人の常連の同伴者として入れることはあります。単独では江南のルームサロンの多くは一見の旅行者を断り、観光客向けをうたう店でも料金は非公開のままです。NightFlowは手配しません。" },
      { q: "韓国のルームサロンはいくらかかりますか？", a: "公開料金はありません。韓国のメディアや掲示板で報告される相場は、個室・ウイスキーセット・同席スタッフで一人30万〜100万ウォン超にサービス料が加わります。メニューがないこと自体が仕組みで、金額はあなたのために決められます。" },
      { q: "ルームサロンは合法ですか？", a: "店の多くは許可営業の遊興酒店なので、そこで飲むこと自体は合法です。性的サービスの売買は違法で、それをほのめかす店や仲介者こそ外国人旅行者がトラブルに遭う場所です。私たちはそのカテゴリーに一切関わりません。" },
      { q: "クラブのテーブルにホステスや有償の同席者はいますか？", a: "いません。そう約束する人がいたら疑ってください。江南のクラブにはブッキング文化があり、自分の意思で来ているお客さん同士をスタッフが紹介し、どちらも断れます。社交であってサービスではありません。有償の同席を伴う店を探しているなら、私たちは適した窓口ではありません。" },
    ],
    ctaH2: "代わりに江南のテーブルを予約", ctaBody: "印刷メニューの料金、英語対応のホスト、デポジットなし。私たちが韓国語でクラブに確認し、確定前に最終金額を書面でお送りします。",
    cta: "🍾 江南のテーブルを予約",
    moreH2: "関連",
    more: [
      { label: "韓国のブッキングクラブ — 「ブッキング」の意味 →", href: "/ja/gangnam-booking-club" },
      { label: "江南のクラブと実際のテーブル料金 →", href: "/ja/clubs/gangnam" },
      { label: "安全・ぼったくり FAQ →", href: "/ja/faq" },
      { label: "入場ルール・ドレスコード →", href: "/ja/club-entry-rules" },
    ],
    breadcrumb: "ルームサロン vs クラブ", back: "← NightFlow", updated: "2026年9月更新",
  },

  zh: {
    title: "韩国房间沙龙 vs 夜店卡座 — 江南价格与外国人能订的选择",
    description: "韩国房间沙龙（room salon）是什么、为什么游客通常进不去、实际花费，以及你真正能订到的合法选择：江南夜店卡座 100 万韩元起、印刷酒单、会英语的 MD。NightFlow 不预订房间沙龙。",
    ogTitle: "房间沙龙 vs 夜店卡座", ogSub: "江南 · 外国人实际能订的是什么",
    keywords: ["韩国 房间沙龙", "韩国 room salon", "江南 房间沙龙", "韩国 夜总会 价格", "韩国 夜店 外国人 江南", "首尔 江南 卡座 价格"],
    eyebrow: "江南夜生活 · 能订的是什么",
    h1: "房间沙龙 vs 夜店卡座 — 江南外国人实际能订的是什么",
    intro: "如果你搜的是「韩国房间沙龙」，轮廓你已经知道了：私密包间、陪坐、威士忌套餐、江南。搜索结果没告诉你的是：大多数店不接待散客游客，没有一家公开价格。这一页说明房间沙龙是什么、为什么对游客很少行得通，以及我们真正能订的合法选择：有印刷酒单、会英语的 MD、同样热闹的江南夜店卡座。",
    sections: [
      { h2: "房间沙龙是什么", paras: [
        "房间沙龙（룸살롱，room salon）是全私密包间的韩国酒场，多数以「游兴酒店（유흥주점）」持牌：包一个房间、开威士忌套餐，有报酬的店员陪坐。类似国内的商务 KTV / 夜总会，但更封闭，价格不公开。它是韩国商务文化的一部分，这一页不是来评判它的，而是告诉你外国游客真的想去时会发生什么。",
      ]},
      { h2: "为什么对游客很少行得通", bullets: [
        "只接待熟客及其同行者，没有对外的预订渠道。",
        "几乎只用韩语运作。有些店标榜会中文或英语，但价格仍不公开，账单是当场决定的。",
        "没有印刷价格。韩国媒体和论坛反映的价位是每人 30 万到 100 万韩元以上，还没算服务费 — 但没有酒单可以约束任何人。",
        "在韩国，性交易是违法的。任何暗示这一点的店或「向导」正是游客陷入法律和金钱麻烦的地方。",
        "NightFlow 不预订房间沙龙或任何有付费陪伴的场所，也不会把你介绍给做这个的人。",
      ]},
      { h2: "我们订的是什么 — 以及为什么那是更好的夜晚", paras: [
        "江南夜店卡座给你的是人们真正想要的那些部分 — 自己的卡座、桌上的酒、照顾你的 MD、一整场为周六打扮好的人 — 但没有那扇关上的门。价格在印刷酒单上，确认前就能看到。MD 会英语。而江南的「booking」文化是店员在桌与桌之间介绍客人；没有人是拿钱来的，双方都可以拒绝。",
        "就是普通持牌夜店，公开，账单就是你同意的那个数字。",
      ]},
    ],
    compareH2: "对比",
    compare: {
      head: ["", "房间沙龙", "江南夜店卡座"],
      rows: [
        ["谁能进", "熟客及其同行者", "19 岁以上、有卡座、带护照、穿搭合乎江南标准的任何人"],
        ["价格", "按人口头报价，不公开；反映为每人 30 万〜100 万+ 韩元", `每桌 ${formatWon(GANGNAM)}（整组），按印刷酒单`],
        ["你付的是什么", "私密包间 + 付费陪坐的店员", "卡座、酒、MD、现场的人"],
        ["语言", "基本只有韩语", "会英语的 MD"],
        ["认识人", "拿钱陪坐的店员", "通过「booking」认识其他客人 — 可选、无偿、双方都可拒绝"],
        ["法律定位", "取决于店", "普通持牌夜店 — 和任何酒吧一样的规则"],
        ["NightFlow 能订吗", "不能", "能，免费申请，无押金"],
      ],
    },
    priceH2: "钱怎么比",
    priceBullets: [
      `江南卡座是每桌 ${won(GANGNAM, "zh")} 的最低消费，整组一起从夜店酒单凑满。4 个人一人约 25 万韩元 — 和房间沙龙一个人的报价相当或更低。`,
      "入场费 2〜5 万韩元，周末有时有台费。确认前我们把最终数字写给你。",
      "无押金、无中介费。当晚在夜店付款。如果夜店收你超过印刷酒单的钱，我们退 200%。",
    ],
    faqH2: "房间沙龙 — 游客常问的问题",
    faqs: [
      { q: "外国人能去韩国的房间沙龙吗？", a: "偶尔可以，作为韩国熟客的同行者。自己去的话，江南大多数房间沙龙不接待散客游客，少数标榜面向游客的店也不公开价格。NightFlow 不预订。" },
      { q: "韩国房间沙龙多少钱？", a: "没有公开价格。韩国媒体和论坛反映的价位是包间、威士忌套餐加陪坐时间每人 30 万到 100 万韩元以上，还要加服务费。没有酒单本身就是重点 — 数字是为你定的。" },
      { q: "房间沙龙合法吗？", a: "店本身多数是持牌的游兴酒店，在那里喝酒是合法的。性交易不合法，任何暗示这一点的店或中间人正是外国游客陷入麻烦的地方。我们完全不碰这个类别。" },
      { q: "夜店卡座有陪酒或付费陪伴吗？", a: "没有，也没有人应该向你承诺这个。江南夜店有 booking 文化 — 店员介绍自愿在场的客人，双方都可以拒绝。这是社交，不是服务。如果你要的是付费陪伴的场所，我们不是合适的平台。" },
    ],
    ctaH2: "改订江南卡座", ctaBody: "印刷酒单价格、会英语的 MD、无押金。我们用韩语向夜店确认，在你决定前把最终数字书面发给你。",
    cta: "🍾 预订江南卡座",
    moreH2: "相关",
    more: [
      { label: "韩国 booking 夜店 — 「booking」是什么 →", href: "/zh/gangnam-booking-club" },
      { label: "江南夜店与真实卡座价格 →", href: "/zh/clubs/gangnam" },
      { label: "安全与防坑 FAQ →", href: "/zh/faq" },
      { label: "入场规定与着装 →", href: "/zh/club-entry-rules" },
    ],
    breadcrumb: "房间沙龙 vs 夜店", back: "← NightFlow", updated: "2026 年 9 月更新",
  },

  "zh-tw": {
    title: "韓國酒店（room salon）vs 夜店桌位｜江南價格",
    description: "韓國的「酒店」（room salon）是什麼、為什麼遊客通常進不去、實際消費，以及你真正能訂到的合法選擇：江南夜店桌位 100 萬韓元起、印好的酒單、會英語的 MD。NightFlow 不代訂酒店。",
    ogTitle: "韓國酒店 vs 夜店桌位", ogSub: "江南 · 外國人實際能訂的是什麼",
    keywords: ["韓國 酒店 江南", "韓國 room salon", "江南 酒店 消費", "韓國 酒店 價格", "韓國 夜店 外國人 江南", "首爾 江南 桌位 價格", "韓國 酒店 外國人"],
    eyebrow: "江南夜生活 · 能訂的是什麼",
    h1: "韓國酒店 vs 夜店桌位 — 江南外國人實際能訂的是什麼",
    intro: "如果你搜的是「韓國 酒店」（不是飯店，是 room salon / 룸살롱），輪廓你已經知道了：密閉包廂、陪坐、威士忌套餐、江南。搜尋結果沒告訴你的是：大多數店不接待散客遊客，沒有一家公開價格。這一頁說明韓國酒店是什麼、為什麼對遊客很少行得通，以及我們真正能訂的合法選擇：有印好的酒單、會英語的 MD、同樣熱鬧的江南夜店桌位。",
    sections: [
      { h2: "韓國的「酒店」是什麼", paras: [
        "韓國酒店（룸살롱，room salon）是全密閉包廂的韓國酒場，多數以「遊興酒店（유흥주점）」持牌：包一間房、開威士忌套餐，有報酬的店員陪坐。跟台灣的酒店概念很像，但更封閉，價格不公開。它是韓國商務文化的一部分，這一頁不是來評判它的，而是告訴你外國遊客真的想去時會發生什麼。",
      ]},
      { h2: "為什麼對遊客很少行得通", bullets: [
        "只接待熟客及其同行者，沒有對外的訂位管道。",
        "幾乎只用韓語運作。有些店標榜會中文或英語，但價格仍不公開，帳單是當場決定的。",
        "沒有印好的價格。韓國媒體和論壇反映的價位是每人 30 萬到 100 萬韓元以上（約 NT$7,000〜23,000+），還沒算服務費 — 但沒有酒單可以約束任何人。",
        "在韓國，性交易是違法的。任何暗示這一點的店或「帶路的」正是遊客陷入法律和金錢麻煩的地方。",
        "NightFlow 不代訂酒店或任何有付費陪伴的場所，也不會把你介紹給做這個的人。",
      ]},
      { h2: "我們訂的是什麼 — 以及為什麼那是更好的夜晚", paras: [
        "江南夜店桌位給你的是人們真正想要的那些部分 — 自己的位子、桌上的酒、照顧你的 MD、一整場為星期六打扮好的人 — 但沒有那扇關上的門。價格在印好的酒單上，確認前就看得到。MD 會英語。而江南的「booking」文化是店員在桌與桌之間介紹客人；沒有人是拿錢來的，雙方都可以拒絕。",
        "就是一般持牌夜店，公開，帳單就是你同意的那個數字。",
      ]},
    ],
    compareH2: "比一比",
    compare: {
      head: ["", "韓國酒店", "江南夜店桌位"],
      rows: [
        ["誰能進", "熟客及其同行者", "19 歲以上、有桌位、帶護照、穿搭合乎江南標準的任何人"],
        ["價格", "按人口頭報價，不公開；反映為每人 30 萬〜100 萬+ 韓元", `每桌 ${formatWon(GANGNAM)}（整組），按印好的酒單`],
        ["你付的是什麼", "密閉包廂 + 付費陪坐的店員", "桌位、酒、MD、現場的人"],
        ["語言", "基本只有韓語", "會英語的 MD"],
        ["認識人", "拿錢陪坐的店員", "透過「booking」認識其他客人 — 可選、無償、雙方都可拒絕"],
        ["法律定位", "取決於店", "一般持牌夜店 — 和任何酒吧一樣的規則"],
        ["NightFlow 能訂嗎", "不能", "能，免費申請，免訂金"],
      ],
    },
    priceH2: "錢怎麼比",
    priceBullets: [
      `江南桌位是每桌 ${won(GANGNAM, "zh-tw")} 的低消，整組一起從夜店酒單湊滿。4 個人一人約 25 萬韓元（約 NT$5,700）— 和韓國酒店一個人的報價相當或更低。`,
      "入場費 2〜5 萬韓元，週末有時有桌位費。確認前我們把最終數字寫給你。",
      "免訂金、無中介費。當晚在夜店付款。如果夜店收你超過印好酒單的錢，我們賠 200%。",
    ],
    faqH2: "韓國酒店 — 遊客常問的問題",
    faqs: [
      { q: "外國人能去韓國的酒店（room salon）嗎？", a: "偶爾可以，作為韓國熟客的同行者。自己去的話，江南大多數酒店不接待散客遊客，少數標榜面向遊客的店也不公開價格。NightFlow 不代訂。" },
      { q: "韓國酒店多少錢？", a: "沒有公開價格。韓國媒體和論壇反映的價位是包廂、威士忌套餐加陪坐時間每人 30 萬到 100 萬韓元以上（約 NT$7,000〜23,000+），還要加服務費。沒有酒單本身就是重點 — 數字是為你定的。" },
      { q: "韓國酒店合法嗎？", a: "店本身多數是持牌的遊興酒店，在那裡喝酒是合法的。性交易不合法，任何暗示這一點的店或中間人正是外國遊客陷入麻煩的地方。我們完全不碰這個類別。" },
      { q: "夜店桌位有陪坐或付費陪伴嗎？", a: "沒有，也沒有人應該向你承諾這個。江南夜店有 booking 文化 — 店員介紹自願在場的客人，雙方都可以拒絕。這是社交，不是服務。如果你要的是付費陪伴的場所，我們不是合適的平台。" },
    ],
    ctaH2: "改訂江南桌位", ctaBody: "印好的酒單價格、會英語的 MD、免訂金。我們用韓語向夜店確認，在你決定前把最終數字書面傳給你。",
    cta: "🍾 訂江南桌位",
    moreH2: "相關",
    more: [
      { label: "韓國 booking 夜店 — 「booking」是什麼 →", href: "/zh-tw/gangnam-booking-club" },
      { label: "江南夜店與真實桌位價格 →", href: "/zh-tw/clubs/gangnam" },
      { label: "安全與防坑 FAQ →", href: "/zh-tw/faq" },
      { label: "入場規定與服裝 →", href: "/zh-tw/club-entry-rules" },
    ],
    breadcrumb: "韓國酒店 vs 夜店", back: "← NightFlow", updated: "2026 年 9 月更新",
  },
};

/* ─────────────────────────── 렌더 ─────────────────────────── */

export const GUIDE_SLUGS = { booking: "gangnam-booking-club", roomSalon: "room-salon-vs-club" } as const;
type GuideKey = keyof typeof GUIDE_SLUGS;
const COPIES: Record<GuideKey, Record<SeoLang, Copy>> = { booking: BOOKING, roomSalon: ROOM_SALON };

const OG_LOCALE: Record<SeoLang, string> = { en: "en_US", ja: "ja_JP", zh: "zh_CN", "zh-tw": "zh_TW" };
const IN_LANG: Record<SeoLang, string> = { en: "en", ja: "ja", zh: "zh-CN", "zh-tw": "zh-TW" };

export function gangnamGuideMetadata(key: GuideKey, lang: SeoLang): Metadata {
  const c = COPIES[key][lang];
  const slug = GUIDE_SLUGS[key];
  const url = `${BASE}/${lang}/${slug}`;
  const og = `${BASE}/api/og?title=${encodeURIComponent(c.ogTitle)}&sub=${encodeURIComponent(c.ogSub)}&lang=${lang}`;
  return {
    title: { absolute: c.title },
    description: c.description,
    keywords: c.keywords,
    alternates: {
      canonical: url,
      languages: {
        en: `${BASE}/en/${slug}`, "en-US": `${BASE}/en/${slug}`, "zh-CN": `${BASE}/zh/${slug}`, "zh-TW": `${BASE}/zh-tw/${slug}`, "ja-JP": `${BASE}/ja/${slug}`,
        "x-default": `${BASE}/en/${slug}`,
      },
    },
    openGraph: { title: c.title, description: c.description, url, locale: OG_LOCALE[lang], type: "article", images: [{ url: og, width: 1200, height: 630, alt: c.ogTitle }] },
  };
}

export function GangnamGuide({ guide, lang }: { guide: GuideKey; lang: SeoLang }) {
  const c = COPIES[guide][lang];
  const slug = GUIDE_SLUGS[guide];
  const url = `${BASE}/${lang}/${slug}`;
  const bookHref = `/flags/new?lang=${lang}&area=${encodeURIComponent("강남")}`;
  const og = `${BASE}/api/og?title=${encodeURIComponent(c.ogTitle)}&sub=${encodeURIComponent(c.ogSub)}&lang=${lang}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: c.h1,
        description: c.description,
        inLanguage: IN_LANG[lang],
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        articleSection: "Gangnam nightlife",
        author: { "@type": "Organization", name: "NightFlow", url: `${BASE}/${lang}` },
        publisher: { "@type": "Organization", name: "NightFlow", url: `${BASE}/${lang}` },
        mainEntityOfPage: url,
        image: og,
        about: [{ "@type": "Place", name: "Gangnam, Seoul" }],
      },
      {
        "@type": "FAQPage",
        mainEntity: c.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: `${BASE}/${lang}` },
          { "@type": "ListItem", position: 2, name: c.breadcrumb, item: url },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ForeignPageTracker kind="info" lang={lang} meta={{ page: slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4">
          <Link href={`/${lang}`} data-nf-track="breadcrumb_home" className="text-[12px] text-muted-foreground hover:text-foreground">{c.back}</Link>
          <p className="text-[12px] font-black tracking-wider text-brand-amber">{c.eyebrow}</p>
          <h1 className="text-[30px] font-black tracking-tight leading-[1.15] break-keep">{c.h1}</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">{c.intro}</p>
          <p className="text-[11px] text-muted-foreground">{c.updated}</p>
          {c.headerCta && (
            <Link data-nf-track="book_cta" href={bookHref} className="inline-block px-6 py-3 rounded-full bg-inverse text-inverse-foreground font-black text-[14px] hover:opacity-90 transition-colors">
              {c.cta}
            </Link>
          )}
        </header>

        {c.sections.map((s, idx) => (
          <section key={s.h2} className="space-y-3">
            <h2 className="text-[20px] font-black break-keep">{s.h2}</h2>
            {s.paras?.map((p, i) => <p key={i} className="text-[14px] text-muted-foreground leading-relaxed break-keep">{p}</p>)}
            {s.bullets && (
              <ul className="space-y-2">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-[14px] text-muted-foreground leading-relaxed break-keep"><span className="text-brand-amber shrink-0">•</span><span>{b}</span></li>
                ))}
              </ul>
            )}
            {/* 헤더 CTA가 없는 페이지(룸살롱)는 "대신 이걸 예약한다" 설명이 끝난 직후가 첫 CTA 자리. */}
            {!c.headerCta && idx === c.sections.length - 1 && (
              <Link data-nf-track="book_cta" href={bookHref} className="inline-block px-6 py-3 rounded-full bg-inverse text-inverse-foreground font-black text-[14px] hover:opacity-90 transition-colors">
                {c.cta}
              </Link>
            )}
          </section>
        ))}

        {c.compare && (
          <section className="space-y-3">
            {c.compareH2 && <h2 className="text-[20px] font-black">{c.compareH2}</h2>}
            <div className="overflow-x-auto rounded-2xl border border-border">
              {/* table-fixed + 열 비율 고정: break-keep이면 CJK 셀이 안 접혀 모바일에서 오른쪽 열이 잘렸다 */}
              <table className="w-full table-fixed text-[13px]">
                <colgroup><col className="w-[22%]" /><col className="w-[36%]" /><col className="w-[42%]" /></colgroup>
                <thead className="bg-card">
                  <tr>{c.compare.head.map((h, i) => <th key={i} className="text-left font-black px-3 py-2.5 break-words">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {c.compare.rows.map((r) => (
                    <tr key={r[0]}>
                      <th scope="row" className="text-left font-bold px-3 py-2.5 align-top text-muted-foreground break-words">{r[0]}</th>
                      <td className="px-3 py-2.5 align-top text-muted-foreground break-words">{r[1]}</td>
                      <td className="px-3 py-2.5 align-top text-foreground font-medium break-words">{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.priceH2}</h2>
          <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
            {c.priceBullets.map((b, i) => <li key={i} className="px-4 py-3 text-[13px] text-muted-foreground leading-relaxed break-keep">{b}</li>)}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.faqH2}</h2>
          {c.faqs.map((f) => (
            <div key={f.q}>
              <h3 className="text-[14px] font-bold text-foreground break-keep">{f.q}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-0.5">{f.a}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">{c.ctaH2}</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">{c.ctaBody}</p>
          <Link data-nf-track="book_cta" href={bookHref} className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors">
            {c.cta}
          </Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.moreH2}</h2>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            {c.more.map((m) => <li key={m.href}><Link className="hover:text-foreground" href={m.href}>{m.label}</Link></li>)}
          </ul>
        </section>
      </article>
    </div>
  );
}
