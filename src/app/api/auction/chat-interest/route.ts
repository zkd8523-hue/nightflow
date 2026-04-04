import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// 오늘특가(instant) 경매에 관심 등록
// → chat_interests INSERT (유저당 1회, 중복 시 무시)
// → MD 연락처 정보 반환
export async function POST(req: Request) {
  try {
    const { auctionId } = await req.json();
    if (!auctionId) {
      return NextResponse.json({ error: "Missing auctionId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 경매 조회: active + instant만 허용
    const { data: auction } = await supabaseAdmin
      .from("auctions")
      .select("id, status, listing_type, md_id, md:users!auctions_md_id_fkey(name, instagram, phone, kakao_open_chat_url, preferred_contact_methods)")
      .eq("id", auctionId)
      .single();

    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    if (auction.listing_type !== "instant") {
      return NextResponse.json({ error: "Only instant listings supported" }, { status: 400 });
    }

    if (auction.status !== "active") {
      return NextResponse.json({ error: "Auction is not active" }, { status: 400 });
    }

    // 본인 경매는 불가
    if (auction.md_id === user.id) {
      return NextResponse.json({ error: "자신의 경매는 예약할 수 없습니다." }, { status: 400 });
    }

    // 유저 차단 확인
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("is_blocked, banned_until")
      .eq("id", user.id)
      .single();

    if (userData?.is_blocked) {
      return NextResponse.json({ error: "차단된 계정입니다." }, { status: 403 });
    }

    if (userData?.banned_until && new Date(userData.banned_until) > new Date()) {
      return NextResponse.json({ error: "이용이 정지된 계정입니다." }, { status: 403 });
    }

    // chat_interests INSERT (UNIQUE 제약으로 중복 시 무시)
    const { error: insertError } = await supabaseAdmin
      .from("chat_interests")
      .upsert(
        { auction_id: auctionId, user_id: user.id },
        { onConflict: "auction_id,user_id", ignoreDuplicates: true }
      );

    if (insertError) {
      // 테이블이 아직 없는 경우 (마이그레이션 미적용) 무시하고 연락처만 반환
      console.warn("[API chat-interest] Insert error (table may not exist):", insertError.message);
    }

    // MD 연락처 정보 반환
    const md = auction.md as any;

    return NextResponse.json({
      success: true,
      md: {
        name: md?.name || null,
        instagram: md?.instagram || null,
        phone: md?.phone || null,
        kakao_open_chat_url: md?.kakao_open_chat_url || null,
        preferred_contact_methods: md?.preferred_contact_methods || null,
      },
    });
  } catch (error) {
    console.error("[API chat-interest] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
