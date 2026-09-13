import type { Metadata } from "next";
import { HalloweenSeoul2026, halloweenMetadata } from "@/components/foreign/HalloweenSeoul2026";

// 가격표(RealTablePrices)가 메뉴를 읽으니 vip-tables와 같은 주기. route segment 파일에만 유효.
export const revalidate = 3600;

export const metadata: Metadata = halloweenMetadata("en");

export default function Page() {
  return <HalloweenSeoul2026 lang="en" />;
}
