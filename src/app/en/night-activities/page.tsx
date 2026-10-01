import type { Metadata } from "next";
import { PlanMemoryHub } from "@/components/foreign/plan/PlanMemoryPages";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: { absolute: "Korea Night Tours 2026 — Seoul, Busan & More Things to Do" },
  description:
    "22 evening tours in Korea — Han River night cruises, Seoul and Busan night views, Suwon Hwaseong and Gyeongju after dark. Prices shown before you book.",
  alternates: { canonical: "https://nightflow.kr/en/night-activities" },
  openGraph: { title: "Night Activities in Korea — Tours & Night Views", url: "https://nightflow.kr/en/night-activities", locale: "en_US", type: "website", images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }] },
};
export default function Page() { return <PlanMemoryHub />; }
