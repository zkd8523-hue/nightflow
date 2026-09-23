// 지역 프로필 — 지역 페이지(/{lang}/clubs/{area}) 상단 "이 지역은 이런 곳" 블록의 데이터.
//
// 왜 따로 두나(2026-09-23): 4개 언어 지역 페이지가 각자 AREA_CONFIG(SEO 산문, sr-only)를
// 갖고 있어 거기 넣으면 같은 판단을 4번 복사하게 된다. 이건 "왜 이 지역인가"라는 편집
// 판단이라 한 곳에서 관리해야 4언어가 안 갈린다. SEO 산문(intro/vibe)은 그대로 두고 —
// 크롤러용이라 — 사람이 보는 블록만 여기서 나간다.
//
// 구조는 목업(B+C) 그대로: 인용(남이 한 말) → ✓ 맞는 사람 → ✗ 아닌 사람(있을 때만).
// ✗가 비면 컴포넌트가 박스를 안 그린다 — 이태원·부산은 "안 되는 게 없다"가 구조로 보인다.
//
// 인용 출처는 전부 외부(TripAdvisor·Creatrip·thedj-diaries·gofarther·Trazy·Google 리뷰).
// 우리 카피를 인용처럼 꾸미지 않는다 — 부산 3번째는 외부 인용이 부족해 2개만 둔다.
// 원문은 영어; 다른 언어는 번역이고 출처 표기는 그대로.
//
// 사실 확인 메모(사장님 지시, 2026-09-23):
//   - 추천 연령: 홍대 20s–30s · 강남 25–40s · 이태원 20s–40s. 부산은 지시 없어 안 씀.
//   - 이태원에 보틀 서비스 있음(우리 상품이 보틀 테이블) — "이태원은 스탠딩" 류 문장 금지.
//   - 부산 "워크인 거절" ✗ 안 씀 — 우리 손님은 예약이라 해당 없음. Groove & Spot·BELPOS가 우리 클럽.
//   - "the oldest crowd" 같은 나이 비교 표현 금지 — 읽는 사람 기분을 상하게 함.
//   - 문 난이도 배지 없음 — 예약 가능 클럽은 어디든 외국인 OK라 난이도가 상품과 모순.

import type { Lang } from "@/lib/i18n";

export type AreaProfileQuote = { text: string; source: string };
export type AreaProfile = {
  quotes: AreaProfileQuote[];
  fit: string[];
  skip: string[];
};

type ForeignLang = Exclude<Lang, "ko">;
type ProfileArea = "itaewon" | "gangnam" | "hongdae" | "busan";

const PROFILES: Record<ProfileArea, Record<ForeignLang, AreaProfile>> = {
  itaewon: {
    en: {
      quotes: [
        { text: "If you really want to meet people, go to Itaewon — these bars are all western style and you can sit alone and have a drink.", source: "TripAdvisor forum" },
        { text: "The crowd is usually more mixed in age — often mid-20s to 40s.", source: "Creatrip" },
        { text: "Roughly 50/50 Korean and international. Most staff speak English and a very welcoming door policy.", source: "thedj-diaries · gofarther" },
      ],
      fit: [
        "Recommended age: 20s–40s",
        "Solo — bars are Western-style, you can sit alone",
        "Techno / house heads — Cakeshop, Faust, Soap",
        "Bottle table without the Gangnam price — from ₩500k",
      ],
      skip: [],
    },
    ja: {
      quotes: [
        { text: "人と出会いたいなら梨泰院へ。どのバーも欧米スタイルで、一人で座って一杯やれる。", source: "TripAdvisor forum" },
        { text: "客層は年齢が幅広く、20代半ばから40代まで。", source: "Creatrip" },
        { text: "韓国人と外国人がほぼ半々。スタッフの多くが英語を話し、入口はとても歓迎的。", source: "thedj-diaries · gofarther" },
      ],
      fit: ["おすすめ年齢: 20代〜40代", "一人でも — 欧米スタイルのバーで一人飲みが普通", "テクノ・ハウス好き — Cakeshop, Faust, Soap", "江南より安くボトルテーブル — ₩500kから"],
      skip: [],
    },
    zh: {
      quotes: [
        { text: "想认识人就去梨泰院——这里的酒吧都是西式的，一个人坐着喝一杯很自然。", source: "TripAdvisor forum" },
        { text: "客人年龄跨度大，通常是25到40多岁。", source: "Creatrip" },
        { text: "韩国人和外国人大约各占一半。大多数员工会英语，门口非常友好。", source: "thedj-diaries · gofarther" },
      ],
      fit: ["推荐年龄：20多岁到40多岁", "一个人也可以——西式酒吧，独自坐下喝一杯很正常", "Techno / House 爱好者——Cakeshop, Faust, Soap", "不用江南的价格也能订桌位——₩500k起"],
      skip: [],
    },
    "zh-tw": {
      quotes: [
        { text: "想認識人就去梨泰院——這裡的酒吧都是西式的，一個人坐著喝一杯很自然。", source: "TripAdvisor forum" },
        { text: "客人年齡跨度大，通常是25到40多歲。", source: "Creatrip" },
        { text: "韓國人和外國人大約各占一半。大多數員工會英語，門口非常友善。", source: "thedj-diaries · gofarther" },
      ],
      fit: ["推薦年齡：20多歲到40多歲", "一個人也可以——西式酒吧，獨自坐下喝一杯很正常", "Techno / House 愛好者——Cakeshop, Faust, Soap", "不用江南的價格也能訂包廂——₩500k起"],
      skip: [],
    },
  },

  gangnam: {
    en: {
      quotes: [
        { text: "Buying a table is the magic way to get in without problems.", source: "TripAdvisor forum" },
        { text: "Not allowed in because of the 'dress code' — though others in less appropriate attire were let in. They only wanted to allow entrance by purchasing a VIP table.", source: "TripAdvisor review, Club Octagon" },
        { text: "Paid 660,000 won for a VIP table on a Saturday and received two bottles.", source: "TripAdvisor review, Club Octagon" },
      ],
      fit: ["Recommended age: 25–40s", "Groups of 4–10 with a table — you walk straight in", "Bottle service, VIP tables, dressed up"],
      skip: ["Solo men without a table — turned away", "Shorts, sandals, athletic wear — refused at the door", "Weekend walk-in without a table"],
    },
    ja: {
      quotes: [
        { text: "テーブルを買うのが、問題なく入るための魔法の方法。", source: "TripAdvisor forum" },
        { text: "「ドレスコード」を理由に入場拒否——もっとラフな格好の人は入れていたのに。VIPテーブルを買えば入れると言われた。", source: "TripAdvisor review, Club Octagon" },
        { text: "土曜のVIPテーブルに66万ウォン払って、ボトル2本。", source: "TripAdvisor review, Club Octagon" },
      ],
      fit: ["おすすめ年齢: 25〜40代", "テーブル付きの4〜10人グループ — そのまま入場", "ボトルサービス・VIPテーブル・ドレスアップ"],
      skip: ["テーブルなしの男性一人 — 断られる", "短パン・サンダル・スポーツウェア — 入口で拒否", "テーブルなしの週末飛び込み"],
    },
    zh: {
      quotes: [
        { text: "订桌位是顺利进门的万能钥匙。", source: "TripAdvisor forum" },
        { text: "以「着装要求」为由拒绝入场——但穿得更随便的人却进去了。他们只肯让买VIP桌位的人进。", source: "TripAdvisor review, Club Octagon" },
        { text: "周六VIP桌位付了66万韩元，含两瓶酒。", source: "TripAdvisor review, Club Octagon" },
      ],
      fit: ["推荐年龄：25到40多岁", "4–10人团体订好桌位——直接进场", "瓶装服务、VIP桌位、穿得体面"],
      skip: ["没有桌位的单身男性——会被拒", "短裤、凉鞋、运动装——门口就被挡", "周末没订桌位直接来"],
    },
    "zh-tw": {
      quotes: [
        { text: "訂包廂是順利進門的萬能鑰匙。", source: "TripAdvisor forum" },
        { text: "以「服裝規定」為由拒絕入場——但穿得更隨便的人卻進去了。他們只肯讓買VIP包廂的人進。", source: "TripAdvisor review, Club Octagon" },
        { text: "週六VIP包廂付了66萬韓元，含兩瓶酒。", source: "TripAdvisor review, Club Octagon" },
      ],
      fit: ["推薦年齡：25到40多歲", "4–10人團體訂好包廂——直接進場", "瓶裝服務、VIP包廂、穿得體面"],
      skip: ["沒有包廂的單身男性——會被拒", "短褲、涼鞋、運動裝——門口就被擋", "週末沒訂包廂直接來"],
    },
  },

  hongdae: {
    en: {
      quotes: [
        { text: "Almost universally open-door. You pay cover, you walk in.", source: "thedj-diaries" },
        { text: "Great night out for under ₩70,000.", source: "gofarther" },
        { text: "College students, young professionals, and international visitors — the youngest crowd in Seoul.", source: "TripAdvisor · Creatrip" },
      ],
      fit: ["Recommended age: 20s–30s", "On a budget — a night for under ₩70k", "First night in Korea — cheapest, easiest entry", "K-pop and hip-hop"],
      skip: ["Looking for a quiet drink — it's standing and loud"],
    },
    ja: {
      quotes: [
        { text: "ほぼどこも自由入場。カバーを払えば入れる。", source: "thedj-diaries" },
        { text: "7万ウォン以下で十分楽しめる夜。", source: "gofarther" },
        { text: "大学生・若い社会人・外国人旅行者 — ソウルで最も若い客層。", source: "TripAdvisor · Creatrip" },
      ],
      fit: ["おすすめ年齢: 20代〜30代", "予算重視 — 7万ウォン以下で一晩", "韓国初日 — 一番安くて入りやすい", "K-popとヒップホップ"],
      skip: ["静かに飲みたい人 — スタンディングで大音量"],
    },
    zh: {
      quotes: [
        { text: "几乎都是开放入场。付了门票就能进。", source: "thedj-diaries" },
        { text: "7万韩元以内就能玩得很尽兴。", source: "gofarther" },
        { text: "大学生、年轻上班族、国际游客——首尔最年轻的人群。", source: "TripAdvisor · Creatrip" },
      ],
      fit: ["推荐年龄：20到30多岁", "预算有限——一晚不到7万韩元", "在韩国的第一晚——最便宜、最容易进", "K-pop 和嘻哈"],
      skip: ["想安静喝一杯——这里是站着的，很吵"],
    },
    "zh-tw": {
      quotes: [
        { text: "幾乎都是開放入場。付了門票就能進。", source: "thedj-diaries" },
        { text: "7萬韓元以內就能玩得很盡興。", source: "gofarther" },
        { text: "大學生、年輕上班族、國際遊客——首爾最年輕的人群。", source: "TripAdvisor · Creatrip" },
      ],
      fit: ["推薦年齡：20到30多歲", "預算有限——一晚不到7萬韓元", "在韓國的第一晚——最便宜、最容易進", "K-pop 和嘻哈"],
      skip: ["想安靜喝一杯——這裡是站著的，很吵"],
    },
  },

  busan: {
    en: {
      quotes: [
        { text: "These days it's quite difficult to find a club that will allow foreigners — I was so happy to find one that didn't even blink an eye.", source: "Google review, Output" },
        { text: "Table fee from 380,000 KRW on Thursdays and Sundays, 450,000 on Fridays and Saturdays.", source: "Trazy, Club Flux (Haeundae)" },
      ],
      fit: ["Booked table — the only reliable way in for foreigners", "Haeundae hotel clubs — table culture, Gangnam-style", "Summer beach season"],
      skip: [],
    },
    ja: {
      quotes: [
        { text: "最近は外国人を入れてくれるクラブを探すのがかなり難しい — 何も気にせず入れてくれる店を見つけて本当に嬉しかった。", source: "Google review, Output" },
        { text: "テーブル料金は木・日が38万ウォンから、金・土が45万ウォンから。", source: "Trazy, Club Flux (海雲台)" },
      ],
      fit: ["予約テーブル — 外国人が確実に入れる唯一の方法", "海雲台のホテルクラブ — テーブル文化、江南スタイル", "夏のビーチシーズン"],
      skip: [],
    },
    zh: {
      quotes: [
        { text: "现在很难找到允许外国人进的夜店——找到一家完全不介意的，真的太开心了。", source: "Google review, Output" },
        { text: "桌位费周四、周日38万韩元起，周五、周六45万起。", source: "Trazy, Club Flux (海云台)" },
      ],
      fit: ["订好桌位——外国人唯一靠得住的进场方式", "海云台酒店夜店——桌位文化，江南风格", "夏季海滩季"],
      skip: [],
    },
    "zh-tw": {
      quotes: [
        { text: "現在很難找到允許外國人進的夜店——找到一家完全不介意的，真的太開心了。", source: "Google review, Output" },
        { text: "包廂費週四、週日38萬韓元起，週五、週六45萬起。", source: "Trazy, Club Flux (海雲台)" },
      ],
      fit: ["訂好包廂——外國人唯一靠得住的進場方式", "海雲台飯店夜店——包廂文化，江南風格", "夏季海灘季"],
      skip: [],
    },
  },
};

/**
 * 지역 슬러그 → 프로필. apgujeong은 강남 하위 지역이라 강남 프로필로 폴백한다 —
 * 다섯 번째 세트를 따로 쓸 만큼 다르지 않고, 압구정 라운지는 강남 ✓("Bottle service, VIP
 * tables")에 이미 들어 있다. 모르는 슬러그면 null → 컴포넌트가 아무것도 안 그린다.
 */

export function getAreaProfile(slug: string, lang: Lang): AreaProfile | null {
  if (lang === "ko") return null;
  const key: ProfileArea | null =
    slug === "apgujeong" ? "gangnam"
    : slug === "itaewon" || slug === "gangnam" || slug === "hongdae" || slug === "busan" ? slug
    : null;
  return key ? PROFILES[key][lang] : null;
}
