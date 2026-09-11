import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { MapPin, Clock, Ticket, Shirt, Star, ExternalLink, ChevronLeft, Instagram } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { clubSlug, canonicalAreaSlug } from "@/lib/clubs/slug";
import { translateClubMeta } from "@/lib/utils/clubMetaI18n";
import { clubFeatureLabels } from "@/lib/clubs/tagLabelsI18n";
import { getGoogleReviewsUrl } from "@/lib/utils/clubReviews";
import { SaveClubButton } from "@/components/clubs/SaveClubButton";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { ForeignShell } from "@/components/foreign/ForeignShell";
import { isBookable, fetchMenuClubIds } from "@/lib/clubs/bookable";
import { BookingComingSoon } from "@/components/foreign/BookingComingSoon";
import { fetchTablePricing, tableFrom, trimAtSentence } from "@/lib/clubs/tablePricing";
import { bookingSeoBits, bookingFaqs, bookingJsonLdFragment } from "@/lib/seo/clubBookingSeo";
import { ClubBookingSection } from "@/components/foreign/ClubBookingSection";
import { getKrwRates } from "@/lib/utils/currency";

// 일본어판 클럽 개별 페이지 — /en/clubs/[area]/[club] 과 완전히 동일한 구조를 복제.
// (이 사이트의 기존 관례: /ja, /zh, /zh-tw 지역 페이지도 공용 컴포넌트로 추상화하지 않고
//  언어별 파일을 그대로 복제해왔음 — AREA_CONFIG 문구만 다르고 구조는 동일)
//
// ⚠️ 클럽 고유명사(name_en)는 언어 불문 라틴 표기 그대로 쓴다 — 기존 ja/zh/zh-tw 지역
// 페이지의 topClubsNote가 이미 "Club ACE", "Massive" 처럼 라틴 표기를 유지하고 있고,
// 밤문화 브랜드명은 실제로 일본/중국 유저도 라틴 표기로 검색하는 게 현지 관행이라(현지 블로그·
// 샤오홍슈 게시물 다수가 라틴 표기 사용) 억지로 가나/한자 음차를 만들면 오히려 실제 검색어와 어긋남.
// 대신 "영업시간/입장료/후기" 같은 속성어만 언어별로 번역해 검색 거미줄을 넓힌다.

const AREA_JA: Record<string, string> = {
  gangnam: "江南",
  hongdae: "弘大",
  itaewon: "梨泰院",
  busan: "釜山",
};

const SELECT =
  "id, name, name_en, area, address, thumbnail_url, operating_hours, entry_fee_detail, " +
  "google_rating, google_review_count, google_reviews, instagram, dresscode, tags, drink_menu_url, " +
  // 예약 SEO(2026-09-10): 좌표(geo)·테이블 차지·메뉴 갱신일 — ClubBookingSection/JSON-LD Offer용
  "latitude, longitude, table_charge_weekday, table_charge_weekend, drink_menu_updated_at, " +
  "foreign_booking_agreed, partners:club_partners(md_id)";

type ClubRow = {
  id: string;
  partners?: { md_id: string }[] | null;
  /** 콜드 DM 승인 플래그(Migration 666) — isBookable의 has_md 대체 축 */
  foreign_booking_agreed?: boolean | null;
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
  latitude: number | null;
  longitude: number | null;
  table_charge_weekday: number | null;
  table_charge_weekend: number | null;
  drink_menu_updated_at: string | null;
};

// React cache — generateMetadata와 페이지 본문이 같은 요청 안에서 두 번 부르던 걸 한 번으로.
const findClub = cache(async (areaSlug: string, clubParam: string) => {
  const areaJa = AREA_JA[areaSlug];
  if (!areaJa) return null;

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

  // 주대(club_menu_items)가 등록된 클럽 집합 — MD와 함께 "즉시 예약 가능" 판정에 쓴다.
  // 이웃 클럽 배지에도 필요하므로 한 번만 조회해 Set으로 돌린다.
  // ⚠️ club_menu_items 생 select는 PostgREST 1,000행 컷에 걸린다(현재 1,048행) — RPC로 club_id만.
  const menuIds = await fetchMenuClubIds(supabase);

  const bookableRaw = isBookable({
    name: club.name,
    has_md: (club.partners?.length ?? 0) > 0,
    agreed: !!club.foreign_booking_agreed,
    has_menu: menuIds.has(club.id),
  });

  // 같은 지역의 다른 클럽 — 내부 링크(거미줄)용.
  // 예약 가능한 이웃을 앞으로 — 이 페이지에서 예약이 안 될 때 대안으로 보내는 자리다.
  const siblingsRaw = rows
    .filter((c) => c.id !== club.id && c.area === club.area && c.name_en?.trim())
    .map((c) => ({
      ...c,
      bookable: isBookable({ name: c.name, has_md: (c.partners?.length ?? 0) > 0, agreed: !!c.foreign_booking_agreed, has_menu: menuIds.has(c.id) }),
    }))
    .sort(
      (a, b) =>
        Number(b.bookable) - Number(a.bookable) ||
        (b.google_review_count ?? 0) - (a.google_review_count ?? 0),
    )
    .slice(0, 8);

  // 가격 요약(예약 SEO) — 이 클럽 + 메뉴 있는 이웃(대안 카드용)을 한 쿼리로.
  const pricing = await fetchTablePricing(supabase, [
    club.id,
    ...siblingsRaw.filter((sib) => sib.bookable).map((sib) => sib.id),
  ]);
  // "예약 가능" = 메뉴 등록 && 활성 항목에 실제 가격이 있음. 항목이 전부 비활성인 클럽이
  // 스티키바에선 "Book"·본문에선 "isn't bookable yet"로 갈리던 문제를 여기서 한 번에 막는다.
  const bookable = bookableRaw && tableFrom(club.area, pricing.get(club.id)) != null;
  const siblings = siblingsRaw.map((sib) => ({ ...sib, bookable: sib.bookable && tableFrom(sib.area, pricing.get(sib.id)) != null }));

  return { club, siblings, bookable, pricing };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string; club: string }>;
}): Promise<Metadata> {
  const { area, club: clubParam } = await params;
  const found = await findClub(area, clubParam);
  if (!found) return {};
  const { club, bookable, pricing } = found;

  const name = club.name_en!.trim();
  const areaJa = AREA_JA[area] ?? club.area;
  const hours = club.operating_hours ? translateClubMeta(club.operating_hours, "ja") : null;
  const fee = club.entry_fee_detail ? translateClubMeta(club.entry_fee_detail, "ja") : null;

  const url = `https://nightflow.kr/ja/clubs/${area}/${clubParam}`;
  // 예약 가능 + 가격이 있으면 title이 "Book a Table from ₩X"로 바뀐다(예약 의도 검색어 CTR).
  const seo = bookingSeoBits({ lang: "ja", name, areaLabel: areaJa, areaKo: club.area, bookable, pricing: pricing.get(club.id) });

  const descBits = [
    `${name}は${area === "busan" ? "" : "ソウル"}${areaJa}にあるナイトクラブです。`,
    // 비예약: "근처는 된다"를 평점 문장보다 앞에 — 뒤에 두면 160자 컷에 잘려 안 보였다(크리틱 2차)
    bookable ? null : seo.descAlt,
    hours ? `営業時間：${hours}。` : null,
    fee ? `入場料：${fee}。` : null,
    club.google_rating ? `Google評価${club.google_rating.toFixed(1)}（${club.google_review_count ?? 0}件のレビュー）。` : null,
  ].filter(Boolean);

  const keywords = [
    name,
    ...(area === "busan" ? [] : [`${name} ソウル`]),
    `${name} ${areaJa}`,
    `${name} クラブ`,
    `${name} 営業時間`,
    `${name} 入場料`,
    `${name} 入場料金`,
    `${name} 住所`,
    `${name} アクセス`,
    `${name} 口コミ`,
    `${name} レビュー`,
    `${name} ドレスコード`,
    ...(bookable ? [`${name} テーブル料金`] : []),
    ...(bookable ? [`${name} ボトルサービス`] : []),
    ...(bookable ? [`${name} 予約`] : []),
    `${areaJa} クラブ`,
    `${areaJa} ナイトクラブ`,
    "ソウル クラブ",
    "韓国 クラブ",
    club.name,
  ];

  return {
    // absolute — 레이아웃 접미사(" — NightFlow Korea")까지 붙으면 90자를 넘어 검색결과에서 잘린다
    title: { absolute: seo.title },
    // 구글 표시 ~155자 — 가격 문장이 앞이라 그 안에서 끝나게 160자.
    description: trimAtSentence([seo.descPrice, ...descBits].filter(Boolean).join(""), 160),
    keywords: [...keywords, ...seo.keywords],
    alternates: {
      canonical: url,
      languages: {
        "en-US": `https://nightflow.kr/en/clubs/${area}/${clubParam}`,
        "ja-JP": url,
        "zh-CN": `https://nightflow.kr/zh/clubs/${area}/${clubParam}`,
        "zh-TW": `https://nightflow.kr/zh-tw/clubs/${area}/${clubParam}`,
        "ko-KR": `https://nightflow.kr/clubs/${club.id}`,
        "x-default": `https://nightflow.kr/en/clubs/${area}/${clubParam}`,
      },
    },
    openGraph: {
      title: `${name} — ${areaJa}のクラブ${area === "busan" ? "" : "、ソウル"}`,
      // 공유 카드에도 가격 훅(크리틱 3차)
      description: trimAtSentence([seo.descPrice, ...descBits].filter(Boolean).join(""), 200),
      url,
      locale: "ja_JP",
      type: "website",
      images: [{ url: club.thumbnail_url || "/og-image-v2.png", width: 1200, height: 630 }],
    },
  };
}

export default async function JaClubDetailPage({
  params,
}: {
  params: Promise<{ area: string; club: string }>;
}) {
  const { area, club: clubParam } = await params;
  const found = await findClub(area, clubParam);
  if (!found) notFound();
  const { club, siblings, bookable, pricing } = found;
  // 예약 불가 페이지에서 "아래에서 고르세요"라고 안내하므로, 실제로 고를 게
  // 있는지 먼저 본다 — 예약 가능한 이웃이 0곳이면 그 문구가 거짓이 된다.
  const bookableSiblings = siblings.filter((s) => s.bookable);

  const canonical = canonicalAreaSlug(club.area);
  if (canonical && canonical !== area) {
    permanentRedirect(`/ja/clubs/${canonical}/${clubParam}`);
  }

  const name = club.name_en!.trim();
  const areaJa = AREA_JA[area] ?? club.area;
  const hours = club.operating_hours ? translateClubMeta(club.operating_hours, "ja") : null;
  const fee = club.entry_fee_detail ? translateClubMeta(club.entry_fee_detail, "ja") : null;
  const dress = club.dresscode ? translateClubMeta(club.dresscode, "ja") : null;
  const features = clubFeatureLabels(club.tags, "ja");
  // 평점 높은 순 — 구글이 주는 순서는 뒤죽박죽이라 첫 리뷰가 1점이면 바로 이탈한다.
  const reviews = (club.google_reviews ?? [])
    .filter((r) => r.text?.trim())
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5);
  const googleUrl = getGoogleReviewsUrl({ name: club.name, address: club.address, area: club.area }, "ja");
  const url = `https://nightflow.kr/ja/clubs/${area}/${clubParam}`;
  const bookHref = `/flags/new?lang=ja&area=${encodeURIComponent(club.area)}&club=${club.id}`;

  // ── 예약 SEO(2026-09-10): 실가격·Offer·대안 카드. 숫자는 폼 카드와 같은 규칙(tablePricing). ──
  const seoInput = { lang: "ja" as const, name, areaLabel: areaJa, areaKo: club.area, bookable, pricing: pricing.get(club.id) };
  const seoBits = bookingSeoBits(seoInput);
  const fxRates = (await getKrwRates()).rates;
  const altClubs = bookableSiblings.map((s) => ({
    id: s.id,
    name: s.name_en!.trim(),
    href: `/ja/clubs/${area}/${clubSlug(s.name_en!)}`,
    bookHref: `/flags/new?lang=ja&area=${encodeURIComponent(s.area)}&club=${s.id}`,
    rating: s.google_rating,
    reviewCount: s.google_review_count,
    from: tableFrom(s.area, pricing.get(s.id)),
  }));

  const faqs = [
    hours && { q: `${name}の営業時間は？`, a: `${name}（${areaJa}）の営業時間は${hours}です。` },
    fee && { q: `${name}の入場料はいくらですか？`, a: `${name}の入場料は${fee}です。` },
    // 한글이 섞인 드레스코드("크록스 X" 등)는 번역이 안 된 원문이라 FAQ·JSON-LD에서 뺀다(크리틱 2차)
    dress && !/[가-힣]/.test(dress) && { q: `${name}のドレスコードは？`, a: `${name}のドレスコード：${dress}。` },
    club.address && { q: `${name}はどこにありますか？`, a: `${name}は${areaJa}${area === "busan" ? "" : "（ソウル）"}の${club.address}にあります。` },
    // ⚠️ 예약 중개가 가능한 클럽에만 넣는다. 담당 MD나 주대가 없으면 실제로 잡아줄 수
    // 없는데 구조화 데이터로 "예, 잡아드립니다"를 선언하면 검색결과가 거짓말이 된다.
    bookable
      ? { q: `${name}を日本語で予約できますか？`, a: `はい。NightFlowが${name}に直接連絡してテーブルを確保します。英語・日本語対応、ブローカー手数料なし。` }
      : null,
  ].filter(Boolean) as { q: string; a: string }[];
  // 예약 가능 + 가격 있을 때만 "얼마부터/어떻게 예약" Q&A가 붙는다(거짓 선언 방지 원칙 동일).
  faqs.push(...bookingFaqs(seoInput));

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
          addressLocality: areaJa,
          addressRegion: area === "busan" ? "Busan" : "Seoul",
          addressCountry: "KR",
        },
        openingHours: hours || undefined,
        // aggregateRating·review는 넣지 않는다(2026-09-10): 구글 리뷰를 자사 마크업으로 재선언하면
        // 리뷰 스니펫 가이드("사용자에게서 직접 수집") 위반 → 수동조치 시 makesOffer까지 무시된다.
        sameAs: club.instagram ? [`https://instagram.com/${club.instagram.replace(/^@/, "")}`] : undefined,
        // geo(항상) + priceRange·AggregateOffer·ReserveAction(예약 가능 시) — 지도·가격·예약 리치결과 후보
        ...bookingJsonLdFragment({ input: seoInput, url, bookUrl: `https://nightflow.kr${bookHref}`, latitude: club.latitude, longitude: club.longitude }),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: `${area === "busan" ? "韓国" : "ソウル"}のクラブ`, item: "https://nightflow.kr/ja/clubs" },
          { "@type": "ListItem", position: 2, name: `${areaJa}のクラブ`, item: `https://nightflow.kr/ja/clubs/${area}` },
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

  // 인스타는 값이 링크라 fact()와 따로 만든다 — 클럽의 최신 소식(라인업·휴무)은
  // 거의 인스타에만 올라오는데, 지금까지 JSON-LD(sameAs)에만 있고 화면엔 없었다.
  const igRow = (handle: string) => (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <span className="shrink-0 mt-0.5 text-muted-foreground"><Instagram className="w-4 h-4" /></span>
      <div className="min-w-0">
        <dt className="text-[12px] font-bold text-muted-foreground">Instagram</dt>
        <dd className="text-[15px] break-all">
          <a
            href={`https://instagram.com/${handle}`}
            target="_blank"
            rel="noopener noreferrer"
            data-nf-track="outbound_instagram"
            className="text-brand-amber hover:underline inline-flex items-center gap-1"
          >
            @{handle}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </dd>
      </div>
    </div>
  );

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
    <ForeignShell lang="ja">
    <div className="min-h-screen bg-background text-foreground pb-28 pb-safe">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* SEO 유입 계측 — 이 페이지들은 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker
        kind="club"
        lang="ja"
        meta={{ club_id: club.id, club_name: club.name, area: club.area }}
      />

      <header className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between bg-background/95 backdrop-blur-sm border-b border-border">
        <Link href="/ja" data-nf-track="header_home" className="flex items-center gap-1 -ml-1 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-[15px] font-black tracking-tight">NightFlow</span>
        </Link>
        <Link href={`/ja/clubs/${area}`}
          data-nf-track="header_more_area"
          className="px-3.5 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold text-foreground hover:text-brand-amber transition-colors">
          {areaJa}の他のクラブ
        </Link>
      </header>

      <div className="max-w-lg lg:max-w-[900px] mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-8">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-wrap">
          <Link href="/ja/clubs" data-nf-track="breadcrumb_index" className="hover:text-foreground">{`${area === "busan" ? "韓国" : "ソウル"}のクラブ`}</Link>
          <span>/</span>
          <Link href={`/ja/clubs/${area}`} data-nf-track="breadcrumb_area" className="hover:text-foreground">{areaJa}</Link>
          <span>/</span>
          <span className="text-foreground font-bold">{name}</span>
        </nav>

        <header className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight">{name}</h1>
          <p className="text-muted-foreground text-[14px]">
            {areaJa}{area === "busan" ? "" : "（ソウル）"}のナイトクラブ{club.name !== name && <> ・ {club.name}</>}
          </p>
          {club.google_rating != null && (
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" data-nf-track="outbound_google_rating"
              className="inline-flex items-center gap-1.5 text-[14px] text-brand-amber">
              <Star className="w-4 h-4 fill-current" />
              {club.google_rating.toFixed(1)}
              <span className="text-muted-foreground">
                ・Googleレビュー{(club.google_review_count ?? 0).toLocaleString()}件
              </span>
            </a>
          )}
        </header>

        {club.thumbnail_url && (
          <div className="relative w-full h-56 rounded-2xl overflow-hidden">
            <Image src={club.thumbnail_url} alt={`${name} — ${areaJa}のナイトクラブ${area === "busan" ? "" : "、ソウル"}`} fill
              className="object-cover" sizes="(max-width: 640px) 100vw, 512px" priority />
          </div>
        )}

        <section>
          <h2 className="text-[18px] font-black mb-1">{name} — 営業時間・入場料・住所</h2>
          <dl className="rounded-2xl bg-card border border-border px-4">
            {hours && fact(<Clock className="w-4 h-4" />, "営業時間", hours)}
            {fee && fact(<Ticket className="w-4 h-4" />, "入場料", fee)}
            {club.address && fact(<MapPin className="w-4 h-4" />, "住所", club.address)}
            {dress && fact(<Shirt className="w-4 h-4" />, "ドレスコード", dress)}
            {club.instagram?.trim() && igRow(club.instagram.trim().replace(/^@/, ""))}
          </dl>
        </section>

        {features.length > 0 && (
          <section>
            <h2 className="text-[18px] font-black mb-2">音楽・タイプ</h2>
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
            <h2 className="text-[18px] font-black mb-2">{name}の口コミ</h2>
            <div className="space-y-2">
              {reviews.map((r, i) => (
                <blockquote key={i} className="p-3 rounded-xl bg-card border border-border">
                  <p className="text-[13px] text-foreground leading-relaxed">{r.text}</p>
                  <footer className="text-[11px] text-muted-foreground mt-1.5">
                    — {r.author_name || "Google user"}
                    {r.relative_time && <>、{r.relative_time}</>}
                  </footer>
                </blockquote>
              ))}
            </div>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" data-nf-track="outbound_google_reviews"
              className="inline-flex items-center gap-1 mt-2 text-[12px] text-brand-amber">
              Googleでもっと見る <ExternalLink className="w-3 h-3" />
            </a>
          </section>
        )}

        {/* 예약 블록 — 가능: 실가격+절차+CTA / 불가: 같은 지역 예약 가능 클럽을 가격 카드로 */}
        <ClubBookingSection
          lang="ja"
          name={name}
          areaLabel={areaJa}
          areaKo={club.area}
          areaSlug={area}
          bookable={bookable}
          pricing={pricing.get(club.id)}
          tableChargeWeekday={club.table_charge_weekday}
          tableChargeWeekend={club.table_charge_weekend}
          bookHref={bookHref}
          alternatives={altClubs}
          rates={fxRates}
        />

        {faqs.length > 0 && (
          <section>
            <h2 className="text-[18px] font-black mb-2">{name}のよくある質問</h2>
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

      </div>

      <div className="fixed bottom-0 inset-x-0 lg:left-[248px] z-10 px-4 pt-3 pb-4 pb-safe bg-card/95 backdrop-blur-sm border-t border-border">
        <div className="flex items-stretch gap-2 w-full max-w-lg lg:max-w-[900px] mx-auto">
          {bookable ? (
            <Link href={bookHref}
              data-nf-track="book_cta"
              className="flex-[8] min-w-0 flex items-center justify-center py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors">
              {seoBits.cta}
            </Link>
          ) : (
            (() => {
              // 비예약 페이지에서도 80% 폭 스티키바는 항상 보인다 — 막다른 "coming soon" 대신
              // 같은 지역에서 지금 잡히는 첫 클럽으로 보낸다(가격 포함).
              const alt = altClubs.find((a) => a.from != null);
              return alt ? (
                <Link href={alt.bookHref} data-nf-track="book_cta_alt"
                  className="flex-[8] min-w-0 flex items-center justify-center py-3.5 rounded-xl bg-amber-500 text-black font-black text-[14px] hover:bg-amber-400 transition-colors truncate px-2">
                  {seoBits.ctaAlt(alt.name, alt.from!)}
                </Link>
              ) : (
                <div className="flex-[8] min-w-0">
                  <BookingComingSoon lang="ja" />
                </div>
              );
            })()
          )}
          <SaveClubButton
            variant="cta"
            className="flex-[2] min-w-0"
            club={{ id: club.id, name: club.name, name_en: club.name_en, area: club.area, thumbnail_url: club.thumbnail_url }}
            lang="ja"
          />
        </div>
      </div>
    </div>
    </ForeignShell>
  );
}
