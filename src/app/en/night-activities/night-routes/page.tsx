import type { Metadata } from "next";
import { PlanMemoryNightRoutes } from "@/components/foreign/plan/PlanMemoryPages";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "Seoul & Busan Night Routes 2026 — Hongdae, Itaewon, Drone Show" },
  description: "Four night plans for Seoul and Busan — Hongdae street music, Itaewon rooftops, the Gwangalli drone show and a Haeundae beach evening, with real times and costs.",
  alternates: { canonical: "https://nightflow.kr/en/night-activities/night-routes" },
  openGraph: { title: "Night routes in Seoul & Busan", url: "https://nightflow.kr/en/night-activities/night-routes", locale: "en_US", type: "website", images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }] },
};
export default function Page() { return <PlanMemoryNightRoutes />; }
