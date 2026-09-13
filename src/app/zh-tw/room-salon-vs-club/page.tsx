import type { Metadata } from "next";
import { GangnamGuide, gangnamGuideMetadata } from "@/components/foreign/GangnamNightlifeGuides";

export const metadata: Metadata = gangnamGuideMetadata("roomSalon", "zh-tw");

export default function Page() {
  return <GangnamGuide guide="roomSalon" lang="zh-tw" />;
}
