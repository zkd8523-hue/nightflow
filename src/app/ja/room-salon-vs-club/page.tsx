import type { Metadata } from "next";
import { GangnamGuide, gangnamGuideMetadata } from "@/components/foreign/GangnamNightlifeGuides";

export const metadata: Metadata = gangnamGuideMetadata("roomSalon", "ja");

export default function Page() {
  return <GangnamGuide guide="roomSalon" lang="ja" />;
}
