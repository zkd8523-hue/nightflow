import type { Metadata } from "next";
import { ClubHoursPage } from "@/components/foreign/ClubHoursPage";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "首尔夜店营业时间 2026 — 几点开门、几点打烊?" },
  description:
    "96家首尔夜店的真实营业时间。大多数22:00开门、05:00打烊,但真正热闹是凌晨1点。江南、弘大、梨泰院、釜山对比。",
  keywords: [
    "首尔夜店营业时间","韩国夜店几点开","首尔夜店几点关门","韩国夜店营业时间",
    "江南夜店营业时间","弘大夜店营业时间","梨泰院夜店营业时间","釜山夜店营业时间",
    "首尔夜店几点去","韩国夜店时间","首尔夜生活时间",
  ],
  alternates: { canonical: "https://nightflow.kr/zh/club-hours", languages: {
    "en-US":"https://nightflow.kr/en/club-hours","ja-JP":"https://nightflow.kr/ja/club-hours",
    "zh-CN":"https://nightflow.kr/zh/club-hours","zh-TW":"https://nightflow.kr/zh-tw/club-hours",
    "x-default":"https://nightflow.kr/en/club-hours" } },
  openGraph: { title:"首尔夜店营业时间 2026", description:"96家夜店真实营业时间。大多数22:00开、05:00关。", url:"https://nightflow.kr/zh/club-hours", locale:"zh_CN", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <ClubHoursPage lang="zh" />; }
