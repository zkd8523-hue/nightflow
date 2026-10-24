import type { Metadata } from "next";
import { GangnamTableBudgetPage, gangnamTableBudgetMetadata } from "@/components/foreign/HighEndPages";

// 메뉴 가격이 바뀌면 1시간 내 반영. route segment 파일에만 유효.
export const revalidate = 3600;

export const metadata: Metadata = gangnamTableBudgetMetadata("ja");

export default function Page() {
  return <GangnamTableBudgetPage lang="ja" />;
}
