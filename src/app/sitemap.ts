import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const BASE_URL = "https://nightflow.kr";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1.0 },
    { url: `${BASE_URL}/clubs`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/hotdeal`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const supabase = await createClient();

    const nowIso = new Date().toISOString();
    const [auctionsRes, clubsRes, puzzlesRes, hotdealsRes] = await Promise.all([
      supabase
        .from("auctions")
        .select("id, updated_at, status")
        .in("status", ["active", "scheduled", "won", "contacted", "confirmed"])
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase
        .from("clubs")
        .select("id, updated_at")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("puzzles")
        .select("id, updated_at")
        .eq("status", "open")
        .gt("expires_at", new Date().toISOString())
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("daily_hotdeals")
        .select("id, updated_at, ends_at")
        .gt("ends_at", nowIso)
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);

    const auctionRoutes: MetadataRoute.Sitemap = (auctionsRes.data ?? []).map((a) => {
      const isLive = a.status === "active" || a.status === "scheduled";
      return {
        url: `${BASE_URL}/auctions/${a.id}`,
        lastModified: a.updated_at ? new Date(a.updated_at) : now,
        changeFrequency: (isLive ? "hourly" : "monthly") as
          | "hourly"
          | "monthly",
        priority: isLive ? 0.8 : 0.6,
      };
    });

    const clubRoutes: MetadataRoute.Sitemap = (clubsRes.data ?? []).map((c) => ({
      url: `${BASE_URL}/clubs/${c.id}`,
      lastModified: c.updated_at ? new Date(c.updated_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const puzzleRoutes: MetadataRoute.Sitemap = (puzzlesRes.data ?? []).map((p) => ({
      url: `${BASE_URL}/flags/${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    }));

    const hotdealRoutes: MetadataRoute.Sitemap = (hotdealsRes.data ?? []).map((h) => ({
      url: `${BASE_URL}/hotdeal/${h.id}`,
      lastModified: h.updated_at ? new Date(h.updated_at) : now,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    }));

    return [
      ...staticRoutes,
      ...auctionRoutes,
      ...clubRoutes,
      ...puzzleRoutes,
      ...hotdealRoutes,
    ];
  } catch {
    return staticRoutes;
  }
}
