// 나라별 검색 특성에 맞춘 FAQ(2026-09-14). SERP·커뮤니티 실측:
//   JA: 「顔審査」「日本人 行ける」「料金」「パスポート コピー」 — KPOPジャーナル/知恵袋 프레임. 얼굴 심사 공포가 1순위.
//   TW: 「進不進得去」「被擋」「穿搭」「一個人」 — FFD·Dcard 프레임. 문 앞에서 잘리는 공포.
//   ZH: 「外国人能进吗」「门票多少」「卡座多少钱」「支付宝能用吗」 — 在首尔·小红书 프레임. 통과율·결제.
//   EN: "can foreigners get in", "face control", "entry fee", "table cost", "cash or card", "solo" — Reddit 프레임.
//
// 구조(크리틱 1차 반영): 같은 8문답을 지역 페이지 4곳 + 가격표에 복제하면 홍대 페이지가 "강남은 반바지 금지"를
// 답하는 식으로 페이지와 어긋나고 20개 FAQPage가 희석된다. 그래서 문답을 id로 두고
//   지역 페이지 = 그 지역 전용 4개 + 공통 2개(신분증·한국어 없이 예약)
//   가격표(vip-tables) = 공통 3개(신분증·결제·예약)만
// 으로 조합한다.
//
// 사실 원칙: "입장 보장/唯一" 같은 클럽이 깰 수 있는 약속은 쓰지 않는다 — "가장 확실한 방법, MD가 입구에서
// 맞이해 일반 줄은 안 선다. 여권 원본·강남 복장은 MD도 면제 못 함"까지만. 결제(외국 카드·간편결제)·
// 여성 무료·만석 입장 중단·MD 영어는 전부 "~할 수 있다/店마다 다르다"로 헤지. 사실은 ClubEntryRulesPage·
// tablePricing과 같은 값(여권 원본, 현금 2~3만, 하한 ₩1M/₩500k).
//
// 서버 컴포넌트. 화면에 그대로 보이고, 같은 문답을 FAQPage JSON-LD로 낸다(가시 텍스트 1:1).

import type { SeoLang } from "@/lib/seo/clubBookingSeo";
import { bookingFloor, formatWon, wonCompact } from "@/lib/clubs/tablePricing";

export type MarketArea = "gangnam" | "hongdae" | "itaewon" | "apgujeong" | "busan";
type Faq = { q: string; a: string };
type FaqId = "door" | "id" | "price" | "pay" | "arrive" | "dress" | "solo" | "book" | "nights";

const AS_OF = "2026-09";
const G = bookingFloor("강남");
const H = bookingFloor("홍대");
const won = (n: number, lang: SeoLang) => `${formatWon(n)}（≈ ${wonCompact(n, lang)}）`;

// 지역별 조합. apgujeong은 강남과 같은 문(門) 문화. busan은 공통 위주.
const SETS: Record<MarketArea | "all", FaqId[]> = {
  gangnam: ["door", "dress", "arrive", "solo", "id", "book"],
  apgujeong: ["door", "dress", "arrive", "solo", "id", "book"],
  hongdae: ["door", "price", "solo", "pay", "id", "book"],
  itaewon: ["door", "nights", "solo", "pay", "id", "book"],
  // busan: 부산 하한은 FOREIGN_TABLE_FLOOR에 없어(폴백 ₩500k) 가격 문답을 빼고 클럽 페이지로 보낸다.
  busan: ["door", "id", "pay", "book"],
  all: ["id", "pay", "book"],
};

type Dict = { h2: (area: string | null) => string; intro: string; faq: (id: FaqId, area: MarketArea | null, label: string) => Faq };

const COPY: Record<SeoLang, Dict> = {
  en: {
    h2: (a) => (a ? `What foreigners actually ask about ${a} clubs` : "What foreigners actually ask before booking"),
    intro: `Straight answers to the questions that come up on Reddit and in our booking chats. Facts as of ${AS_OF}.`,
    faq: (id, area, label) => {
      const strictDoor = area === "gangnam" || area === "apgujeong";
      switch (id) {
        case "door":
          return strictDoor
            ? { q: `Can foreigners get into ${label} clubs? Is there face control?`, a: `Yes, foreigners get in, but ${label} has a real door: staff check dress and age, and popular clubs may stop admitting at capacity. A booked table is the closest thing to guaranteed entry — your MD meets you at the door and you skip the general queue. You still need a physical passport and the dress code; no host can override those.` }
            : area === "hongdae"
              ? { q: "Can foreigners get into Hongdae clubs?", a: "Yes — Hongdae doors are the most relaxed in Seoul and many clubs have free entry. On busy nights (Friday and Saturday) the popular ones queue after 23:00 and may cap entry at capacity. With a table your MD walks you in." }
              : area === "itaewon"
                ? { q: "Can foreigners get into Itaewon clubs?", a: "Yes — Itaewon is Seoul's most international district and doors rarely turn foreigners away for being foreign. A physical passport is still required for the age check. With a table your MD meets you at the door and you skip the general queue." }
                : { q: `Can foreigners get into ${label} clubs?`, a: `Yes. Bring a physical passport for the age check. With a table booked through NightFlow your MD meets you at the door and you skip the general queue.` };
        case "id":
          return { q: "What ID do I need?", a: "A physical passport (or Korean ARC). Photos and photocopies are not accepted — ID checks are a legal obligation for the venue. Clubs are 19+ under Korea's year-based rule (in 2026: born 2007 or earlier)." };
        case "price":
          return area === "hongdae"
            ? { q: "How much is entry and how much is a table in Hongdae?", a: `Entry is usually ₩10,000–₩30,000 and some Hongdae clubs waive it for women on certain nights — check the club page. Tables through NightFlow start at ${won(H, "en")} per table, filled from the club's printed menu, for the whole group.` }
            : { q: `How much is a table in ${label}?`, a: `Tables through NightFlow start at ${won(H, "en")} per table outside Gangnam and ${won(G, "en")} in Gangnam, filled from the club's printed menu — for the whole group, not per person. Entry is usually ₩10,000–₩30,000 and can be higher on weekends.` };
        case "pay":
          return { q: "Cash or card?", a: "Cards work in most clubs, but some door terminals refuse foreign cards, so carry ₩20,000–₩30,000 in cash for the entry fee. Tables booked through NightFlow are paid to the club on the night; no deposit, no platform fee." };
        case "arrive":
          return { q: `What time should I arrive in ${label}?`, a: `Before 23:00 on Friday and Saturday is safest; popular ${label} clubs often queue after that and may stop admitting at capacity. With a table you can arrive later, but ask early in the week — availability is first come, first served.` };
        case "dress":
          return { q: `What should I wear in ${label}?`, a: `${label} doors are the strictest in Seoul: no shorts, tank tops, slides or sportswear. A plain shirt or an all-black outfit with clean closed shoes is the safe choice.` };
        case "solo":
          return strictDoor
            ? { q: `Is it OK to go alone in ${label}?`, a: `You can, but ${label} nights run table by table, so a group of 3–4 splitting one table gets far more out of it. Solo visitors usually have an easier night in Hongdae or Itaewon.` }
            : { q: `Is it OK to go alone in ${label}?`, a: `Yes. ${label} is one of the easiest districts in Seoul to go out solo — free-entry clubs, mixed crowds and plenty of foreigners. If you'd rather have a base for the night, a table with a host works well too.` };
        case "nights":
          return { q: "Which nights are Itaewon clubs open?", a: "Many Itaewon clubs run Friday and Saturday only; several are closed or quiet mid-week. Check the club page for nights and hours before you plan around it." };
        case "book":
          return { q: "How does booking work if I don't speak Korean?", a: "Pick a club, date and group size and choose items from its real menu. NightFlow confirms with the club in Korean and sends you the final price in writing. On the night your MD meets you; the price is already fixed, so there is little to negotiate." };
      }
    },
  },

  ja: {
    h2: (a) => (a ? `${a}のクラブについて日本人がよく聞く質問（顔審査・料金・パスポート）` : "予約前に日本人がよく聞く質問（パスポート・支払い・予約）"),
    intro: `知恵袋やご予約相談で繰り返し聞かれる質問への答えです。${AS_OF}時点の情報。`,
    faq: (id, area, label) => {
      const strictDoor = area === "gangnam" || area === "apgujeong";
      switch (id) {
        case "door":
          return strictDoor
            ? { q: `${label}のクラブは日本人でも入れますか？顔審査はありますか？`, a: `入れます。ただし${label}は入口が本当に厳しく、服装と年齢を確認し、人気店は満員になると入場を止めることがあります。テーブル予約が一番確実です。担当MDが入口まで迎えに来て一般の行列に並ばずに入れます。ただしパスポート原本とドレスコードは必須で、MDでも免除できません。` }
            : area === "hongdae"
              ? { q: "弘大のクラブは日本人でも入れますか？", a: "入れます。弘大はソウルで一番入口がゆるく、無料入場の店も多いです。混む夜（金・土）は人気店で23時以降に行列ができ、満員時は入場を止めることがあります。テーブルがあれば担当MDが入口で迎え、一般の行列には並びません。" }
              : area === "itaewon"
                ? { q: "梨泰院のクラブは日本人でも入れますか？", a: "入れます。梨泰院はソウルで最も国際的なエリアで、外国人だからという理由で断られることはほぼありません。年齢確認のためパスポート原本は必要です。テーブルがあれば担当MDが入口で迎え、一般の行列には並びません。" }
                : { q: `${label}のクラブは日本人でも入れますか？`, a: `入れます。年齢確認のためパスポート原本をお持ちください。NightFlowでテーブルを予約すれば担当MDが入口で迎え、一般の行列には並びません。` };
        case "id":
          return { q: "身分証は何が必要ですか？パスポートのコピーで大丈夫？", a: "パスポートの原本（または韓国のARC）が必要です。写真やコピーは受け付けません — 店側の法的義務なのでほぼ融通が利きません。韓国の年齢基準で19歳以上（2026年は2007年以前生まれ）。" };
        case "price":
          return area === "hongdae"
            ? { q: "弘大のクラブの入場料とテーブル料金は？", a: `入場料はだいたい₩10,000〜₩30,000で、弘大では曜日によって女性無料の店もあります（各店ページで確認を）。NightFlowでのテーブルは1卓 ${won(H, "ja")}〜で、店の正規メニューから注文して最低金額を満たす形。人数ではなくテーブル単位です。` }
            : { q: `${label}のテーブル料金は？`, a: `NightFlowでのテーブルは江南以外 1卓 ${won(H, "ja")}〜、江南 ${won(G, "ja")}〜。店の正規メニューから注文して最低金額を満たす形で、人数ではなくテーブル単位です。入場料は₩10,000〜₩30,000程度、週末は高くなることがあります。` };
        case "pay":
          return { q: "現金は必要ですか？カードは使えますか？", a: "ほとんどの店でカードが使えますが、入口の端末で海外カードが通らないことがあるので、入場料分の現金₩20,000〜30,000を持っていくと安心です。NightFlowで予約したテーブルは当日クラブに直接支払い。デポジット不要・手数料なし。" };
        case "arrive":
          return { q: `${label}には何時に行けばいいですか？`, a: `金・土は23時前が無難です。${label}の人気店はそれ以降に行列ができ、満員で入場を止めることがあります。テーブルがあれば遅く着いても入れますが、空きは早い者順なので週の前半にリクエストしてください。` };
        case "dress":
          return { q: `${label}の服装は？`, a: `${label}の入口はソウルで一番厳しいです。短パン・タンクトップ・サンダル・スポーツウェアは不可。シンプルなシャツか全身黒に、きれいめの靴が無難です。` };
        case "solo":
          return strictDoor
            ? { q: `${label}に一人で行っても大丈夫？`, a: `行けますが、${label}の夜は基本的にテーブル単位で回るので、3〜4人で1卓を割る方がずっと楽しめます。一人なら弘大か梨泰院の方が入りやすいです。` }
            : { q: `${label}に一人・女性一人で行っても大丈夫？`, a: `大丈夫です。${label}はソウルで一番一人で行きやすいエリアで、無料入場の店が多く外国人も多いです。落ち着ける拠点が欲しければ、担当MD付きのテーブルという選択肢もあります。` };
        case "nights":
          return { q: "梨泰院のクラブは何曜日に開いていますか？", a: "梨泰院は金・土のみ営業の店が多く、平日は閉まっているか静かな店がかなりあります。予定を組む前に各店ページで営業日と時間を確認してください。" };
        case "book":
          return { q: "韓国語が話せなくても予約できますか？", a: "できます。クラブ・日付・人数を選び、実際のメニューから注文したい項目を選ぶだけ。NightFlowが韓国語でクラブに確認し、最終価格を書面で送ります。当日は担当MDが迎えます。価格は事前に確定しているので、現地でのやり取りはほとんど不要です。" };
      }
    },
  },

  zh: {
    h2: (a) => (a ? `外国人去${a}夜店前最常问的问题` : "预订前最常问的问题（证件、付款、预订）"),
    intro: `小红书和预订咨询里反复出现的问题，直接给答案。信息截至 ${AS_OF}。`,
    faq: (id, area, label) => {
      const strictDoor = area === "gangnam" || area === "apgujeong";
      switch (id) {
        case "door":
          return strictDoor
            ? { q: `外国人能进${label}的夜店吗？会看脸吗？`, a: `能进，但${label}是真正有门槛的：会看穿搭和年龄，热门店满员时可能停止入场。最稳的是提前订好卡座：MD 在门口接你，不用排普通队。但护照原件和着装要求照样要过，MD 也没法帮你免。` }
            : area === "hongdae"
              ? { q: "外国人能进弘大的夜店吗？", a: "能进。弘大是首尔门口最松的区，很多店免费入场。热闹的晚上（周五周六）热门店 23 点后要排队，满了可能停止入场。订了卡座的话 MD 在门口接你，不用排普通队。" }
              : area === "itaewon"
                ? { q: "外国人能进梨泰院的夜店吗？", a: "能进。梨泰院是首尔最国际化的区，几乎不会因为你是外国人被拒。查年龄要护照原件。订了卡座的话 MD 在门口接你，不用排普通队。" }
                : { q: `外国人能进${label}的夜店吗？`, a: `能进。查年龄要带护照原件。通过 NightFlow 订了卡座，MD 会在门口接你，不用排普通队。` };
        case "id":
          return { q: "要带什么证件？护照复印件可以吗？", a: "要护照原件（或韩国 ARC）。照片和复印件不接受 — 查证件是店家的法律义务，几乎没有通融。按韩国的年龄算法 19 岁以上（2026 年是 2007 年及以前出生）。" };
        case "price":
          return area === "hongdae"
            ? { q: "弘大夜店门票多少钱？卡座多少钱？", a: `门票一般 ₩10,000–₩30,000，弘大部分店特定晚上女生免费（看各店页面）。通过 NightFlow 订卡座每桌 ${won(H, "zh")} 起，从夜店印刷酒单里选酒凑满，按整桌算。` }
            : { q: `${label}卡座多少钱？`, a: `通过 NightFlow 订卡座：江南以外每桌 ${won(H, "zh")} 起，江南 ${won(G, "zh")} 起，从夜店印刷酒单里选酒凑满 — 按整桌算，不是每人。门票一般 ₩10,000–₩30,000，周末可能更高。` };
        case "pay":
          return { q: "能刷卡吗？支付宝、微信能用吗？", a: "多数夜店能刷卡，但门口收门票的机器偶尔刷不了外卡，现金 ₩20,000–30,000 备着最稳。支付宝、微信别指望 — 夜店基本没接，个别店接了 Alipay+ 也不要当成能用。通过 NightFlow 订的卡座当晚直接付给夜店，无押金、无平台费。" };
        case "arrive":
          return { q: `${label}几点去合适？`, a: `周五周六 23 点前最稳。${label}的热门店 23 点之后经常要排，满了可能停止入场。有卡座可以晚点到，但位子先到先得，周初就发申请。` };
        case "dress":
          return { q: `去${label}穿什么？`, a: `${label}的门口是首尔最严的：短裤、背心、拖鞋、运动装不行。素色衬衫或全黑加干净的包鞋最稳。` };
        case "solo":
          return strictDoor
            ? { q: `一个人可以去${label}吗？`, a: `可以，但${label}基本是一桌一桌玩，3–4 个人分一桌划算得多。一个人的话弘大、梨泰院更好进。` }
            : { q: `一个人可以去${label}吗？`, a: `可以。${label}是首尔最适合一个人去的区之一：免费入场的店多、人群混合、外国人多。想有个据点的话，带 MD 的卡座也行。` };
        case "nights":
          return { q: "梨泰院的夜店哪几天开？", a: "梨泰院很多店只在周五周六营业，平时不少店关门或很冷清。安排行程前先看各店页面的营业日和时间。" };
        case "book":
          return { q: "不会韩语能沟通吗？有中文 MD 吗？", a: "现场没有中文 MD，但预订全程中文：你选夜店、日期、人数，从真实酒单里选酒，NightFlow 用韩语向夜店确认，把最终价格书面发给你。当晚 MD 会接待，语言以简单英语为主；价格已经书面定好，所以现场几乎不需要沟通。" };
      }
    },
  },

  "zh-tw": {
    h2: (a) => (a ? `台灣人去${a}夜店前最常問的問題` : "訂位前最常問的問題（證件、付款、訂位）"),
    intro: `Dcard、Threads 和訂位諮詢裡一直出現的問題，直接給答案。資訊截至 ${AS_OF}。`,
    faq: (id, area, label) => {
      const strictDoor = area === "gangnam" || area === "apgujeong";
      switch (id) {
        case "door":
          return strictDoor
            ? { q: `台灣人進得去${label}的夜店嗎？會被擋在門口嗎？`, a: `進得去，但${label}是真的有門檻的：會看穿搭和年齡，熱門店滿了可能停止入場。最保險的是先訂好桌位：MD 在門口接你，不用排一般的隊。但護照正本和穿搭規定還是要過，MD 也沒辦法幫你免。` }
            : area === "hongdae"
              ? { q: "台灣人進得去弘大的夜店嗎？", a: "進得去。弘大是首爾門口最鬆的區，很多店免費入場。熱鬧的晚上（週五週六）熱門店 23 點後要排，滿了可能停止入場。訂了桌位的話 MD 在門口接你，不用排一般的隊。" }
              : area === "itaewon"
                ? { q: "台灣人進得去梨泰院的夜店嗎？", a: "進得去。梨泰院是首爾最國際化的區，幾乎不會因為你是外國人被擋。查年齡要護照正本。訂了桌位的話 MD 在門口接你，不用排一般的隊。" }
                : { q: `台灣人進得去${label}的夜店嗎？`, a: `進得去。查年齡要帶護照正本。透過 NightFlow 訂了桌位，MD 會在門口接你，不用排一般的隊。` };
        case "id":
          return { q: "要帶什麼證件？護照影本可以嗎？", a: "要護照正本（或韓國 ARC）。照片和影本不收 — 查證件是店家的法律義務，幾乎沒得通融。按韓國的年齡算法 19 歲以上（2026 年是 2007 年含以前出生）。" };
        case "price":
          return area === "hongdae"
            ? { q: "弘大夜店入場費多少？桌位多少錢？", a: `入場費一般 ₩10,000–₩30,000（約 NT$230–700），弘大部分店特定晚上女生免費（看各店頁面）。透過 NightFlow 訂桌位每桌 ${won(H, "zh-tw")} 起，從夜店印好的酒單選酒湊滿，按整桌算。` }
            : { q: `${label}桌位多少錢？`, a: `透過 NightFlow 訂桌位：江南以外每桌 ${won(H, "zh-tw")} 起，江南 ${won(G, "zh-tw")} 起，從夜店印好的酒單選酒湊滿 — 按整桌算，不是每人。入場費一般 ₩10,000–₩30,000，週末可能更高。` };
        case "pay":
          return { q: "可以刷卡嗎？要帶現金嗎？", a: "多數夜店可以刷卡，但門口收入場費的機器偶爾刷不了海外卡，帶 ₩20,000–30,000 現金比較保險。透過 NightFlow 訂的桌位當晚直接付給夜店，免訂金、無平台費。" };
        case "arrive":
          return { q: `${label}幾點去比較不會排？`, a: `週五週六 23 點前最保險。${label}的熱門店 23 點之後經常要排，滿了可能停止入場。有桌位可以晚點到，但位子先到先得，週初就送出申請。` };
        case "dress":
          return { q: `去${label}穿什麼才不會被擋？`, a: `${label}的門口是首爾最嚴的：短褲、背心、拖鞋、運動服不行。素色襯衫或全黑加乾淨的包鞋最保險。` };
        case "solo":
          return strictDoor
            ? { q: `一個人可以去${label}嗎？`, a: `可以，但${label}基本上是一桌一桌在玩，3–4 個人分一桌划算得多。一個人的話弘大、梨泰院比較好進。` }
            : { q: `一個人可以去${label}嗎？台灣人多嗎？`, a: `可以。${label}是首爾最適合一個人去的區之一：免費入場的店多、人群混合、外國人多，講中文的也常遇到（台灣人比例沒有統計）。想有個據點的話，有 MD 的桌位也行。` };
        case "nights":
          return { q: "梨泰院的夜店哪幾天有開？", a: "梨泰院很多店只在週五週六營業，平日不少店沒開或很冷清。排行程前先看各店頁面的營業日和時間。" };
        case "book":
          return { q: "不會韓語怎麼訂？", a: "全程中文：你選夜店、日期、人數，從真實酒單選酒，NightFlow 用韓語向夜店確認，把最終價格書面傳給你。當晚 MD 會接待，語言以簡單英文為主；價格已經書面確定，現場幾乎不用溝通。" };
      }
    },
  },
};

export function marketFaqs(lang: SeoLang, area: MarketArea | null, areaLabel: string | null): Faq[] {
  const dict = COPY[lang];
  const ids = SETS[area ?? "all"];
  return ids.map((id) => dict.faq(id, area, areaLabel ?? ""));
}

export function marketFaqJsonLd(lang: SeoLang, area: MarketArea | null, areaLabel: string | null, pageUrl: string) {
  return {
    "@type": "FAQPage",
    "@id": `${pageUrl}#market-faq`,
    dateModified: `${AS_OF}-14`,
    mainEntity: marketFaqs(lang, area, areaLabel).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/** 화면 블록. JSON-LD는 페이지의 @graph에 marketFaqJsonLd로 넣는다(스크립트 중복 방지). */
export function MarketFaq({ lang, area = null, areaLabel = null }: { lang: SeoLang; area?: MarketArea | null; areaLabel?: string | null }) {
  const c = COPY[lang];
  const faqs = marketFaqs(lang, area, areaLabel);
  return (
    <section id="market-faq" className="space-y-3 scroll-mt-20">
      <h2 className="text-[20px] font-black break-keep">{c.h2(areaLabel)}</h2>
      <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">{c.intro}</p>
      <div className="space-y-3">
        {faqs.map((f) => (
          <div key={f.q}>
            <h3 className="text-[14px] font-bold text-foreground break-keep">{f.q}</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-0.5">{f.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
