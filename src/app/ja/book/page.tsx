import type { Metadata } from "next";
import { AdLanding, adLandingMetadata } from "@/components/foreign/AdLanding";

export const metadata: Metadata = adLandingMetadata("ja");

export default function Page() {
  return <AdLanding lang="ja" />;
}
