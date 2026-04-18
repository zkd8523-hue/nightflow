import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

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
        { error: "인증이 필요합니다. 다시 로그인해주세요." },
        { status: 401 }
      );
    }

    // 2. Admin 클라이언트 (RLS 우회 — clubs 테이블은 admin-only)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. 요청 데이터 파싱
    const body = await request.json();
    const {
      display_name, area, instagram, kakao_open_chat_url, business_card_url,
      club_name, club_address, club_address_detail, club_postal_code,
      club_latitude, club_longitude, club_phone, club_thumbnail_url,
      floor_plan_url,
    } = body;

    // clubs.area는 TEXT 단일값 — 대표 지역(첫 번째) 사용
    const primaryArea: string = Array.isArray(area) ? area[0] : area;

    // 4. 필수 필드 검증 (phone은 PASS 인증으로 이미 DB에 저장됨 — 폼에서 재전송 불필요)
    if (!display_name || !area || !Array.isArray(area) || area.length === 0 || !instagram || !club_name || !club_address ||
        !club_latitude || !club_longitude) {
      return NextResponse.json(
        { error: "필수 항목을 모두 입력해주세요." },
        { status: 400 }
      );
    }

    // Instagram 서버 검증
    const cleanInstagram = instagram.replace(/^@/, "");
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleanInstagram)) {
      return NextResponse.json(
        { error: "인스타그램 아이디 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 카카오 오픈채팅 URL 검증 (선택)
    const cleanKakaoUrl = kakao_open_chat_url?.trim() || null;
    if (cleanKakaoUrl && !/^https:\/\/open\.kakao\.com\//.test(cleanKakaoUrl)) {
      return NextResponse.json(
        { error: "카카오톡 오픈채팅 URL 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 4.5 인스타 기반 슬러그 자동 생성
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

    // 5. 기존 클럽 확인 (상태별 분기 처리)
    const { data: existingClub } = await supabaseAdmin
      .from("clubs")
      .select("id, status")
      .eq("md_id", user.id)
      .maybeSingle();

    let clubId: string;

    if (existingClub) {
      // ✅ approved 클럽 덮어쓰기 방지
      if (existingClub.status === "approved") {
        return NextResponse.json(
          { error: "승인된 클럽은 수정할 수 없습니다. 추가 클럽 신청은 관리자에게 문의하세요." },
          { status: 403 }
        );
      }

      // pending 또는 rejected → 정보 업데이트 후 즉시 approved
      const { error: clubError } = await supabaseAdmin
        .from("clubs")
        .update({
          name: club_name,
          area: primaryArea,
          address: club_address,
          address_detail: club_address_detail || null,
          postal_code: club_postal_code || null,
          latitude: club_latitude,
          longitude: club_longitude,
          phone: club_phone || null,
          thumbnail_url: club_thumbnail_url || null,
          status: "approved",
          rejected_at: null,
          rejected_reason: null,
          rejected_by: null,
        })
        .eq("id", existingClub.id);

      if (clubError) {
        logger.error("Club update error:", clubError);
        return NextResponse.json(
          { error: `클럽 정보 업데이트에 실패했습니다. (${clubError.code}: ${clubError.message})` },
          { status: 500 }
        );
      }
      clubId = existingClub.id;
    } else {
      // 새 클럽 생성
      const { data: newClub, error: clubError } = await supabaseAdmin
        .from("clubs")
        .insert({
          md_id: user.id,
          name: club_name,
          area: primaryArea,
          address: club_address,
          address_detail: club_address_detail || null,
          postal_code: club_postal_code || null,
          latitude: club_latitude,
          longitude: club_longitude,
          phone: club_phone || null,
          thumbnail_url: club_thumbnail_url || null,
          status: "approved",
        })
        .select("id")
        .single();

      if (clubError || !newClub) {
        logger.error("Club create error:", clubError);
        return NextResponse.json(
          { error: `클럽 등록에 실패했습니다. (${clubError?.code}: ${clubError?.message})` },
          { status: 500 }
        );
      }
      clubId = newClub.id;
    }

    // 6. 유저 업데이트 (md_status = pending)
    const { error: userError } = await supabaseAdmin
      .from("users")
      .update({
        display_name,
        area,
        instagram: cleanInstagram,
        ...(cleanKakaoUrl ? { kakao_open_chat_url: cleanKakaoUrl } : {}),
        verification_club_name: club_name,
        md_unique_slug: generatedSlug,
        md_status: "pending",
        role: "user",
        default_club_id: clubId,
        ...(floor_plan_url ? { floor_plan_url } : {}),
        ...(business_card_url ? { business_card_url } : {}),
      })
      .eq("id", user.id);

    if (userError) {
      logger.error("User update error:", userError);

      // 롤백: 새로 생성한 클럽이면 삭제
      if (!existingClub) {
        await supabaseAdmin.from("clubs").delete().eq("id", clubId);
      }

      // 에러 코드별 메시지
      if (userError.code === "23505") {
        return NextResponse.json(
          { error: "이미 사용 중인 아이디입니다. 다른 아이디를 선택해주세요." },
          { status: 409 }
        );
      }
      if (userError.code === "23514") {
        return NextResponse.json(
          { error: "입력값이 올바르지 않습니다. 다시 확인해주세요." },
          { status: 400 }
        );
      }
      if (userError.code === "23502") {
        return NextResponse.json(
          { error: "필수 입력값이 누락되었습니다. 다시 확인해주세요." },
          { status: 400 }
        );
      }
      if (userError.code === "23503") {
        return NextResponse.json(
          { error: "연결된 데이터가 올바르지 않습니다. 다시 시도해주세요." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: `신청 정보 저장에 실패했습니다. (${userError.code}: ${userError.message})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, clubId });
  } catch (error) {
    logger.error("MD apply API error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
