import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ROUTES, routeBySlug, img } from "@/lib/planMemory/content";
import { PlanMemoryRoute } from "@/components/foreign/plan/PlanMemoryRoute";

export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return ROUTES.map((r) => ({ route: r.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ route: string }> }): Promise<Metadata> {
  const r = routeBySlug((await params).route);
  if (!r) return {};
  const url = `https://nightflow.kr/en/night-activities/${r.slug}`;
  return {
    title: { absolute: r.metaTitle },
    description: r.metaDescription,
    alternates: { canonical: url },
    openGraph: { title: r.metaTitle, description: r.metaDescription, url, locale: "en_US", type: "article", images: [{ url: img(r.hero, 1200), width: 1200, height: 630 }] },
  };
}

export default async function Page({ params }: { params: Promise<{ route: string }> }) {
  const r = routeBySlug((await params).route);
  if (!r) notFound();
  return <PlanMemoryRoute route={r} />;
}
