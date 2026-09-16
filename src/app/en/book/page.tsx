import type { Metadata } from "next";
import { AdLanding, adLandingMetadata } from "@/components/foreign/AdLanding";

export const metadata: Metadata = adLandingMetadata("en");

export default function Page() {
  return <AdLanding lang="en" />;
}
