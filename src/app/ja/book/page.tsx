import type { Metadata } from "next";
import { AdLanding, adLandingMetadata } from "@/components/foreign/AdLanding";

// 예약 가능 클럽 이름을 DB에서 읽는다(AdLanding) — 1시간 단위로 다시 만든다.
export const revalidate = 3600;

export const metadata: Metadata = adLandingMetadata("ja");

export default function Page() {
  return <AdLanding lang="ja" />;
}
