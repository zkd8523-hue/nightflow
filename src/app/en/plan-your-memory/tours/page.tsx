import type { Metadata } from "next";
import { PlanMemoryTours } from "@/components/foreign/plan/PlanMemoryPages";

export const metadata: Metadata = {
  title: { absolute: "Seoul & Busan Night Tours 2026 — Han River Cruise, Night Views" },
  description: "Evening tours for travelers: Han River night cruise, N Seoul Tower walk, small-group Seoul night views, Busan night hikes and Haeundae sunset Sky Capsule.",
  alternates: { canonical: "https://nightflow.kr/en/plan-your-memory/tours" },
  openGraph: { title: "Night tours in Seoul & Busan", url: "https://nightflow.kr/en/plan-your-memory/tours", locale: "en_US", type: "website", images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }] },
};
export default function Page() { return <PlanMemoryTours />; }
