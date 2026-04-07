import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const { id } = await params;

    // 1. 인증: ANON_KEY + 쿠키로 사용자 확인
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "인증이 필요합니다" },
        { status: 401 }
      );
    }

    // 2. Admin 클라이언트 (쿠키 없이 직접 생성 — RLS 완전 우회)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: auction, error: fetchError } = await supabaseAdmin
      .from("auctions")
      .select("id, md_id, status, bid_count, created_at")
      .eq("id", id)
      .single();

    if (fetchError || !auction) {
      return NextResponse.json(
        { error: "경매를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // 권한 확인 (MD 본인만 삭제 가능)
    if (auction.md_id !== user.id) {
      return NextResponse.json(
        { error: "삭제 권한이 없습니다" },
        { status: 403 }
      );
    }

    // 입찰 보호: 진행/예정 중인 경매는 입찰이 있으면 삭제 불가
    const endedStatuses = ["won", "unsold", "confirmed", "cancelled"];
    const isEnded = endedStatuses.includes(auction.status);
    if (!isEnded && auction.bid_count > 0) {
      return NextResponse.json(
        { error: "입찰이 있는 진행 중 경매는 삭제할 수 없습니다." },
        { status: 400 }
      );
    }

    // 3. 연관 데이터 삭제 (FK 제약조건)
    await supabaseAdmin.from("bids").delete().eq("auction_id", id);
    await supabaseAdmin.from("chat_interests").delete().eq("auction_id", id);

    // 4. 경매 삭제
    const { error: deleteError } = await supabaseAdmin
      .from("auctions")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: "삭제 중 오류가 발생했습니다: " + deleteError.message },
        { status: 500 }
      );
    }

    // 5. 서버 캐시 무효화
    revalidatePath("/md/dashboard");
    revalidatePath("/");

    return NextResponse.json(
      { message: "경매가 삭제되었습니다" },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Delete auction error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
