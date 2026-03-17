import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

// 입찰 성공 시 본인에게 in-app 알림 생성
export async function POST(req: Request) {
  try {
    const { auctionId, bidAmount } = await req.json();
    if (!auctionId || !bidAmount) {
      return NextResponse.json(
        { error: "Missing auctionId or bidAmount" },
        { status: 400 }
      );
    }

    // 인증 확인
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 경매 정보 조회
    const { data: auction } = await supabase
      .from("auctions")
      .select("club:clubs(name)")
      .eq("id", auctionId)
      .single();

    const clubName =
      (auction?.club as unknown as { name: string })?.name || "클럽";
    const price = new Intl.NumberFormat("ko-KR").format(bidAmount);

    // in-app 알림 생성
    await supabase.from("in_app_notifications").insert({
      user_id: user.id,
      type: "outbid" as const, // 기존 타입 재활용 (입찰 관련)
      title: "입찰 완료!",
      message: `${clubName} 경매에 ${price}원으로 입찰했습니다. 결과를 기다려주세요!`,
      action_url: `/auctions/${auctionId}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[notification/bid-placed]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
