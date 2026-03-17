import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

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

    // 2. MD 권한 확인
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userData || (userData.role !== "md" && userData.role !== "admin")) {
      return NextResponse.json(
        { error: "MD 권한이 필요합니다." },
        { status: 403 }
      );
    }

    // 3. 요청 데이터 파싱 + 허용 필드만 추출
    const body = await request.json();
    const { name, phone, instagram } = body;

    // 4. 서버사이드 유효성 검증
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "이름은 2자 이상 입력해주세요." },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== "string" || phone.replace(/\D/g, "").length < 10) {
      return NextResponse.json(
        { error: "올바른 연락처를 입력해주세요." },
        { status: 400 }
      );
    }

    if (!instagram || typeof instagram !== "string") {
      return NextResponse.json(
        { error: "인스타그램 아이디를 입력해주세요." },
        { status: 400 }
      );
    }

    const cleanInstagram = instagram.replace(/^@/, "");
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleanInstagram)) {
      return NextResponse.json(
        { error: "인스타그램 아이디 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 5. 업데이트
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        name: name.trim(),
        phone,
        instagram: cleanInstagram,
      })
      .eq("id", user.id);

    if (updateError) {
      logger.error("Profile update error:", updateError);

      if (updateError.code === "23505") {
        return NextResponse.json(
          { error: "이미 사용 중인 정보입니다. 다른 값을 입력해주세요." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "프로필 저장에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("MD profile update API error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
