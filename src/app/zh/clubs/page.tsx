import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ClubsClient } from "../../en/clubs/ClubsClient";

export const metadata: Metadata = {
  title: {
    absolute:
      "韩国夜店指南 2026 — 江南·弘大·梨泰院夜店 (首尔)",
  },
  description:
    "浏览韩国首尔最佳夜店，真实价格、Google 评分、VIP 包间预订。江南 EDM 夜店、弘大嘻哈夜店、梨泰院国际夜店、狎鸥亭 VIP 包间。无需韩语。",
  keywords: [
    "韩国夜店",
    "韩国夜店指南",
    "韩国夜店推荐",
    "首尔夜店",
    "首尔夜店指南",
    "首尔夜店推荐",
    "首尔VIP包间",
    "江南夜店",
    "江南VIP包间",
    "弘大夜店",
    "弘大酒吧",
    "梨泰院夜店",
    "梨泰院夜生活",
    "狎鸥亭包间",
    "清潭包间",
    "釜山夜店",
    "韩国最好的夜店",
    "首尔最好的夜店",
    "韩国旅游夜店",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh/clubs",
    languages: {
        "ko-KR": "https://nightflow.kr/clubs",
        "en-US": "https://nightflow.kr/en/clubs",
        "zh-CN": "https://nightflow.kr/zh/clubs",
        "zh-Hans": "https://nightflow.kr/zh/clubs",
        "zh-TW": "https://nightflow.kr/zh-tw/clubs",
        "zh-HK": "https://nightflow.kr/zh-tw/clubs",
        "zh-Hant": "https://nightflow.kr/zh-tw/clubs",
        "ja-JP": "https://nightflow.kr/ja/clubs",
        "x-default": "https://nightflow.kr/clubs",
    },
  },
  openGraph: {
    title: "韩国夜店指南 2026 — 江南·弘大·梨泰院",
    description:
      "浏览韩国首尔最佳夜店，真实价格和 VIP 包间预订。无中介。",
    url: "https://nightflow.kr/zh/clubs",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default async function ZhClubsPage() {
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
    .order("google_review_count", { ascending: false, nullsFirst: false });

  const clubList = (clubs ?? []).map((c) => ({ ...c, has_md: (c.partners?.length ?? 0) > 0 }));
  const clubCount = clubList.length;

  return (
    <>
      <div className="sr-only">
        <h1>韩国夜店预订指南 — 江南、弘大、梨泰院、狎鸥亭</h1>
        <p>
          浏览 {clubCount} 家韩国首尔最佳夜店，提供真实价格、Google 评分、酒水菜单和 VIP 包间预订。无需韩语即可预订韩国夜店。无中介，无隐藏费用，无预订费 — 您直接付款给夜店。
        </p>
        <h2>按地区浏览韩国顶级夜店</h2>
        <ul>
          {clubList.slice(0, 30).map((c) => {
            const areaZh =
              ({ 강남: "江南", 홍대: "弘大", 이태원: "梨泰院", 건대: "建大", 부산: "釜山" } as Record<string, string>)[c.area] ??
              c.area;
            return (
              <li key={c.id}>
                {c.name} — {areaZh}夜店
                {c.google_rating ? ` (${c.google_rating}★)` : ""}
              </li>
            );
          })}
        </ul>
        <h2>如何通过 NightFlow 预订韩国夜店</h2>
        <p>
          选好想去的夜店(或者只告诉我们预算和喜好)，填写日期、人数和预算。NightFlow 会直接联系江南、弘大、梨泰院、狎鸥亭、清潭的夜店，为您锁定预算内最好的座位和瓶装套餐 — 真实价格，无中介加价。一键预订首尔夜店包间 — 无需韩语。
        </p>
        <h2>按地区浏览韩国夜店</h2>
        <ul>
          <li>
            <a href="/zh/clubs/gangnam">
              江南夜店预订 — VIP 包间、EDM 夜店、狎鸥亭 &amp; 清潭包间
            </a>
          </li>
          <li>
            <a href="/zh/clubs/hongdae">
              弘大夜店预订 — 嘻哈、K-POP、外国人友好
            </a>
          </li>
          <li>
            <a href="/zh/clubs/itaewon">
              梨泰院夜店预订 — 国际化、英语友好
            </a>
          </li>
          <li>
            <a href="/zh/clubs/apgujeong">
              狎鸥亭包间预订 — 高端 VIP、香槟服务
            </a>
          </li>
          <li>
            <a href="/zh/clubs/busan">
              釜山夜店预订 — 海云台 &amp; 西面夜生活
            </a>
          </li>
        </ul>
        <h2>FAQ — 首尔夜店预订常见问题</h2>
        <p>
          有关价格、着装要求、中介问题，以及外国旅客如何预订 VIP 包间，请查阅{" "}
          <a href="/zh/faq">首尔夜店预订 FAQ</a>。
        </p>
      </div>
      <ClubsClient clubs={clubList} lang="zh" />
    </>
  );
}
