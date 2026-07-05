import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ClubsClient } from "../../en/clubs/ClubsClient";

export const metadata: Metadata = {
  title: {
    absolute:
      "韓國夜店指南 2026 — 江南·弘大·梨泰院夜店 (首爾)",
  },
  description:
    "瀏覽韓國首爾最佳夜店,真實價格、Google 評分、VIP 包廂預訂。江南 EDM 夜店、弘大嘻哈夜店、梨泰院國際夜店、狎鷗亭 VIP 包廂。無需韓語。台灣·香港旅客首選。",
  keywords: [
    "韓國夜店",
    "韓國夜店指南",
    "韓國夜店推薦",
    "首爾夜店",
    "首爾夜店指南",
    "首爾夜店推薦",
    "首爾VIP包廂",
    "首爾夜店外國人",
    "江南夜店",
    "江南VIP包廂",
    "江南夜店挑客",
    "弘大夜店",
    "弘大夜店推薦",
    "弘大酒吧",
    "梨泰院夜店",
    "梨泰院夜生活",
    "狎鷗亭包廂",
    "清潭包廂",
    "釜山夜店",
    "韓國最好的夜店",
    "首爾最好的夜店",
    "首爾旅遊夜店",
    "台灣 韓國 夜店",
    "香港 韓國 夜店",
    "首爾夜蒲",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/clubs",
    languages: {
      "zh-TW": "https://nightflow.kr/zh-tw/clubs",
      "zh-HK": "https://nightflow.kr/zh-tw/clubs",
      "zh-Hant": "https://nightflow.kr/zh-tw/clubs",
      "zh-CN": "https://nightflow.kr/zh/clubs",
      "zh-Hans": "https://nightflow.kr/zh/clubs",
      "ko-KR": "https://nightflow.kr/clubs",
      "en-US": "https://nightflow.kr/en/clubs",
      "ja-JP": "https://nightflow.kr/ja/clubs",
      "x-default": "https://nightflow.kr/clubs",
    },
  },
  openGraph: {
    title: "韓國夜店指南 2026 — 江南·弘大·梨泰院",
    description:
      "瀏覽韓國首爾最佳夜店,真實價格和 VIP 包廂預訂。無中介。台灣·香港旅客首選。",
    url: "https://nightflow.kr/zh-tw/clubs",
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default async function ZhTwClubsPage() {
  const supabase = await createClient();

  const { data: clubs } = await supabase
    .from("clubs")
    .select(
      "id, name, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram"
    )
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .eq("is_test", false)
    .order("google_review_count", { ascending: false, nullsFirst: false });

  const clubList = clubs ?? [];
  const clubCount = clubList.length;

  return (
    <>
      <div className="sr-only">
        <h1>首爾夜店預訂指南 — 江南、弘大、梨泰院、狎鷗亭</h1>
        <p>
          瀏覽首爾 {clubCount} 家最佳夜店,真實價格、Google 評分、酒單、VIP 包廂預訂。無需韓語即可預訂首爾夜店。無中介、無隱藏費用、無預訂手續費 — 直接付款給夜店。台灣·香港旅客特別推薦。
        </p>
        <h2>首爾夜店按地區瀏覽</h2>
        <ul>
          <li><a href="/zh-tw/clubs/gangnam">江南夜店預訂 — VIP 包廂、EDM 夜店、狎鷗亭 &amp; 清潭包廂</a></li>
          <li><a href="/zh-tw/clubs/hongdae">弘大夜店預訂 — 嘻哈、K-POP、外國人友善</a></li>
          <li><a href="/zh-tw/clubs/itaewon">梨泰院夜店預訂 — 國際化、英語友善</a></li>
          <li><a href="/zh-tw/clubs/apgujeong">狎鷗亭包廂預訂 — 清潭高端 VIP 包廂 &amp; 香檳服務</a></li>
          <li><a href="/zh-tw/clubs/busan">釜山夜店預訂 — 海雲台 &amp; 西面夜生活</a></li>
        </ul>
        <h2>透過 NightFlow 預訂首爾夜店</h2>
        <p>
          在 NightFlow 插旗,填寫日期、人數、預算。江南、弘大、梨泰院、狎鷗亭、清潭的夜店會直接向您發送專屬 VIP 報價。一個畫面比較價格、座位地圖、瓶裝套餐,一鍵預訂完成 — 無需韓語。
        </p>
      </div>
      <ClubsClient clubs={clubList} lang="zh-tw" />
    </>
  );
}
