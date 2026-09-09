import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchMenuClubIds, isBookable } from "@/lib/clubs/bookable";
import { fetchTablePricing, bookingFloor, wonCompact } from "@/lib/clubs/tablePricing";
import { getKrwRates } from "@/lib/utils/currency";
import { AreaTablePrices } from "@/components/foreign/AreaTablePrices";
import { ClubsClient } from "../../../en/clubs/ClubsClient";
import { clubSlug } from "@/lib/clubs/slug";

type AreaSlug = "gangnam" | "hongdae" | "itaewon" | "busan" | "apgujeong";

const AREA_CONFIG: Record<
  AreaSlug,
  {
    koreanArea: string;
    ja: string;
    title: string;
    description: string;
    intro: string;
    vibe: string;
    topClubsNote: string;
    keywords: string[];
  }
> = {
  gangnam: {
    koreanArea: "강남",
    ja: "江南",
    title:
      "江南クラブ予約 2026 — VIPルーム、狎鴎亭 & 清潭ラウンジ (ソウル)",
    description:
      "ソウル江南のベストクラブ&VIPルーム予約。EDMクラブ、ヒップホップ、狎鴎亭&清潭の高級ラウンジ。本物の価格、VIPルーム、ブローカーなし、韓国語不要。",
    intro:
      "江南はソウルの高級ナイトライフエリアで、大型EDMクラブ、ヒップホップ会場、狎鴎亭・清潭の韓国トップVIPラウンジが集まる場所。NightFlowなら韓国語不要で江南クラブVIPルームを予約可能 — 本物の価格、ブローカーなし。",
    vibe:
      "江南クラブはハイエナジーEDM、おしゃれな客層、豪華なボトルサービスで知られています。メインテーブルは通常₩750,000+から、VIPルームは₩1,500,000+から。狎鴎亭と清潭にはソウルで最も独占的なラウンジが集まり、シャンパンサービスを提供。",
    topClubsNote:
      "江南トップクラブにはClub ACE（新沙、旧Race）、Massive、Club Pop、Mirabaud、Core Lounge（狎鴎亭EDM）、Club Arzu（清潭高級）、DM Seoul（狎鴎亭ヒップホップラウンジ）が含まれます。",
    keywords: [
      "江南クラブ",
      "江南クラブ予約",
      "江南VIPルーム",
      "江南ラウンジ",
      "江南EDMクラブ",
      "江南ベストクラブ",
      "狎鴎亭ラウンジ",
      "狎鴎亭クラブ",
      "清潭ラウンジ",
      "新沙クラブ",
      "Club ACE ソウル",
      "ソウルVIPルーム",
      "韓国VIPルーム",
      "ソウルクラブ予約",
      "韓国クラブ予約",
    ],
  },
  hongdae: {
    koreanArea: "홍대",
    ja: "弘大",
    title:
      "弘大クラブ予約 2026 — ヒップホップ、K-POP & 外国人フレンドリー (ソウル)",
    description:
      "ソウル弘大のベストヒップホップ&K-POPナイトクラブ予約。弘益大学近く、外国人フレンドリー、英語OK、本物の価格、ブローカーなし。",
    intro:
      "弘大はソウルのヒップホップ・K-POPナイトライフエリアで、弘益大学近くの外国人フレンドリーなナイトクラブが集まります。旅行者にとって最も入りやすいエリア — ほとんどのクラブがウォークイン可能ですが、NightFlowでVIPルーム・ゲストアクセス予約すれば良い席が確保でき、列をスキップできます。",
    vibe:
      "弘大クラブはヒップホップ、K-POP、EDMを演奏。客層は若め（20代前半）、国際的、入場料は通常₩10,000–30,000（女性は多くの会場で無料）。バードリンクは₩10,000–15,000。江南より遥かに安い。",
    topClubsNote:
      "弘大トップクラブにはClub Dokkaebi（高級ヒップホップ）、Sabotage、Attention、Club Purple（ヒップホップ、初心者フレンドリー）、NB2（K-POP、K-POPツーリスト人気）、Awesome Redなどが含まれます。",
    keywords: [
      "弘大クラブ",
      "ホンデクラブ",
      "弘大クラブ予約",
      "弘大バー",
      "弘大ヒップホップクラブ",
      "弘大K-POPクラブ",
      "弘大ベストクラブ",
      "弘益大学クラブ",
      "弘大外国人クラブ",
      "Club Dokkaebi",
      "NB2 ソウル",
      "ソウルクラブ予約",
      "韓国クラブ予約",
    ],
  },
  itaewon: {
    koreanArea: "이태원",
    ja: "梨泰院",
    title:
      "梨泰院クラブ予約 2026 — 国際的、英語フレンドリーナイトライフ (ソウル)",
    description:
      "ソウル梨泰院のベスト国際クラブ予約。ハウス、EDM、ヒップホップ、ディスコ。英語フレンドリー、外国人フレンドリーな客層。本物の価格、VIPルーム、ブローカーなし。",
    intro:
      "梨泰院はソウルの国際的なナイトライフエリアで、外国人旅行者の比率が最も高い場所。音楽はハウス、EDM、ディスコ、R&B、ヒップホップまで幅広い。ほとんどのスタッフが英語を話し、韓国語を話さない旅行者にとって最も入りやすいエリア。",
    vibe:
      "梨泰院クラブは国際的、小規模、音楽中心（ハウス、グルーヴ、R&B）。入場料は通常₩30,000–40,000。客層はソウルで最も多様 — 地元民、外国人居住者、旅行者が一緒に集う。深夜から早朝まで続く雰囲気。",
    topClubsNote:
      "梨泰院トップクラブにはSoap Seoul（2026年再オープン、ハウスとグルーヴ）、Cakeshop（伝説的なアンダーグラウンド）、梨泰院ロード沿いの様々な国際バー・クラブが含まれます。",
    keywords: [
      "梨泰院クラブ",
      "イテウォンクラブ",
      "梨泰院クラブ予約",
      "梨泰院バー",
      "梨泰院ナイトライフ",
      "梨泰院ベストクラブ",
      "梨泰院外国人クラブ",
      "梨泰院英語クラブ",
      "Soap Seoul",
      "Cakeshop ソウル",
      "梨泰院ハウスクラブ",
      "ソウルクラブ予約",
      "韓国クラブ予約",
    ],
  },
  apgujeong: {
    koreanArea: "강남",
    ja: "狎鴎亭",
    title:
      "狎鴎亭ラウンジ予約 2026 — 清潭高級VIPラウンジ (ソウル)",
    description:
      "ソウル狎鴎亭&清潭の高級VIPラウンジ予約。シャンパンサービス、プレミアムボトル、独占的な客層。本物の価格、ブローカーなし、韓国語不要。",
    intro:
      "狎鴎亭と清潭にはソウルで最も独占的なVIPラウンジが集まる場所。シャンパン文化、プレミアムボトルサービス、ファッショナブルな客層。NightFlowなら日本人旅行者でも韓国の地元の友人なしで狎鴎亭ラウンジを予約可能 — 韓国人と同じ価格、同じ体験。",
    vibe:
      "狎鴎亭ラウンジは高級、親密、厳選。テーブルは₩2,000,000+から。客層は20–30代の高級層、ファッション・芸能関係者が多い。音楽は会場によりEDM、ヒップホップラウンジ、ハウスまで様々。ドレスコードはスマートカジュアル最低限が必須。",
    topClubsNote:
      "狎鴎亭&清潭トップラウンジにはCore Lounge（狎鴎亭、EDM、2026年オープン）、Club Arzu（清潭、高級ヒップホップ）、DM Seoul（狎鴎亭、ヒップホップラウンジ）、Lion（清潭、超高級セレブ会場）が含まれます。",
    keywords: [
      "狎鴎亭ラウンジ",
      "アックジョンラウンジ",
      "狎鴎亭ラウンジ予約",
      "狎鴎亭クラブ",
      "清潭ラウンジ",
      "清潭クラブ",
      "清潭VIP",
      "ソウルVIPラウンジ",
      "ソウルシャンパンラウンジ",
      "Core Lounge ソウル",
      "Club Arzu",
      "DM Seoul",
      "狎鴎亭高級クラブ",
      "韓国VIPラウンジ",
      "韓国クラブ予約",
    ],
  },
  busan: {
    koreanArea: "부산",
    ja: "釜山",
    title:
      "釜山クラブ予約 2026 — 海雲台、西面ナイトライフガイド (韓国)",
    description:
      "釜山のベストナイトクラブ予約。海雲台ビーチクラブ、西面ナイトライフ。本物の価格、VIPルーム、ブローカーなし。韓国第二の都市のナイトライフを簡単に。",
    intro:
      "釜山は韓国第二の都市で、ナイトクラブシーンが成長中。海雲台（ビーチエリア）と西面（ダウンタウン）が中心。ソウル以外の韓国を訪れる旅行者に人気が高まっています。",
    vibe:
      "釜山クラブはソウルよりリラックスした雰囲気 — 海雲台はビーチバイブ、西面はダウンタウンエネルギー。入場料は₩15,000–30,000。客層はほとんど地元民、夏のビーチシーズンには観光客も多少。",
    topClubsNote:
      "釜山クラブシーンは海雲台（ビーチフロントクラブ、夏のピーク）と西面（通年のダウンタウンナイトライフ）に集中しています。",
    keywords: [
      "釜山クラブ",
      "プサンクラブ",
      "釜山クラブ予約",
      "釜山ナイトクラブ",
      "釜山ナイトライフ",
      "海雲台クラブ",
      "西面クラブ",
      "釜山ビーチクラブ",
      "釜山ベストクラブ",
      "釜山海雲台ナイトライフ",
      "釜山VIPルーム",
      "韓国クラブ予約",
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(AREA_CONFIG).map((area) => ({ area }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const { area } = await params;
  const config = AREA_CONFIG[area as AreaSlug];
  if (!config) return {};
  // 지역 가격표(AreaTablePrices)에 맞춘 랭킹 신호 — 지역 하한은 정적이라 조회 없이 넣는다
  const floor = bookingFloor(config.koreanArea);
  // 가격 문장을 앞에 — SERP 표시 폭(전각 ~78자) 안에 들어오게(크리틱 3차)
  const description = `テーブル予約は1卓${wonCompact(floor, "ja")}〜（実際のメニュー価格、仲介手数料なし）。${config.description}`;

  return {
    title: config.title,
    description,
    keywords: config.keywords,
    alternates: {
      canonical: `https://nightflow.kr/ja/clubs/${area}`,
      languages: {
        "en-US": `https://nightflow.kr/en/clubs/${area}`,
        "zh-CN": `https://nightflow.kr/zh/clubs/${area}`,
        "zh-TW": `https://nightflow.kr/zh-tw/clubs/${area}`,
        "ja-JP": `https://nightflow.kr/ja/clubs/${area}`,
        "x-default": `https://nightflow.kr/en/clubs/${area}`,
      },
    },
    openGraph: {
      title: config.title,
      description,
      url: `https://nightflow.kr/ja/clubs/${area}`,
      locale: "ja_JP",
      type: "website",
      images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
    },
  };
}

export default async function JaClubsAreaPage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  const config = AREA_CONFIG[area as AreaSlug];
  if (!config) notFound();

  const supabase = await createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select(
      "id, name, name_en, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram, dresscode, tags, google_reviews, featured_rank, tagline_ko, tagline_en, tagline_ja, tagline_zh, tagline_zh_tw, partners:club_partners(md_id)"
    )
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .eq("is_test", false)
    .eq("hidden_from_guide", false)
    .eq("area", config.koreanArea)
    .order("google_review_count", { ascending: false, nullsFirst: false });

  const menuIds = await fetchMenuClubIds(supabase);
  const clubList = (clubs ?? []).map((c) => ({
    ...c,
    has_md: (c.partners?.length ?? 0) > 0,
    // 주대까지 있어야 실제로 예약을 잡아줄 수 있다 — 배지·정렬의 기준.
    has_menu: menuIds.has(c.id),
  }));
  const clubCount = clubList.length;

  // 지역 가격 비교 표(2026-09-10) — 예약 가능한 클럽만, 한 쿼리. 지역당 최대 10곳이라 1,000행 안전.
  const bookableClubs = clubList.filter((c) => isBookable({ name: c.name, has_menu: c.has_menu }));
  const [areaPricing, fxSnapshot] = await Promise.all([
    fetchTablePricing(supabase, bookableClubs.map((c) => c.id)),
    getKrwRates(),
  ]);
  const priceRows = bookableClubs
    .filter((c) => c.name_en?.trim())
    .map((c) => ({
      id: c.id,
      name: c.name_en!.trim(),
      href: `/ja/clubs/${area}/${clubSlug(c.name_en!)}`,
      bookHref: `/flags/new?lang=ja&area=${encodeURIComponent(c.area)}&club=${c.id}`,
      areaKo: c.area,
      rating: c.google_rating,
      reviewCount: c.google_review_count,
      pricing: areaPricing.get(c.id),
    }));

  // Schema.org — Place + ItemList (Google: 별점·리스트 노출). en 버전(clubs/[area]/page.tsx)엔
  // 있는데 ja/zh/zh-tw엔 통째로 빠져 있었다 — 콘텐츠는 동일하게 현지화됐는데 구조화 데이터만
  // en 전용이라, 검색결과 리치 스니펫이 3개 언어에서 안 뜨는 격차였다.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        "@id": `https://nightflow.kr/ja/clubs/${area}/#itemlist`,
        name: `${config.ja}クラブ — ソウルクラブ予約`,
        description: config.intro,
        numberOfItems: clubCount,
        itemListElement: clubList.map((c, i) => {
          const nameEn = c.name_en?.trim();
          const slug = nameEn ? clubSlug(nameEn) : null;
          return {
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "NightClub",
              name: nameEn || c.name,
              alternateName: nameEn ? c.name : undefined,
              address: c.address
                ? { "@type": "PostalAddress", addressLocality: area.charAt(0).toUpperCase() + area.slice(1), addressCountry: "KR" }
                : undefined,
              aggregateRating: c.google_rating
                ? {
                    "@type": "AggregateRating",
                    ratingValue: c.google_rating,
                    reviewCount: c.google_review_count ?? 1,
                  }
                : undefined,
              url: slug
                ? `https://nightflow.kr/ja/clubs/${area}/${slug}`
                : `https://nightflow.kr/clubs/${c.id}`,
            },
          };
        }),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/ja" },
          { "@type": "ListItem", position: 2, name: "ソウルクラブ", item: "https://nightflow.kr/ja/clubs" },
          {
            "@type": "ListItem",
            position: 3,
            name: `${config.ja}クラブ`,
            item: `https://nightflow.kr/ja/clubs/${area}`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="sr-only">
        <h1>
          {config.ja}クラブ予約 — ソウル{config.ja} {clubCount}軒のナイトクラブ ({config.koreanArea})
        </h1>
        <p>{config.intro}</p>

        <h2>{config.ja}ナイトライフの雰囲気 &amp; 価格</h2>
        <p>{config.vibe}</p>

        <h2>{config.ja}トップクラブ</h2>
        <p>{config.topClubsNote}</p>

        <h2>NightFlow上のすべての{config.ja}クラブ ({clubCount}軒)</h2>
        <ul>
          {clubList.map((c) => {
            const nameEn = c.name_en?.trim();
            const slug = nameEn ? clubSlug(nameEn) : null;
            const label = `${nameEn || c.name} — ${config.ja}クラブ${c.google_rating ? ` (${c.google_rating}★)` : ""}`;
            return (
              <li key={c.id}>
                {slug ? <Link href={`/ja/clubs/${area}/${slug}`}>{label}</Link> : label}
              </li>
            );
          })}
        </ul>

        <h2>NightFlowで{config.ja}クラブを予約する方法</h2>
        <p>
          行きたい{config.ja}クラブを選んでください、または雰囲気だけ伝えてください — 日付・人数・予算と一緒に。NightFlowが直接クラブに連絡し、数時間以内に予算内で一番良い席を確保します。韓国語不要、ブローカー手数料なし、デポジット不要。到着後、クラブに直接支払い。
        </p>

        <h2>NightFlowで{config.ja}クラブを予約するメリット</h2>
        <ul>
          <li>英語・日本語フレンドリー — NightFlowが直接{config.ja}クラブに連絡します。</li>
          <li>本物の価格 — ブローカー手数料なし、隠れた手数料なし。</li>
          <li>{config.ja}クラブVIPルーム — ボトルサービス、ゴールデンロケーション、列スキップ。</li>
          <li>プラットフォーム料金ゼロ — {config.ja}クラブに直接支払い。</li>
          <li>リクエスト送信は無料、デポジット不要。プラン変更時はいつでもキャンセル可能。</li>
        </ul>
      </div>
      <ClubsClient clubs={clubList} lang="ja" />

      {/* 지역 단위 가격 비교 — "itaewon bottle service price"류 클럽명 없는 가격 검색의 랜딩.
          숫자는 클럽 상세·폼과 같은 tablePricing 규칙. */}
      <AreaTablePrices lang="ja" areaLabel={config.ja} rows={priceRows} rates={fxSnapshot.rates} />

      <nav className="max-w-lg lg:max-w-[1000px] mx-auto px-4 lg:px-8 pb-10 pt-2 lg:pt-8">
        <h2 className="text-[15px] font-black text-foreground mb-2">
          {config.ja}のクラブ — 営業時間・入場料・口コミ
        </h2>
        <div className="flex flex-wrap gap-2">
          {clubList.map((c) => {
            const nameEn = c.name_en?.trim();
            const slug = nameEn ? clubSlug(nameEn) : null;
            if (!slug) return null;
            return (
              <Link
                key={c.id}
                href={`/ja/clubs/${area}/${slug}`}
                className="px-3 py-1.5 rounded-full bg-muted border border-border text-[13px] font-bold text-foreground hover:text-brand-amber transition-colors"
              >
                {nameEn}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
