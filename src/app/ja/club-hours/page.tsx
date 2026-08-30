import type { Metadata } from "next";
import { ClubHoursPage } from "@/components/foreign/ClubHoursPage";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "ソウルのクラブ営業時間 2026 — 何時に開いて何時に閉まる？" },
  description:
    "96店の実際の営業時間。ほとんどが22:00オープン・05:00クローズですが、本格的に混むのは深夜1時から。江南・弘大・梨泰院・釜山を比較。",
  keywords: [
    "ソウル クラブ 営業時間","韓国 クラブ 何時","ソウル クラブ 何時まで","韓国 クラブ 営業時間",
    "江南 クラブ 営業時間","弘大 クラブ 営業時間","梨泰院 クラブ 営業時間","釜山 クラブ 営業時間",
    "ソウル クラブ 時間","韓国 ナイトクラブ 営業時間","ソウル クラブ いつ行く",
  ],
  alternates: { canonical: "https://nightflow.kr/ja/club-hours", languages: {
    "en-US":"https://nightflow.kr/en/club-hours","ja-JP":"https://nightflow.kr/ja/club-hours",
    "zh-CN":"https://nightflow.kr/zh/club-hours","zh-TW":"https://nightflow.kr/zh-tw/club-hours",
    "x-default":"https://nightflow.kr/en/club-hours" } },
  openGraph: { title:"ソウルのクラブ営業時間 2026", description:"96店の実際の営業時間。ほとんどが22:00オープン・05:00クローズ。", url:"https://nightflow.kr/ja/club-hours", locale:"ja_JP", type:"article", images:[{url:"/og-image-v2.png",width:1200,height:630}] },
};
export default function Page(){ return <ClubHoursPage lang="ja" />; }
