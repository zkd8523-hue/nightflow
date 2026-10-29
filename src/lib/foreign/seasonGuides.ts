// 시즌·상황별 안내 페이지 문구(2026-10-20). 렌더는 components/foreign/SeasonGuide.tsx.
//
// 왜 이 세 페이지인가(9/7~10/20 외국인 데이터):
//   - 예약 요청은 거의 전부 4~10명 단체·100만~200만 원이었다. 혼자 온 여행자가 아니라
//     생일·총각파티·출장 단체가 진짜 고객이다 → 단체/생일 페이지.
//   - 할로윈 페이지가 2주 만에 구글 유입 5 → 19로 컸다. 날짜가 정해진 시즌 검색은
//     예약 의도가 있다 → 크리스마스·신년. 색인에 몇 주 걸리니 10월에 올린다.
//
// 사실 규칙:
//   - 날짜·요일은 확인값: 2026-12-24 목, 12-25 금(공휴일), 12-31 목, 2027-01-01 금(공휴일).
//   - 가격은 외국인 예약 하한(tablePricing.FOREIGN_TABLE_FLOOR): 강남 140만, 홍대·이태원 50만.
//     홍대 일부(La Rosa)는 15만 — "일부 클럽은 더 낮다"로만 쓴다. 하한이 바뀌면 여기 숫자도 바꾼다.
//   - 클럽별 시즌 이벤트·특별 가격은 모른다 → "클럽이 따로 정할 수 있고, 확정 전에 알려드린다".
//   - 대만·홍콩 표현(project_tw_community_vocab): 包廂·低消·公關·被卡.

import type { SeasonGuideConfig } from "@/components/foreign/SeasonGuide";

// ─────────────────────────────────────────────────────────────────────────────
// 크리스마스 2026 — 12/24(목) 이브, 12/25(금) 공휴일 → 목~일 긴 주말
// ─────────────────────────────────────────────────────────────────────────────
export const CHRISTMAS_2026: SeasonGuideConfig = {
  slug: "christmas-seoul",
  about: "Christmas 2026 in Seoul",
  temporalCoverage: "2026-12-24/2026-12-27",
  areaOrder: ["강남", "홍대", "이태원"],
  copy: {
    en: {
      title: "Seoul Christmas Eve 2026 Clubs — Table Prices & Booking (Dec 24–25)",
      description:
        "Christmas Eve 2026 is a Thursday and Christmas Day (Fri) is a public holiday in Korea — a four-night weekend. Which Seoul clubs take table bookings, real prices from ₩500,000, and when to book.",
      ogTitle: "Seoul Christmas 2026",
      ogSub: "Dec 24 (Thu) – 27 (Sun) · club tables, real prices",
      keywords: [
        "Seoul Christmas 2026", "Christmas Eve Seoul club", "Gangnam club Christmas", "Hongdae Christmas party",
        "Itaewon Christmas", "Seoul Christmas party table", "Korea Christmas nightlife", "Christmas in Seoul 2026",
      ],
      eyebrow: "DEC 24–27, 2026 · THU–SUN",
      h1: "Seoul Christmas 2026 — Clubs, Tables & Prices",
      intro:
        "In Korea, Christmas Eve is a going-out night, not a family night — the clubs in Gangnam, Hongdae and Itaewon are some of the busiest of the year. In 2026 Christmas Eve is a Thursday and Christmas Day (Friday) is a public holiday, so the busy stretch runs Thursday to Sunday. If you're coming as a group, a booked table is what gets everyone in together and gives you somewhere to sit. Here's how the nights run, what a table costs, and which clubs we can book.",
      areasH2: "Where to go over Christmas",
      areas: [
        { name: "Gangnam", tag: "Big rooms · strictest door", body: "Large EDM clubs and the strictest door policy in Seoul. On Christmas Eve the entrance is where groups get split up or turned away — a table avoids that. Tables from ₩1,400,000.", href: "/en/clubs/gangnam" },
        { name: "Hongdae", tag: "Biggest crowd · hip-hop", body: "The most clubs in one area and the youngest crowd. Free-entry clubs fill early on Christmas Eve. Tables from ₩500,000, some clubs lower.", href: "/en/clubs/hongdae" },
        { name: "Itaewon", tag: "International crowd", body: "Seoul's most international nightlife — easiest place to go out in English. Tables from ₩500,000.", href: "/en/clubs/itaewon" },
      ],
      stepsH2: "How Christmas weekend runs",
      steps: [
        { time: "Dec 24 (Thu)", text: "Christmas Eve — the main night. Arrive by 22:00–22:30 if you want to walk in; with a table, come when you like." },
        { time: "Dec 25 (Fri)", text: "Public holiday in Korea. Christmas night plus a Friday — another full night." },
        { time: "Dec 26 (Sat)", text: "Regular weekend night with holiday crowds. Clubs with a table charge may use weekend pricing." },
        { time: "Getting home", text: "The subway stops around midnight and taxis are scarce after 02:00 on holiday nights. Most clubs run until 05:00–06:00, so many groups stay until the first train." },
      ],
      pricesH2: "Christmas table prices — real menus",
      pricesNote:
        "These are the clubs' printed menus. The minimum spend per table normally stays the same over Christmas, but clubs with a table charge may use the weekend rate, and a club can set a special holiday minimum. If it does, we tell you the final number in writing before you commit.",
      faqH2: "Christmas in Seoul — questions people ask",
      faqs: [
        { q: "Is Christmas a public holiday in Korea?", a: "Yes. December 25 is a public holiday in South Korea. In 2026 it falls on a Friday, so Christmas Eve (Thursday) through Sunday is one long weekend for going out." },
        { q: "Is Christmas a big night for clubs in Seoul?", a: "Yes. In Korea Christmas Eve is a night out with friends or a date, so clubs in Gangnam, Hongdae and Itaewon are among their busiest of the year. In 2026 Christmas Eve is a Thursday and Christmas Day is a Friday public holiday, so expect busy nights from Thursday through Sunday." },
        { q: "Do I need to book a table for Christmas Eve?", a: "You can walk in, but on Christmas Eve popular clubs fill early and the door can stop admitting or split up large groups. A booked table means the group goes in together — as long as everyone meets the age, passport and dress rules — with seating and bottles for the night." },
        { q: "How much is a club table on Christmas in Seoul?", a: "The minimum spend is ₩1,400,000 per table in Gangnam and ₩500,000 in Hongdae and Itaewon (a few Hongdae clubs are lower), filled from the club's own menu. A table is shared, so for a group of 8 in Gangnam that's about ₩175,000 each. No deposit, no broker fee — you pay the club on the night." },
        { q: "When should I book?", a: "Two to three weeks ahead for Christmas Eve, earlier for groups of 8 or more. Clubs post their Christmas line-ups on Instagram closer to the date." },
        { q: "Can foreigners get in? What do I need?", a: "Yes. Clubs are 19+ (in 2026: born 2007 or earlier) and foreigners must show a physical passport at the door. Gangnam has the strictest dress code — no shorts, tank tops or slides." },
      ],
      ctaH2: "Book a Christmas table",
      ctaBody: "Tell us the date, group size and district (or one of the clubs we book). We confirm with the club in Korean, send you the final price in writing, and you walk in on the night. Free to request, no deposit.",
      cta: "🎄 Book for Christmas",
      ctaNote: "Free to request · No deposit · You pay the club on the night",
      datesH: "Which night?",
      dates: [
        { date: "2026-12-24", label: "Thu, Dec 24 · Eve" },
        { date: "2026-12-25", label: "Fri, Dec 25 · Christmas" },
        { date: "2026-12-26", label: "Sat, Dec 26" },
      ],
      otherDate: "Another date →",
      moreH2: "More",
      more: [
        { label: "New Year's Eve 2026 in Seoul →", href: "/en/new-years-eve-seoul" },
        { label: "Birthday & group tables →", href: "/en/group-table-seoul" },
        { label: "All Seoul club table prices →", href: "/en/vip-tables" },
        { label: "Dress code & entry rules →", href: "/en/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "Christmas 2026",
    },
    ja: {
      title: "ソウル クリスマス 2026 クラブ — 12/24(木)・25(金) テーブル予約と料金",
      description:
        "2026年のクリスマスイブは木曜日、クリスマス当日(金)は韓国の祝日。木〜日の4連夜です。テーブル予約できるソウルのクラブ、50万ウォン〜の実際の料金、予約のタイミング。",
      ogTitle: "ソウル クリスマス 2026",
      ogSub: "12/24(木)〜27(日) · クラブのテーブルと実際の料金",
      keywords: [
        "ソウル クリスマス 2026", "クリスマスイブ ソウル クラブ", "江南 クラブ クリスマス", "弘大 クリスマス",
        "梨泰院 クリスマス", "韓国 クリスマス ナイトライフ", "ソウル クラブ テーブル予約",
      ],
      eyebrow: "2026年12月24日〜27日 · 木〜日",
      h1: "ソウル クリスマス 2026 — クラブ・テーブル・料金",
      intro:
        "韓国のクリスマスイブは家族ではなく友人や恋人と出かける夜。江南・弘大・梨泰院のクラブは一年で最も混む夜のひとつです。2026年はイブが木曜日、クリスマス当日(金)が祝日なので、木曜から日曜まで混雑が続きます。グループで行くなら、全員一緒に入れて座る場所も確保できるのがテーブル予約です。",
      areasH2: "クリスマスはどこに行く？",
      areas: [
        { name: "江南", tag: "大型クラブ · 入口が最も厳しい", body: "大型EDMクラブと市内で最も厳しい入口審査。イブは入口でグループが分かれたり断られたりしやすい夜。テーブルならその心配がありません。1卓140万ウォン〜。", href: "/ja/clubs/gangnam" },
        { name: "弘大", tag: "人出が最大 · ヒップホップ", body: "クラブの数が最も多く、客層も若いエリア。無料入場の店はイブは早くに満員。1卓50万ウォン〜、さらに安い店も。", href: "/ja/clubs/hongdae" },
        { name: "梨泰院", tag: "外国人が多い", body: "ソウルで最も国際的なエリア。英語でも遊びやすい。1卓50万ウォン〜。", href: "/ja/clubs/itaewon" },
      ],
      stepsH2: "クリスマスの4日間",
      steps: [
        { time: "12/24(木)", text: "イブ — 一番混む夜。テーブルなしで入るなら22時〜22時半までに到着。テーブルがあれば好きな時間に。" },
        { time: "12/25(金)", text: "韓国の祝日。クリスマス当日の夜で金曜日 — こちらも満員になる夜です。" },
        { time: "12/26(土)", text: "連休中の通常の週末。テーブルチャージがある店は週末料金の場合あり。" },
        { time: "帰り方", text: "地下鉄は0時ごろ終了、祝日の夜は2時以降タクシーがつかまりにくい。多くのクラブは5〜6時まで営業なので、始発まで残るグループが多いです。" },
      ],
      pricesH2: "クリスマスのテーブル料金 — 実際のメニュー",
      pricesNote:
        "クラブの実際のメニューです。1卓あたりの最低予約金額はクリスマスも通常は同じですが、テーブルチャージがある店は週末料金になる場合があり、店が祝日限定の最低金額を設定する場合もあります。その場合は確定前に最終金額を書面（メッセージ）でお知らせします。",
      faqH2: "ソウルのクリスマス — よくある質問",
      faqs: [
        { q: "韓国ではクリスマスは祝日ですか？", a: "はい。12月25日は韓国の祝日です。2026年は金曜日なので、イブ(木)から日曜までが遊びに出かける長い週末になります。" },
        { q: "ソウルのクリスマスはクラブが混みますか？", a: "はい。韓国ではクリスマスイブは友人や恋人と出かける夜なので、江南・弘大・梨泰院のクラブは一年で最も混む夜のひとつです。2026年はイブが木曜、25日(金)が祝日のため、木曜から日曜まで混雑します。" },
        { q: "イブはテーブル予約が必要ですか？", a: "当日入場もできますが、イブは人気店が早くに満員になり、入口で入場が止まったり大人数のグループが分けられたりします。テーブル予約ならグループ全員で一緒に入れて（年齢・パスポート・服装の条件を満たしていれば）、席とボトルも確保できます。" },
        { q: "クリスマスのテーブル料金はいくら？", a: "1卓あたり江南140万ウォン、弘大・梨泰院50万ウォン（弘大の一部はさらに安い）から、クラブ自身のメニューで組みます。テーブルはグループで割るので、江南で8人なら1人あたり約17.5万ウォン。デポジット・仲介手数料なし、当日クラブでお支払い。" },
        { q: "いつまでに予約すべき？", a: "イブは2〜3週間前、8人以上のグループはもっと早めに。各クラブのクリスマスのラインナップは日が近づくとインスタで発表されます。" },
        { q: "外国人も入れますか？必要なものは？", a: "入れます。クラブは19歳以上（2026年は2007年以前生まれ）で、外国人はパスポート原本が必要です。江南は服装が最も厳しく、短パン・タンクトップ・サンダルは不可。" },
      ],
      ctaH2: "クリスマスのテーブルを予約",
      ctaBody: "日程・人数・エリア（または掲載クラブ）を送るだけ。クラブに韓国語で確認して最終金額を書面（メッセージ）でお送りし、当日はそのまま入場。申し込み無料、デポジット不要。",
      cta: "🎄 クリスマスのテーブルを予約",
      ctaNote: "申し込み無料 · デポジット不要 · 当日クラブでお支払い",
      datesH: "どの夜？",
      dates: [
        { date: "2026-12-24", label: "12/24(木) イブ" },
        { date: "2026-12-25", label: "12/25(金) 祝日" },
        { date: "2026-12-26", label: "12/26(土)" },
      ],
      otherDate: "別の日程 →",
      moreH2: "もっと見る",
      more: [
        { label: "ソウル 大晦日・カウントダウン 2026 →", href: "/ja/new-years-eve-seoul" },
        { label: "誕生日・グループのテーブル →", href: "/ja/group-table-seoul" },
        { label: "ソウルのクラブ テーブル料金一覧 →", href: "/ja/vip-tables" },
        { label: "ドレスコード・入場ルール →", href: "/ja/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "クリスマス 2026",
    },
    zh: {
      title: "首尔圣诞节 2026 夜店 — 12/24(周四)・25(周五) 卡座预订与价格",
      description:
        "2026 年平安夜是周四，圣诞节当天(周五)是韩国公休日，连续四晚。哪些首尔夜店能订卡座、50 万韩元起的真实价格、什么时候订。",
      ogTitle: "首尔圣诞节 2026",
      ogSub: "12/24(周四)–27(周日) · 夜店卡座与真实价格",
      keywords: [
        "首尔 圣诞节 2026", "首尔 平安夜 夜店", "江南 夜店 圣诞", "弘大 圣诞节", "梨泰院 圣诞",
        "韩国 圣诞 夜生活", "首尔 夜店 订卡座",
      ],
      eyebrow: "2026 年 12 月 24–27 日 · 周四至周日",
      h1: "首尔圣诞节 2026 — 夜店、卡座与价格",
      intro:
        "在韩国，平安夜不是家庭夜，而是和朋友、情侣出去玩的夜晚 — 江南、弘大、梨泰院的夜店是一年里最满的几晚之一。2026 年平安夜是周四，圣诞节(周五)是公休日，所以周四到周日都很热闹。一群人去的话，订卡座才能保证全员一起进场、有地方坐。",
      areasH2: "圣诞节去哪里",
      areas: [
        { name: "江南", tag: "大型夜店 · 门口最严", body: "大型 EDM 夜店，首尔门口审核最严。平安夜最容易在门口被拆散或拒绝，订卡座就没有这个问题。每桌 140 万韩元起。", href: "/zh/clubs/gangnam" },
        { name: "弘大", tag: "人最多 · 嘻哈", body: "夜店最多、客群最年轻的区域。免费入场的店平安夜很早就满。每桌 50 万韩元起，部分更低。", href: "/zh/clubs/hongdae" },
        { name: "梨泰院", tag: "外国人多", body: "首尔最国际化的夜生活区，用英文也好玩。每桌 50 万韩元起。", href: "/zh/clubs/itaewon" },
      ],
      stepsH2: "圣诞四天怎么过",
      steps: [
        { time: "12/24(周四)", text: "平安夜 — 最满的一晚。不订位想直接进，22:00–22:30 前到；有卡座随时来。" },
        { time: "12/25(周五)", text: "韩国公休日。圣诞当晚又是周五 — 也会满。" },
        { time: "12/26(周六)", text: "连假中的普通周末。有台费的店可能按周末价。" },
        { time: "怎么回去", text: "地铁 0 点左右停运，假日夜里 2 点后很难打到车。大多数夜店营业到 5–6 点，很多人待到首班车。" },
      ],
      pricesH2: "圣诞卡座价格 — 真实酒单",
      pricesNote:
        "以下是夜店的真实酒单。每桌最低消费圣诞期间通常不变，但有台费的店可能按周末价，夜店也可能设节日特别低消。如果有，确认前我们会把最终金额书面告诉你。",
      faqH2: "首尔圣诞 — 常见问题",
      faqs: [
        { q: "圣诞节在韩国放假吗？", a: "放。12 月 25 日是韩国公休日。2026 年是周五，所以平安夜(周四)到周日是一个出去玩的长周末。" },
        { q: "首尔圣诞节夜店人多吗？", a: "很多。韩国的平安夜是和朋友或情侣出去的夜晚，江南、弘大、梨泰院的夜店是一年里最满的几晚之一。2026 年平安夜是周四、25 日(周五)公休，周四到周日都会很满。" },
        { q: "平安夜一定要订卡座吗？", a: "可以直接去排队，但平安夜热门夜店很早就满，门口可能停止入场或把人多的团拆开。订卡座就能全员一起进场(年龄、护照、着装符合规定即可)，还有座位和酒。" },
        { q: "圣诞节卡座多少钱？", a: "每桌最低消费江南 140 万韩元、弘大和梨泰院 50 万韩元(弘大部分更低)，用夜店自己的酒单凑满。卡座大家分摊，江南 8 个人每人约 17.5 万韩元。无订金、无中介费，当晚在夜店付款。" },
        { q: "什么时候订？", a: "平安夜提前 2–3 周，8 人以上的团更早。各夜店的圣诞阵容会在临近时发在 Instagram。" },
        { q: "外国人能进吗？要带什么？", a: "能。夜店 19 岁以上(2026 年为 2007 年及以前出生)，外国人要带护照原件。江南着装最严，不能穿短裤、背心、拖鞋。" },
      ],
      ctaH2: "预订圣诞卡座",
      ctaBody: "告诉我们日期、人数和区域(或我们列表上的夜店)。我们用韩语向夜店确认，把最终价格书面发给你，当晚直接进场。免费申请，无订金。",
      cta: "🎄 预订圣诞",
      ctaNote: "免费申请 · 无订金 · 当晚在夜店付款",
      datesH: "哪一晚？",
      dates: [
        { date: "2026-12-24", label: "12/24(周四) 平安夜" },
        { date: "2026-12-25", label: "12/25(周五) 圣诞" },
        { date: "2026-12-26", label: "12/26(周六)" },
      ],
      otherDate: "其他日期 →",
      moreH2: "更多",
      more: [
        { label: "首尔跨年 2026 →", href: "/zh/new-years-eve-seoul" },
        { label: "生日/团体卡座 →", href: "/zh/group-table-seoul" },
        { label: "首尔夜店卡座价格一览 →", href: "/zh/vip-tables" },
        { label: "着装与入场规定 →", href: "/zh/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "圣诞节 2026",
    },
    "zh-tw": {
      title: "首爾聖誕節 2026 夜店 — 12/24(週四)・25(週五) 包廂預訂與價格",
      description:
        "2026 年平安夜是週四，聖誕節當天(週五)是韓國國定假日，連續四晚。哪些首爾夜店能訂包廂、50 萬韓元起的真實低消、什麼時候訂。",
      ogTitle: "首爾聖誕節 2026",
      ogSub: "12/24(週四)–27(週日) · 夜店包廂與真實價格",
      keywords: [
        "首爾 聖誕節 2026", "首爾 平安夜 夜店", "江南 夜店 聖誕", "弘大 聖誕節", "梨泰院 聖誕",
        "韓國 聖誕 夜生活", "首爾 夜店 訂包廂", "首爾 夜店 低消",
      ],
      eyebrow: "2026 年 12 月 24–27 日 · 週四至週日",
      h1: "首爾聖誕節 2026 — 夜店、包廂與價格",
      intro:
        "在韓國，平安夜不是家庭夜，而是跟朋友、另一半出去玩的晚上 — 江南、弘大、梨泰院的夜店是一年裡最滿的幾晚之一。2026 年平安夜是週四，聖誕節(週五)是國定假日，所以週四到週日都很熱鬧。一群人去的話，訂包廂最能確保大家一起進場、不用擔心在門口被卡(年齡、護照、服裝符合規定即可)，也有位子坐。",
      areasH2: "聖誕節去哪裡",
      areas: [
        { name: "江南", tag: "大型夜店 · 門口最嚴", body: "大型 EDM 夜店，首爾門口審核最嚴。平安夜最容易在門口被卡或整團被拆開，有包廂就不用擔心。每桌低消 140 萬韓元起。", href: "/zh-tw/clubs/gangnam" },
        { name: "弘大", tag: "人最多 · 嘻哈", body: "夜店最多、客群最年輕的區域。免費入場的店平安夜很早就滿。每桌低消 50 萬韓元起，部分更低。", href: "/zh-tw/clubs/hongdae" },
        { name: "梨泰院", tag: "外國人多", body: "首爾最國際化的夜生活區，講英文也好玩。每桌低消 50 萬韓元起。", href: "/zh-tw/clubs/itaewon" },
      ],
      stepsH2: "聖誕四天怎麼玩",
      steps: [
        { time: "12/24(週四)", text: "平安夜 — 最滿的一晚。不訂位想直接進，22:00–22:30 前到；有包廂隨時來。" },
        { time: "12/25(週五)", text: "韓國國定假日。聖誕當晚又是週五 — 一樣會滿。" },
        { time: "12/26(週六)", text: "連假中的一般週末。有包廂費的店可能算週末價。" },
        { time: "怎麼回去", text: "地鐵 0 點左右收班，假日晚上 2 點後很難叫車。多數夜店開到 5–6 點，很多人待到首班車。" },
      ],
      pricesH2: "聖誕包廂價格 — 真實酒單",
      pricesNote:
        "以下是夜店的真實酒單。每桌低消聖誕期間通常不變，但有包廂費的店可能算週末價，夜店也可能設節日特別低消。這裡的「包廂」指夜店內的桌位(開放式)，不是獨立房間。如果有，確認前我們會把最終金額書面告訴你。",
      faqH2: "首爾聖誕 — 常見問題",
      faqs: [
        { q: "聖誕節在韓國放假嗎？", a: "有。12 月 25 日是韓國國定假日。2026 年是週五，所以平安夜(週四)到週日是出去玩的長週末。" },
        { q: "首爾聖誕節夜店人多嗎？", a: "很多。韓國的平安夜是跟朋友或另一半出去的晚上，江南、弘大、梨泰院的夜店是一年裡最滿的幾晚之一。2026 年平安夜是週四、25 日(週五)放假，週四到週日都會很滿。" },
        { q: "平安夜一定要訂包廂嗎？", a: "可以直接去排，但平安夜熱門夜店很早就滿，門口可能停止入場，人多的團也容易被卡或被拆開。訂包廂就能整團一起進場(年齡、護照、服裝符合規定即可)，還有位子和酒。" },
        { q: "聖誕節包廂多少錢？", a: "每桌低消江南 140 萬韓元、弘大和梨泰院 50 萬韓元(弘大部分更低)，從夜店自己的酒單湊滿。包廂大家分攤，江南 8 個人每人約 17.5 萬韓元。免訂金、無中介費，當晚在夜店付款。" },
        { q: "什麼時候訂？", a: "平安夜提前 2–3 週，8 人以上的團更早。各夜店的聖誕陣容會在接近時發在 Instagram。" },
        { q: "外國人能進嗎？要帶什麼？", a: "可以。夜店 19 歲以上(2026 年為 2007 年(含)以前出生)，外國人要帶護照正本。江南服裝最嚴，不能穿短褲、背心、拖鞋。" },
      ],
      ctaH2: "訂聖誕包廂",
      ctaBody: "告訴我們日期、人數和區域(或我們列表上的夜店)。我們用韓文跟夜店確認，把最終價格書面傳給你，當晚直接進場。免費申請，免訂金。",
      cta: "🎄 訂聖誕節",
      ctaNote: "免費申請 · 免訂金 · 當晚在夜店付款",
      datesH: "哪一晚？",
      dates: [
        { date: "2026-12-24", label: "12/24(週四) 平安夜" },
        { date: "2026-12-25", label: "12/25(週五) 聖誕" },
        { date: "2026-12-26", label: "12/26(週六)" },
      ],
      otherDate: "其他日期 →",
      moreH2: "更多",
      more: [
        { label: "首爾跨年 2026 →", href: "/zh-tw/new-years-eve-seoul" },
        { label: "慶生/團體包廂 →", href: "/zh-tw/group-table-seoul" },
        { label: "首爾夜店包廂價格一覽 →", href: "/zh-tw/vip-tables" },
        { label: "服裝與入場規定 →", href: "/zh-tw/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "聖誕節 2026",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 신년 2026→2027 — 12/31(목) 카운트다운, 1/1(금) 공휴일
// ─────────────────────────────────────────────────────────────────────────────
export const NYE_2026: SeasonGuideConfig = {
  slug: "new-years-eve-seoul",
  about: "New Year's Eve 2026 in Seoul",
  temporalCoverage: "2026-12-31/2027-01-02",
  areaOrder: ["강남", "홍대", "이태원"],
  copy: {
    en: {
      title: "Seoul New Year's Eve 2026–27 Clubs — Countdown Tables & Prices (Dec 31)",
      description:
        "New Year's Eve 2026 is a Thursday and Jan 1 (Fri) is a public holiday in Korea. Where to count down in a Seoul club, which clubs take table bookings, real prices from ₩500,000, and getting home.",
      ogTitle: "Seoul New Year's Eve 2026",
      ogSub: "Dec 31 (Thu) countdown · club tables, real prices",
      keywords: [
        "Seoul New Year's Eve 2026", "Seoul NYE club", "Gangnam New Year's Eve party", "Hongdae countdown",
        "Itaewon New Year's Eve", "Seoul countdown party 2027", "New Year's Eve Korea club", "Seoul NYE table booking",
      ],
      eyebrow: "DEC 31, 2026 · THURSDAY",
      h1: "Seoul New Year's Eve 2026 — Countdown Clubs, Tables & Prices",
      intro:
        "New Year's Eve falls on a Thursday this year, and January 1 (Friday) is a public holiday — so the night runs late and the weekend follows straight after. Seoul's clubs count down at midnight and keep going until morning. If you want to be inside, together, when the clock hits 00:00, the safest way is a booked table: no queue at 23:30 and a place for the whole group. Here's how the night runs, what it costs, and which clubs we can book.",
      areasH2: "Where to count down",
      areas: [
        { name: "Gangnam", tag: "Big countdown rooms", body: "The large EDM clubs make the countdown the peak of the night — and have the strictest door. Get in well before midnight or book a table. Tables from ₩1,400,000.", href: "/en/clubs/gangnam" },
        { name: "Hongdae", tag: "Most clubs · hip-hop", body: "The most clubs in one area, the youngest crowd, and queues that build fast before midnight. Tables from ₩500,000, some clubs lower.", href: "/en/clubs/hongdae" },
        { name: "Itaewon", tag: "International crowd", body: "The easiest place to count down in English, with a mixed international crowd. Tables from ₩500,000.", href: "/en/clubs/itaewon" },
      ],
      stepsH2: "How the night runs",
      steps: [
        { time: "21:00", text: "Dinner. Clubs don't serve food and this will be a long night." },
        { time: "22:00–23:00", text: "Arrive. Queues build fast in the hour before midnight; inside by 23:00 is the safe plan. With a table, walk straight in." },
        { time: "00:00", text: "Countdown inside the club." },
        { time: "After", text: "Most clubs run until 05:00–06:00. Taxis are very hard to find right after midnight, so many groups stay until the first trains." },
      ],
      pricesH2: "New Year's Eve table prices — real menus",
      pricesNote:
        "These are the clubs' printed menus. The minimum spend per table normally stays the same, but New Year's Eve is the night a club is most likely to set a special event minimum or table charge. If it does, we tell you the final number in writing before you commit.",
      faqH2: "New Year's Eve in Seoul — questions people ask",
      faqs: [
        { q: "Do Seoul clubs do a New Year's countdown?", a: "Most do. Clubs in Gangnam, Hongdae and Itaewon generally count down at midnight and keep the party going until 05:00–06:00. Line-ups are announced on each club's Instagram closer to the date." },
        { q: "Should I book a table for New Year's Eve?", a: "If you want to be inside at midnight, yes. Queues build quickly between 23:00 and midnight and the door can stop admitting when full. A table means no queue and seating for the group." },
        { q: "How much is a New Year's Eve table in Seoul?", a: "From ₩1,400,000 per table in Gangnam and ₩500,000 in Hongdae and Itaewon (a few Hongdae clubs lower), filled from the club's menu. Split across a group of 8 in Gangnam that's about ₩175,000 each. Some clubs set a special minimum for this night — we confirm the final price in writing first. No deposit, pay the club on the night." },
        { q: "How do I get home after midnight?", a: "Plan for it. Taxis are very hard to get right after midnight on New Year's Eve. Most groups either stay until the first subway (around 05:30) or wait until 03:00–04:00 when taxis free up." },
        { q: "When should I book?", a: "At least three weeks ahead, earlier for groups of 8 or more — New Year's Eve tables go early." },
      ],
      ctaH2: "Book a New Year's Eve table",
      ctaBody: "Tell us your group size and district (or one of the clubs we book). We confirm with the club in Korean, send you the final price in writing, and you walk in on the night. Free to request, no deposit.",
      cta: "🥂 Book for Dec 31",
      ctaNote: "Free to request · No deposit · You pay the club on the night",
      datesH: "Which night?",
      dates: [
        { date: "2026-12-31", label: "Thu, Dec 31 · Countdown" },
        { date: "2027-01-01", label: "Fri, Jan 1 · Holiday" },
        { date: "2027-01-02", label: "Sat, Jan 2" },
      ],
      otherDate: "Another date →",
      moreH2: "More",
      more: [
        { label: "Christmas 2026 in Seoul →", href: "/en/christmas-seoul" },
        { label: "Birthday & group tables →", href: "/en/group-table-seoul" },
        { label: "All Seoul club table prices →", href: "/en/vip-tables" },
        { label: "Dress code & entry rules →", href: "/en/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "New Year's Eve 2026",
    },
    ja: {
      title: "ソウル 年越し・大晦日 2026→2027 クラブ — 12/31(木) カウントダウンのテーブル予約と料金",
      description:
        "2026年の大晦日は木曜日、1月1日(金)は韓国の祝日。ソウルのクラブでカウントダウンするなら — テーブル予約できるクラブ、50万ウォン〜の実際の料金、帰り方。",
      ogTitle: "ソウル 大晦日 2026",
      ogSub: "12/31(木) カウントダウン · テーブルと実際の料金",
      keywords: [
        "ソウル 大晦日 2026", "ソウル カウントダウン クラブ", "江南 カウントダウン", "弘大 カウントダウン",
        "梨泰院 年越し", "韓国 年越し クラブ", "ソウル 年越し テーブル予約",
      ],
      eyebrow: "2026年12月31日 · 木曜日",
      h1: "ソウル 年越しカウントダウン 2026→2027 — クラブ・テーブル・料金",
      intro:
        "今年の大晦日は木曜日、1月1日(金)は祝日なので、夜は遅くまで続きそのまま週末に入ります。ソウルのクラブは0時にカウントダウンして朝まで営業。0時の瞬間にグループ全員で店内にいたいなら、23時半の行列に並ばずに入れるテーブル予約が一番確実です。",
      areasH2: "どこでカウントダウンする？",
      areas: [
        { name: "江南", tag: "大型カウントダウン", body: "大型EDMクラブはカウントダウンが一番の盛り上がり。入口は市内で最も厳しいので、0時のかなり前に入るかテーブル予約を。1卓140万ウォン〜。", href: "/ja/clubs/gangnam" },
        { name: "弘大", tag: "クラブ最多 · ヒップホップ", body: "クラブの数が最も多く、0時前は行列が一気に伸びます。1卓50万ウォン〜、さらに安い店も。", href: "/ja/clubs/hongdae" },
        { name: "梨泰院", tag: "外国人が多い", body: "英語でもカウントダウンしやすい国際的なエリア。1卓50万ウォン〜。", href: "/ja/clubs/itaewon" },
      ],
      stepsH2: "当日の流れ",
      steps: [
        { time: "21:00", text: "夕食。クラブでは食事が出ないうえ、長い夜になります。" },
        { time: "22:00〜23:00", text: "到着。0時前の1時間で行列が一気に伸びるので、23時までに入るのが安全。テーブルならそのまま入場。" },
        { time: "0:00", text: "店内でカウントダウン。" },
        { time: "その後", text: "多くのクラブは5〜6時まで営業。0時直後はタクシーが非常につかまりにくいので、始発まで残るグループが多いです。" },
      ],
      pricesH2: "大晦日のテーブル料金 — 実際のメニュー",
      pricesNote:
        "クラブの実際のメニューです。1卓あたりの最低予約金額は通常変わりませんが、大晦日は店が特別な最低金額やテーブルチャージを設定しやすい夜です。その場合は確定前に最終金額を書面（メッセージ）でお知らせします。",
      faqH2: "ソウルの大晦日 — よくある質問",
      faqs: [
        { q: "ソウルのクラブはカウントダウンをしますか？", a: "多くのクラブがします。江南・弘大・梨泰院のクラブは一般的に0時にカウントダウンし、5〜6時まで営業します。ラインナップは日が近づくと各クラブのインスタで発表されます。" },
        { q: "大晦日はテーブル予約したほうがいい？", a: "0時に店内にいたいなら予約がおすすめです。23時〜0時の間に行列が一気に伸び、満員になると入場が止まります。テーブルなら並ばずに入れて、グループの席もあります。" },
        { q: "大晦日のテーブルはいくら？", a: "1卓あたり江南140万ウォン〜、弘大・梨泰院50万ウォン〜（弘大の一部はさらに安い）で、クラブのメニューで組みます。江南で8人なら1人あたり約17.5万ウォン。この夜だけ特別な最低金額を設定する店もあるので、先に最終金額を書面（メッセージ）で確認します。デポジット不要、当日クラブでお支払い。" },
        { q: "0時以降どうやって帰る？", a: "事前に考えておきましょう。大晦日の0時直後はタクシーが非常につかまりにくいです。多くのグループは始発（5時半ごろ）まで残るか、タクシーが空き始める3〜4時まで待ちます。" },
        { q: "いつまでに予約すべき？", a: "少なくとも3週間前、8人以上ならもっと早めに。大晦日のテーブルは早めに埋まります。" },
      ],
      ctaH2: "大晦日のテーブルを予約",
      ctaBody: "人数とエリア（または掲載クラブ）を送るだけ。クラブに韓国語で確認して最終金額を書面（メッセージ）でお送りし、当日はそのまま入場。申し込み無料、デポジット不要。",
      cta: "🥂 12/31を予約",
      ctaNote: "申し込み無料 · デポジット不要 · 当日クラブでお支払い",
      datesH: "どの夜？",
      dates: [
        { date: "2026-12-31", label: "12/31(木) カウントダウン" },
        { date: "2027-01-01", label: "1/1(金) 元日" },
        { date: "2027-01-02", label: "1/2(土)" },
      ],
      otherDate: "別の日程 →",
      moreH2: "もっと見る",
      more: [
        { label: "ソウル クリスマス 2026 →", href: "/ja/christmas-seoul" },
        { label: "誕生日・グループのテーブル →", href: "/ja/group-table-seoul" },
        { label: "ソウルのクラブ テーブル料金一覧 →", href: "/ja/vip-tables" },
        { label: "ドレスコード・入場ルール →", href: "/ja/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "大晦日 2026",
    },
    zh: {
      title: "首尔跨年 2026→2027 夜店 — 12/31(周四) 倒数 卡座预订与价格",
      description:
        "2026 年跨年夜是周四，1 月 1 日(周五)是韩国公休日。想在首尔夜店倒数 — 哪些夜店能订卡座、50 万韩元起的真实价格、怎么回去。",
      ogTitle: "首尔跨年 2026",
      ogSub: "12/31(周四) 倒数 · 夜店卡座与真实价格",
      keywords: [
        "首尔 跨年 2026", "首尔 跨年 夜店", "江南 跨年 派对", "弘大 跨年", "梨泰院 跨年",
        "韩国 跨年 夜店", "首尔 倒数 卡座",
      ],
      eyebrow: "2026 年 12 月 31 日 · 周四",
      h1: "首尔跨年 2026 — 倒数夜店、卡座与价格",
      intro:
        "今年跨年夜是周四，1 月 1 日(周五)公休，所以这一晚会玩到很晚，接着就是周末。首尔的夜店 0 点倒数，一直开到早上。想在 0 点那一刻全员都在店里，最稳的是订卡座 — 不用在 23:30 排队，整团都有位子。",
      areasH2: "在哪里倒数",
      areas: [
        { name: "江南", tag: "大型倒数现场", body: "大型 EDM 夜店把倒数当作整晚的高潮，门口也最严。要么 0 点前很早进场，要么订卡座。每桌 140 万韩元起。", href: "/zh/clubs/gangnam" },
        { name: "弘大", tag: "夜店最多 · 嘻哈", body: "夜店最多、客群最年轻，0 点前排队一下就变长。每桌 50 万韩元起，部分更低。", href: "/zh/clubs/hongdae" },
        { name: "梨泰院", tag: "外国人多", body: "用英文倒数最方便的国际化区域。每桌 50 万韩元起。", href: "/zh/clubs/itaewon" },
      ],
      stepsH2: "当晚流程",
      steps: [
        { time: "21:00", text: "先吃饭。夜店不供餐，而且会是很长的一晚。" },
        { time: "22:00–23:00", text: "到场。0 点前一小时排队会迅速变长，23 点前进场最稳。有卡座直接进。" },
        { time: "00:00", text: "在店里倒数。" },
        { time: "之后", text: "大多数夜店开到 5–6 点。0 点刚过非常难打车，很多团待到首班地铁。" },
      ],
      pricesH2: "跨年卡座价格 — 真实酒单",
      pricesNote:
        "以下是夜店的真实酒单。每桌最低消费通常不变，但跨年夜是夜店最可能设特别低消或台费的一晚。如果有，确认前我们会把最终金额书面告诉你。",
      faqH2: "首尔跨年 — 常见问题",
      faqs: [
        { q: "首尔夜店有跨年倒数吗？", a: "大多数有。江南、弘大、梨泰院的夜店一般 0 点倒数，开到 5–6 点。阵容临近时会发在各夜店的 Instagram。" },
        { q: "跨年要订卡座吗？", a: "想 0 点在店里的话建议订。23 点到 0 点之间排队迅速变长，满了就停止入场。有卡座不用排队，整团有位子。" },
        { q: "跨年卡座多少钱？", a: "每桌江南 140 万韩元起、弘大和梨泰院 50 万韩元起(弘大部分更低)，用夜店酒单凑满。江南 8 个人每人约 17.5 万韩元。有些店这晚会设特别低消，我们会先把最终价格书面确认。无订金，当晚在夜店付款。" },
        { q: "0 点以后怎么回去？", a: "提前规划。跨年 0 点刚过非常难打车。多数团待到首班地铁(约 5:30)，或等到 3–4 点出租车变多。" },
        { q: "什么时候订？", a: "至少提前 3 周，8 人以上更早 — 跨年卡座会较早订满。" },
      ],
      ctaH2: "预订跨年卡座",
      ctaBody: "告诉我们人数和区域(或我们列表上的夜店)。我们用韩语向夜店确认，把最终价格书面发给你，当晚直接进场。免费申请，无订金。",
      cta: "🥂 预订 12/31",
      ctaNote: "免费申请 · 无订金 · 当晚在夜店付款",
      datesH: "哪一晚？",
      dates: [
        { date: "2026-12-31", label: "12/31(周四) 跨年" },
        { date: "2027-01-01", label: "1/1(周五) 元旦" },
        { date: "2027-01-02", label: "1/2(周六)" },
      ],
      otherDate: "其他日期 →",
      moreH2: "更多",
      more: [
        { label: "首尔圣诞节 2026 →", href: "/zh/christmas-seoul" },
        { label: "生日/团体卡座 →", href: "/zh/group-table-seoul" },
        { label: "首尔夜店卡座价格一览 →", href: "/zh/vip-tables" },
        { label: "着装与入场规定 →", href: "/zh/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "跨年 2026",
    },
    "zh-tw": {
      title: "首爾跨年 2026→2027 夜店 — 12/31(週四) 倒數 包廂預訂與價格",
      description:
        "2026 年跨年夜是週四，1 月 1 日(週五)是韓國國定假日。想在首爾夜店倒數 — 哪些夜店能訂包廂、50 萬韓元起的真實低消、怎麼回去。",
      ogTitle: "首爾跨年 2026",
      ogSub: "12/31(週四) 倒數 · 夜店包廂與真實價格",
      keywords: [
        "首爾 跨年 2026", "首爾 跨年 夜店", "江南 跨年 派對", "弘大 跨年", "梨泰院 跨年",
        "韓國 跨年 夜店", "首爾 倒數 包廂", "首爾 夜店 低消",
      ],
      eyebrow: "2026 年 12 月 31 日 · 週四",
      h1: "首爾跨年 2026 — 倒數夜店、包廂與價格",
      intro:
        "今年跨年夜是週四，1 月 1 日(週五)放假，所以這晚會玩到很晚，接著就是週末。首爾的夜店 0 點倒數，一路開到早上。想在 0 點那一刻整團都在店裡，最穩的是訂包廂 — 不用在 23:30 排隊，整團都有位子。",
      areasH2: "在哪裡倒數",
      areas: [
        { name: "江南", tag: "大型倒數現場", body: "大型 EDM 夜店把倒數當整晚的高潮，門口也最嚴。要嘛 0 點前很早進場，要嘛訂包廂。每桌低消 140 萬韓元起。", href: "/zh-tw/clubs/gangnam" },
        { name: "弘大", tag: "夜店最多 · 嘻哈", body: "夜店最多、客群最年輕，0 點前排隊一下就變長。每桌低消 50 萬韓元起，部分更低。", href: "/zh-tw/clubs/hongdae" },
        { name: "梨泰院", tag: "外國人多", body: "講英文倒數最方便的國際化區域。每桌低消 50 萬韓元起。", href: "/zh-tw/clubs/itaewon" },
      ],
      stepsH2: "當晚流程",
      steps: [
        { time: "21:00", text: "先吃飯。夜店不供餐，而且會是很長的一晚。" },
        { time: "22:00–23:00", text: "到場。0 點前一小時排隊會迅速變長，23 點前進場最穩。有包廂直接進。" },
        { time: "00:00", text: "在店裡倒數。" },
        { time: "之後", text: "多數夜店開到 5–6 點。0 點剛過非常難叫車，很多團待到首班車。" },
      ],
      pricesH2: "跨年包廂價格 — 真實酒單",
      pricesNote:
        "以下是夜店的真實酒單。每桌低消通常不變，但跨年夜是夜店最可能設特別低消或包廂費的一晚。如果有，確認前我們會把最終金額書面告訴你。",
      faqH2: "首爾跨年 — 常見問題",
      faqs: [
        { q: "首爾夜店有跨年倒數嗎？", a: "多數有。江南、弘大、梨泰院的夜店一般 0 點倒數，開到 5–6 點。陣容接近時會發在各夜店的 Instagram。" },
        { q: "跨年要訂包廂嗎？", a: "想 0 點在店裡的話建議訂。23 點到 0 點之間排隊迅速變長，滿了就停止入場，人多的團也容易被卡。有包廂不用排，整團有位子。" },
        { q: "跨年包廂多少錢？", a: "每桌低消江南 140 萬韓元起、弘大和梨泰院 50 萬韓元起(弘大部分更低)，從夜店酒單湊滿。江南 8 個人每人約 17.5 萬韓元。有些店這晚會設特別低消，我們會先把最終價格書面確認。免訂金，當晚在夜店付款。" },
        { q: "0 點以後怎麼回去？", a: "先規劃好。跨年 0 點剛過非常難叫車。多數團待到首班地鐵(約 5:30)，或等到 3–4 點計程車變多。" },
        { q: "什麼時候訂？", a: "至少提前 3 週，8 人以上更早 — 跨年包廂會比較早訂滿。" },
      ],
      ctaH2: "訂跨年包廂",
      ctaBody: "告訴我們人數和區域(或我們列表上的夜店)。我們用韓文跟夜店確認，把最終價格書面傳給你，當晚直接進場。免費申請，免訂金。",
      cta: "🥂 訂 12/31",
      ctaNote: "免費申請 · 免訂金 · 當晚在夜店付款",
      datesH: "哪一晚？",
      dates: [
        { date: "2026-12-31", label: "12/31(週四) 跨年" },
        { date: "2027-01-01", label: "1/1(週五) 元旦" },
        { date: "2027-01-02", label: "1/2(週六)" },
      ],
      otherDate: "其他日期 →",
      moreH2: "更多",
      more: [
        { label: "首爾聖誕節 2026 →", href: "/zh-tw/christmas-seoul" },
        { label: "慶生/團體包廂 →", href: "/zh-tw/group-table-seoul" },
        { label: "首爾夜店包廂價格一覽 →", href: "/zh-tw/vip-tables" },
        { label: "服裝與入場規定 →", href: "/zh-tw/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "跨年 2026",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 춘절·설 2027 — 중국·대만 정월 초하루 2/6(토), 한국 설날 2/7(일)·연휴 2/6~2/9(9일 대체공휴일)
// 영어(싱가포르·말레이시아·홍콩 영어 검색)·간체·번체만. 일본은 음력 설을 쇠지 않아 ja 없음.
// 날짜 확인값(2026-10-30): 대만 연휴 2/4~2/10(행정원 인사총처 공고), 중국 본토 공식 휴일은 미발표
//   → 본토 휴일 날짜는 쓰지 않는다.
// 설 연휴 클럽 영업은 클럽마다 다르고 확인 안 됐다 → 단정하지 않고 "그날 연다고 확인된 곳만 잡는다".
// ─────────────────────────────────────────────────────────────────────────────
export const LNY_2027: SeasonGuideConfig = {
  slug: "lunar-new-year-seoul",
  about: "Lunar New Year 2027 in Seoul",
  temporalCoverage: "2027-02-05/2027-02-09",
  areaOrder: ["강남", "홍대", "이태원"],
  copy: {
    en: {
      title: "Seoul Clubs over Lunar New Year 2027 — Table Prices & Booking (Feb 5–9)",
      description:
        "Lunar New Year's Day 2027 is Saturday, Feb 6 in China and Taiwan; Korea celebrates Seollal a day later (Sun, Feb 7, holiday Feb 6–9). Which Seoul clubs we can book over the holiday, real table prices from ₩500,000, and what changes in Seoul that week.",
      ogTitle: "Seoul Lunar New Year 2027",
      ogSub: "Feb 5–9 · club tables, real prices, holiday hours",
      keywords: [
        "Lunar New Year Seoul 2027", "Chinese New Year Seoul club", "Seollal Seoul nightlife", "Seoul club Lunar New Year",
        "Gangnam club Chinese New Year", "Hongdae Lunar New Year", "Seoul February 2027 nightlife", "Korea Lunar New Year clubs open",
      ],
      eyebrow: "FEB 5–9, 2027 · LUNAR NEW YEAR",
      h1: "Seoul Clubs over Lunar New Year 2027 — Tables & Prices",
      intro:
        "Lunar New Year is one of the busiest travel weeks of the year for visitors from China, Taiwan and Hong Kong — in 2027, New Year's Day is Saturday, February 6. Korea celebrates it too: Seollal falls a day later (Sunday, Feb 7), the public holiday runs Saturday Feb 6 to Tuesday Feb 9, and many Seoul residents travel to their hometowns. That changes how the city runs: Friday Feb 5 is still a normal Friday night, but over the Korean holiday some clubs may close or change their hours, and each club decides for itself. We only book clubs that confirm they're open on the night you pick.",
      areasH2: "Where to go",
      areas: [
        { name: "Gangnam", tag: "Big rooms · strictest door", body: "Large EDM clubs and the strictest door in Seoul — a booked table gets the whole group in together. Tables from ₩1,400,000.", href: "/en/clubs/gangnam" },
        { name: "Hongdae", tag: "Most clubs · hip-hop", body: "The most clubs in one area and the youngest crowd, so it's the easiest place to find one open over the holiday. Tables from ₩500,000, some clubs lower.", href: "/en/clubs/hongdae" },
        { name: "Itaewon", tag: "International crowd", body: "Seoul's most international nightlife — easiest place to go out in English. Tables from ₩500,000.", href: "/en/clubs/itaewon" },
      ],
      stepsH2: "How the week runs",
      steps: [
        { time: "Feb 5 (Fri)", text: "New Year's Eve in China and Taiwan, and a regular Friday in Seoul — Korea's holiday hasn't started yet. The most straightforward night to go out." },
        { time: "Feb 6 (Sat)", text: "Lunar New Year's Day in China and Taiwan; the first day of the Korean holiday. Hours vary by club — we check before confirming." },
        { time: "Feb 7 (Sun)", text: "Seollal, Korean New Year's Day. The night a club is most likely to be closed — ask us before you plan around it." },
        { time: "Feb 8–9", text: "Still a holiday in Korea (Feb 9 is the substitute holiday). Clubs keep their usual weeknight schedule, which for many means closed." },
        { time: "Feb 12–13", text: "The first Friday and Saturday after the Korean holiday — normal weekend hours, if your trip runs longer." },
      ],
      pricesH2: "Lunar New Year table prices — real menus",
      pricesNote:
        "These are the clubs' printed menus. The minimum spend per table normally stays the same, but over Seollal a club can change its hours or set a holiday minimum. If it does, we tell you the final number in writing before you commit.",
      faqH2: "Lunar New Year in Seoul — questions people ask",
      faqs: [
        { q: "When is Lunar New Year 2027?", a: "Lunar New Year's Day is Saturday, February 6, 2027 in China and Taiwan (New Year's Eve is Friday, Feb 5). Korea's Seollal falls one day later, on Sunday, February 7, with a public holiday from Saturday Feb 6 to Tuesday Feb 9. Taiwan's official holiday is Feb 4–10." },
        { q: "Are Seoul clubs open over Seollal?", a: "It depends on the club and the night. Friday Feb 5 is a regular Friday in Seoul. Over the Korean holiday (Feb 6–9) some clubs may close or change hours, and Seollal day itself (Feb 7) is the most likely night to find a club closed. When you send a date, we only offer clubs that confirm they're open that night." },
        { q: "How much is a club table in Seoul over Lunar New Year?", a: "The minimum spend is ₩1,400,000 per table in Gangnam and ₩500,000 in Hongdae and Itaewon (a few Hongdae clubs are lower), filled from the club's own menu. A table is shared, so for a group of 8 in Gangnam that's about ₩175,000 each. No deposit, no broker fee — you pay the club on the night." },
        { q: "When should I book?", a: "Two to three weeks ahead. Over the holiday we have to check each club's hours as well as the table, so earlier requests give you more choice." },
        { q: "Can foreigners get in? What do I need?", a: "Yes. Clubs are 19+ (in 2027: born 2008 or earlier) and foreigners must show a physical passport at the door. Gangnam has the strictest dress code — no shorts, tank tops or slides." },
      ],
      ctaH2: "Book a Lunar New Year table",
      ctaBody: "Tell us the date, group size and district (or one of the clubs we book). We check the club is open that night, confirm in Korean, and send you the final price in writing. Free to request, no deposit.",
      cta: "🧧 Book for Lunar New Year",
      ctaNote: "Free to request · No deposit · You pay the club on the night",
      datesH: "Which night?",
      dates: [
        { date: "2027-02-05", label: "Fri, Feb 5 · NY Eve" },
        { date: "2027-02-06", label: "Sat, Feb 6 · New Year" },
      ],
      otherDate: "Another date →",
      moreH2: "More",
      more: [
        { label: "Birthday & group tables →", href: "/en/group-table-seoul" },
        { label: "All Seoul club table prices →", href: "/en/vip-tables" },
        { label: "Dress code & entry rules →", href: "/en/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "Lunar New Year 2027",
    },
    zh: {
      title: "首尔春节夜店 2027 — 卡座预订与价格（2/5–2/9）",
      description:
        "2027 年正月初一是 2 月 6 日(周六)，韩国过年晚一天(2 月 7 日周日，2/6–2/9 放假)。春节期间哪些首尔夜店能订卡座、50 万韩元起的真实价格、韩国过年那几天首尔有什么不一样。",
      ogTitle: "首尔春节 2027",
      ogSub: "2/5–2/9 · 夜店卡座、真实价格、过年营业",
      keywords: [
        "首尔 春节 2027", "春节 首尔 夜店", "韩国 过年 夜店 营业", "江南 夜店 春节", "弘大 夜店 春节",
        "首尔 2月 夜生活", "首尔 夜店 订卡座", "春节 去韩国 玩什么",
      ],
      eyebrow: "2027 年 2 月 5–9 日 · 春节",
      h1: "首尔春节 2027 — 夜店、卡座与价格",
      intro:
        "春节是中国游客来首尔最多的时期之一 — 2027 年正月初一是 2 月 6 日(周六)。韩国也过年，但晚一天：韩国的过年是 2 月 7 日(周日)，2/6(周六)到 2/9(周二)放假，很多首尔本地人会回老家。所以那一周首尔和平时不一样：2/5(周五，除夕)韩国还没放假，是正常的周五夜；韩国放假那几天，有的夜店可能休息或调整营业时间，每家自己决定。我们只帮你订当晚确认营业的夜店。",
      areasH2: "去哪里",
      areas: [
        { name: "江南", tag: "大型夜店 · 门口最严", body: "大型 EDM 夜店，首尔门口审核最严 — 订卡座能保证一群人一起进场。每桌 140 万韩元起。", href: "/zh/clubs/gangnam" },
        { name: "弘大", tag: "夜店最多 · 嘻哈", body: "夜店最多、客群最年轻的区域，过年期间最容易找到营业的店。每桌 50 万韩元起，部分更低。", href: "/zh/clubs/hongdae" },
        { name: "梨泰院", tag: "外国人多", body: "首尔最国际化的夜生活区，用英文也好玩。每桌 50 万韩元起。", href: "/zh/clubs/itaewon" },
      ],
      stepsH2: "春节这一周怎么安排",
      steps: [
        { time: "2/5(周五)", text: "除夕。韩国还没放假，是正常的周五夜 — 最稳的一晚。" },
        { time: "2/6(周六)", text: "正月初一，也是韩国放假第一天。营业时间因店而异，确认前我们会先问清楚。" },
        { time: "2/7(周日)", text: "韩国的过年当天。夜店最可能休息的一晚 — 想去先问我们。" },
        { time: "2/8–2/9", text: "韩国还在放假(2/9 是补假)。夜店按平时的工作日安排，很多家不营业。" },
        { time: "2/12–2/13", text: "韩国放完假后的第一个周五、周六 — 恢复正常周末营业，行程长的话可以安排在这两晚。" },
      ],
      pricesH2: "春节卡座价格 — 真实酒单",
      pricesNote:
        "以下是夜店的真实酒单。每桌最低消费过年期间通常不变，但韩国过年时夜店可能调整营业时间或设节日低消。如果有，确认前我们会把最终金额书面告诉你。",
      faqH2: "首尔过春节 — 常见问题",
      faqs: [
        { q: "2027 年春节是哪天？", a: "正月初一是 2027 年 2 月 6 日(周六)，除夕是 2 月 5 日(周五)。韩国过年晚一天，是 2 月 7 日(周日)，韩国 2/6(周六)到 2/9(周二)放假。中国大陆的放假安排以国务院公布为准。" },
        { q: "韩国过年期间首尔夜店营业吗？", a: "看店也看哪一晚。2/5(周五)韩国还没放假，是正常的周五。韩国放假期间(2/6–2/9)有的夜店可能休息或调整时间，过年当天(2/7)休息的可能性最大。你告诉我们日期后，我们只推荐当晚确认营业的夜店。" },
        { q: "春节期间首尔夜店卡座多少钱？", a: "每桌最低消费江南 140 万韩元、弘大和梨泰院 50 万韩元(弘大部分更低)，用夜店自己的酒单凑满。卡座大家分摊，江南 8 个人每人约 17.5 万韩元。无订金、无中介费，当晚在夜店付款。" },
        { q: "什么时候订？", a: "提前 2–3 周。过年期间除了卡座还要确认每家的营业时间，越早申请可选的店越多。" },
        { q: "外国人能进吗？要带什么？", a: "能。夜店 19 岁以上(2027 年为 2008 年及以前出生)，外国人要带护照原件。江南着装最严，不能穿短裤、背心、拖鞋。" },
      ],
      ctaH2: "预订春节卡座",
      ctaBody: "告诉我们日期、人数和区域(或我们列表上的夜店)。我们先确认那晚营业，再用韩语向夜店确认，把最终价格书面发给你。免费申请，无订金。",
      cta: "🧧 预订春节卡座",
      ctaNote: "免费申请 · 无订金 · 当晚在夜店付款",
      datesH: "哪一晚？",
      dates: [
        { date: "2027-02-05", label: "2/5(周五) 除夕" },
        { date: "2027-02-06", label: "2/6(周六) 初一" },
      ],
      otherDate: "其他日期 →",
      moreH2: "更多",
      more: [
        { label: "生日/团体卡座 →", href: "/zh/group-table-seoul" },
        { label: "首尔夜店卡座价格一览 →", href: "/zh/vip-tables" },
        { label: "着装与入场规定 →", href: "/zh/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "春节 2027",
    },
    "zh-tw": {
      title: "首爾過年夜店 2027 — 農曆春節包廂預訂與低消（2/5–2/9）",
      description:
        "2027 年大年初一是 2 月 6 日(週六)，台灣春節連假 2/4–2/10。韓國過年晚一天(2 月 7 日週日，2/6–2/9 放假)。過年期間哪些首爾夜店能訂包廂、50 萬韓元起的真實低消、韓國過年那幾天首爾有什麼不一樣。",
      ogTitle: "首爾過年 2027",
      ogSub: "2/5–2/9 · 夜店包廂、真實低消、過年營業",
      keywords: [
        "首爾 過年 2027", "春節 首爾 夜店", "韓國 過年 夜店 有開嗎", "江南 夜店 過年", "弘大 夜店 過年",
        "首爾 2月 夜生活", "首爾 夜店 訂包廂", "首爾 夜店 低消", "春節連假 韓國",
      ],
      eyebrow: "2027 年 2 月 5–9 日 · 農曆春節",
      h1: "首爾過年 2027 — 夜店、包廂與低消",
      intro:
        "2027 年台灣春節連假是 2/4(週四)到 2/10(週三)，大年初一是 2 月 6 日(週六)，是一年裡最適合飛首爾的連假之一。韓國也過年，但晚一天：韓國的過年是 2 月 7 日(週日)，2/6(週六)到 2/9(週二)放假，很多首爾當地人會回老家。所以那一週首爾跟平常不一樣：2/5(週五，除夕)韓國還沒放假，是一般的週五夜；韓國放假那幾天，有的夜店可能休息或調整營業時間，每家自己決定。我們只幫你訂當晚確認有開的夜店，也不用擔心在門口被卡(年齡、護照、服裝符合規定即可)。",
      areasH2: "去哪裡",
      areas: [
        { name: "江南", tag: "大型夜店 · 門口最嚴", body: "大型 EDM 夜店，首爾門口審核最嚴 — 有包廂整團一起進場，不怕被卡。每桌低消 140 萬韓元起。", href: "/zh-tw/clubs/gangnam" },
        { name: "弘大", tag: "夜店最多 · 嘻哈", body: "夜店最多、客群最年輕的區域，過年期間最容易找到有開的店。每桌低消 50 萬韓元起，部分更低。", href: "/zh-tw/clubs/hongdae" },
        { name: "梨泰院", tag: "外國人多", body: "首爾最國際化的夜生活區，講英文也好玩。每桌低消 50 萬韓元起。", href: "/zh-tw/clubs/itaewon" },
      ],
      stepsH2: "過年這一週怎麼排",
      steps: [
        { time: "2/4(週四)", text: "台灣連假開始。首爾還是一般的週四。" },
        { time: "2/5(週五)", text: "除夕。韓國還沒放假，是一般的週五夜 — 最穩的一晚。" },
        { time: "2/6(週六)", text: "大年初一，也是韓國放假第一天。營業時間每家不同，確認前我們會先問清楚。" },
        { time: "2/7(週日)", text: "韓國的過年當天。夜店最可能休息的一晚 — 想去先問我們。" },
        { time: "2/8–2/10", text: "韓國 2/9 前都還在放假(2/9 是補假)。夜店照平常的平日排，很多家沒開。" },
      ],
      pricesH2: "過年包廂價格 — 真實酒單",
      pricesNote:
        "以下是夜店的真實酒單。每桌低消過年期間通常不變，但韓國過年時夜店可能調整營業時間或設節日低消。這裡的「包廂」指夜店內的桌位(開放式)，不是獨立房間。如果有變動，確認前我們會把最終金額書面告訴你。",
      faqH2: "首爾過年 — 常見問題",
      faqs: [
        { q: "2027 年過年是哪天？", a: "大年初一是 2027 年 2 月 6 日(週六)，除夕是 2 月 5 日(週五)，台灣春節連假是 2/4 到 2/10。韓國過年晚一天，是 2 月 7 日(週日)，韓國 2/6(週六)到 2/9(週二)放假。" },
        { q: "韓國過年期間首爾夜店有開嗎？", a: "看店也看哪一晚。2/5(週五)韓國還沒放假，是一般的週五。韓國放假期間(2/6–2/9)有的夜店可能休息或調整時間，過年當天(2/7)沒開的機率最高。你告訴我們日期後，我們只推薦當晚確認有開的夜店。" },
        { q: "過年期間首爾夜店包廂多少錢？", a: "每桌低消江南 140 萬韓元、弘大和梨泰院 50 萬韓元(弘大部分更低)，從夜店自己的酒單湊滿。包廂大家分攤，江南 8 個人每人約 17.5 萬韓元。免訂金、無中介費，當晚在夜店付款。" },
        { q: "什麼時候訂？", a: "提前 2–3 週。過年期間除了包廂還要確認每家有沒有開，越早申請可選的店越多。" },
        { q: "外國人能進嗎？要帶什麼？", a: "可以。夜店 19 歲以上(2027 年為 2008 年(含)以前出生)，外國人要帶護照正本。江南服裝最嚴，不能穿短褲、背心、拖鞋。" },
      ],
      ctaH2: "訂過年包廂",
      ctaBody: "告訴我們日期、人數和區域(或我們列表上的夜店)。我們先確認那晚有開，再用韓文跟夜店確認，把最終價格書面傳給你。免費申請，免訂金。",
      cta: "🧧 訂過年包廂",
      ctaNote: "免費申請 · 免訂金 · 當晚在夜店付款",
      datesH: "哪一晚？",
      dates: [
        { date: "2027-02-05", label: "2/5(週五) 除夕" },
        { date: "2027-02-06", label: "2/6(週六) 初一" },
      ],
      otherDate: "其他日期 →",
      moreH2: "更多",
      more: [
        { label: "慶生/團體包廂 →", href: "/zh-tw/group-table-seoul" },
        { label: "首爾夜店包廂價格一覽 →", href: "/zh-tw/vip-tables" },
        { label: "服裝與入場規定 →", href: "/zh-tw/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "過年 2027",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 단체·생일 테이블 — 날짜 없는 상시 페이지(AI 질문형: "birthday table Seoul club for 8")
// ─────────────────────────────────────────────────────────────────────────────
export const GROUP_TABLE: SeasonGuideConfig = {
  slug: "group-table-seoul",
  about: "Group and birthday club tables in Seoul",
  areaOrder: ["강남", "홍대", "이태원"],
  copy: {
    en: {
      title: "Birthday, Bachelor & Group Club Tables in Seoul — Prices per Person (2026)",
      description:
        "Booking a Seoul club for a birthday, bachelor or bachelorette party, or a work trip? How group tables work, what it costs per person (around ₩60,000–175,000 each for a group of 8), and how to book in English with no deposit.",
      ogTitle: "Group & birthday tables in Seoul",
      ogSub: "Birthdays, bachelor parties, work trips — price per person",
      keywords: [
        "birthday table Seoul club", "Seoul club for a birthday", "bachelor party Seoul club", "bachelorette party Seoul",
        "Gangnam club table for 8 people", "group club booking Seoul", "Seoul club table price per person", "company team night out Seoul", "year-end company party Seoul club",
      ],
      eyebrow: "BIRTHDAYS · BACHELOR PARTIES · GROUPS",
      h1: "Birthday & Bachelor Party Club Tables in Seoul — Price per Person",
      intro:
        "Most of the table requests we handle are groups of 4 to 10 — birthdays, bachelor and bachelorette parties, friends on a trip, teams on a work trip. For a group, a table isn't a luxury: it's how everyone gets in together, has somewhere to sit and put their things, and doesn't spend the night at the bar. A table has one minimum spend that the whole group shares, so the bigger the group, the less each person pays.",
      areasH2: "Which area suits your group",
      areas: [
        { name: "Gangnam", tag: "Big night · strict door", body: "Large EDM clubs, the most 'big night out' feel, and the strictest door — exactly where a table helps a group most. ₩1,400,000 per table: about ₩175,000 each for 8 people.", href: "/en/clubs/gangnam" },
        { name: "Hongdae", tag: "Young crowd · hip-hop", body: "Lots of clubs close together and a relaxed crowd. ₩500,000 per table (some clubs lower): about ₩83,000 each for 6 people.", href: "/en/clubs/hongdae" },
        { name: "Itaewon", tag: "International · English", body: "The easiest area to go out in English, with a mixed international crowd. ₩500,000 per table: about ₩62,500 each for 8 people.", href: "/en/clubs/itaewon" },
      ],
      stepsH2: "How a group booking works",
      steps: [
        { time: "1. Request", text: "Send the date, group size and occasion (birthday, bachelor party, team night). Pick a club, or tell us the area and we suggest one." },
        { time: "2. Confirm", text: "We ask the club in Korean — including what they can do for the occasion — and send you the final price in writing before you commit." },
        { time: "3. The night", text: "Arrive with passports. Your table is under your name; you order from the club's menu and pay the club on the night. No deposit." },
      ],
      pricesH2: "Table prices — real menus",
      pricesNote:
        "These are the clubs' printed menus. The minimum spend is per table, not per person — split it across your group. Very large groups may need a bigger table or two tables; we confirm the total before you commit.",
      faqH2: "Group & birthday tables — questions people ask",
      faqs: [
        { q: "How much does a club table cost per person in Seoul?", a: "The minimum spend is per table and shared by the group: ₩1,400,000 in Gangnam and ₩500,000 in Hongdae and Itaewon (a few Hongdae clubs are lower), filled from the club's own menu. For 8 people that's about ₩175,000 each in Gangnam or ₩62,500 each in Itaewon." },
        { q: "Can a Seoul club do something for a birthday?", a: "Tell us it's a birthday when you request. We ask the club what they can do — for example a birthday bottle presentation — and confirm it with the price before the night. What's possible depends on the club." },
        { q: "How many people fit at one table?", a: "It depends on the club and the table. Tell us your group size and we ask the club which table fits; for big groups (10+) that can mean a larger table or two, and we confirm the total first." },
        { q: "Is it OK for a bachelor or bachelorette party?", a: "Yes — groups celebrating are a normal sight in Seoul clubs. Everyone needs to be 19+ (in 2026: born 2007 or earlier) and bring a physical passport. Gangnam doors are strict on dress: no shorts, tank tops or slides." },
        { q: "Do we need to pay a deposit?", a: "No. Requesting is free, there's no deposit and no broker fee. You get the final price in writing before the night and pay the club directly on the night." },
        { q: "Can we book a table for a year-end company party in December?", a: "Yes. December is year-end party season in Korea, so Friday and Saturday tables can go earlier than usual — request two to three weeks ahead. Tell us the group size and that it's a company night; we confirm the table and the final price in writing before you commit." },
      ],
      ctaH2: "Book a group table",
      ctaBody: "Tell us the date, group size and occasion. We confirm with the club in Korean and send you the final price in writing. Free to request, no deposit.",
      cta: "🎉 Book a group table",
      ctaNote: "Free to request · No deposit · You pay the club on the night",
      moreH2: "More",
      more: [
        { label: "Christmas 2026 in Seoul →", href: "/en/christmas-seoul" },
        { label: "New Year's Eve 2026 in Seoul →", href: "/en/new-years-eve-seoul" },
        { label: "All Seoul club table prices →", href: "/en/vip-tables" },
        { label: "Dress code & entry rules →", href: "/en/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "Group & birthday tables",
    },
    ja: {
      title: "ソウル クラブ 誕生日・グループのテーブル予約 — 1人あたりの料金 (2026)",
      description:
        "誕生日、独身最後のパーティー、社員旅行でソウルのクラブへ。グループのテーブルの仕組み、1人あたりの料金（8人なら約6万〜17.5万ウォン）、日本語フォームからデポジットなしで予約する方法。",
      ogTitle: "ソウル 誕生日・グループのテーブル",
      ogSub: "誕生日・パーティー・社員旅行 — 1人あたりの料金",
      keywords: [
        "ソウル クラブ 誕生日", "ソウル 誕生日 テーブル", "江南 クラブ グループ", "ソウル クラブ 何人",
        "ソウル クラブ 1人あたり 料金", "韓国 社員旅行 クラブ", "ソウル クラブ テーブル予約",
      ],
      eyebrow: "誕生日 · パーティー · グループ",
      h1: "ソウルのクラブ — 誕生日・グループのテーブル",
      intro:
        "私たちが受けるテーブル予約の多くは4〜10人のグループです — 誕生日、独身最後のパーティー、友人旅行、社員旅行。グループにとってテーブルは贅沢ではなく、全員一緒に入れて、座る場所と荷物を置く場所があり、一晩中バーに並ばなくていい方法です。最低予約金額は1卓ごとでグループで割るので、人数が多いほど1人あたりは安くなります。",
      areasH2: "グループに合うエリア",
      areas: [
        { name: "江南", tag: "派手な夜 · 入口が厳しい", body: "大型EDMクラブで一番「特別な夜」らしい雰囲気。入口が最も厳しいので、テーブルが一番役立つエリア。1卓140万ウォン：8人なら1人約17.5万ウォン。", href: "/ja/clubs/gangnam" },
        { name: "弘大", tag: "若い客層 · ヒップホップ", body: "クラブが密集し、気軽な雰囲気。1卓50万ウォン（さらに安い店も）：6人なら1人約8.3万ウォン。", href: "/ja/clubs/hongdae" },
        { name: "梨泰院", tag: "国際的 · 英語OK", body: "外国人が多く、英語でも遊びやすいエリア。1卓50万ウォン：8人なら1人約6.25万ウォン。", href: "/ja/clubs/itaewon" },
      ],
      stepsH2: "グループ予約の流れ",
      steps: [
        { time: "1. 申し込み", text: "日程・人数・目的（誕生日、パーティー、社員旅行）を送るだけ。クラブを選ぶか、エリアを伝えればおすすめします。" },
        { time: "2. 確定", text: "クラブに韓国語で確認（目的に合わせてできることも含めて）し、確定前に最終金額を書面（メッセージ）でお送りします。" },
        { time: "3. 当日", text: "パスポートを持って到着。テーブルはあなたの名前で予約済み、クラブのメニューから注文し当日クラブでお支払い。デポジット不要。" },
      ],
      pricesH2: "テーブル料金 — 実際のメニュー",
      pricesNote:
        "クラブの実際のメニューです。最低予約金額は1人ではなく1卓あたり — グループで割ってください。大人数の場合は大きいテーブルや2卓になることもあり、確定前に合計をお知らせします。",
      faqH2: "誕生日・グループのテーブル — よくある質問",
      faqs: [
        { q: "ソウルのクラブのテーブルは1人いくら？", a: "最低予約金額は1卓あたりでグループで割ります：江南140万ウォン、弘大・梨泰院50万ウォン（弘大の一部はさらに安い）、クラブのメニューで組みます。8人なら江南で1人約17.5万ウォン、梨泰院なら約6.25万ウォン。" },
        { q: "誕生日に何かしてもらえますか？", a: "申し込み時に誕生日だと伝えてください。クラブに何ができるか（例：誕生日のボトル演出）を確認し、料金と一緒に事前にお知らせします。内容はクラブによって異なります。" },
        { q: "1卓に何人座れますか？", a: "クラブとテーブルによります。人数を伝えていただければ合うテーブルをクラブに確認します。10人以上なら大きいテーブルや2卓になることもあり、先に合計を確定します。" },
        { q: "独身最後のパーティーでも大丈夫？", a: "大丈夫です。お祝いのグループはソウルのクラブでは普通の光景です。全員19歳以上（2026年は2007年以前生まれ）でパスポート原本が必要。江南は服装が厳しく、短パン・タンクトップ・サンダルは不可。" },
        { q: "デポジットは必要？", a: "不要です。申し込み無料、デポジット・仲介手数料なし。当日までに最終金額を書面（メッセージ）でお知らせし、当日クラブに直接お支払いいただきます。" },
        { q: "12月の忘年会でテーブル予約できますか？", a: "できます。韓国も12月は忘年会シーズンで、金・土のテーブルは普段より早く埋まることがあります。2〜3週間前に、人数と会社の集まりであることを添えてお申し込みください。テーブルと最終金額を確定前に書面（メッセージ）でお知らせします。" },
      ],
      ctaH2: "グループのテーブルを予約",
      ctaBody: "日程・人数・目的を送るだけ。クラブに韓国語で確認し、最終金額を書面（メッセージ）でお送りします。申し込み無料、デポジット不要。",
      cta: "🎉 グループで予約",
      ctaNote: "申し込み無料 · デポジット不要 · 当日クラブでお支払い",
      moreH2: "もっと見る",
      more: [
        { label: "ソウル クリスマス 2026 →", href: "/ja/christmas-seoul" },
        { label: "ソウル 大晦日 2026 →", href: "/ja/new-years-eve-seoul" },
        { label: "ソウルのクラブ テーブル料金一覧 →", href: "/ja/vip-tables" },
        { label: "ドレスコード・入場ルール →", href: "/ja/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "誕生日・グループのテーブル",
    },
    zh: {
      title: "首尔夜店生日/团体卡座预订 — 每人多少钱 (2026)",
      description:
        "在首尔夜店过生日、办单身派对、公司出差聚会？团体卡座怎么订、每人多少钱(8 人约 6 万–17.5 万韩元)，中文表单预订、无订金。",
      ogTitle: "首尔生日/团体卡座",
      ogSub: "生日、单身派对、出差团 — 每人价格",
      keywords: [
        "首尔 夜店 生日", "首尔 生日 卡座", "江南 夜店 团体", "首尔 夜店 几个人",
        "首尔 夜店 卡座 人均", "首尔 单身派对", "首尔 夜店 订卡座",
      ],
      eyebrow: "生日 · 单身派对 · 团体",
      h1: "首尔夜店 — 生日与团体卡座",
      intro:
        "我们处理的卡座预订大多是 4 到 10 人的团 — 过生日、单身派对、朋友旅行、公司出差。对一群人来说，卡座不是奢侈，而是让大家一起进场、有地方坐和放东西、不用整晚挤在吧台的办法。最低消费按桌算、全团分摊，人越多每人越便宜。",
      areasH2: "哪个区域适合你们",
      areas: [
        { name: "江南", tag: "大场面 · 门口严", body: "大型 EDM 夜店，最有大场面的派对感，门口也最严 — 最需要卡座的区域。每桌 140 万韩元：8 个人每人约 17.5 万韩元。", href: "/zh/clubs/gangnam" },
        { name: "弘大", tag: "年轻 · 嘻哈", body: "夜店密集、气氛轻松。每桌 50 万韩元(部分更低)：6 个人每人约 8.3 万韩元。", href: "/zh/clubs/hongdae" },
        { name: "梨泰院", tag: "国际化 · 英文", body: "外国人多，用英文也好玩。每桌 50 万韩元：8 个人每人约 6.25 万韩元。", href: "/zh/clubs/itaewon" },
      ],
      stepsH2: "团体预订流程",
      steps: [
        { time: "1. 申请", text: "发来日期、人数和目的(生日、单身派对、团建)。可以选夜店，也可以只说区域，我们推荐。" },
        { time: "2. 确认", text: "我们用韩语向夜店确认(包括能为这次活动做什么)，确认前把最终价格书面发给你。" },
        { time: "3. 当晚", text: "带护照到场。卡座以你的名字预订，从夜店酒单点酒，当晚在夜店付款。无订金。" },
      ],
      pricesH2: "卡座价格 — 真实酒单",
      pricesNote:
        "以下是夜店的真实酒单。最低消费是每桌不是每人 — 全团分摊。人很多的话可能需要大桌或两桌，确认前我们会告诉你总额。",
      faqH2: "生日与团体卡座 — 常见问题",
      faqs: [
        { q: "首尔夜店卡座每人多少钱？", a: "最低消费按桌算、全团分摊：江南 140 万韩元，弘大和梨泰院 50 万韩元(弘大部分更低)，用夜店自己的酒单凑满。8 个人的话江南每人约 17.5 万韩元，梨泰院约 6.25 万韩元。" },
        { q: "过生日夜店能安排吗？", a: "申请时告诉我们是生日。我们会问夜店能做什么(例如生日开酒仪式)，连同价格事先告诉你。能做什么取决于夜店。" },
        { q: "一桌能坐几个人？", a: "看夜店和桌型。告诉我们人数，我们向夜店确认合适的桌。10 人以上可能是大桌或两桌，总额会先确认。" },
        { q: "单身派对可以吗？", a: "可以，庆祝的团体在首尔夜店很常见。全员需 19 岁以上(2026 年为 2007 年及以前出生)并带护照原件。江南着装严，不能穿短裤、背心、拖鞋。" },
        { q: "要付订金吗？", a: "不用。申请免费，无订金、无中介费。当晚前书面确认最终价格，当晚直接付给夜店。" },
        { q: "12 月公司年会能订卡座吗？", a: "能。12 月是韩国的年末聚会季，周五、周六的卡座可能比平时更早订满 — 建议提前 2–3 周申请。告诉我们人数、说明是公司聚会，确认前我们会把卡座和最终价格书面告诉你。" },
      ],
      ctaH2: "预订团体卡座",
      ctaBody: "告诉我们日期、人数和目的。我们用韩语向夜店确认，把最终价格书面发给你。免费申请，无订金。",
      cta: "🎉 预订团体卡座",
      ctaNote: "免费申请 · 无订金 · 当晚在夜店付款",
      moreH2: "更多",
      more: [
        { label: "首尔圣诞节 2026 →", href: "/zh/christmas-seoul" },
        { label: "首尔跨年 2026 →", href: "/zh/new-years-eve-seoul" },
        { label: "首尔夜店卡座价格一览 →", href: "/zh/vip-tables" },
        { label: "着装与入场规定 →", href: "/zh/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "生日/团体卡座",
    },
    "zh-tw": {
      title: "首爾夜店慶生/團體包廂預訂 — 一人多少錢 (2026)",
      description:
        "在首爾夜店慶生、辦單身派對、員工旅遊團聚？團體包廂怎麼訂、一人多少錢(8 人約 6 萬–17.5 萬韓元)，中文表單預訂、免訂金。",
      ogTitle: "首爾慶生/團體包廂",
      ogSub: "生日、單身派對、出差團 — 一人價格",
      keywords: [
        "首爾 夜店 生日", "首爾 生日 包廂", "江南 夜店 團體", "首爾 夜店 幾個人",
        "首爾 夜店 包廂 一人", "首爾 夜店 低消", "首爾 單身派對", "首爾 夜店 訂包廂",
      ],
      eyebrow: "生日 · 單身派對 · 團體",
      h1: "首爾夜店 — 生日與團體包廂",
      intro:
        "我們處理的包廂預訂大多是 4 到 10 人的團 — 慶生、單身派對、朋友旅行、公司出差。對一群人來說，包廂不是奢侈，而是讓大家一起進場、不會在門口被卡、有位子坐和放東西、不用整晚擠在吧台的辦法。低消按桌算、整團分攤，人越多一人越便宜。",
      areasH2: "哪一區適合你們",
      areas: [
        { name: "江南", tag: "大場面 · 門口嚴", body: "大型 EDM 夜店，最有大場面的派對感，門口也最嚴 — 最需要包廂的區域。每桌低消 140 萬韓元：8 個人一人約 17.5 萬韓元。", href: "/zh-tw/clubs/gangnam" },
        { name: "弘大", tag: "年輕 · 嘻哈", body: "夜店密集、氣氛輕鬆。每桌低消 50 萬韓元(部分更低)：6 個人一人約 8.3 萬韓元。", href: "/zh-tw/clubs/hongdae" },
        { name: "梨泰院", tag: "國際化 · 英文", body: "外國人多，講英文也好玩。每桌低消 50 萬韓元：8 個人一人約 6.25 萬韓元。", href: "/zh-tw/clubs/itaewon" },
      ],
      stepsH2: "團體預訂流程",
      steps: [
        { time: "1. 申請", text: "傳來日期、人數和目的(慶生、單身派對、員工旅遊)。可以選夜店，也可以只說區域，我們推薦。" },
        { time: "2. 確認", text: "我們用韓文跟夜店確認(包括能為這次活動做什麼)，確認前把最終價格書面傳給你。" },
        { time: "3. 當晚", text: "帶護照到場。包廂用你的名字訂好，從夜店酒單點酒，當晚在夜店付款。免訂金。" },
      ],
      pricesH2: "包廂價格 — 真實酒單",
      pricesNote:
        "以下是夜店的真實酒單。低消是每桌不是每人 — 整團分攤。人很多的話可能需要大桌或兩桌，確認前我們會告訴你總額。",
      faqH2: "生日與團體包廂 — 常見問題",
      faqs: [
        { q: "首爾夜店包廂一人多少錢？", a: "低消按桌算、整團分攤：江南 140 萬韓元，弘大和梨泰院 50 萬韓元(弘大部分更低)，從夜店自己的酒單湊滿。8 個人的話江南一人約 17.5 萬韓元，梨泰院約 6.25 萬韓元。" },
        { q: "慶生夜店能安排嗎？", a: "申請時告訴我們是生日。我們會問夜店能做什麼(例如生日開酒儀式)，連同價格事先告訴你。能做什麼看夜店。" },
        { q: "一桌能坐幾個人？", a: "看夜店和桌型。告訴我們人數，我們跟夜店確認合適的桌。10 人以上可能是大桌或兩桌，總額會先確認。" },
        { q: "單身派對可以嗎？", a: "可以，慶祝的團體在首爾夜店很常見。全員需 19 歲以上(2026 年為 2007 年(含)以前出生)並帶護照正本。江南服裝嚴，不能穿短褲、背心、拖鞋。" },
        { q: "要付訂金嗎？", a: "不用。申請免費，免訂金、無中介費。當晚前書面確認最終價格，當晚直接付給夜店。不用找公關。" },
        { q: "12 月公司尾牙能訂包廂嗎？", a: "可以。12 月是韓國的年末聚會季，週五、週六的包廂可能比平常更早被訂走 — 建議提前 2–3 週申請。告訴我們人數、說明是公司聚會，確認前我們會把包廂和最終價格書面告訴你。" },
      ],
      ctaH2: "訂團體包廂",
      ctaBody: "告訴我們日期、人數和目的。我們用韓文跟夜店確認，把最終價格書面傳給你。免費申請，免訂金。",
      cta: "🎉 訂團體包廂",
      ctaNote: "免費申請 · 免訂金 · 當晚在夜店付款",
      moreH2: "更多",
      more: [
        { label: "首爾聖誕節 2026 →", href: "/zh-tw/christmas-seoul" },
        { label: "首爾跨年 2026 →", href: "/zh-tw/new-years-eve-seoul" },
        { label: "首爾夜店包廂價格一覽 →", href: "/zh-tw/vip-tables" },
        { label: "服裝與入場規定 →", href: "/zh-tw/club-entry-rules" },
      ],
      back: "← NightFlow",
      breadcrumb: "慶生/團體包廂",
    },
  },
};
