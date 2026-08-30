import type { Metadata } from "next";
import { DressCodePage } from "@/components/foreign/DressCodePage";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "ソウルのクラブ ドレスコード 2026 — 何を着ていけばいい？" },
  description:
    "江南は厳しく弘大は自由 — ただしスリッパ・ビーチサンダルはどこでも不可。エリア別の服装基準と、男性が入口で断られる理由。",
  keywords: [
    "ソウル クラブ ドレスコード","韓国 クラブ 服装","韓国 クラブ ドレスコード",
    "江南 クラブ 服装","弘大 クラブ 服装","梨泰院 クラブ 服装",
    "韓国 クラブ 短パン","ソウル クラブ 靴","韓国 クラブ 何を着る",
  ],
  alternates: { canonical: "https://nightflow.kr/ja/dress-code", languages: {
    "en-US":"https://nightflow.kr/en/dress-code","ja-JP":"https://nightflow.kr/ja/dress-code",
    "zh-CN":"https://nightflow.kr/zh/dress-code","zh-TW":"https://nightflow.kr/zh-tw/dress-code",
    "x-default":"https://nightflow.kr/en/dress-code" } },
  openGraph: { title:"ソウルのクラブ ドレスコード 2026", description:"江南は厳しく弘大は自由。スリッパはどこでも不可。", url:"https://nightflow.kr/ja/dress-code", locale:"ja_JP", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <DressCodePage lang="ja" />; }
