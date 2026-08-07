import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { HotdealList } from "@/components/hotdeal/HotdealList";

export const revalidate = 30;

// brand suffix(" | 나플")는 layout.tsx의 title.template이 자동 추가.
export const metadata: Metadata = {
  title: "오늘의 클럽 핫딜·무료입장·게스트 - 강남·홍대 클럽 특가",
  description:
    "나플에서 오늘 진행 중인 강남·홍대·이태원 클럽 핫딜·무료입장·게스트 명단 정보. 종료 시간이 다가오는 한정 혜택과 무료입장 가능 클럽을 한눈에. 클럽 테이블 가격 비교는 나플에서.",
  alternates: { canonical: "https://nightflow.kr/hotdeal" },
  keywords: [
    "클럽 핫딜",
    "클럽 무료입장",
    "클럽 게스트",
    "강남 클럽 무료입장",
    "홍대 클럽 무료입장",
    "강남 게스트",
    "홍대 게스트",
    "이태원 클럽 무료입장",
    "클럽 특가",
    "오늘의 클럽 핫딜",
    "나플",
    "나이트플로우",
  ],
  openGraph: {
    title: "오늘의 클럽 핫딜·무료입장·게스트 - 강남·홍대 클럽 특가",
    description: "강남·홍대 클럽 오늘의 핫딜·무료입장·게스트 명단을 한눈에. 나플.",
    url: "https://nightflow.kr/hotdeal",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

// 프로덕션에서는 운영자/테스트 클럽 핫딜을 숨김 (HotdealHomeSection과 동일 정책)
const HIDDEN_CLUB_PATTERN = /운영자/;
const SHOW_TEST_CLUBS = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

type HotdealRow = Parameters<typeof HotdealList>[0]["hotdeals"][number];

export default async function HotdealIndexPage() {
  const supabase = createAnonClient();

  const { data: hotdeals } = await supabase
    .from("daily_hotdeals")
    .select(
      `*,
       club:clubs(id, name, area, thumbnail_url),
       md:public_user_profiles!daily_hotdeals_md_id_fkey(id, display_name, instagram, profile_image)`
    )
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: true });

  const rows = (hotdeals ?? []) as unknown as HotdealRow[];
  const visible = SHOW_TEST_CLUBS
    ? rows
    : rows.filter((h) => !(h.club?.name && HIDDEN_CLUB_PATTERN.test(h.club.name)));

  // SEO용 SSR 텍스트 — HotdealList가 client-only라 본문 비는 문제 보완.
  // 지역+클럽명 prefix로 "강남 ACE", "홍대 버뮤다" 같은 조합 검색 매칭 강화.
  const formatPrice = (n: number | null | undefined) =>
    n ? `${Math.round(n / 10000)}만원` : "";

  return (
    <div className="container mx-auto max-w-3xl px-4 pt-4 pb-8 mb-20">
      <div className="sr-only">
        <h1>오늘의 클럽 핫딜·무료입장·게스트 - 강남·홍대·이태원 클럽 특가</h1>
        <p>
          나플에서 오늘 진행 중인 클럽 핫딜·무료입장·게스트
          정보 {visible.length}건. 강남·홍대·이태원·부산·광주 클럽 테이블
          가격과 무료입장 가능 클럽을 한눈에 비교하세요. 클럽 게스트 명단
          등록·무료입장 안내·게스트 입장 혜택까지.
        </p>
        {visible.length > 0 && (
          <ul>
            {visible.slice(0, 50).map((h) => {
              const club = h.club;
              const area = club?.area ?? "";
              const clubName = club?.name ?? "";
              const areaPrefix = area ? `${area} ` : "";
              const priceLabel = formatPrice(h.price);
              const originalLabel = formatPrice(h.original_price);
              const title = h.title ?? "";
              return (
                <li key={h.id}>
                  {areaPrefix}{clubName} 핫딜 - {title}
                  {priceLabel ? ` ${priceLabel}` : ""}
                  {originalLabel ? ` (정가 ${originalLabel})` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Suspense fallback={null}>
        <HotdealList hotdeals={visible} />
      </Suspense>
    </div>
  );
}
