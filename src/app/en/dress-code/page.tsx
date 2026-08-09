import type { Metadata } from "next";
import { DressCodePage } from "@/components/foreign/DressCodePage";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "Seoul Club Dress Code 2026 — What to Wear to a Korean Club" },
  description:
    "Gangnam is strict, Hongdae is relaxed — but no slippers or flip-flops anywhere. What to wear by district, and what gets men turned away at the door.",
  keywords: [
    "Seoul club dress code","what to wear to Korean club","Korea club dress code",
    "Seoul nightclub dress code","Gangnam club dress code","Hongdae club dress code",
    "Itaewon club dress code","can I wear shorts Seoul club","Seoul club shoes",
    "Korean club outfit","Seoul club what to wear","Korea nightclub attire",
  ],
  alternates: { canonical: "https://nightflow.kr/en/dress-code", languages: {
    "en-US":"https://nightflow.kr/en/dress-code","ja-JP":"https://nightflow.kr/ja/dress-code",
    "zh-CN":"https://nightflow.kr/zh/dress-code","zh-TW":"https://nightflow.kr/zh-tw/dress-code",
    "x-default":"https://nightflow.kr/en/dress-code" } },
  openGraph: { title:"Seoul Club Dress Code 2026", description:"Gangnam strict, Hongdae relaxed — no slippers anywhere.", url:"https://nightflow.kr/en/dress-code", locale:"en_US", type:"article", images:[{url:"/og-image.png",width:1200,height:630}] },
};
export default function Page(){ return <DressCodePage lang="en" />; }
