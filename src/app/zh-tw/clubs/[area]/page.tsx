import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClubsClient } from "../../../en/clubs/ClubsClient";

type AreaSlug = "gangnam" | "hongdae" | "itaewon" | "busan" | "apgujeong";

const AREA_CONFIG: Record<
  AreaSlug,
  {
    koreanArea: string;
    zh: string;
    title: string;
    description: string;
    intro: string;
    vibe: string;
    topClubsNote: string;
    keywords: string[];
  }
> = {
  gangnam: {
    koreanArea: "강남",
    zh: "江南",
    title:
      "江南夜店預訂 2026 — VIP 包廂、狎鷗亭 &amp; 清潭包廂 (首爾)",
    description:
      "首爾江南最佳夜店和 VIP 包廂預訂。EDM 夜店、嘻哈、狎鷗亭 &amp; 清潭高端包廂。真實價格,VIP 包廂,無中介,無需韓語。台灣·香港旅客首選。",
    intro:
      "江南是首爾的高端夜生活區,雲集大型 EDM 夜店、嘻哈場所以及狎鷗亭、清潭的韓國頂級 VIP 包廂。NightFlow 讓您無需韓語即可預訂江南夜店包廂 — 真實價格,無中介。",
    vibe:
      "江南夜店以高能 EDM、時尚人群和奢華瓶裝服務著稱。主桌通常從 ₩750,000 起,VIP 包廂 ₩1,500,000 起。狎鷗亭和清潭雲集首爾最獨家的包廂,提供香檳服務。江南挑客較嚴,建議事先預訂。",
    topClubsNote:
      "江南頂級夜店包括 Club ACE (新沙,原 Race)、Massive、Club Pop、Mirabaud、Core Lounge (狎鷗亭 EDM)、Club Arzu (清潭高端) 和 DM Seoul (狎鷗亭嘻哈包廂)。",
    keywords: [
      "江南夜店",
      "江南夜店預訂",
      "江南夜店推薦",
      "江南VIP包廂",
      "江南包廂",
      "江南EDM夜店",
      "江南夜店挑客",
      "狎鷗亭包廂",
      "狎鷗亭夜店",
      "清潭包廂",
      "新沙夜店",
      "Club ACE 首爾",
      "首爾VIP包廂",
      "韓國VIP包廂",
      "首爾夜店預訂",
      "韓國夜店預訂",
      "台灣 江南 夜店",
      "香港 江南 夜店",
    ],
  },
  hongdae: {
    koreanArea: "홍대",
    zh: "弘大",
    title:
      "弘大夜店預訂 2026 — 嘻哈、K-POP &amp; 外國人友善 (首爾)",
    description:
      "首爾弘大最佳嘻哈和 K-POP 夜店預訂,靠近弘益大學。外國人友善,英文 OK,真實價格,無中介。選好夜店,我們直接為您預訂。台灣·香港旅客首選。",
    intro:
      "弘大是首爾的嘻哈和 K-POP 夜生活區,雲集靠近弘益大學的外國人友善夜店。這是旅客最容易入門的地區 — 大多數夜店接受 walk-in,但透過 NightFlow 預訂 VIP 包廂和 guest list 可獲得更好的座位並跳過排隊。",
    vibe:
      "弘大夜店主打嘻哈、K-POP 和 EDM。人群偏年輕 (20 出頭),國際化程度高,入場費通常 ₩10,000–30,000 (女性多數場所免費)。酒吧飲品 ₩10,000–15,000。比江南便宜很多。",
    topClubsNote:
      "弘大頂級夜店包括 Club Dokkaebi (高端嘻哈)、Sabotage、Attention、Club Purple (嘻哈,新手友善)、NB2 (K-POP,K-POP 旅客最愛)、Awesome Red 等。",
    keywords: [
      "弘大夜店",
      "弘大夜店推薦",
      "弘大夜店預訂",
      "弘大酒吧",
      "弘大嘻哈夜店",
      "弘大K-POP夜店",
      "弘大派對",
      "韓國最好的弘大夜店",
      "弘益大學夜店",
      "弘大外國人夜店",
      "Club Dokkaebi",
      "NB2 首爾",
      "首爾夜店預訂",
      "韓國夜店預訂",
      "台灣 弘大 夜店",
      "香港 弘大 夜店",
    ],
  },
  itaewon: {
    koreanArea: "이태원",
    zh: "梨泰院",
    title:
      "梨泰院夜店預訂 2026 — 國際化、英語友善夜生活 (首爾)",
    description:
      "首爾梨泰院最佳國際化夜店預訂。House、EDM、嘻哈、Disco。英語友善,外國人友善的人群。真實價格,VIP 包廂,無中介。",
    intro:
      "梨泰院是首爾的國際化夜生活區,外國旅客比例最高。音樂風格涵蓋 House、EDM、Disco、R&amp;B 和嘻哈。大多數員工會說英語,對不會韓語的旅客最為友善。",
    vibe:
      "梨泰院夜店國際化、規模較小,以音樂為重點 (House、Groove、R&amp;B)。入場費通常 ₩30,000–40,000。人群是首爾最多元化的 — 本地人、外籍人士、旅客都在這裡相聚。夜晚氣氛延續到清晨。",
    topClubsNote:
      "梨泰院頂級夜店包括 Soap Seoul (2026 年重開,House 和 Groove 音樂)、Cakeshop (傳奇地下場所) 以及梨泰院路上的各種國際酒吧和夜店。",
    keywords: [
      "梨泰院夜店",
      "梨泰院夜店預訂",
      "梨泰院酒吧",
      "梨泰院夜生活",
      "梨泰院外國人夜店",
      "梨泰院英語夜店",
      "Soap Seoul",
      "Cakeshop 首爾",
      "梨泰院House夜店",
      "首爾夜店預訂",
      "韓國夜店預訂",
    ],
  },
  apgujeong: {
    koreanArea: "강남",
    zh: "狎鷗亭",
    title:
      "狎鷗亭包廂預訂 2026 — 清潭高端 VIP 包廂 (首爾)",
    description:
      "預訂首爾狎鷗亭 &amp; 清潭高端 VIP 包廂。香檳服務、高端套餐、獨家人群。真實價格,無中介,無需韓語。",
    intro:
      "狎鷗亭和清潭雲集首爾最獨家的 VIP 包廂。香檳文化、高端瓶裝服務、時尚人群。NightFlow 讓外國旅客無需韓國本地朋友即可預訂狎鷗亭頂級包廂 — 韓國本地人的價格,韓國本地人的服務。",
    vibe:
      "狎鷗亭包廂高端、私密、精選。包廂起價 ₩2,000,000+。人群是高端 20–30 多歲,常見時尚·演藝圈人士。音樂根據場所不同涵蓋 EDM、嘻哈包廂和 House。著裝要求嚴格的 smart-casual 起步。",
    topClubsNote:
      "狎鷗亭 &amp; 清潭頂級包廂包括 Core Lounge (狎鷗亭 EDM,2026 年開業)、Club Arzu (清潭高端嘻哈)、DM Seoul (狎鷗亭嘻哈包廂)、Lion (清潭超高端明星場所)。",
    keywords: [
      "狎鷗亭包廂",
      "狎鷗亭包廂預訂",
      "狎鷗亭夜店",
      "清潭包廂",
      "清潭夜店",
      "清潭VIP",
      "首爾VIP包廂",
      "首爾香檳包廂",
      "Core Lounge 首爾",
      "Club Arzu",
      "DM Seoul",
      "狎鷗亭高端夜店",
      "韓國VIP包廂",
      "韓國夜店預訂",
    ],
  },
  busan: {
    koreanArea: "부산",
    zh: "釜山",
    title:
      "釜山夜店預訂 2026 — 海雲台、西面夜生活指南 (韓國)",
    description:
      "預訂釜山最佳夜店。海雲台海灘夜店、西面市區夜生活。真實價格,VIP 包廂,無中介。韓國第二大城市的夜生活輕鬆搞定。",
    intro:
      "釜山是韓國第二大城市,夜生活蓬勃發展,主要集中在海雲台 (海灘區) 和西面 (市中心)。在遊覽首爾以外的韓國時越來越受旅客歡迎。",
    vibe:
      "釜山夜店比首爾更輕鬆 — 海雲台是海灘氛圍,西面是市中心活力。入場費 ₩15,000–30,000。人群主要是本地人,夏季海灘季節會有一些遊客。",
    topClubsNote:
      "釜山夜店場景集中在海雲台 (海灘前夜店,夏季高峰) 和西面 (全年市區夜生活)。",
    keywords: [
      "釜山夜店",
      "釜山夜店預訂",
      "釜山夜生活",
      "海雲台夜店",
      "西面夜店",
      "釜山海灘夜店",
      "韓國最好的釜山夜店",
      "釜山海雲台夜生活",
      "韓國第二大城市夜生活",
      "釜山VIP包廂",
      "韓國夜店預訂",
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(AREA_CONFIG).map((area) => ({ area }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const { area } = await params;
  const config = AREA_CONFIG[area as AreaSlug];
  if (!config) return {};

  return {
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    alternates: {
      canonical: `https://nightflow.kr/zh-tw/clubs/${area}`,
      languages: {
        "zh-TW": `https://nightflow.kr/zh-tw/clubs/${area}`,
        "zh-HK": `https://nightflow.kr/zh-tw/clubs/${area}`,
        "zh-Hant": `https://nightflow.kr/zh-tw/clubs/${area}`,
        "zh-CN": `https://nightflow.kr/zh/clubs/${area}`,
        "zh-Hans": `https://nightflow.kr/zh/clubs/${area}`,
        "en-US": `https://nightflow.kr/en/clubs/${area}`,
        "ja-JP": `https://nightflow.kr/ja/clubs/${area}`,
        "x-default": `https://nightflow.kr/en/clubs/${area}`,
      },
    },
    openGraph: {
      title: config.title,
      description: config.description,
      url: `https://nightflow.kr/zh-tw/clubs/${area}`,
      locale: "zh_TW",
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function ZhTwClubsAreaPage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  const config = AREA_CONFIG[area as AreaSlug];
  if (!config) notFound();

  const supabase = await createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select(
      "id, name, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram, dresscode, tags"
    )
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .eq("is_test", false)
    .eq("area", config.koreanArea)
    .order("google_review_count", { ascending: false, nullsFirst: false });

  const clubList = clubs ?? [];
  const clubCount = clubList.length;

  return (
    <>
      <div className="sr-only">
        <h1>
          {config.zh}夜店預訂 — 首爾 {config.zh} {clubCount} 家夜店 ({config.koreanArea})
        </h1>
        <p>{config.intro}</p>

        <h2>{config.zh}夜生活氛圍 &amp; 價格</h2>
        <p>{config.vibe}</p>

        <h2>{config.zh}頂級夜店</h2>
        <p>{config.topClubsNote}</p>

        <h2>NightFlow 上的所有 {config.zh} 夜店 ({clubCount})</h2>
        <ul>
          {clubList.slice(0, 30).map((c) => (
            <li key={c.id}>
              {c.name} — {config.zh}夜店
              {c.google_rating ? ` (${c.google_rating}★)` : ""}
            </li>
          ))}
        </ul>

        <h2>如何透過 NightFlow 預訂 {config.zh} 夜店</h2>
        <p>
          選好想去的{config.zh}夜店(或者只告訴我們預算和喜好),填寫日期、人數和預算。NightFlow 會直接聯絡{config.zh}夜店,為您鎖定預算內最好的座位 — 真實價格,無中介加價。無需韓語,無中介費,無押金。到場後直接付款給夜店。
        </p>

        <h2>為什麼透過 NightFlow 預訂 {config.zh} 夜店</h2>
        <ul>
          <li>英語·中文友善 — NightFlow 直接為您聯絡{config.zh}夜店。</li>
          <li>真實價格 — 價格透明公開,無中介加價。</li>
          <li>{config.zh}夜店 VIP 包廂 — 瓶裝服務、黃金座位、跳過排隊。</li>
          <li>零平台費 — 直接付款給 {config.zh} 夜店。</li>
          <li>提交請求免費,無需押金。計畫變更可隨時取消。</li>
        </ul>
      </div>
      <ClubsClient clubs={clubList} lang="zh-tw" />
    </>
  );
}
