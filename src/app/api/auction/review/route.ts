import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// 고객이 MD를 평가 (confirmed 경매에 대해서만)
export async function POST(req: Request) {
  try {
    const { auctionId, rating, comment } = await req.json();

    if (!auctionId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "auctionId와 rating(1-5)은 필수입니다." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 경매 확인: confirmed 상태 + 본인이 낙찰자
    const { data: auction } = await supabaseAdmin
      .from("auctions")
      .select("id, md_id, winner_id, status")
      .eq("id", auctionId)
      .single();

    if (!auction) {
      return NextResponse.json({ error: "경매를 찾을 수 없습니다." }, { status: 404 });
    }

    if (auction.winner_id !== user.id) {
      return NextResponse.json({ error: "낙찰자만 리뷰를 작성할 수 있습니다." }, { status: 403 });
    }

    if (auction.status !== "confirmed") {
      return NextResponse.json(
        { error: "방문 확인된 경매에만 리뷰를 작성할 수 있습니다." },
        { status: 400 }
      );
    }

    // 중복 체크
    const { data: existing } = await supabaseAdmin
      .from("auction_reviews")
      .select("id")
      .eq("auction_id", auctionId)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "이미 리뷰를 작성했습니다." },
        { status: 409 }
      );
    }

    // 리뷰 생성 (트리거가 MD 캐시 자동 업데이트)
    const { data: review, error } = await supabaseAdmin
      .from("auction_reviews")
      .insert({
        auction_id: auctionId,
        user_id: user.id,
        md_id: auction.md_id,
        rating: Math.round(rating),
        comment: comment?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error("[review POST]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// 본인 리뷰 조회 (특정 경매)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const auctionId = searchParams.get("auctionId");

    if (!auctionId) {
      return NextResponse.json({ error: "Missing auctionId" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: review } = await supabase
      .from("auction_reviews")
      .select("*")
      .eq("auction_id", auctionId)
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({ review: review || null });
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
