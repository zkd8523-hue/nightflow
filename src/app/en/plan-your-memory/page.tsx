import type { Metadata } from "next";
import { PlanMemoryHub } from "@/components/foreign/plan/PlanMemoryPages";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "Plan Your Night in Korea 2026 — Night Routes, Tours & Clubs" },
  description:
    "Not sure where to go at night in Seoul or Busan? Pick a night — Hongdae, Itaewon, Busan drone show, Haeundae or night tours — and book a club table in English.",
  alternates: { canonical: "https://nightflow.kr/en/plan-your-memory" },
  openGraph: { title: "Plan your Memory — Night routes in Seoul & Busan", url: "https://nightflow.kr/en/plan-your-memory", locale: "en_US", type: "website", images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }] },
};
export default function Page() { return <PlanMemoryHub />; }
