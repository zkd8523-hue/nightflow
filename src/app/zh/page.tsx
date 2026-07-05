import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import { hideTestData } from "@/lib/utils/testData";
import { EnHomeClient } from "../en/EnHomeClient";

export const revalidate = 30;

export const metadata: Metadata = {
  title: {
    absolute:
      "韩国夜店预订 — 江南·弘大·梨泰院 VIP 包间 (NightFlow 首尔)",
  },
  description:
    "首尔最佳夜店预订 — 江南·弘大·梨泰院·狎鸥亭。真实价格，VIP 包间，无中介，无需韩语。韩国顶级夜店为您提供专属报价。轻松搞定韩国夜生活。",
  keywords: [
    // 韩国 country-level
    "韩国夜店",
    "韩国夜店预订",
    "韩国夜生活",
    "韩国夜场",
    "韩国酒吧",
    "韩国包间预订",
    "韩国VIP桌",
    // 首尔 city-level
    "首尔夜店",
    "首尔夜店预订",
    "首尔夜生活",
    "首尔夜场",
    "首尔VIP桌",
    "首尔包间",
    "首尔派对",
    // 江南
    "江南夜店",
    "江南夜店预订",
    "江南VIP桌",
    "江南夜生活",
    "江南包间",
    // 弘大
    "弘大夜店",
    "弘大夜店预订",
    "弘大派对",
    "弘大酒吧",
    // 梨泰院
    "梨泰院夜店",
    "梨泰院夜生活",
    "梨泰院酒吧",
    // 狎鸥亭/清潭
    "狎鸥亭夜店",
    "清潭夜店",
    "狎鸥亭包间",
    // 釜山
    "釜山夜店",
    "釜山夜生活",
    // 推荐
    "韩国最好的夜店",
    "首尔最好的夜店",
    "韩国夜店推荐",
    "首尔夜店推荐",
    "首尔旅游夜店",
    "韩国旅游夜生活",
    // K-POP
    "韩国K-POP夜店",
    "首尔K-POP夜店",
    // Brand
    "NightFlow",
    "NightFlow 韩国",
    "NightFlow 首尔",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh",
    languages: {
        "ko-KR": "https://nightflow.kr/",
        "en-US": "https://nightflow.kr/en",
        "zh-CN": "https://nightflow.kr/zh",
        "zh-TW": "https://nightflow.kr/zh-tw",
        "ja-JP": "https://nightflow.kr/ja",
        "x-default": "https://nightflow.kr/",
    },
  },
  openGraph: {
    title: "韩国夜店预订 — NightFlow 首尔",
    description:
      "首尔最佳夜店预订 — 江南·弘大·梨泰院。真实价格，VIP 包间，无中介，无需韩语。",
    url: "https://nightflow.kr/zh",
    siteName: "NightFlow",
    locale: "zh_CN",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NightFlow — 韩国夜店预订",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "韩国夜店预订 — NightFlow 首尔",
    description: "首尔最佳夜店预订 — 江南·弘大·梨泰院。无中介，无需韩语。",
    images: ["/og-image.png"],
  },
};

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export default async function ZhHomePage() {
  const supabase = createAnonClient();
  const nowIso = new Date().toISOString();

  const { data: puzzlesRaw } = await hideTestData(
    supabase
      .from("puzzles")
      .select(
        "id, area, event_date, budget_per_person, total_budget, target_count, current_count, target_male, target_female, status, gender_pref, notes, leader:users!puzzles_leader_id_fkey!inner(id, display_name, name, country_code, is_test)"
      )
      .in("status", ["open", "selecting"])
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(30),
    "users"
  );

  const puzzles = puzzlesRaw ?? [];
  let offerCountMap: Record<string, number> = {};

  if (puzzles.length > 0) {
    const ids = puzzles.map((p) => p.id);
    const { data: offerRows } = await supabase
      .from("puzzle_offers")
      .select("puzzle_id")
      .in("puzzle_id", ids)
      .eq("status", "pending")
      .limit(1000);
    if (offerRows) {
      offerRows.forEach((r: { puzzle_id: string }) => {
        offerCountMap[r.puzzle_id] = (offerCountMap[r.puzzle_id] || 0) + 1;
      });
    }
  }

  const flags = puzzles.map((p) => ({
    id: p.id,
    area: p.area,
    event_date: p.event_date,
    budget_per_person: p.budget_per_person,
    total_budget: p.total_budget,
    target_count: p.target_count,
    current_count: p.current_count,
    target_male: p.target_male,
    target_female: p.target_female,
    status: p.status,
    gender_pref: p.gender_pref,
    notes: p.notes,
    leader: Array.isArray(p.leader) ? p.leader[0] ?? null : (p.leader as { display_name: string | null; name: string | null; country_code: string | null } | null) ?? null,
    offerCount: offerCountMap[p.id] ?? 0,
  }));

  const flagCount = flags.length;

  // 강남·홍대 클럽 (지역 섹션 "Spots competing for you"용) — /en 홈과 동일 로직
  const { data: clubsRaw } = await supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, address")
    .in("area", ["강남", "홍대", "이태원"])
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .eq("is_test", false)
    .not("thumbnail_url", "is", null)
    .neq("thumbnail_url", "")
    .order("google_review_count", { ascending: false, nullsFirst: false })
    .limit(60);
  const seenClubNames = new Set<string>();
  const clubs = (clubsRaw ?? [])
    .filter((c) => {
      const key = c.name.trim().toLowerCase();
      if (seenClubNames.has(key)) return false;
      seenClubNames.add(key);
      return true;
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      area: c.area,
      thumbnail_url: c.thumbnail_url,
      address: c.address,
    }));
  const clubIds = clubs.map((c) => c.id);
  if (clubIds.length > 0) {
    const { data: clubOfferRows } = await supabase
      .from("puzzle_offers")
      .select("club_id")
      .in("club_id", clubIds)
      .limit(5000);
    const clubOfferCount: Record<string, number> = {};
    clubOfferRows?.forEach((r: { club_id: string | null }) => {
      if (r.club_id) clubOfferCount[r.club_id] = (clubOfferCount[r.club_id] || 0) + 1;
    });
    clubs.sort((a, b) => (clubOfferCount[b.id] ?? 0) - (clubOfferCount[a.id] ?? 0));
  }

  // Schema.org JSON-LD — 中国/华语区搜索结果中的丰富展示
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://nightflow.kr/zh/#organization",
        name: "NightFlow",
        alternateName: ["NightFlow 韩国", "NightFlow 首尔"],
        url: "https://nightflow.kr/zh",
        logo: "https://nightflow.kr/og-image.png",
        description:
          "韩国夜店预订平台，专为外国旅客打造。轻松预订首尔江南·弘大·梨泰院顶级夜店的 VIP 包间，无需韩语。",
        sameAs: ["https://www.instagram.com/nightflow.kr/"],
        areaServed: { "@type": "Country", name: "South Korea" },
      },
      {
        "@type": "WebSite",
        "@id": "https://nightflow.kr/zh/#website",
        url: "https://nightflow.kr/zh",
        name: "NightFlow — 韩国夜店预订",
        inLanguage: "zh-CN",
        publisher: { "@id": "https://nightflow.kr/zh/#organization" },
      },
      {
        "@type": "Service",
        "@id": "https://nightflow.kr/zh/#service",
        name: "首尔夜店预订服务",
        provider: { "@id": "https://nightflow.kr/zh/#organization" },
        areaServed: [
          { "@type": "City", name: "首尔" },
          { "@type": "City", name: "釜山" },
        ],
        description:
          "首尔顶级夜店 VIP 包间预订（江南·弘大·梨泰院·狎鸥亭）。无需韩语，真实价格，无中介。",
        serviceType: "Club Reservation",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* SEO 用 SSR sr-only 内容 — Google·百度等搜索引擎可读取 */}
      <div className="sr-only">
        <h1>
          韩国夜店预订 — 江南·弘大·梨泰院 VIP 包间 (NightFlow 首尔)
        </h1>
        <p>
          NightFlow 是专为外国旅客打造的韩国夜店预订平台。无需韩语，即可轻松预订首尔江南、弘大、梨泰院、狎鸥亭的顶级夜店 VIP 包间。真实价格，无中介，无隐藏费用。韩国顶级夜店为您发送专属报价 —
          您只需比较并挑选最适合的方案。轻松享受韩国夜生活，无论是 K-POP 夜店、酒吧、嘻哈夜店还是高端 VIP 包间，NightFlow 全程英文/中文对接。
        </p>

        <h2>弘大夜店预订 — 嘻哈 &amp; 外国人友好</h2>
        <p>
          弘大是首尔的嘻哈夜店区，靠近弘益大学，外国旅客友好。代表性夜店包括 Club Dokkaebi (高端嘻哈)、Sabotage、Attention、Club Purple、NB2 (K-POP 嘻哈)、Awesome Red。弘大夜店是旅客最容易入门的选择 — 大多数夜店接受 walk-in，但通过 NightFlow 预订 VIP 包间可获得更好的座位并跳过排队。
        </p>

        <h2>江南夜店预订 — 大型 EDM &amp; VIP 包间</h2>
        <p>
          江南是首尔的高端夜店区，云集大型 EDM 夜店和奢华包房。代表性夜店包括 Club ACE (新沙，原 Race)、Massive、Club Pop、Mirabaud。江南夜店通常需要预订 VIP 包间 — 主桌起价 ₩750,000+。包瓶服务、EDM 黄金座位、私密 VIP 包房 — 通过 NightFlow 全程无需韩语即可预订。
        </p>

        <h2>梨泰院夜店预订 — 国际化 &amp; 英语友好</h2>
        <p>
          梨泰院是首尔国际化夜生活区，外国旅客比例最高。英语友好的梨泰院夜店包括 Soap Seoul (2026 年重开，House 和 Groove 音乐)、Cakeshop 等。梨泰院夜店在旅客中尤其受欢迎，因为大部分员工会说英语，音乐风格涵盖 House、EDM、Disco、R&amp;B、嘻哈。
        </p>

        <h2>狎鸥亭 &amp; 清潭 VIP 包间</h2>
        <p>
          狎鸥亭和清潭云集首尔最高端的 VIP 包间，提供香槟服务和高端套餐。代表性场所包括 Core Lounge (EDM，2026 年开业)、Club Arzu (高端)、DM Seoul (嘻哈包间)。包间起价 ₩2,000,000+。NightFlow 让外国旅客无需韩国本地朋友即可预订 VIP 包间。
        </p>

        <h2>NightFlow 韩国夜店预订流程</h2>
        <p>
          插一面旗帜，填写日期、人数、预算。首尔顶级夜店 — 包括江南 Club ACE、弘大 Club Dokkaebi、梨泰院 Soap Seoul、狎鸥亭 Core Lounge 等 — 会直接向您发送 VIP 预订报价。在一个界面比较价格、座位位置、瓶装套餐，一键预订完成。无需韩语，无需 MD 联系人，无中介费。
        </p>

        <h2>当前可预订旗帜</h2>
        <p>
          现有 {flagCount} 面韩国夜店预订旗帜，来自计划在首尔（江南、弘大、梨泰院、狎鸥亭）享受夜生活的旅客。插旗后数小时内即可收到首尔顶级夜店的专属 VIP 报价。
        </p>

        <h2>通过 NightFlow 预订韩国夜店的优势</h2>
        <ul>
          <li>
            无需韩语 — 江南、弘大、梨泰院夜店会主动用英语/中文友好回复您。
          </li>
          <li>
            真实价格 — 私密报价仅您可见，无中介加价。
          </li>
          <li>
            VIP 包间 — 瓶装服务、黄金位置、跳过排队。
          </li>
          <li>
            零平台费 — 直接付款给夜店，NightFlow 不收取任何费用。
          </li>
          <li>
            插旗免费，收报价免费，无需押金。
          </li>
        </ul>

        <h2>按地区浏览韩国夜店</h2>
        <ul>
          <li>
            <a href="/zh/clubs/gangnam">
              江南夜店 — EDM、嘻哈、狎鸥亭 &amp; 清潭 VIP 包间
            </a>
          </li>
          <li>
            <a href="/zh/clubs/hongdae">
              弘大夜店 — 嘻哈、K-POP、外国人友好
            </a>
          </li>
          <li>
            <a href="/zh/clubs/itaewon">
              梨泰院夜店 — 国际化、英语友好
            </a>
          </li>
          <li>
            <a href="/zh/clubs/apgujeong">
              狎鸥亭 &amp; 清潭包间 — 高端 VIP、香槟服务
            </a>
          </li>
          <li>
            <a href="/zh/clubs/busan">
              釜山夜店 — 海云台海滩 &amp; 西面市区
            </a>
          </li>
        </ul>

        <h2>按预订类型浏览</h2>
        <ul>
          <li>
            <a href="/zh/vip-tables">
              首尔 VIP 包间预订 — 江南、狎鸥亭瓶装服务
            </a>
          </li>
          <li>
            <a href="/zh/guests">
              首尔夜店 Guest List — 韩国夜店免费入场
            </a>
          </li>
          <li>
            <a href="/zh/kpop-clubs">
              首尔 K-POP 夜店 — K-POP 粉丝必去
            </a>
          </li>
          <li>
            <a href="/zh/faq">
              首尔夜店预订 FAQ — 价格、着装要求、中介问题
            </a>
          </li>
        </ul>
      </div>
      <EnHomeClient flags={flags} clubs={clubs} />
    </>
  );
}
