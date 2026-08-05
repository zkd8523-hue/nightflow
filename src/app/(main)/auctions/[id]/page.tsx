import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { AuctionDetail } from "@/components/auctions/AuctionDetail";
import { getPrimaryAlias } from "@/lib/clubs/aliases";
import type { Metadata } from "next";

export const revalidate = 0; // 실시간 데이터
export const dynamic = "force-dynamic"; // notFound() 시 정상 404 응답 보장 (Soft 404 방지)

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
      club:clubs(id, name, area)
    `
    )
    .eq("id", id)
    .single();

  if (!auction) {
    // notFound() 호출해서 HTTP 404 응답 + 404 페이지 렌더링.
    // 이전엔 metadata만 반환해서 HTTP 200 + 404 본문 = Soft 404 패턴이었음.
    // Google이 가장 싫어하는 시그널 (색인 점수 ↓).
    notFound();
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("ko-KR").format(price);

  const clubId = auction.club?.id || "";
  const clubName = auction.club?.name || "";
  const area = auction.club?.area || "";
  const areaLabel = area ? `${area} ` : "";
  const primary = clubId ? getPrimaryAlias(clubId) : null;
  // "홍대 빠따(K-bat 빠따)" 패턴. 메인 별칭 없으면 등록명만.
  const head = primary
    ? `${areaLabel}${primary}(${clubName})`
    : `${areaLabel}${clubName}`;

  // share(조각) 모드는 사용자가 "강남 조각", "홍대 조각" 등으로 검색하므로
  // "조각" 키워드를 title·description에 강하게 노출.
  const isShare = auction.listing_type === "share";

  let title: string;
  let description: string;

  if (isShare) {
    const perPerson = formatPrice(auction.start_price);
    title = `${head} 파티 - 1인 ₩${perPerson}`;
    description = `${areaLabel}클럽 파티 매물. ${head}${
      auction.title ? ` ${auction.title}` : ""
    }. 1인 ₩${perPerson}. ${areaLabel}파티·합석으로 같이 갈 일행을 나플에서 찾으세요.`;
  } else {
    const currentPrice = formatPrice(
      auction.current_bid || auction.start_price
    );
    title = `${head} 클럽 테이블 경매 - 현재가 ₩${currentPrice}`;
    description = `${head} 클럽 테이블 ${auction.title}. 현재가 ₩${currentPrice}, 입찰 ${auction.bid_count}회. 파트너 직거래로 정가보다 저렴하게 예약하세요.`;
  }

  return {
    title,
    description,
    alternates: { canonical: `https://nightflow.kr/auctions/${id}` },
    openGraph: {
      title,
      description,
      url: `https://nightflow.kr/auctions/${id}`,
      type: "website",
      locale: "ko_KR",
      siteName: "NightFlow",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
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

  // 종료된 경매 페이지 이탈 방지 (view_auction 이탈률 3.6% 대응).
  // Model B 피봇 후 경매는 레거시 기능. 종료된 경매에 SEO/알림 유입 시 유저는 뭘 해야 할지 모름 → 이탈.
  // 활성 상태(active/scheduled)나 낙찰 후 처리 중(won/contacted/confirmed)은 페이지 유지,
  // 그 외 상태(unsold/cancelled/expired)는 관련 클럽 페이지 or 홈으로 리디렉트.
  const DEAD_STATUSES = ["unsold", "cancelled", "expired"];
  if (DEAD_STATUSES.includes(auction.status as string)) {
    if (auction.club?.id) {
      redirect(`/clubs/${auction.club.id}?from=expired-auction`);
    }
    redirect("/?from=expired-auction");
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

  // SEO용 SSR sr-only — AuctionDetail이 client-only라 본문 비는 문제 보완.
  // share 모드는 "조각" 키워드를, 경매/instant는 "경매" 키워드를 강하게 노출.
  const ssrArea = auction.club?.area || "";
  const ssrAreaPrefix = ssrArea ? `${ssrArea} ` : "";
  const ssrClubId = auction.club?.id || "";
  const ssrPrimary = ssrClubId ? getPrimaryAlias(ssrClubId) : null;
  const ssrClubName = auction.club?.name || "";
  const ssrHead = ssrPrimary
    ? `${ssrAreaPrefix}${ssrPrimary}(${ssrClubName})`
    : `${ssrAreaPrefix}${ssrClubName}`;
  const ssrIsShare = auction.listing_type === "share";
  const formatPriceSsr = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
  const ssrPerPerson = formatPriceSsr(auction.start_price);

  return (
    <>
      <div className="sr-only">
        {ssrIsShare ? (
          <>
            <h1>
              {ssrHead} 파티 - 1인 ₩{ssrPerPerson} ({ssrAreaPrefix}클럽 파티)
            </h1>
            <p>
              {ssrAreaPrefix}클럽 파티 매물입니다. {ssrHead}에서 같이 갈 일행을
              모집합니다. 인당 가격 ₩{ssrPerPerson}. {ssrAreaPrefix}파티·합석으로
              혼자 가기 부담스러운 클럽에 안전하게 함께 가는 방법, 나플에서
              {ssrAreaPrefix}파티 매물을 확인하고 합류하세요.
            </p>
          </>
        ) : (
          <>
            <h1>
              {ssrHead} - 클럽 테이블 경매 ({ssrAreaPrefix}클럽)
            </h1>
            <p>
              {ssrHead} 클럽 테이블 경매 매물입니다.
              나플에서 {ssrAreaPrefix}클럽 테이블을 정가보다
              저렴하게 입찰로 예약하세요.
            </p>
          </>
        )}
      </div>
      <AuctionDetail auction={auction} initialBids={bids || []} mdConfirmedCount={mdConfirmedCount || 0} />
    </>
  );
}
