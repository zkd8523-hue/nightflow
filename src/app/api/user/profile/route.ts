import { createServerClient } from "@supabase/ssr";
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

    // 4. 닉네임 변경 (제한 검증 + 중복 체크 + 변경 + 이력 기록을 RPC에서 원자적으로 처리)
    //    14일에 최대 2회 (인스타그램 "이름" 변경 정책과 동일)
    //    auth.uid() 기반이므로 인증 클라이언트(supabaseAuth)로 호출.
    const { data: result, error: rpcError } = await supabaseAuth.rpc(
      "change_display_name",
      { p_new_name: trimmed }
    );

    if (rpcError) {
      return NextResponse.json(
        { error: "저장에 실패했습니다." },
        { status: 500 }
      );
    }

    if (!result?.success) {
      // 변경 횟수 제한 도달
      if (result?.limit_reached) {
        return NextResponse.json(
          {
            error: result.error ?? "닉네임 변경 횟수를 초과했습니다.",
            next_available_at: result.next_available_at ?? null,
          },
          { status: 429 }
        );
      }
      // 중복(409) vs 그 외(400) 구분
      const isDuplicate = (result?.error ?? "").includes("이미 사용 중");
      return NextResponse.json(
        { error: result?.error ?? "저장에 실패했습니다." },
        { status: isDuplicate ? 409 : 400 }
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
