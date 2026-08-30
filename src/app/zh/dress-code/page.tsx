import type { Metadata } from "next";
import { DressCodePage } from "@/components/foreign/DressCodePage";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "首尔夜店着装要求 2026 — 该穿什么去韩国夜店?" },
  description:
    "江南严格、弘大自由 — 但拖鞋和人字拖哪里都不行。各区域的着装标准,以及男性在门口被拒的原因。",
  keywords: [
    "首尔夜店着装要求","韩国夜店穿什么","韩国夜店着装","首尔夜店dress code",
    "江南夜店着装","弘大夜店穿着","梨泰院夜店着装","韩国夜店可以穿短裤吗","首尔夜店鞋子",
  ],
  alternates: { canonical: "https://nightflow.kr/zh/dress-code", languages: {
    "en-US":"https://nightflow.kr/en/dress-code","ja-JP":"https://nightflow.kr/ja/dress-code",
    "zh-CN":"https://nightflow.kr/zh/dress-code","zh-TW":"https://nightflow.kr/zh-tw/dress-code",
    "x-default":"https://nightflow.kr/en/dress-code" } },
  openGraph: { title:"首尔夜店着装要求 2026", description:"江南严格、弘大自由。拖鞋哪里都不行。", url:"https://nightflow.kr/zh/dress-code", locale:"zh_CN", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <DressCodePage lang="zh" />; }
