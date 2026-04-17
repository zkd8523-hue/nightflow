import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest) {
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
        { error: "인증이 필요합니다. 다시 로그인해주세요." },
        { status: 401 }
      );
    }

    // 2. 요청 데이터 파싱
    const body = await request.json();
    const { display_name } = body;

    // 3. 유효성 검증
    if (!display_name || typeof display_name !== "string") {
      return NextResponse.json(
        { error: "닉네임을 입력해주세요." },
        { status: 400 }
      );
    }

    const trimmed = display_name.trim();

    if (trimmed.length < 2 || trimmed.length > 16) {
      return NextResponse.json(
        { error: "닉네임은 2~16자로 입력해주세요." },
        { status: 400 }
      );
    }

    // 4. 중복 체크
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("display_name", trimmed)
      .neq("id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "이미 사용 중인 닉네임입니다." },
        { status: 409 }
      );
    }

    // 5. 저장
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ display_name: trimmed })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: "저장에 실패했습니다." },
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
