import { notFound } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { HotdealDetail } from "@/components/hotdeal/HotdealDetail";
import type { DailyHotdeal } from "@/types/database";
import type { Metadata } from "next";

export const revalidate = 30;

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createAnonClient();

  const { data } = await supabase
    .from("daily_hotdeals")
    .select("title, price, original_price, ends_at, club:clubs(name, area)")
    .eq("id", id)
    .single();

  if (!data) {
    return { title: "핫딜을 찾을 수 없습니다" };
  }

  const club = (data as { club?: { name?: string; area?: string | null } }).club;
  const clubName = club?.name ?? "";
  const area = club?.area ?? "";
  const areaLabel = area ? `${area} ` : "";
  const formatPrice = (n: number | null | undefined) =>
    n ? `${Math.round(n / 10000)}만원` : "";
  const priceLabel = formatPrice((data as { price?: number | null }).price);
  const originalLabel = formatPrice((data as { original_price?: number | null }).original_price);
  const dealTitle = (data as { title?: string }).title ?? "핫딜";

  const title = `${clubName} 핫딜 - ${dealTitle}${priceLabel ? ` ${priceLabel}` : ""} (${areaLabel}클럽)`;
  const description = `${clubName}${area ? ` (${area})` : ""} 클럽 ${dealTitle}.${
    priceLabel ? ` ${priceLabel}` : ""
  }${originalLabel ? ` (정가 ${originalLabel})` : ""}. 강남·홍대 클럽 테이블 특가는 나플(나이트플로우)에서.`;

  return {
    title,
    description,
    alternates: { canonical: `https://nightflow.kr/hotdeal/${id}` },
    openGraph: {
      title,
      description,
      url: `https://nightflow.kr/hotdeal/${id}`,
      type: "website",
      locale: "ko_KR",
      siteName: "NightFlow",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function HotdealDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAnonClient();

  const { data, error } = await supabase
    .from("daily_hotdeals")
    .select(
      `*,
       club:clubs(id, name, area, thumbnail_url, floor_plan_url, address, instagram),
       md:users!daily_hotdeals_md_id_fkey(id, display_name, instagram, profile_image)`
    )
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  // 프로덕션에서는 운영자/테스트 클럽 핫딜 상세 접근 차단
  const SHOW_TEST_CLUBS = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";
  const clubName = (data as { club?: { name?: string } }).club?.name ?? "";
  if (!SHOW_TEST_CLUBS && /운영자/.test(clubName)) return notFound();

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <HotdealDetail hotdeal={data as unknown as DailyHotdeal & { club: { id: string; name: string; area: string | null; thumbnail_url: string | null; floor_plan_url: string | null; address: string | null; instagram: string | null } }} />
    </div>
  );
}
