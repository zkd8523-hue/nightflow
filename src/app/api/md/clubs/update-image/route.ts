import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    // 1. 인증
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

    // 2. 요청 파싱
    const body = await request.json();
    const { clubId, field, value } = body as {
      clubId: string;
      field: "floor_plan_url" | "thumbnail_url";
      value: string | null;
    };

    if (!clubId || !field || !["floor_plan_url", "thumbnail_url"].includes(field)) {
      return NextResponse.json(
        { error: "잘못된 요청입니다." },
        { status: 400 }
      );
    }

    // 3. Admin 클라이언트 (RLS 우회)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 4. 클럽 소유권 확인
    const { data: club, error: clubError } = await supabaseAdmin
      .from("clubs")
      .select("id, md_id")
      .eq("id", clubId)
      .single();

    if (clubError || !club) {
      return NextResponse.json(
        { error: "클럽을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (club.md_id !== user.id) {
      return NextResponse.json(
        { error: "본인 클럽만 수정할 수 있습니다." },
        { status: 403 }
      );
    }

    // 5. 이미지 필드 업데이트
    const { error: updateError } = await supabaseAdmin
      .from("clubs")
      .update({ [field]: value })
      .eq("id", clubId);

    if (updateError) {
      return NextResponse.json(
        { error: "업데이트에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
