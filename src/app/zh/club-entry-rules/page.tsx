import type { Metadata } from "next";
import { ClubEntryRulesPage } from "@/components/foreign/ClubEntryRulesPage";
export const revalidate = 86400;
export const metadata: Metadata = {
  title: { absolute: "韩国夜店年龄限制与证件规定 2026 — 外国人需要带护照吗?" },
  description:
    "韩国按「年龄年」算:2026年,2007年及以前出生可入场。外国人需携带护照或ARC原件,照片不行。首尔夜店是否接待外国人,以及该带什么。",
  keywords: [
    "韩国夜店年龄限制","韩国夜店护照","韩国夜店证件","韩国喝酒年龄",
    "首尔夜店外国人","韩国夜店入场条件","首尔夜店几岁","外国人可以进韩国夜店吗",
  ],
  alternates: { canonical: "https://nightflow.kr/zh/club-entry-rules", languages: {
    "en-US":"https://nightflow.kr/en/club-entry-rules","ja-JP":"https://nightflow.kr/ja/club-entry-rules",
    "zh-CN":"https://nightflow.kr/zh/club-entry-rules","zh-TW":"https://nightflow.kr/zh-tw/club-entry-rules",
    "x-default":"https://nightflow.kr/en/club-entry-rules" } },
  openGraph: { title:"韩国夜店年龄限制与证件规定 2026", description:"2007年及以前出生。需护照或ARC原件。", url:"https://nightflow.kr/zh/club-entry-rules", locale:"zh_CN", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <ClubEntryRulesPage lang="zh" />; }
