import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import { hideTestData } from "@/lib/utils/testData";
import { EnHomeClient } from "../en/EnHomeClient";

export const revalidate = 30;

export const metadata: Metadata = {
  title: {
    absolute:
      "韓國夜店預訂 — 江南·弘大·梨泰院 VIP 包廂 (NightFlow 首爾)",
  },
  description:
    "首爾最佳夜店預訂 — 江南·弘大·梨泰院·狎鷗亭。真實價格,VIP 包廂,無中介,無需韓語。韓國頂級夜店為您提供專屬報價。輕鬆搞定韓國夜生活。",
  keywords: [
    // 韓國 (번체)
    "韓國夜店",
    "韓國夜店預訂",
    "韓國夜生活",
    "韓國夜店推薦",
    "韓國酒吧",
    "韓國包廂預訂",
    "韓國VIP桌",
    // 首爾
    "首爾夜店",
    "首爾夜店預訂",
    "首爾夜店推薦",
    "首爾夜生活",
    "首爾VIP桌",
    "首爾包廂",
    "首爾派對",
    "首爾夜店外國人",
    // 江南
    "江南夜店",
    "江南夜店預訂",
    "江南夜店推薦",
    "江南VIP桌",
    "江南包廂",
    "江南夜店挑客",
    // 弘大
    "弘大夜店",
    "弘大夜店推薦",
    "弘大夜店預訂",
    "弘大派對",
    "弘大酒吧",
    // 梨泰院
    "梨泰院夜店",
    "梨泰院夜生活",
    "梨泰院酒吧",
    // 狎鷗亭·清潭
    "狎鷗亭夜店",
    "清潭夜店",
    "狎鷗亭包廂",
    // 釜山
    "釜山夜店",
    "釜山夜生活",
    // 台灣·홍콩 사용자
    "台灣人 首爾 夜店",
    "香港人 首爾 夜店",
    "首爾夜蒲",   // 홍콩식
    "首爾夜場",   // 홍콩식
    // 추천
    "韓國最好的夜店",
    "首爾最好的夜店",
    "首爾旅遊夜店",
    "韓國旅遊夜生活",
    // K-POP
    "韓國K-POP夜店",
    "首爾K-POP夜店",
    // Brand
    "NightFlow",
    "NightFlow 韓國",
    "NightFlow 首爾",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw",
    languages: {
      "zh-TW": "https://nightflow.kr/zh-tw",
      "zh-HK": "https://nightflow.kr/zh-tw",
      "zh-Hant": "https://nightflow.kr/zh-tw",
      "zh-CN": "https://nightflow.kr/zh",
      "zh-Hans": "https://nightflow.kr/zh",
      "ko-KR": "https://nightflow.kr/",
      "en-US": "https://nightflow.kr/en",
      "ja-JP": "https://nightflow.kr/ja",
      "x-default": "https://nightflow.kr/",
    },
  },
  openGraph: {
    title: "韓國夜店預訂 — NightFlow 首爾",
    description:
      "首爾最佳夜店預訂 — 江南·弘大·梨泰院。真實價格,VIP 包廂,無中介,無需韓語。",
    url: "https://nightflow.kr/zh-tw",
    siteName: "NightFlow",
    locale: "zh_TW",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NightFlow — 韓國夜店預訂",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "韓國夜店預訂 — NightFlow 首爾",
    description: "首爾最佳夜店預訂 — 江南·弘大·梨泰院。無中介,無需韓語。",
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

export default async function ZhTwHomePage() {
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
  const offerCountMap: Record<string, number> = {};

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
    leader: Array.isArray(p.leader)
      ? p.leader[0] ?? null
      : (p.leader as { display_name: string | null; name: string | null; country_code: string | null } | null) ?? null,
    offerCount: offerCountMap[p.id] ?? 0,
  }));

  const flagCount = flags.length;

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

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://nightflow.kr/zh-tw/#organization",
        name: "NightFlow",
        alternateName: ["NightFlow 韓國", "NightFlow 首爾"],
        url: "https://nightflow.kr/zh-tw",
        logo: "https://nightflow.kr/og-image.png",
        description:
          "韓國夜店預訂平台,專為外國旅客打造。輕鬆預訂首爾江南·弘大·梨泰院頂級夜店的 VIP 包廂,無需韓語。",
        sameAs: ["https://www.instagram.com/nightflow.kr/"],
        areaServed: { "@type": "Country", name: "South Korea" },
      },
      {
        "@type": "WebSite",
        "@id": "https://nightflow.kr/zh-tw/#website",
        url: "https://nightflow.kr/zh-tw",
        name: "NightFlow — 韓國夜店預訂",
        inLanguage: "zh-TW",
        publisher: { "@id": "https://nightflow.kr/zh-tw/#organization" },
      },
      {
        "@type": "Service",
        "@id": "https://nightflow.kr/zh-tw/#service",
        name: "首爾夜店預訂服務",
        provider: { "@id": "https://nightflow.kr/zh-tw/#organization" },
        areaServed: [
          { "@type": "City", name: "首爾" },
          { "@type": "City", name: "釜山" },
        ],
        description:
          "首爾頂級夜店 VIP 包廂預訂(江南·弘大·梨泰院·狎鷗亭)。無需韓語,真實價格,無中介。",
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
      {/* SEO 用 SSR sr-only 內容 — 台灣·香港 Google 搜尋引擎可讀取 */}
      <div className="sr-only">
        <h1>
          韓國夜店預訂 — 江南·弘大·梨泰院 VIP 包廂 (NightFlow 首爾)
        </h1>
        <p>
          NightFlow 是專為台灣·香港旅客打造的韓國夜店預訂平台。無需韓語,即可輕鬆預訂首爾江南、弘大、梨泰院、狎鷗亭的頂級夜店 VIP 包廂。真實價格,無中介,無隱藏費用。韓國頂級夜店為您發送專屬報價 — 您只需比較並挑選最適合的方案。輕鬆享受韓國夜生活,無論是 K-POP 夜店、酒吧、嘻哈夜店還是高端 VIP 包廂,NightFlow 全程英文·中文對接。
        </p>

        <h2>弘大夜店預訂 — 嘻哈 &amp; 外國人友善</h2>
        <p>
          弘大是首爾的嘻哈夜店區,靠近弘益大學,對台灣·香港旅客友善。代表性夜店包括 Club Dokkaebi (高端嘻哈)、Sabotage、Attention、Club Purple、NB2 (K-POP 嘻哈)、Awesome Red。弘大夜店是旅客最容易入門的選擇 — 大多數夜店接受 walk-in,但透過 NightFlow 預訂 VIP 包廂可獲得更好的座位並跳過排隊。
        </p>

        <h2>江南夜店預訂 — 大型 EDM &amp; VIP 包廂</h2>
        <p>
          江南是首爾的高端夜店區,雲集大型 EDM 夜店和奢華包廂。代表性夜店包括 Club ACE (新沙,原 Race)、Massive、Club Pop、Mirabaud。江南夜店通常需要預訂 VIP 包廂 — 主桌起價 ₩750,000+。包瓶服務、EDM 黃金座位、私密 VIP 包廂 — 透過 NightFlow 全程無需韓語即可預訂。台灣·香港旅客特別注意:江南挑客較嚴,建議事先預訂。
        </p>

        <h2>梨泰院夜店預訂 — 國際化 &amp; 英語友善</h2>
        <p>
          梨泰院是首爾國際化夜生活區,外國旅客比例最高。英語友善的梨泰院夜店包括 Soap Seoul (2026 年重開,House 和 Groove 音樂)、Cakeshop 等。梨泰院夜店在旅客中特別受歡迎,因為大部分員工會說英語,音樂風格涵蓋 House、EDM、Disco、R&amp;B、嘻哈。
        </p>

        <h2>狎鷗亭 &amp; 清潭 VIP 包廂</h2>
        <p>
          狎鷗亭和清潭雲集首爾最高端的 VIP 包廂,提供香檳服務和高端套餐。代表性場所包括 Core Lounge (EDM,2026 年開業)、Club Arzu (高端)、DM Seoul (嘻哈包廂)。包廂起價 ₩2,000,000+。NightFlow 讓台灣·香港旅客無需韓國本地朋友即可預訂 VIP 包廂。
        </p>

        <h2>NightFlow 韓國夜店預訂流程</h2>
        <p>
          插一面旗幟,填寫日期、人數、預算。首爾頂級夜店 — 包括江南 Club ACE、弘大 Club Dokkaebi、梨泰院 Soap Seoul、狎鷗亭 Core Lounge 等 — 會直接向您發送 VIP 預訂報價。在一個畫面比較價格、座位位置、瓶裝套餐,一鍵預訂完成。無需韓語,無需 MD 聯絡人,無中介費。
        </p>

        <h2>目前可預訂旗幟</h2>
        <p>
          現有 {flagCount} 面韓國夜店預訂旗幟,來自計劃在首爾(江南、弘大、梨泰院、狎鷗亭)享受夜生活的旅客。插旗後數小時內即可收到首爾頂級夜店的專屬 VIP 報價。
        </p>

        <h2>透過 NightFlow 預訂韓國夜店的優勢</h2>
        <ul>
          <li>無需韓語 — 江南、弘大、梨泰院夜店會主動用英文·中文友善回覆您。</li>
          <li>真實價格 — 私密報價僅您可見,無中介加價。</li>
          <li>VIP 包廂 — 瓶裝服務、黃金位置、跳過排隊。</li>
          <li>零平台費 — 直接付款給夜店,NightFlow 不收取任何費用。</li>
          <li>插旗免費,收報價免費,無需押金。</li>
        </ul>

        <h2>按地區瀏覽韓國夜店</h2>
        <ul>
          <li><a href="/zh-tw/clubs/gangnam">江南夜店 — EDM、嘻哈、狎鷗亭 &amp; 清潭 VIP 包廂</a></li>
          <li><a href="/zh-tw/clubs/hongdae">弘大夜店 — 嘻哈、K-POP、外國人友善</a></li>
          <li><a href="/zh-tw/clubs/itaewon">梨泰院夜店 — 國際化、英語友善</a></li>
          <li><a href="/zh-tw/clubs/apgujeong">狎鷗亭 &amp; 清潭包廂 — 高端 VIP、香檳服務</a></li>
          <li><a href="/zh-tw/clubs/busan">釜山夜店 — 海雲台海灘 &amp; 西面市區</a></li>
        </ul>
      </div>
      <EnHomeClient flags={flags} clubs={clubs} initialLang="zh-tw" />
    </>
  );
}
