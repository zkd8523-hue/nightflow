import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/md/",
          "/api/",
          "/auth/",
          "/settings/",
          "/profile/",
          "/notifications/",
          "/my-wins/",
          "/my-penalties/",
          "/bids/",
          "/favorites/",
          "/recover-account/",
        ],
      },
    ],
    sitemap: "https://nightflow.kr/sitemap.xml",
    host: "https://nightflow.kr",
  };
}
