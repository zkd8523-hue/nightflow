import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * Admin이 클럽 대표 이미지를 변경.
 * 이 이미지는 /clubs/[id] 페이지의 공식 대표 이미지로만 사용됨.
 * MD가 등록한 경매(auctions.thumbnail_url)와는 완전히 무관 — cascade 없음.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

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
      data: { user: authUser },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !authUser) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Admin 권한 검증
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", authUser.id)
      .single();

    if (!userRow || userRow.role !== "admin") {
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { clubId, thumbnailUrl } = body as {
      clubId: string;
      thumbnailUrl: string | null;
    };

    if (!clubId) {
      return NextResponse.json(
        { error: "clubId가 누락되었습니다." },
        { status: 400 }
      );
    }

    // clubs.thumbnail_url만 업데이트. 경매 게시글 이미지에는 영향 없음.
    const { error: clubErr } = await supabaseAdmin
      .from("clubs")
      .update({ thumbnail_url: thumbnailUrl })
      .eq("id", clubId);

    if (clubErr) {
      console.error("[admin/clubs/update-thumbnail] club update error:", clubErr);
      return NextResponse.json(
        { error: "클럽 업데이트 실패", detail: clubErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/clubs/update-thumbnail] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
