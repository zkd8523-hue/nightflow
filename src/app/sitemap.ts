import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const BASE_URL = "https://nightflow.kr";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1.0 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const supabase = await createClient();

    const [auctionsRes, clubsRes] = await Promise.all([
      supabase
        .from("auctions")
        .select("id, updated_at")
        .in("status", ["active", "scheduled"])
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("clubs")
        .select("id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);

    const auctionRoutes: MetadataRoute.Sitemap = (auctionsRes.data ?? []).map((a) => ({
      url: `${BASE_URL}/auctions/${a.id}`,
      lastModified: a.updated_at ? new Date(a.updated_at) : now,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    }));

    const clubRoutes: MetadataRoute.Sitemap = (clubsRes.data ?? []).map((c) => ({
      url: `${BASE_URL}/clubs/${c.id}`,
      lastModified: c.updated_at ? new Date(c.updated_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    return [...staticRoutes, ...auctionRoutes, ...clubRoutes];
  } catch {
    return staticRoutes;
  }
}
