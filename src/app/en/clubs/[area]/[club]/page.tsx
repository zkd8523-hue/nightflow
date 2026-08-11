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

// 클럽 개별 페이지 — 외국인 롱테일 SEO의 핵심.
//
// 배경(2026-08-09 감사): /en 에는 지역 페이지까지만 있고 클럽 상세는 시트(모달)라
// "Hongdae B1 opening hours", "Waikiki entrance fee" 같은 클럽명+속성 검색에 걸릴 URL이
// 아예 없었다. 영업시간(99%)·입장료(63%)·구글평점(91%) 데이터를 다 갖고도 크롤러에겐
// 안 보이는 상태였음(시트는 클릭해야 마운트되므로 초기 HTML에 없음).
//
// 그래서 이 페이지는 모든 정보를 서버 렌더링하고, 같은 정보를 JSON-LD(NightClub/FAQPage)로
// 한 번 더 준다 — 구글이 "영업시간/위치/리뷰" 질의에 직접 답으로 쓸 수 있는 형태.

const AREA_EN: Record<string, string> = {
  gangnam: "Gangnam",
  hongdae: "Hongdae",
  itaewon: "Itaewon",
  busan: "Busan",
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

/** 슬러그로 클럽 찾기. 슬러그는 name_en 파생이라 DB에서 직접 못 걸러 지역 단위로 받아 매칭. */
async function findClub(areaSlug: string, clubParam: string) {
  const areaEn = AREA_EN[areaSlug];
  if (!areaEn) return null;

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

  // 같은 지역의 다른 클럽 — 내부 링크(거미줄)용. 크롤러가 한 페이지에서 이웃으로 퍼져나감.
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
  const areaEn = AREA_EN[area] ?? club.area;
  const hours = club.operating_hours ? translateClubMeta(club.operating_hours, "en") : null;
  const fee = club.entry_fee_detail ? translateClubMeta(club.entry_fee_detail, "en") : null;
  const url = `https://nightflow.kr/en/clubs/${area}/${clubParam}`;

  // 설명에 실제 영업시간·입장료를 넣는다 — 검색 스니펫이 곧 질문의 답이 되도록.
  const descBits = [
    `${name} is a nightclub in ${areaEn}, Seoul.`,
    hours ? `Open ${hours}.` : null,
    fee ? `Entry ${fee}.` : null,
    club.google_rating ? `Rated ${club.google_rating.toFixed(1)} on Google (${club.google_review_count ?? 0} reviews).` : null,
    "Book a table in English with NightFlow — no broker, real prices.",
  ].filter(Boolean);

  // 롱테일 거미줄 — 이름 단독부터 이름+속성까지 폭넓게.
  const keywords = [
    name,
    `${name} Seoul`,
    `${name} ${areaEn}`,
    `${name} club`,
    `${name} nightclub`,
    `${name} entrance fee`,
    `${name} entry fee`,
    `${name} cover charge`,
    `${name} opening hours`,
    `${name} hours`,
    `${name} address`,
    `${name} location`,
    `${name} reviews`,
    `${name} dress code`,
    `${name} table price`,
    `${name} bottle service`,
    `${name} reservation`,
    `${name} booking`,
    `${areaEn} club`,
    `${areaEn} nightclub`,
    `Seoul nightclub`,
    club.name, // 한글 등록명 — 한국어 병기 검색 대응
  ];

  return {
    title: `${name} ${areaEn} — Entry Fee, Opening Hours & Table Booking`,
    description: descBits.join(" ").slice(0, 300),
    keywords,
    alternates: {
      canonical: url,
      languages: {
        "en-US": url,
        "ja-JP": `https://nightflow.kr/ja/clubs/${area}/${clubParam}`,
        "zh-CN": `https://nightflow.kr/zh/clubs/${area}/${clubParam}`,
        "zh-TW": `https://nightflow.kr/zh-tw/clubs/${area}/${clubParam}`,
        "ko-KR": `https://nightflow.kr/clubs/${club.id}`,
        "x-default": url,
      },
    },
    openGraph: {
      title: `${name} — ${areaEn} Club, Seoul`,
      description: descBits.join(" ").slice(0, 200),
      url,
      locale: "en_US",
      type: "website",
      images: [{ url: club.thumbnail_url || "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function EnClubDetailPage({
  params,
}: {
  params: Promise<{ area: string; club: string }>;
}) {
  const { area, club: clubParam } = await params;
  const found = await findClub(area, clubParam);
  if (!found) notFound();
  const { club, siblings } = found;

  // apgujeong 등 별칭 경로로 들어오면 정본으로 보냄 (중복 콘텐츠 방지)
  const canonical = canonicalAreaSlug(club.area);
  if (canonical && canonical !== area) {
    permanentRedirect(`/en/clubs/${canonical}/${clubParam}`);
  }

  const name = club.name_en!.trim();
  const areaEn = AREA_EN[area] ?? club.area;
  const hours = club.operating_hours ? translateClubMeta(club.operating_hours, "en") : null;
  const fee = club.entry_fee_detail ? translateClubMeta(club.entry_fee_detail, "en") : null;
  const dress = club.dresscode ? translateClubMeta(club.dresscode, "en") : null;
  const features = clubFeatureLabels(club.tags, "en");
  // 평점 높은 순 — 구글이 주는 순서는 뒤죽박죽이라 첫 리뷰가 1점이면 바로 이탈한다.
  const reviews = (club.google_reviews ?? [])
    .filter((r) => r.text?.trim())
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5);
  const googleUrl = getGoogleReviewsUrl({ name: club.name, address: club.address, area: club.area }, "en");
  const url = `https://nightflow.kr/en/clubs/${area}/${clubParam}`;
  const bookHref = `/flags/new?lang=en&area=${encodeURIComponent(club.area)}&club=${club.id}`;

  // FAQ는 실제 데이터가 있는 항목만 만든다 — 빈 답을 넣으면 구조화 데이터 품질만 떨어짐.
  const faqs = [
    hours && { q: `What time does ${name} open?`, a: `${name} in ${areaEn} operates ${hours}.` },
    fee && { q: `How much is the entry fee at ${name}?`, a: `Entry at ${name} is ${fee}.` },
    dress && { q: `What is the dress code at ${name}?`, a: `${name} dress code: ${dress}.` },
    club.address && { q: `Where is ${name} located?`, a: `${name} is at ${club.address}, ${areaEn}, Seoul.` },
    { q: `Can I book a table at ${name} in English?`, a: `Yes. NightFlow contacts ${name} directly and locks in your table — you deal only in English, with no broker fee.` },
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
          addressLocality: areaEn,
          addressRegion: area === "busan" ? "Busan" : "Seoul",
          addressCountry: "KR",
        },
        // 원본이 자유 텍스트라 openingHours(문자열)로 준다 — openingHoursSpecification은
        // 요일·시각 구조가 정확해야 해서, 파싱 실패 시 오히려 잘못된 정보를 심게 됨.
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
          { "@type": "ListItem", position: 1, name: "Seoul Clubs", item: "https://nightflow.kr/en/clubs" },
          { "@type": "ListItem", position: 2, name: `${areaEn} Clubs`, item: `https://nightflow.kr/en/clubs/${area}` },
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
    // 하단 sticky 예약바에 안 가리도록 실제 콘텐츠 높이만큼 여백 확보 (pb-safe: 아이폰 홈 인디케이터).
    <div className="min-h-screen bg-background text-foreground pb-28 pb-safe">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* 상단 헤더 — 클럽 하나만 보고 이탈하지 않게, 홈/다른 클럽으로 돌아갈 진입점을 항상 노출.
          클럽 상세가 시트였을 때는 "닫기"만 하면 원래 목록이었는데, 페이지가 되면서
          브레드크럼(아래)만으론 "여기서 더 둘러볼 수 있다"는 게 눈에 안 띔. */}
      <header className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between bg-background/95 backdrop-blur-sm border-b border-border">
        <Link href="/en" className="flex items-center gap-1 -ml-1 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-[15px] font-black tracking-tight">NightFlow</span>
        </Link>
        <Link href={`/en/clubs/${area}`}
          className="px-3.5 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold text-foreground hover:text-brand-amber transition-colors">
          More {areaEn} clubs
        </Link>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        {/* 브레드크럼 — 크롤러 경로이자 유저 탈출구 */}
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-wrap">
          <Link href="/en/clubs" className="hover:text-foreground">Seoul Clubs</Link>
          <span>/</span>
          <Link href={`/en/clubs/${area}`} className="hover:text-foreground">{areaEn}</Link>
          <span>/</span>
          <span className="text-foreground font-bold">{name}</span>
        </nav>

        <header className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight">{name}</h1>
          <p className="text-muted-foreground text-[14px]">
            Nightclub in {areaEn}, Seoul{club.name !== name && <> · {club.name}</>}
          </p>
          {club.google_rating != null && (
            <a href={googleUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[14px] text-brand-amber">
              <Star className="w-4 h-4 fill-current" />
              {club.google_rating.toFixed(1)}
              <span className="text-muted-foreground">
                · {(club.google_review_count ?? 0).toLocaleString()} Google reviews
              </span>
            </a>
          )}
        </header>

        {club.thumbnail_url && (
          <div className="relative w-full h-56 rounded-2xl overflow-hidden">
            <Image src={club.thumbnail_url} alt={`${name} — ${areaEn} nightclub in Seoul`} fill
              className="object-cover" sizes="(max-width: 640px) 100vw, 512px" priority />
          </div>
        )}

        {/* 핵심 정보 — 검색 질의에 그대로 대응하는 항목들 */}
        <section>
          <h2 className="text-[18px] font-black mb-1">{name} — hours, entry fee & location</h2>
          <dl className="rounded-2xl bg-card border border-border px-4">
            {hours && fact(<Clock className="w-4 h-4" />, "Opening hours", hours)}
            {fee && fact(<Ticket className="w-4 h-4" />, "Entry fee", fee)}
            {club.address && fact(<MapPin className="w-4 h-4" />, "Address", club.address)}
            {dress && fact(<Shirt className="w-4 h-4" />, "Dress code", dress)}
          </dl>
        </section>

        {features.length > 0 && (
          <section>
            <h2 className="text-[18px] font-black mb-2">Music & venue type</h2>
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
            <h2 className="text-[18px] font-black mb-2">What people say about {name}</h2>
            <div className="space-y-2">
              {reviews.map((r, i) => (
                <blockquote key={i} className="p-3 rounded-xl bg-card border border-border">
                  <p className="text-[13px] text-foreground leading-relaxed">{r.text}</p>
                  <footer className="text-[11px] text-muted-foreground mt-1.5">
                    — {r.author_name || "Google user"}
                    {r.relative_time && <>, {r.relative_time}</>}
                  </footer>
                </blockquote>
              ))}
            </div>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[12px] text-brand-amber">
              More reviews on Google <ExternalLink className="w-3 h-3" />
            </a>
          </section>
        )}

        <section className="rounded-2xl bg-card border border-border p-5 space-y-1.5">
          <h2 className="text-[18px] font-black">Book a table at {name}</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
            Tell us your date, group size and budget. We contact {name} directly, negotiate your
            table in Korean, and reply to you in English. No broker fee, no deposit.
          </p>
        </section>

        {/* FAQ — 화면에도 보여준다. JSON-LD만 있고 본문에 없으면 구글이 신뢰하지 않음. */}
        {faqs.length > 0 && (
          <section>
            <h2 className="text-[18px] font-black mb-2">{name} FAQ</h2>
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

        {/* 이웃 클럽 — 크롤러가 지역 안을 돌아다니게 하는 거미줄 */}
        {siblings.length > 0 && (
          <section>
            <h2 className="text-[18px] font-black mb-2">Other clubs in {areaEn}</h2>
            <div className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link key={s.id} href={`/en/clubs/${area}/${clubSlug(s.name_en!)}`}
                  className="px-3 py-1.5 rounded-full bg-muted border border-border text-[13px] font-bold hover:text-brand-amber">
                  {s.name_en!.trim()}
                </Link>
              ))}
            </div>
            <Link href={`/en/clubs/${area}`} className="inline-block mt-3 text-[13px] text-brand-amber underline underline-offset-2">
              See all {areaEn} clubs →
            </Link>
          </section>
        )}
      </div>

      {/* 예약(8) : 찜(2) — ForeignClubDetailPanel의 하단 sticky CTA와 같은 패턴·비율. */}
      <div className="fixed bottom-0 inset-x-0 z-10 px-4 pt-3 pb-4 pb-safe bg-card/95 backdrop-blur-sm border-t border-border">
        <div className="flex items-stretch gap-2 w-full max-w-lg mx-auto">
          <Link href={bookHref}
            className="flex-[8] min-w-0 flex items-center justify-center py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors">
            🍾 Book {name}
          </Link>
          <SaveClubButton
            variant="cta"
            className="flex-[2] min-w-0"
            club={{ id: club.id, name: club.name, name_en: club.name_en, area: club.area, thumbnail_url: club.thumbnail_url }}
            lang="en"
          />
        </div>
      </div>
    </div>
  );
}
