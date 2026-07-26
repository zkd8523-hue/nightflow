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
      "江南夜店预订 2026 — VIP 包间、狎鸥亭 &amp; 清潭包间 (首尔)",
    description:
      "首尔江南最佳夜店和 VIP 包间预订。EDM 夜店、嘻哈、狎鸥亭 &amp; 清潭高端包间。真实价格，VIP 包间，无中介，无需韩语。",
    intro:
      "江南是首尔的高端夜生活区，云集大型 EDM 夜店、嘻哈场所以及狎鸥亭、清潭的韩国顶级 VIP 包间。NightFlow 让您无需韩语即可预订江南夜店包间 — 真实价格，无中介。",
    vibe:
      "江南夜店以高能 EDM、时尚人群和奢华瓶装服务著称。主桌通常从 ₩750,000 起，VIP 包间 ₩1,500,000 起。狎鸥亭和清潭云集首尔最独家的包间，提供香槟服务。",
    topClubsNote:
      "江南顶级夜店包括 Club ACE (新沙，原 Race)、Massive、Club Pop、Mirabaud、Core Lounge (狎鸥亭 EDM)、Club Arzu (清潭高端) 和 DM Seoul (狎鸥亭嘻哈包间)。",
    keywords: [
      "江南夜店",
      "江南夜店预订",
      "江南VIP包间",
      "江南包间",
      "江南EDM夜店",
      "韩国最好的江南夜店",
      "狎鸥亭包间",
      "狎鸥亭夜店",
      "清潭包间",
      "新沙夜店",
      "Club ACE 首尔",
      "首尔VIP包间",
      "韩国VIP包间",
      "首尔夜店预订",
      "韩国夜店预订",
    ],
  },
  hongdae: {
    koreanArea: "홍대",
    zh: "弘大",
    title:
      "弘大夜店预订 2026 — 嘻哈、K-POP &amp; 外国人友好 (首尔)",
    description:
      "首尔弘大最佳嘻哈和 K-POP 夜店预订，靠近弘益大学。外国人友好，英文 OK，真实价格，无中介。提交请求后，NightFlow 直接联系夜店为您锁定座位。",
    intro:
      "弘大是首尔的嘻哈和 K-POP 夜生活区，云集靠近弘益大学的外国人友好夜店。这是旅客最容易入门的地区 — 大多数夜店接受 walk-in，但通过 NightFlow 预订 VIP 包间和 guest list 可获得更好的座位并跳过排队。",
    vibe:
      "弘大夜店主打嘻哈、K-POP 和 EDM。人群偏年轻 (20 出头)，国际化程度高，入场费通常 ₩10,000–30,000 (女性多数场所免费)。酒吧饮品 ₩10,000–15,000。比江南便宜很多。",
    topClubsNote:
      "弘大顶级夜店包括 Club Dokkaebi (高端嘻哈)、Sabotage、Attention、Club Purple (嘻哈，新手友好)、NB2 (K-POP，K-POP 旅客最爱)、Awesome Red 等。",
    keywords: [
      "弘大夜店",
      "弘大夜店预订",
      "弘大酒吧",
      "弘大嘻哈夜店",
      "弘大K-POP夜店",
      "弘大派对",
      "韩国最好的弘大夜店",
      "弘益大学夜店",
      "弘大外国人夜店",
      "Club Dokkaebi",
      "NB2 首尔",
      "首尔夜店预订",
      "韩国夜店预订",
    ],
  },
  itaewon: {
    koreanArea: "이태원",
    zh: "梨泰院",
    title:
      "梨泰院夜店预订 2026 — 国际化、英语友好夜生活 (首尔)",
    description:
      "首尔梨泰院最佳国际化夜店预订。House、EDM、嘻哈、Disco。英语友好，外国人友好的人群。真实价格，VIP 包间，无中介。",
    intro:
      "梨泰院是首尔的国际化夜生活区，外国旅客比例最高。音乐风格涵盖 House、EDM、Disco、R&amp;B 和嘻哈。大多数员工会说英语，对不会韩语的旅客最为友好。",
    vibe:
      "梨泰院夜店国际化、规模较小，以音乐为重点 (House、Groove、R&amp;B)。入场费通常 ₩30,000–40,000。人群是首尔最多元化的 — 本地人、外籍人士、旅客都在这里相聚。夜晚气氛延续到清晨。",
    topClubsNote:
      "梨泰院顶级夜店包括 Soap Seoul (2026 年重开，House 和 Groove 音乐)、Cakeshop (传奇地下场所) 以及梨泰院路上的各种国际酒吧和夜店。",
    keywords: [
      "梨泰院夜店",
      "梨泰院夜店预订",
      "梨泰院酒吧",
      "梨泰院夜生活",
      "梨泰院外国人夜店",
      "梨泰院英语夜店",
      "Soap Seoul",
      "Cakeshop 首尔",
      "梨泰院House夜店",
      "首尔夜店预订",
      "韩国夜店预订",
    ],
  },
  apgujeong: {
    koreanArea: "강남",
    zh: "狎鸥亭",
    title:
      "狎鸥亭包间预订 2026 — 清潭高端 VIP 包间 (首尔)",
    description:
      "预订首尔狎鸥亭 &amp; 清潭高端 VIP 包间。香槟服务、高端套餐、独家人群。真实价格，无中介，无需韩语。",
    intro:
      "狎鸥亭和清潭云集首尔最独家的 VIP 包间。香槟文化、高端瓶装服务、时尚人群。NightFlow 让外国旅客无需韩国本地朋友即可预订狎鸥亭顶级包间 — 韩国本地人的价格，韩国本地人的服务。",
    vibe:
      "狎鸥亭包间高端、私密、精选。包间起价 ₩2,000,000+。人群是高端 20–30 多岁，常见时尚/演艺圈人士。音乐根据场所不同涵盖 EDM、嘻哈包间和 House。着装要求严格的 smart-casual 起步。",
    topClubsNote:
      "狎鸥亭 &amp; 清潭顶级包间包括 Core Lounge (狎鸥亭 EDM，2026 年开业)、Club Arzu (清潭高端嘻哈)、DM Seoul (狎鸥亭嘻哈包间)、Lion (清潭超高端明星场所)。",
    keywords: [
      "狎鸥亭包间",
      "狎鸥亭包间预订",
      "狎鸥亭夜店",
      "清潭包间",
      "清潭夜店",
      "清潭VIP",
      "首尔VIP包间",
      "首尔香槟包间",
      "Core Lounge 首尔",
      "Club Arzu",
      "DM Seoul",
      "狎鸥亭高端夜店",
      "韩国VIP包间",
      "韩国夜店预订",
    ],
  },
  busan: {
    koreanArea: "부산",
    zh: "釜山",
    title:
      "釜山夜店预订 2026 — 海云台、西面夜生活指南 (韩国)",
    description:
      "预订釜山最佳夜店。海云台海滩夜店、西面市区夜生活。真实价格，VIP 包间，无中介。韩国第二大城市的夜生活轻松搞定。",
    intro:
      "釜山是韩国第二大城市，夜生活蓬勃发展，主要集中在海云台 (海滩区) 和西面 (市中心)。在游览首尔以外的韩国时越来越受旅客欢迎。",
    vibe:
      "釜山夜店比首尔更轻松 — 海云台是海滩氛围，西面是市中心活力。入场费 ₩15,000–30,000。人群主要是本地人，夏季海滩季节会有一些游客。",
    topClubsNote:
      "釜山夜店场景集中在海云台 (海滩前夜店，夏季高峰) 和西面 (全年市区夜生活)。",
    keywords: [
      "釜山夜店",
      "釜山夜店预订",
      "釜山夜生活",
      "海云台夜店",
      "西面夜店",
      "釜山海滩夜店",
      "韩国最好的釜山夜店",
      "釜山海云台夜生活",
      "韩国第二大城市夜生活",
      "釜山VIP包间",
      "韩国夜店预订",
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
      canonical: `https://nightflow.kr/zh/clubs/${area}`,
      languages: {
        "en-US": `https://nightflow.kr/en/clubs/${area}`,
        "zh-CN": `https://nightflow.kr/zh/clubs/${area}`,
        "zh-Hans": `https://nightflow.kr/zh/clubs/${area}`,
        "zh-TW": `https://nightflow.kr/zh-tw/clubs/${area}`,
        "zh-HK": `https://nightflow.kr/zh-tw/clubs/${area}`,
        "zh-Hant": `https://nightflow.kr/zh-tw/clubs/${area}`,
        "ja-JP": `https://nightflow.kr/ja/clubs/${area}`,
        "x-default": `https://nightflow.kr/en/clubs/${area}`,
      },
    },
    openGraph: {
      title: config.title,
      description: config.description,
      url: `https://nightflow.kr/zh/clubs/${area}`,
      locale: "zh_CN",
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function ZhClubsAreaPage({
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
      "id, name, name_en, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram, dresscode, tags, google_reviews, featured_rank, partners:club_partners(md_id)"
    )
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .eq("is_test", false)
    .eq("hidden_from_guide", false)
    .eq("area", config.koreanArea)
    .order("google_review_count", { ascending: false, nullsFirst: false });

  const clubList = (clubs ?? []).map((c) => ({ ...c, has_md: (c.partners?.length ?? 0) > 0 }));
  const clubCount = clubList.length;

  return (
    <>
      <div className="sr-only">
        <h1>
          {config.zh}夜店预订 — 首尔 {config.zh} {clubCount} 家夜店 ({config.koreanArea})
        </h1>
        <p>{config.intro}</p>

        <h2>{config.zh}夜生活氛围 &amp; 价格</h2>
        <p>{config.vibe}</p>

        <h2>{config.zh}顶级夜店</h2>
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

        <h2>如何通过 NightFlow 预订 {config.zh} 夜店</h2>
        <p>
          选好想去的{config.zh}夜店(或者只告诉我们预算和喜好)，填写日期、人数和预算。NightFlow 会直接联系{config.zh}夜店，为您锁定预算内最好的座位 — 真实价格，无中介加价。无需韩语，无中介费，无押金。到场后直接付款给夜店。
        </p>

        <h2>为什么通过 NightFlow 预订 {config.zh} 夜店</h2>
        <ul>
          <li>英语/中文友好 — NightFlow 直接为您联系{config.zh}夜店。</li>
          <li>真实价格 — 价格透明公开，无中介加价。</li>
          <li>{config.zh}夜店 VIP 包间 — 瓶装服务、黄金座位、跳过排队。</li>
          <li>零平台费 — 直接付款给 {config.zh} 夜店。</li>
          <li>提交请求免费，无需押金。计划变更可随时取消。</li>
        </ul>
      </div>
      <ClubsClient clubs={clubList} lang="zh" />
    </>
  );
}
