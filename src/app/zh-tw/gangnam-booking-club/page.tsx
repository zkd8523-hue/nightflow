import type { Metadata } from "next";
import { GangnamGuide, gangnamGuideMetadata } from "@/components/foreign/GangnamNightlifeGuides";

export const metadata: Metadata = gangnamGuideMetadata("booking", "zh-tw");

export default function Page() {
  return <GangnamGuide guide="booking" lang="zh-tw" />;
}
