import type { Metadata } from "next";
import { ClubHoursPage } from "@/components/foreign/ClubHoursPage";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "首爾夜店營業時間 2026 — 幾點開門、幾點打烊?" },
  description:
    "96家首爾夜店的真實營業時間。大多數22:00開門、05:00打烊,但真正熱鬧是凌晨1點。江南、弘大、梨泰院、釜山比較。",
  keywords: [
    "首爾夜店營業時間","韓國夜店幾點開","首爾夜店幾點關門","韓國夜店營業時間",
    "江南夜店營業時間","弘大夜店營業時間","梨泰院夜店營業時間","釜山夜店營業時間",
    "首爾夜店幾點去","韓國夜店時間","首爾夜生活時間",
  ],
  alternates: { canonical: "https://nightflow.kr/zh-tw/club-hours", languages: {
    "en-US":"https://nightflow.kr/en/club-hours","ja-JP":"https://nightflow.kr/ja/club-hours",
    "zh-CN":"https://nightflow.kr/zh/club-hours","zh-TW":"https://nightflow.kr/zh-tw/club-hours",
    "x-default":"https://nightflow.kr/en/club-hours" } },
  openGraph: { title:"首爾夜店營業時間 2026", description:"96家夜店真實營業時間。大多數22:00開、05:00關。", url:"https://nightflow.kr/zh-tw/club-hours", locale:"zh_TW", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <ClubHoursPage lang="zh-tw" />; }
