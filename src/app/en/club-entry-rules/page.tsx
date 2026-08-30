import type { Metadata } from "next";
import { ClubEntryRulesPage } from "@/components/foreign/ClubEntryRulesPage";
export const revalidate = 86400;
export const metadata: Metadata = {
  title: { absolute: "Korean Club Age Limit & ID Rules 2026 — Do Foreigners Need a Passport?" },
  description:
    "Korea uses 'year age': in 2026, born 2007 or earlier. Foreigners need a physical passport or ARC — no photos. Whether Seoul clubs accept foreigners, and what to bring.",
  keywords: [
    "Korean club age limit","Korea drinking age foreigner","do I need passport club Korea",
    "Seoul club ID requirement","can foreigners enter Korean clubs","Seoul club age",
    "Korea legal drinking age","Seoul club passport","Korean club entry requirements",
    "Seoul club foreigner","Korea club ID check","Seoul club rules","clubbing in Korea age",
  ],
  alternates: { canonical: "https://nightflow.kr/en/club-entry-rules", languages: {
    "en-US":"https://nightflow.kr/en/club-entry-rules","ja-JP":"https://nightflow.kr/ja/club-entry-rules",
    "zh-CN":"https://nightflow.kr/zh/club-entry-rules","zh-TW":"https://nightflow.kr/zh-tw/club-entry-rules",
    "x-default":"https://nightflow.kr/en/club-entry-rules" } },
  openGraph: { title:"Korean Club Age Limit & ID Rules 2026", description:"Born 2007 or earlier. Physical passport or ARC required.", url:"https://nightflow.kr/en/club-entry-rules", locale:"en_US", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <ClubEntryRulesPage lang="en" />; }
