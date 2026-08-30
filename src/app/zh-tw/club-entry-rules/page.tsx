import type { Metadata } from "next";
import { ClubEntryRulesPage } from "@/components/foreign/ClubEntryRulesPage";
export const revalidate = 86400;
export const metadata: Metadata = {
  title: { absolute: "韓國夜店年齡限制與證件規定 2026 — 外國人需要帶護照嗎?" },
  description:
    "韓國按「年齡年」算:2026年,2007年及以前出生可入場。外國人需攜帶護照或ARC正本,照片不行。首爾夜店是否接待外國人,以及該帶什麼。",
  keywords: [
    "韓國夜店年齡限制","韓國夜店護照","韓國夜店證件","韓國喝酒年齡",
    "首爾夜店外國人","韓國夜店入場條件","首爾夜店幾歲","外國人可以進韓國夜店嗎",
  ],
  alternates: { canonical: "https://nightflow.kr/zh-tw/club-entry-rules", languages: {
    "en-US":"https://nightflow.kr/en/club-entry-rules","ja-JP":"https://nightflow.kr/ja/club-entry-rules",
    "zh-CN":"https://nightflow.kr/zh/club-entry-rules","zh-TW":"https://nightflow.kr/zh-tw/club-entry-rules",
    "x-default":"https://nightflow.kr/en/club-entry-rules" } },
  openGraph: { title:"韓國夜店年齡限制與證件規定 2026", description:"2007年及以前出生。需護照或ARC正本。", url:"https://nightflow.kr/zh-tw/club-entry-rules", locale:"zh_TW", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <ClubEntryRulesPage lang="zh-tw" />; }
