import type { Metadata } from "next";
import { PlanMemoryNightRoutes } from "@/components/foreign/plan/PlanMemoryPages";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "Korea Night Routes 2026 — Hongdae, Itaewon, Busan Nightlife" },
  description: "Pick a night in Seoul or Busan — Hongdae, Itaewon, the Busan drone show or Haeundae — and book a club table in English. Pay at the club.",
  alternates: { canonical: "https://nightflow.kr/en/plan-your-memory/night-routes" },
  openGraph: { title: "Night routes in Seoul & Busan", url: "https://nightflow.kr/en/plan-your-memory/night-routes", locale: "en_US", type: "website", images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }] },
};
export default function Page() { return <PlanMemoryNightRoutes />; }
