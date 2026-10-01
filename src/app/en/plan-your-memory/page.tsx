import type { Metadata } from "next";
import { PlanMemoryHub } from "@/components/foreign/plan/PlanMemoryPages";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "Korea Night Tours 2026 — Seoul, Busan & More Things to Do" },
  description:
    "Night views, river cruises and evening tours across Korea — Seoul, Busan and more. Plus night routes with clubs you can book in English.",
  alternates: { canonical: "https://nightflow.kr/en/plan-your-memory" },
  openGraph: { title: "Night Activities in Korea — Tours & Night Views", url: "https://nightflow.kr/en/plan-your-memory", locale: "en_US", type: "website", images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }] },
};
export default function Page() { return <PlanMemoryHub />; }
