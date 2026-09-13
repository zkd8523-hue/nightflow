// /{en,ja,zh,zh-tw}/halloween-seoul-2026 — 시즌 랜딩. 외국인이 실제로 검색하는
// 몇 안 되는 시즌 키워드("itaewon halloween 2026", "ハロウィン ソウル クラブ")를 예약으로 잇는다.
// 10/31이 토요일이라 이태원·홍대·강남 전부 만석 예정 — "테이블 = 입장 보장"이 이 페이지의 논지.
//
// 하지 않는 것:
//   - 클럽별 할로윈 이벤트를 지어내지 않는다. 라인업은 각 클럽 인스타에 2주 전쯤 뜬다고만 적는다.
//   - 이태원 거리 인파 사진·2022년 언급 없음. 안전 안내는 "일찍 도착·실내·예약" 톤으로만.
//   - Event 구조화 데이터 없음(우리가 주최자가 아니다). WebPage + FAQ + 가격 ItemList만.
//
// 가격표는 vip-tables의 RealTablePrices를 그대로 쓰되 이태원→홍대→강남 순(할로윈 수요 순).

import Link from "next/link";
import type { Metadata } from "next";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { RealTablePrices, fetchRealTablePrices, realTablePricesJsonLd } from "@/components/foreign/RealTablePrices";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";
import { HALLOWEEN_2026 } from "@/lib/foreign/seasonal";

const BASE = "https://nightflow.kr";
const SLUG = HALLOWEEN_2026.slug;

type AreaCard = { name: string; tag: string; body: string; href: string };

type Copy = {
  title: string;
  description: string;
  ogTitle: string;
  ogSub: string;
  keywords: string[];
  eyebrow: string;
  h1: string;
  intro: string;
  areasH2: string;
  areas: AreaCard[];
  timelineH2: string;
  timeline: { time: string; text: string }[];
  pricesH2: string;
  pricesNote: string;
  faqH2: string;
  faqs: { q: string; a: string }[];
  ctaH2: string;
  ctaBody: string;
  cta: string;
  moreH2: string;
  more: { label: string; href: string }[];
  back: string;
  breadcrumb: string;
};

const COPY: Record<SeoLang, Copy> = {
  en: {
    title: "Seoul Halloween 2026 Clubs — Oct 31 (Sat): Itaewon, Hongdae, Gangnam Tables & Prices",
    description:
      "Halloween 2026 falls on a Saturday. Where to go out in Seoul, which clubs take table bookings, real prices from ₩500,000, and how to skip the queue. Updated as clubs announce their nights.",
    ogTitle: "Seoul Halloween 2026",
    ogSub: "Oct 31 is a Saturday — clubs, tables, real prices",
    keywords: [
      "Seoul Halloween 2026", "Itaewon Halloween 2026", "Hongdae Halloween 2026", "Gangnam Halloween club",
      "Halloween Seoul clubs", "Seoul Halloween party", "Itaewon Halloween club", "Seoul Halloween table booking",
      "Korea Halloween nightlife", "Halloween Korea 2026",
    ],
    eyebrow: "OCT 31, 2026 · SATURDAY",
    h1: "Seoul Halloween 2026 — Clubs, Tables & Prices",
    intro:
      "Halloween lands on a Saturday this year, which means every club in Itaewon, Hongdae and Gangnam will hit capacity. Walk-in queues run an hour or more after 23:00 and doors stop admitting when full. A booked table is the one thing that guarantees you get in. Here's what the night looks like, what it costs, and which clubs take bookings.",
    areasH2: "Where to go on Halloween night",
    areas: [
      {
        name: "Itaewon",
        tag: "International crowd · most costumes",
        body: "Seoul's international Halloween hub. Expect heavy crowd management on the main street and early capacity caps at venues. Go for the clubs, not the street — be inside before 22:00. Tables from ₩500,000.",
        href: "/en/clubs/itaewon",
      },
      {
        name: "Hongdae",
        tag: "Biggest crowd · student energy",
        body: "Now the largest Halloween crowd in Seoul. Free-entry clubs queue 1h+ after 23:00 and many stop entry when full. Costumes everywhere, hip-hop everywhere. Tables from ₩500,000 skip all of it.",
        href: "/en/clubs/hongdae",
      },
      {
        name: "Gangnam",
        tag: "Big EDM rooms · strictest door",
        body: "The large clubs run Halloween nights with costume crowds and the strictest door in the city. Without a table you're competing with everyone else at the entrance. Tables from ₩1,000,000.",
        href: "/en/clubs/gangnam",
      },
    ],
    timelineH2: "How the night actually runs",
    timeline: [
      { time: "20:00", text: "Dinner. Eat first — Seoul clubs don't serve food and you'll be out until morning." },
      { time: "21:30–22:30", text: "Arrive. This is the window before queues form. With a table, walk straight in." },
      { time: "23:00–01:00", text: "Peak. Queues 1h+, doors stop admitting when full. Costume masks come off at the ID check — bring your passport (19+)." },
      { time: "00:00", text: "Subway stops. Taxis get scarce after 02:00, so plan to stay until the first train (~05:30) or budget for a taxi." },
      { time: "03:00–05:00", text: "Most clubs run until 05:00–06:00. Hongdae and Itaewon have 24-hour food nearby." },
    ],
    pricesH2: "Halloween table prices — real menus",
    pricesNote:
      "Halloween weekend is weekend pricing. The minimum spend below does not change, but clubs with a table charge use the weekend rate, and some set a special Halloween minimum. We confirm the final price in writing before you commit.",
    faqH2: "Halloween in Seoul — questions people ask",
    faqs: [
      { q: "Can I get into Seoul clubs in a costume?", a: "Yes. Costumes are welcome on Halloween weekend and most clubs expect them. Masks and face coverings must come off at the ID check, and full-face masks may be refused inside. Foreigners show a passport — a photo of it is usually not accepted." },
      { q: "Do I need to book, or can I just walk in?", a: "Walk-in is possible, but on a Saturday Halloween expect 1h+ queues after 23:00 and doors that stop admitting when full. A booked table is the only thing that guarantees entry, and it comes with seating and bottles for the group." },
      { q: "When should I book a Halloween table?", a: "By October 20. Tables at the popular clubs sell out the week before, and clubs announce their Halloween nights on Instagram about two weeks out — we update this page as they do." },
      { q: "Is Itaewon safe on Halloween?", a: "The district runs heavy crowd management on Halloween night — controlled streets, police presence and early venue caps. The practical advice: arrive early, stay inside the venue rather than in the crowd on the street, and avoid narrow alleys when they get busy. Hongdae and Gangnam are less congested alternatives." },
      { q: "How much does a Halloween table cost?", a: "The same minimum spend as any weekend: ₩500,000 per table in Itaewon and Hongdae, ₩1,000,000 in Gangnam, filled from the club's own menu. Some clubs add a weekend table charge or a special Halloween minimum; we tell you the final number before you commit. No deposit, no broker fee, pay the club on the night." },
    ],
    ctaH2: "Book a Halloween table",
    ctaBody: "Pick a club (or tell us the district and group size). We confirm with the club in Korean, send you the final price in writing, and you walk in on the night. Free to request, no deposit.",
    cta: "🎃 Book for Oct 31",
    moreH2: "More",
    more: [
      { label: "All Seoul club table prices →", href: "/en/vip-tables" },
      { label: "Itaewon clubs →", href: "/en/clubs/itaewon" },
      { label: "Hongdae clubs →", href: "/en/clubs/hongdae" },
      { label: "Gangnam clubs →", href: "/en/clubs/gangnam" },
      { label: "Dress code & entry rules →", href: "/en/club-entry-rules" },
    ],
    back: "← NightFlow",
    breadcrumb: "Halloween 2026",
  },

  ja: {
    title: "ソウル ハロウィン 2026 クラブ — 10/31(土) 梨泰院・弘大・江南 テーブル予約と料金",
    description:
      "2026年のハロウィンは土曜日。ソウルでどこに行くか、テーブル予約できるクラブ、50万ウォン〜の実際の料金、行列を避ける方法。各クラブの発表に合わせて更新。",
    ogTitle: "ソウル ハロウィン 2026",
    ogSub: "10月31日は土曜日 — クラブ・テーブル・実際の料金",
    keywords: [
      "ソウル ハロウィン 2026", "梨泰院 ハロウィン 2026", "弘大 ハロウィン", "江南 ハロウィン クラブ",
      "ハロウィン ソウル クラブ", "韓国 ハロウィン 2026", "ソウル ハロウィン テーブル予約", "韓国 ハロウィン ナイトライフ",
    ],
    eyebrow: "2026年10月31日 · 土曜日",
    h1: "ソウル ハロウィン 2026 — クラブ・テーブル・料金",
    intro:
      "今年のハロウィンは土曜日。梨泰院・弘大・江南のクラブはすべて満員になります。23時以降の入場待ちは1時間以上、満員になると入場は止まります。入場を確実にする唯一の方法がテーブル予約です。当日の流れ、料金、予約できるクラブをまとめました。",
    areasH2: "ハロウィンの夜、どこに行くか",
    areas: [
      { name: "梨泰院", tag: "外国人が最多 · 仮装が最多", body: "ソウルの国際的なハロウィンの中心。メイン通りは厳しい人流管理、店は早い時間から入場制限。通りではなくクラブを目的に、22時前に店内へ。テーブル50万ウォン〜。", href: "/ja/clubs/itaewon" },
      { name: "弘大", tag: "人出が最大 · 学生の熱気", body: "今やソウル最大のハロウィンの人出。無料入場の店は23時以降1時間以上の行列、満員で入場停止も多い。仮装とヒップホップだらけ。テーブル50万ウォン〜なら全部飛ばせます。", href: "/ja/clubs/hongdae" },
      { name: "江南", tag: "大型EDM · 入口が最も厳しい", body: "大型クラブがハロウィンナイトを開催、仮装客で満員、入口の審査は市内で最も厳しい。テーブルなしでは入口で全員と競うことに。テーブル100万ウォン〜。", href: "/ja/clubs/gangnam" },
    ],
    timelineH2: "当日の実際の流れ",
    timeline: [
      { time: "20:00", text: "夕食。ソウルのクラブに食事はなく、朝まで外にいることになるので先に食べておく。" },
      { time: "21:30–22:30", text: "到着。行列ができる前の時間帯。テーブルがあればそのまま入場。" },
      { time: "23:00–01:00", text: "ピーク。行列1時間以上、満員で入場停止。仮装のマスクはID確認で外します。パスポート必携(19歳以上)。" },
      { time: "00:00", text: "地下鉄終電。2時以降はタクシーが捕まりにくいので、始発(5:30頃)まで遊ぶかタクシー代を見込む。" },
      { time: "03:00–05:00", text: "多くのクラブは5〜6時まで営業。弘大・梨泰院は近くに24時間営業の食堂あり。" },
    ],
    pricesH2: "ハロウィンのテーブル料金 — 実際のメニュー",
    pricesNote: "ハロウィン週末は週末料金です。下の最低予約金額は変わりませんが、テーブルチャージのある店は週末レート、ハロウィン特別最低額を設ける店もあります。確定前に最終価格を書面でお伝えします。",
    faqH2: "ソウルのハロウィン — よくある質問",
    faqs: [
      { q: "仮装でクラブに入れますか？", a: "はい。ハロウィン週末は仮装歓迎で、ほとんどの店が仮装を想定しています。マスクや顔を覆うものはID確認で外す必要があり、フルフェイスは店内でも断られることがあります。外国人はパスポート提示 — 写真では通らないことが多いです。" },
      { q: "予約は必要？当日行けば入れる？", a: "当日入場も可能ですが、土曜日のハロウィンは23時以降1時間以上の行列と満員での入場停止が前提です。入場を保証できるのはテーブル予約だけで、席とボトルも付きます。" },
      { q: "いつまでに予約すべき？", a: "10月20日まで。人気店のテーブルは前の週に埋まります。各クラブのハロウィンナイトはInstagramで2週間前ごろに発表され、それに合わせてこのページも更新します。" },
      { q: "ハロウィンの梨泰院は安全？", a: "当夜は厳しい人流管理が行われます — 通りの規制、警察の配置、店の早期入場制限。実際的な助言は、早く到着する、通りの人混みではなく店内にいる、混雑した細い路地を避ける、です。弘大・江南は混雑が比較的少ない選択肢です。" },
      { q: "ハロウィンのテーブルはいくら？", a: "通常の週末と同じ最低予約金額です：梨泰院・弘大は1卓50万ウォン、江南は100万ウォン、クラブのメニューから選んで埋めます。週末テーブルチャージやハロウィン特別最低額を設ける店もあり、確定前に最終金額をお伝えします。デポジットなし、仲介手数料なし、当日クラブで支払い。" },
    ],
    ctaH2: "ハロウィンのテーブルを予約",
    ctaBody: "クラブを選ぶ(またはエリアと人数だけ伝える)。私たちが韓国語でクラブに確認し、最終価格を書面で送ります。当日はそのまま入場。リクエスト無料、デポジットなし。",
    cta: "🎃 10/31を予約する",
    moreH2: "関連ページ",
    more: [
      { label: "ソウル全クラブのテーブル料金 →", href: "/ja/vip-tables" },
      { label: "梨泰院のクラブ →", href: "/ja/clubs/itaewon" },
      { label: "弘大のクラブ →", href: "/ja/clubs/hongdae" },
      { label: "江南のクラブ →", href: "/ja/clubs/gangnam" },
      { label: "ドレスコード・入場ルール →", href: "/ja/club-entry-rules" },
    ],
    back: "← NightFlow",
    breadcrumb: "ハロウィン 2026",
  },

  zh: {
    title: "首尔万圣节 2026 夜店 — 10/31（周六）梨泰院、弘大、江南卡座预订与价格",
    description:
      "2026 年万圣节是周六。首尔去哪玩、哪些夜店接受卡座预订、50 万韩元起的真实价格、怎么免排队。随各夜店公布持续更新。",
    ogTitle: "首尔万圣节 2026",
    ogSub: "10 月 31 日是周六 — 夜店、卡座、真实价格",
    keywords: [
      "首尔万圣节 2026", "梨泰院万圣节 2026", "弘大万圣节", "江南万圣节夜店",
      "万圣节首尔夜店", "韩国万圣节 2026", "首尔万圣节卡座预订", "韩国万圣节夜生活",
    ],
    eyebrow: "2026 年 10 月 31 日 · 周六",
    h1: "首尔万圣节 2026 — 夜店、卡座与价格",
    intro:
      "今年万圣节是周六，梨泰院、弘大、江南的夜店都会满场。23 点后现场排队 1 小时以上，满员即停止入场。唯一能保证进场的，是提前订好的卡座。这里整理当晚的流程、价格和可以预订的夜店。",
    areasH2: "万圣节晚上去哪",
    areas: [
      { name: "梨泰院", tag: "外国人最多 · 变装最多", body: "首尔的国际万圣节中心。主街有严格的人流管控，场地很早就限流。目标是夜店而不是街上 — 22 点前进店。卡座 50 万韩元起。", href: "/zh/clubs/itaewon" },
      { name: "弘大", tag: "人最多 · 学生氛围", body: "如今首尔万圣节人流最大的地方。免费入场的店 23 点后排队 1 小时以上，很多满员就不再放人。到处是变装和嘻哈。50 万韩元起的卡座可以全部跳过。", href: "/zh/clubs/hongdae" },
      { name: "江南", tag: "大型 EDM · 门口最严", body: "大型夜店办万圣节之夜，变装人群满场，门口审核全城最严。没有卡座就要在门口和所有人竞争。卡座 100 万韩元起。", href: "/zh/clubs/gangnam" },
    ],
    timelineH2: "当晚实际的时间线",
    timeline: [
      { time: "20:00", text: "晚餐。首尔夜店不供餐，而且你会在外面待到早上，先吃饱。" },
      { time: "21:30–22:30", text: "到场。这是排队形成前的窗口。有卡座直接进。" },
      { time: "23:00–01:00", text: "高峰。排队 1 小时以上，满员停止入场。变装面具在查证件时要摘下 — 带护照（19 岁以上）。" },
      { time: "00:00", text: "地铁停运。凌晨 2 点后很难打车，要么玩到首班车（约 5:30），要么预留打车费。" },
      { time: "03:00–05:00", text: "多数夜店营业到 5–6 点。弘大和梨泰院附近有 24 小时餐厅。" },
    ],
    pricesH2: "万圣节卡座价格 — 真实酒单",
    pricesNote: "万圣节周末按周末价。下面的最低消费不变，但有台费的店按周末费率，部分店设万圣节特别最低消费。确认前我们会书面告知最终价格。",
    faqH2: "首尔万圣节 — 常见问题",
    faqs: [
      { q: "变装可以进夜店吗？", a: "可以。万圣节周末欢迎变装，多数夜店也预期你会变装。面具和遮脸的东西在查证件时必须摘下，全脸面具在店内可能被拒。外国人出示护照 — 照片通常不被接受。" },
      { q: "需要预订吗，还是直接去？", a: "可以直接去，但周六的万圣节要做好 23 点后排队 1 小时以上、满员停止入场的准备。只有订好的卡座能保证进场，而且包含座位和酒水。" },
      { q: "万圣节卡座什么时候订？", a: "10 月 20 日前。热门夜店的卡座前一周就会订完，各夜店大约提前两周在 Instagram 公布万圣节之夜 — 我们会随之更新本页。" },
      { q: "万圣节的梨泰院安全吗？", a: "当晚会有严格的人流管控 — 街道管制、警力部署、场地提前限流。实际建议：早到、待在店内而不是街上的人群里、人多时避开狭窄小巷。弘大和江南是相对不那么拥挤的选择。" },
      { q: "万圣节卡座多少钱？", a: "和普通周末一样的最低消费：梨泰院、弘大每桌 50 万韩元，江南 100 万韩元，从夜店自己的酒单里选酒凑满。部分店加收周末台费或设万圣节特别最低消费，确认前我们会告诉你最终数字。无押金、无中介费，当晚在夜店付款。" },
    ],
    ctaH2: "预订万圣节卡座",
    ctaBody: "选一家夜店（或只告诉我们区域和人数）。我们用韩语向夜店确认，把最终价格书面发给你，当晚直接进场。免费申请，无押金。",
    cta: "🎃 预订 10/31",
    moreH2: "更多",
    more: [
      { label: "首尔全部夜店卡座价格 →", href: "/zh/vip-tables" },
      { label: "梨泰院夜店 →", href: "/zh/clubs/itaewon" },
      { label: "弘大夜店 →", href: "/zh/clubs/hongdae" },
      { label: "江南夜店 →", href: "/zh/clubs/gangnam" },
      { label: "着装与入场规定 →", href: "/zh/club-entry-rules" },
    ],
    back: "← NightFlow",
    breadcrumb: "万圣节 2026",
  },

  "zh-tw": {
    title: "首爾萬聖節 2026 夜店 — 10/31（週六）梨泰院、弘大、江南包廂預訂與價格",
    description:
      "2026 年萬聖節是星期六。首爾去哪玩、哪些夜店可以訂包廂、50 萬韓元起的真實價格、怎麼不用排隊。隨各夜店公布持續更新。",
    ogTitle: "首爾萬聖節 2026",
    ogSub: "10 月 31 日是星期六 — 夜店、包廂、真實價格",
    keywords: [
      "首爾萬聖節 2026", "梨泰院萬聖節 2026", "弘大萬聖節", "江南萬聖節夜店",
      "萬聖節首爾夜店", "韓國萬聖節 2026", "首爾萬聖節包廂", "韓國萬聖節夜生活", "首爾萬聖節 夜店 訂位",
    ],
    eyebrow: "2026 年 10 月 31 日 · 星期六",
    h1: "首爾萬聖節 2026 — 夜店、包廂與價格",
    intro:
      "今年萬聖節是星期六，梨泰院、弘大、江南的夜店全部會爆滿。23 點後現場排隊 1 小時以上，滿了就不再放人。唯一能保證進得去的，是先訂好的包廂。這裡整理當晚的流程、價格，和可以訂包廂的夜店。",
    areasH2: "萬聖節晚上要去哪",
    areas: [
      { name: "梨泰院", tag: "外國人最多 · 變裝最多", body: "首爾的國際萬聖節中心。主街有嚴格的人流管制，店家很早就限制入場。目標是夜店不是街上 — 22 點前進店。包廂 50 萬韓元起。", href: "/zh-tw/clubs/itaewon" },
      { name: "弘大", tag: "人最多 · 大學生氣氛", body: "現在首爾萬聖節人潮最大的地方。免費入場的店 23 點後排 1 小時以上，很多店滿了就不放人。到處是變裝和 Hip-hop。50 萬韓元起的包廂可以全部跳過。", href: "/zh-tw/clubs/hongdae" },
      { name: "江南", tag: "大型 EDM · 門口最嚴", body: "大型夜店辦萬聖節之夜，變裝人潮爆滿，門口審核全首爾最嚴。沒有包廂就要在門口跟所有人一起被卡。包廂 100 萬韓元起。", href: "/zh-tw/clubs/gangnam" },
    ],
    timelineH2: "當晚實際的時間線",
    timeline: [
      { time: "20:00", text: "晚餐。首爾夜店不供餐，而且你會在外面待到早上，先吃飽。" },
      { time: "21:30–22:30", text: "到場。這是排隊形成前的空檔。有包廂直接進。" },
      { time: "23:00–01:00", text: "高峰。排隊 1 小時以上，滿了停止入場。變裝面具在查證件時要拿下來 — 帶護照（19 歲以上）。" },
      { time: "00:00", text: "地鐵收班。凌晨 2 點後很難叫到計程車，要嘛玩到首班車（約 5:30），要嘛預留車資。" },
      { time: "03:00–05:00", text: "多數夜店營業到 5–6 點。弘大和梨泰院附近有 24 小時餐廳。" },
    ],
    pricesH2: "萬聖節包廂價格 — 真實酒單",
    pricesNote: "萬聖節週末算週末價。下面的低消不變，但有包廂費的店用週末費率，部分店會設萬聖節特別低消。確認前我們會書面告知最終價格。",
    faqH2: "首爾萬聖節 — 常見問題",
    faqs: [
      { q: "變裝可以進夜店嗎？", a: "可以。萬聖節週末歡迎變裝，多數夜店也預期你會變裝。面具和遮臉的東西在查證件時一定要拿下來，全臉面具在店內可能被拒。外國人出示護照 — 照片通常不收。" },
      { q: "需要先訂嗎，還是直接去？", a: "可以直接去，但星期六的萬聖節要有 23 點後排 1 小時以上、滿了就被卡在門口的心理準備。只有訂好的包廂能保證進場，而且含座位和酒。" },
      { q: "萬聖節包廂什麼時候訂？", a: "10 月 20 日前。熱門夜店的包廂前一週就會滿，各夜店大約提前兩週在 Instagram 公布萬聖節之夜 — 我們會跟著更新這一頁。" },
      { q: "萬聖節的梨泰院安全嗎？", a: "當晚會有嚴格的人流管制 — 街道管制、警力部署、店家提前限流。實際建議：早到、待在店裡而不是街上的人潮裡、人多時避開狹窄巷子。弘大和江南是相對沒那麼擠的選擇。" },
      { q: "萬聖節包廂多少錢？", a: "跟一般週末一樣的低消：梨泰院、弘大每桌 50 萬韓元，江南 100 萬韓元，從夜店自己的酒單選酒湊滿。部分店加收週末包廂費或設萬聖節特別低消，確認前我們會告訴你最終數字。免訂金、無中介費，當晚在夜店付款。" },
    ],
    ctaH2: "訂萬聖節包廂",
    ctaBody: "選一家夜店（或只告訴我們區域和人數）。我們用韓語向夜店確認，把最終價格書面傳給你，當晚直接進場。免費申請，免訂金。",
    cta: "🎃 訂 10/31",
    moreH2: "更多",
    more: [
      { label: "首爾全部夜店包廂價格 →", href: "/zh-tw/vip-tables" },
      { label: "梨泰院夜店 →", href: "/zh-tw/clubs/itaewon" },
      { label: "弘大夜店 →", href: "/zh-tw/clubs/hongdae" },
      { label: "江南夜店 →", href: "/zh-tw/clubs/gangnam" },
      { label: "服裝與入場規定 →", href: "/zh-tw/club-entry-rules" },
    ],
    back: "← NightFlow",
    breadcrumb: "萬聖節 2026",
  },
};

const OG_LOCALE: Record<SeoLang, string> = { en: "en_US", ja: "ja_JP", zh: "zh_CN", "zh-tw": "zh_TW" };

export function halloweenMetadata(lang: SeoLang): Metadata {
  const c = COPY[lang];
  const url = `${BASE}/${lang}/${SLUG}`;
  const og = `${BASE}/api/og?title=${encodeURIComponent(c.ogTitle)}&sub=${encodeURIComponent(c.ogSub)}&lang=${lang}`;
  return {
    title: { absolute: c.title },
    description: c.description,
    keywords: c.keywords,
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

// 할로윈 수요 순. vip-tables는 강남이 먼저지만 여기선 이태원·홍대가 주인공.
const AREA_ORDER = ["이태원", "홍대", "강남"];

export async function HalloweenSeoul2026({ lang }: { lang: SeoLang }) {
  const c = COPY[lang];
  const url = `${BASE}/${lang}/${SLUG}`;
  const rows = (await fetchRealTablePrices(lang)).sort(
    (a, b) => AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area),
  );
  const priceLd = realTablePricesJsonLd(rows, lang, url);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: c.title,
        description: c.description,
        inLanguage: lang === "zh-tw" ? "zh-TW" : lang === "zh" ? "zh-CN" : lang,
        about: { "@type": "Thing", name: "Halloween 2026 in Seoul" },
        temporalCoverage: HALLOWEEN_2026.date,
      },
      ...(priceLd ? [priceLd] : []),
      {
        "@type": "FAQPage",
        mainEntity: c.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
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
      <ForeignPageTracker kind="info" lang={lang} meta={{ page: SLUG }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4">
          <Link href={`/${lang}`} className="text-[12px] text-muted-foreground hover:text-foreground">{c.back}</Link>
          <p className="text-[12px] font-black tracking-wider text-brand-amber">{c.eyebrow}</p>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15] break-keep">{c.h1}</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">{c.intro}</p>
          <Link
            data-nf-track="book_cta"
            href={`/flags/new?lang=${lang}`}
            className="inline-block px-6 py-3 rounded-full bg-inverse text-inverse-foreground font-black text-[14px] hover:opacity-90 transition-colors"
          >
            {c.cta}
          </Link>
        </header>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.areasH2}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {c.areas.map((a) => (
              <Link key={a.href} href={a.href} data-nf-track="area_card" className="rounded-2xl bg-card border border-border p-4 hover:border-amber-500/40 transition-colors flex flex-col">
                <h3 className="text-[16px] font-black">{a.name}</h3>
                <p className="text-[11px] font-bold text-brand-amber mt-0.5">{a.tag}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-2 flex-1">{a.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.timelineH2}</h2>
          <ol className="rounded-2xl border border-border bg-card divide-y divide-border">
            {c.timeline.map((s) => (
              <li key={s.time} className="grid grid-cols-[92px_1fr] gap-3 px-4 py-3">
                <span className="text-[13px] font-black tabular-nums text-brand-amber">{s.time}</span>
                <span className="text-[13px] text-muted-foreground leading-relaxed break-keep">{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.pricesH2}</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">{c.pricesNote}</p>
          {/* 이 안에 자체 h2("What a table actually costs")가 하나 더 있다 — 가격표 섹션의 제목이라 그대로 둔다 */}
          <RealTablePrices lang={lang} rows={rows} />
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
          <Link
            data-nf-track="book_cta"
            href={`/flags/new?lang=${lang}`}
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors"
          >
            {c.cta}
          </Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.moreH2}</h2>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            {c.more.map((m) => (
              <li key={m.href}><Link className="hover:text-foreground" href={m.href}>{m.label}</Link></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
