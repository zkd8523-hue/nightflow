import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * Admin이 클럽 프로필 태그(clubs.tags)를 업데이트.
 * tags 배열 전체를 교체한다.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
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
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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
    const { clubId, tags } = body as { clubId: string; tags: string[] };

    if (!clubId) {
      return NextResponse.json(
        { error: "clubId가 누락되었습니다." },
        { status: 400 }
      );
    }
    if (!Array.isArray(tags)) {
      return NextResponse.json(
        { error: "tags는 배열이어야 합니다." },
        { status: 400 }
      );
    }

    // 정규화: prefix 패턴(group:key) 만 통과
    const normalized = tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => /^[a-z]+:[a-z0-9]+$/i.test(t));

    const { error: updateErr } = await supabaseAdmin
      .from("clubs")
      .update({ tags: normalized })
      .eq("id", clubId);

    if (updateErr) {
      console.error("[admin/clubs/update-tags] update error:", updateErr);
      return NextResponse.json(
        { error: "업데이트 실패", detail: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, tags: normalized });
  } catch (err) {
    console.error("[admin/clubs/update-tags] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
