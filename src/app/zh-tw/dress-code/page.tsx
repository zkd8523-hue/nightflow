import type { Metadata } from "next";
import { DressCodePage } from "@/components/foreign/DressCodePage";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "首爾夜店服裝規定 2026 — 該穿什麼去韓國夜店?" },
  description:
    "江南嚴格、弘大自由 — 但拖鞋和夾腳拖哪裡都不行。各區域的服裝標準,以及男性在門口被拒的原因。",
  keywords: [
    "首爾夜店服裝規定","韓國夜店穿什麼","韓國夜店服裝","首爾夜店dress code",
    "江南夜店服裝","弘大夜店穿著","梨泰院夜店服裝","韓國夜店可以穿短褲嗎","首爾夜店鞋子",
  ],
  alternates: { canonical: "https://nightflow.kr/zh-tw/dress-code", languages: {
    "en-US":"https://nightflow.kr/en/dress-code","ja-JP":"https://nightflow.kr/ja/dress-code",
    "zh-CN":"https://nightflow.kr/zh/dress-code","zh-TW":"https://nightflow.kr/zh-tw/dress-code",
    "x-default":"https://nightflow.kr/en/dress-code" } },
  openGraph: { title:"首爾夜店服裝規定 2026", description:"江南嚴格、弘大自由。拖鞋哪裡都不行。", url:"https://nightflow.kr/zh-tw/dress-code", locale:"zh_TW", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <DressCodePage lang="zh-tw" />; }
