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
    const { instagram, kakao_open_chat_url, preferred_contact_methods } = body;

    // 4. 서버사이드 유효성 검증
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

    // 슬러그 재생성 (인스타 기반)
    const baseSlug = cleanInstagram
      .toLowerCase()
      .replace(/[._]+/g, "-")
      .replace(/^-|-$/g, "");

    let generatedSlug = baseSlug;
    let attempt = 0;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("md_unique_slug", generatedSlug)
        .neq("id", user.id)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      generatedSlug = `${baseSlug}-${attempt}`;
    }

    // 카카오 오픈채팅 URL 검증 (선택)
    const cleanKakaoUrl = kakao_open_chat_url?.trim() || null;
    if (cleanKakaoUrl && !/^https:\/\/open\.kakao\.com\//.test(cleanKakaoUrl)) {
      return NextResponse.json(
        { error: "카카오톡 오픈채팅 URL 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // preferred_contact_methods 검증 (선택)
    const validMethods = ["dm", "kakao", "phone"];
    let cleanPreferred: string[] | null = null;
    if (Array.isArray(preferred_contact_methods) && preferred_contact_methods.length > 0) {
      cleanPreferred = preferred_contact_methods.filter((m: unknown) =>
        typeof m === "string" && validMethods.includes(m)
      );
      if (cleanPreferred.length === 0) cleanPreferred = null;
    }

    // 5. 업데이트
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        instagram: cleanInstagram,
        md_unique_slug: generatedSlug,
        kakao_open_chat_url: cleanKakaoUrl,
        preferred_contact_methods: cleanPreferred,
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
