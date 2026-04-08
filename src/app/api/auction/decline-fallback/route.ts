import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// 차순위 낙찰 제안 거절
// 거절 시 해당 유저 bid가 cancelled 되고 즉시 다음 차순위 탐색
// 패널티 없음
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

    const { data, error } = await supabaseAdmin.rpc("decline_fallback", {
      p_auction_id: auctionId,
      p_user_id: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
