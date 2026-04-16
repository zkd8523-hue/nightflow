import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AuctionDetail } from "@/components/auctions/AuctionDetail";
import type { Metadata } from "next";

export const revalidate = 0; // 실시간 데이터

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: auction } = await supabase
    .from("auctions")
    .select(
      `
      *,
      club:clubs(name, area)
    `
    )
    .eq("id", id)
    .single();

  if (!auction) {
    return {
      title: "경매를 찾을 수 없습니다 | NightFlow",
    };
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("ko-KR").format(price);

  const description = `${auction.club?.name} | 현재가 ₩${formatPrice(
    auction.current_bid || auction.start_price
  )} | 입찰 ${auction.bid_count}회`;

  return {
    title: `${auction.title} | NightFlow`,
    description,
    openGraph: {
      title: auction.title,
      description,
      type: "website",
      locale: "ko_KR",
      siteName: "NightFlow",
    },
    twitter: {
      card: "summary_large_image",
      title: auction.title,
      description,
    },
  };
}

export default async function AuctionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // 경매 정보 조회
  // MD 프로필은 public_user_profiles VIEW 경유 (실명 대신 display_name 노출).
  // MD의 연락처/인스타는 role='md' 조건으로 VIEW에서 자동 허용.
  const { data: auction, error } = await supabase
    .from("auctions")
    .select(
      `
      *,
      club:clubs(*),
      md:public_user_profiles!auctions_md_id_fkey(id, display_name, profile_image, md_unique_slug, instagram, phone, kakao_open_chat_url, preferred_contact_methods)
    `
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("[AuctionDetail] Query error:", error);
  }

  if (!auction) {
    notFound();
  }

  // MD 거래 완료 건수 조회 (소셜 프루프)
  const { count: mdConfirmedCount } = await supabase
    .from("auctions")
    .select("id", { count: "exact", head: true })
    .eq("md_id", auction.md_id)
    .in("status", ["confirmed", "won"]);

  // 입찰 히스토리 조회 (공개 경로: display_name만 노출)
  const { data: bids } = await supabase
    .from("bids")
    .select(
      `
      *,
      bidder:public_user_profiles!bids_bidder_id_fkey(id, display_name, profile_image)
    `
    )
    .eq("auction_id", id)
    .order("bid_at", { ascending: false })
    .limit(20);

  return <AuctionDetail auction={auction} initialBids={bids || []} mdConfirmedCount={mdConfirmedCount || 0} />;
}
