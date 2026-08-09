import type { Metadata } from "next";
import { ClubEntryRulesPage } from "@/components/foreign/ClubEntryRulesPage";
export const revalidate = 86400;
export const metadata: Metadata = {
  title: { absolute: "韓国クラブの年齢制限・身分証ルール 2026 — パスポートは必要？" },
  description:
    "韓国は「年年齢」基準。2026年は2007年生まれまで入場可能。外国人はパスポートまたはARCの実物が必要で、写真は不可。外国人の入場可否と持ち物。",
  keywords: [
    "韓国 クラブ 年齢制限","韓国 クラブ パスポート","韓国 クラブ 身分証","韓国 飲酒 年齢",
    "ソウル クラブ 外国人","韓国 クラブ 入場 条件","ソウル クラブ 年齢","韓国 クラブ 何歳から",
  ],
  alternates: { canonical: "https://nightflow.kr/ja/club-entry-rules", languages: {
    "en-US":"https://nightflow.kr/en/club-entry-rules","ja-JP":"https://nightflow.kr/ja/club-entry-rules",
    "zh-CN":"https://nightflow.kr/zh/club-entry-rules","zh-TW":"https://nightflow.kr/zh-tw/club-entry-rules",
    "x-default":"https://nightflow.kr/en/club-entry-rules" } },
  openGraph: { title:"韓国クラブの年齢制限・身分証ルール 2026", description:"2007年生まれまで。パスポートまたはARCの実物が必要。", url:"https://nightflow.kr/ja/club-entry-rules", locale:"ja_JP", type:"article", images:[{url:"/og-image.png",width:1200,height:630}] },
};
export default function Page(){ return <ClubEntryRulesPage lang="ja" />; }
