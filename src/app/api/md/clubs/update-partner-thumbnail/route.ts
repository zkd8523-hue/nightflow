import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * MD가 본인의 club_partners.thumbnail_url을 업데이트.
 * 같은 클럽이라도 각 MD가 독립적인 대표 이미지를 가질 수 있다.
 * clubs.thumbnail_url (admin 전용)과는 완전히 무관.
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
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
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

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 본인이 해당 클럽의 partner인지 확인
    const { data: partner, error: partnerErr } = await supabaseAdmin
      .from("club_partners")
      .select("id")
      .eq("club_id", clubId)
      .eq("md_id", user.id)
      .maybeSingle();

    if (partnerErr) {
      console.error("[md/clubs/update-partner-thumbnail] partner lookup error:", partnerErr);
      return NextResponse.json(
        { error: "조회 실패", detail: partnerErr.message },
        { status: 500 }
      );
    }

    if (!partner) {
      return NextResponse.json(
        { error: "본인 클럽이 아닙니다." },
        { status: 403 }
      );
    }

    const { error: updateErr } = await supabaseAdmin
      .from("club_partners")
      .update({ thumbnail_url: thumbnailUrl })
      .eq("id", partner.id);

    if (updateErr) {
      console.error("[md/clubs/update-partner-thumbnail] update error:", updateErr);
      return NextResponse.json(
        { error: "업데이트 실패", detail: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[md/clubs/update-partner-thumbnail] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
