import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { MapPin, Clock, Ticket, Shirt, Star, ExternalLink, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { clubSlug, canonicalAreaSlug } from "@/lib/clubs/slug";
import { translateClubMeta } from "@/lib/utils/clubMetaI18n";
import { clubFeatureLabels } from "@/lib/clubs/tagLabelsI18n";
import { getGoogleReviewsUrl } from "@/lib/utils/clubReviews";
import { SaveClubButton } from "@/components/clubs/SaveClubButton";

// 중국어(간체)판 클럽 개별 페이지 — /en/clubs/[area]/[club] 과 동일 구조 복제.
// 클럽 고유명사는 라틴 표기 고정 — 기존 /zh 지역 페이지도 "Club ACE", "Massive"처럼
// 라틴 표기 유지(2026-08-09 확인). 속성어(营业时间/入场费 등)만 번역해 검색 커버리지 확장.

const AREA_ZH: Record<string, string> = {
  gangnam: "江南",
  hongdae: "弘大",
  itaewon: "梨泰院",
  busan: "釜山",
};

const SELECT =
  "id, name, name_en, area, address, thumbnail_url, operating_hours, entry_fee_detail, " +
  "google_rating, google_review_count, google_reviews, instagram, dresscode, tags, drink_menu_url";

type ClubRow = {
  id: string;
  name: string;
  name_en: string | null;
  area: string;
  address: string | null;
  thumbnail_url: string | null;
  operating_hours: string | null;
  entry_fee_detail: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_reviews: { author_name: string | null; rating: number | null; text: string | null; relative_time: string | null }[] | null;
  instagram: string | null;
  dresscode: string | null;
  tags: string[] | null;
  drink_menu_url: string | null;
};

async function findClub(areaSlug: string, clubParam: string) {
  const areaZh = AREA_ZH[areaSlug];
  if (!areaZh) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select(SELECT)
    .is("deleted_at", null)
    .eq("status", "approved")
    .eq("is_test", false)
    .eq("hidden_from_guide", false);

  const rows = (data ?? []) as unknown as ClubRow[];
  const club = rows.find(
    (c) => c.name_en?.trim() && clubSlug(c.name_en) === clubParam.toLowerCase()
  );
  if (!club) return null;

  const siblings = rows
    .filter((c) => c.id !== club.id && c.area === club.area && c.name_en?.trim())
    .sort((a, b) => (b.google_review_count ?? 0) - (a.google_review_count ?? 0))
    .slice(0, 8);

  return { club, siblings };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string; club: string }>;
}): Promise<Metadata> {
  const { area, club: clubParam } = await params;
  const found = await findClub(area, clubParam);
  if (!found) return {};
  const { club } = found;

  const name = club.name_en!.trim();
  const areaZh = AREA_ZH[area] ?? club.area;
  const hours = club.operating_hours ? translateClubMeta(club.operating_hours, "zh") : null;
  const fee = club.entry_fee_detail ? translateClubMeta(club.entry_fee_detail, "zh") : null;
  const url = `https://nightflow.kr/zh/clubs/${area}/${clubParam}`;

  const descBits = [
    `${name}是首尔${areaZh}的一家夜店。`,
    hours ? `营业时间：${hours}。` : null,
    fee ? `入场费：${fee}。` : null,
    club.google_rating ? `谷歌评分${club.google_rating.toFixed(1)}（${club.google_review_count ?? 0}条评价）。` : null,
    "通过 NightFlow 用中文预订卡座 — 无中介，真实价格。",
  ].filter(Boolean);

  const keywords = [
    name,
    `${name} 首尔`,
    `${name} ${areaZh}`,
    `${name} 夜店`,
    `${name} 营业时间`,
    `${name} 入场费`,
    `${name} 门票`,
    `${name} 地址`,
    `${name} 点评`,
    `${name} 评价`,
    `${name} 着装要求`,
    `${name} 桌台价格`,
    `${name} 预订`,
    `${areaZh} 夜店`,
    `${areaZh} 夜店预订`,
    "首尔夜店",
    "韩国夜店",
    club.name,
  ];

  return {
    title: `${name} ${areaZh} — 营业时间・入场费・卡座预订`,
    description: descBits.join(" ").slice(0, 300),
    keywords,
    alternates: {
      canonical: url,
      languages: {
        "en-US": `https://nightflow.kr/en/clubs/${area}/${clubParam}`,
        "zh-CN": url,
        "zh-TW": `https://nightflow.kr/zh-tw/clubs/${area}/${clubParam}`,
        "ja-JP": `https://nightflow.kr/ja/clubs/${area}/${clubParam}`,
        "ko-KR": `https://nightflow.kr/clubs/${club.id}`,
        "x-default": `https://nightflow.kr/en/clubs/${area}/${clubParam}`,
      },
    },
    openGraph: {
      title: `${name} — ${areaZh}夜店，首尔`,
      description: descBits.join(" ").slice(0, 200),
      url,
      locale: "zh_CN",
      type: "website",
      images: [{ url: club.thumbnail_url || "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function ZhClubDetailPage({
  params,
}: {
  params: Promise<{ area: string; club: string }>;
}) {
  const { area, club: clubParam } = await params;
  const found = await findClub(area, clubParam);
  if (!found) notFound();
  const { club, siblings } = found;

  const canonical = canonicalAreaSlug(club.area);
  if (canonical && canonical !== area) {
    permanentRedirect(`/zh/clubs/${canonical}/${clubParam}`);
  }

  const name = club.name_en!.trim();
  const areaZh = AREA_ZH[area] ?? club.area;
  const hours = club.operating_hours ? translateClubMeta(club.operating_hours, "zh") : null;
  const fee = club.entry_fee_detail ? translateClubMeta(club.entry_fee_detail, "zh") : null;
  const dress = club.dresscode ? translateClubMeta(club.dresscode, "zh") : null;
  const features = clubFeatureLabels(club.tags, "zh");
  const reviews = (club.google_reviews ?? []).filter((r) => r.text?.trim()).slice(0, 5);
  const googleUrl = getGoogleReviewsUrl({ name: club.name, address: club.address, area: club.area }, "zh");
  const url = `https://nightflow.kr/zh/clubs/${area}/${clubParam}`;
  const bookHref = `/flags/new?lang=zh&area=${encodeURIComponent(club.area)}&club=${club.id}`;

  const faqs = [
    hours && { q: `${name}的营业时间是？`, a: `${name}（${areaZh}）的营业时间是${hours}。` },
    fee && { q: `${name}的入场费是多少？`, a: `${name}的入场费是${fee}。` },
    dress && { q: `${name}有着装要求吗？`, a: `${name}的着装要求：${dress}。` },
    club.address && { q: `${name}在哪里？`, a: `${name}位于${areaZh}（首尔）${club.address}。` },
    { q: `可以用中文预订${name}的卡座吗？`, a: `可以。NightFlow 会直接联系${name}为您锁定卡座，支持英文/中文沟通，无中介费。` },
  ].filter(Boolean) as { q: string; a: string }[];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NightClub",
        "@id": `${url}#nightclub`,
        name,
        alternateName: club.name,
        url,
        image: club.thumbnail_url || undefined,
        address: {
          "@type": "PostalAddress",
          streetAddress: club.address || undefined,
          addressLocality: areaZh,
          addressRegion: area === "busan" ? "Busan" : "Seoul",
          addressCountry: "KR",
        },
        openingHours: hours || undefined,
        aggregateRating: club.google_rating
          ? {
              "@type": "AggregateRating",
              ratingValue: club.google_rating,
              reviewCount: club.google_review_count ?? 1,
              bestRating: 5,
            }
          : undefined,
        review: reviews.map((r) => ({
          "@type": "Review",
          author: { "@type": "Person", name: r.author_name || "Google user" },
          reviewRating: r.rating ? { "@type": "Rating", ratingValue: r.rating, bestRating: 5 } : undefined,
          reviewBody: r.text,
        })),
        sameAs: club.instagram ? [`https://instagram.com/${club.instagram.replace(/^@/, "")}`] : undefined,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首尔夜店", item: "https://nightflow.kr/zh/clubs" },
          { "@type": "ListItem", position: 2, name: `${areaZh}夜店`, item: `https://nightflow.kr/zh/clubs/${area}` },
          { "@type": "ListItem", position: 3, name, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  const fact = (icon: React.ReactNode, label: string, value: string) => (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <span className="shrink-0 mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12px] font-bold text-muted-foreground">{label}</dt>
        <dd className="text-[15px] text-foreground break-keep">{value}</dd>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 pb-safe">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between bg-background/95 backdrop-blur-sm border-b border-border">
        <Link href="/zh" className="flex items-center gap-1 -ml-1 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-[15px] font-black tracking-tight">NightFlow</span>
        </Link>
        <Link href={`/zh/clubs/${area}`}
          className="px-3.5 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold text-foreground hover:text-brand-amber transition-colors">
          {areaZh}的其他夜店
        </Link>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-wrap">
          <Link href="/zh/clubs" className="hover:text-foreground">首尔夜店</Link>
          <span>/</span>
          <Link href={`/zh/clubs/${area}`} className="hover:text-foreground">{areaZh}</Link>
          <span>/</span>
          <span className="text-foreground font-bold">{name}</span>
        </nav>

        <header className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight">{name}</h1>
          <p className="text-muted-foreground text-[14px]">
            {areaZh}（首尔）夜店{club.name !== name && <> ・ {club.name}</>}
          </p>
          {club.google_rating != null && (
            <a href={googleUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[14px] text-brand-amber">
              <Star className="w-4 h-4 fill-current" />
              {club.google_rating.toFixed(1)}
              <span className="text-muted-foreground">
                ・{(club.google_review_count ?? 0).toLocaleString()}条谷歌评价
              </span>
            </a>
          )}
        </header>

        {club.thumbnail_url && (
          <div className="relative w-full h-56 rounded-2xl overflow-hidden">
            <Image src={club.thumbnail_url} alt={`${name} — ${areaZh}夜店，首尔`} fill
              className="object-cover" sizes="(max-width: 640px) 100vw, 512px" priority />
          </div>
        )}

        <section>
          <h2 className="text-[18px] font-black mb-1">{name} — 营业时间・入场费・地址</h2>
          <dl className="rounded-2xl bg-card border border-border px-4">
            {hours && fact(<Clock className="w-4 h-4" />, "营业时间", hours)}
            {fee && fact(<Ticket className="w-4 h-4" />, "入场费", fee)}
            {club.address && fact(<MapPin className="w-4 h-4" />, "地址", club.address)}
            {dress && fact(<Shirt className="w-4 h-4" />, "着装要求", dress)}
          </dl>
        </section>

        {features.length > 0 && (
          <section>
            <h2 className="text-[18px] font-black mb-2">音乐・类型</h2>
            <div className="flex flex-wrap gap-2">
              {features.map((f) => (
                <span key={f} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[13px] font-bold">
                  {f}
                </span>
              ))}
            </div>
          </section>
        )}

        {reviews.length > 0 && (
          <section>
            <h2 className="text-[18px] font-black mb-2">{name}的点评</h2>
            <div className="space-y-2">
              {reviews.map((r, i) => (
                <blockquote key={i} className="p-3 rounded-xl bg-card border border-border">
                  <p className="text-[13px] text-foreground leading-relaxed">{r.text}</p>
                  <footer className="text-[11px] text-muted-foreground mt-1.5">
                    — {r.author_name || "Google user"}
                    {r.relative_time && <>，{r.relative_time}</>}
                  </footer>
                </blockquote>
              ))}
            </div>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[12px] text-brand-amber">
              查看更多谷歌评价 <ExternalLink className="w-3 h-3" />
            </a>
          </section>
        )}

        <section className="rounded-2xl bg-card border border-border p-5 space-y-1.5">
          <h2 className="text-[18px] font-black">预订{name}的卡座</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
            告诉我们日期、人数和预算。NightFlow 会直接联系{name}，用韩语沟通，为您用中文回复。
            无中介费，无需押金。
          </p>
        </section>

        {faqs.length > 0 && (
          <section>
            <h2 className="text-[18px] font-black mb-2">{name}常见问题</h2>
            <div className="space-y-3">
              {faqs.map((f) => (
                <div key={f.q}>
                  <h3 className="text-[14px] font-bold text-foreground">{f.q}</h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-0.5">{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {siblings.length > 0 && (
          <section>
            <h2 className="text-[18px] font-black mb-2">{areaZh}的其他夜店</h2>
            <div className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link key={s.id} href={`/zh/clubs/${area}/${clubSlug(s.name_en!)}`}
                  className="px-3 py-1.5 rounded-full bg-muted border border-border text-[13px] font-bold hover:text-brand-amber">
                  {s.name_en!.trim()}
                </Link>
              ))}
            </div>
            <Link href={`/zh/clubs/${area}`} className="inline-block mt-3 text-[13px] text-brand-amber underline underline-offset-2">
              查看{areaZh}全部夜店 →
            </Link>
          </section>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-10 px-4 pt-3 pb-4 pb-safe bg-card/95 backdrop-blur-sm border-t border-border">
        <div className="flex items-stretch gap-2 w-full max-w-lg mx-auto">
          <Link href={bookHref}
            className="flex-[8] min-w-0 flex items-center justify-center py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors">
            🍾 预订 {name}
          </Link>
          <SaveClubButton
            variant="cta"
            className="flex-[2] min-w-0"
            club={{ id: club.id, name: club.name, name_en: club.name_en, area: club.area, thumbnail_url: club.thumbnail_url }}
            lang="zh"
          />
        </div>
      </div>
    </div>
  );
}
