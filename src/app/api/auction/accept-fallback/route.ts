import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// 차순위 낙찰 제안 수락
// 검증은 accept_fallback() RPC 내부에서 처리 (fallback_deadline, 대상자 확인)
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

    const { data, error } = await supabaseAdmin.rpc("accept_fallback", {
      p_auction_id: auctionId,
      p_user_id: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // TODO: 알림톡 발송 (사업자 등록 후 추가)
    // await sendAlimtalk(user.id, "FALLBACK_ACCEPTED", { auctionId });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
