import type { Metadata } from "next";
import { SeasonGuide, seasonGuideMetadata } from "@/components/foreign/SeasonGuide";
import { LNY_2027 } from "@/lib/foreign/seasonGuides";

// 가격표(RealTablePrices)가 메뉴를 읽으니 vip-tables와 같은 주기. route segment 파일에만 유효.
export const revalidate = 3600;

export const metadata: Metadata = seasonGuideMetadata(LNY_2027, "en");

export default function Page() {
  return <SeasonGuide cfg={LNY_2027} lang="en" />;
}
