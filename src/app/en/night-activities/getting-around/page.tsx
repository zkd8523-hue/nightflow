import type { Metadata } from "next";
import { PlanMemoryGettingAround } from "@/components/foreign/plan/PlanMemoryPages";

export const metadata: Metadata = {
  title: { absolute: "Getting Home Safely at Night in Korea — Last Train, Taxi, 1330 Helpline" },
  description: "Last trains, taxi apps, cash, age rules and help numbers (1330, 112, 119) for a night out in Seoul or Busan.",
  alternates: { canonical: "https://nightflow.kr/en/night-activities/getting-around" },
  openGraph: { title: "Getting home safely at night in Korea", url: "https://nightflow.kr/en/night-activities/getting-around", locale: "en_US", type: "article", images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }] },
};
export default function Page() { return <PlanMemoryGettingAround />; }
