import type { Metadata } from "next";
import { SeasonGuide, seasonGuideMetadata } from "@/components/foreign/SeasonGuide";
import { GROUP_TABLE } from "@/lib/foreign/seasonGuides";

// 가격표(RealTablePrices)가 메뉴를 읽으니 vip-tables와 같은 주기. route segment 파일에만 유효.
export const revalidate = 3600;

export const metadata: Metadata = seasonGuideMetadata(GROUP_TABLE, "zh-tw");

export default function Page() {
  return <SeasonGuide cfg={GROUP_TABLE} lang="zh-tw" />;
}
