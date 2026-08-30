import type { Metadata } from "next";
import { ClubHoursPage } from "@/components/foreign/ClubHoursPage";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "Seoul Club Opening Hours 2026 — What Time Do Clubs Open & Close?" },
  description:
    "Real opening hours from 96 Seoul clubs. Most open at 22:00 and close at 05:00, but the room only fills around 1am. Gangnam, Hongdae, Itaewon and Busan compared.",
  keywords: [
    "Seoul club opening hours","what time do Seoul clubs open","Seoul club closing time",
    "Seoul nightclub hours","Korea club hours","Korean club opening time",
    "Gangnam club hours","Hongdae club hours","Itaewon club hours","Busan club hours",
    "when to go clubbing Seoul","Seoul club time","Seoul nightlife hours","best time to arrive Seoul club",
  ],
  alternates: { canonical: "https://nightflow.kr/en/club-hours", languages: {
    "en-US":"https://nightflow.kr/en/club-hours","ja-JP":"https://nightflow.kr/ja/club-hours",
    "zh-CN":"https://nightflow.kr/zh/club-hours","zh-TW":"https://nightflow.kr/zh-tw/club-hours",
    "x-default":"https://nightflow.kr/en/club-hours" } },
  openGraph: { title:"Seoul Club Opening Hours 2026", description:"Real hours from 96 clubs. Most open 22:00, close 05:00.", url:"https://nightflow.kr/en/club-hours", locale:"en_US", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <ClubHoursPage lang="en" />; }
