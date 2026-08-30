import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { isValidKoreanPhone, normalizePhone } from "@/lib/utils/phone";

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
      display_name, area, phone: rawPhone, instagram, kakao_open_chat_url, business_card_url,
      club_name,
      floor_plan_url,
      preferred_contact_methods,
    } = body;
    // 소속 클럽 이름 (대표 + 추가) — 신청 시 클럽을 생성하지 않고 메모로만 저장.
    // 실제 클럽 연결은 admin이 승인 화면에서 기존 클럽에 연결(club_partners).
    const extraClubNames: string[] = Array.isArray(body.extra_club_names) ? body.extra_club_names : [];

    // phone 정규화 (하이픈 제거 등). users.phone에 normalized 형태로 저장.
    if (!isValidKoreanPhone(rawPhone ?? "")) {
      return NextResponse.json(
        { error: "올바른 휴대폰 번호를 입력해주세요." },
        { status: 400 }
      );
    }
    const phone = normalizePhone(rawPhone);

    // 4. 필수 필드 검증 (주소·좌표는 등록폼에서 제거 — 클럽명만 필수, 상세는 admin이 등록)
    if (!display_name || !area || !Array.isArray(area) || area.length === 0 || !instagram || !phone || !club_name) {
      return NextResponse.json(
        { error: "필수 항목을 모두 입력해주세요." },
        { status: 400 }
      );
    }
    if (!Array.isArray(preferred_contact_methods) || preferred_contact_methods.length === 0) {
      return NextResponse.json(
        { error: "고객에게 표시할 연락 수단을 최소 1개 선택해주세요." },
        { status: 400 }
      );
    }

    // 휴대폰 번호는 SMS OTP 인증 없이 자기신고로 저장. 신뢰성은 Admin 승인 절차에서 확인.

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

    // 5. 클럽은 신청 시 생성하지 않음 — 타이핑한 이름은 메모(verification_club_name + additional_club_names)로만 저장.
    //    실제 클럽 연결(club_partners) + default_club_id 설정은 admin이 승인 화면에서 기존 클럽에 연결할 때 수행.
    //    → 껍데기/중복 클럽이 DB에 안 생김. 승인 전까지 default_club_id는 null.
    const seenNames = new Set<string>([club_name.trim().toLowerCase()]);
    const additionalClubNames = extraClubNames
      .slice(0, 4)
      .map((n) => String(n || "").trim())
      .filter((n) => {
        if (!n || n.length < 2 || seenNames.has(n.toLowerCase())) return false;
        seenNames.add(n.toLowerCase());
        return true;
      });

    // 6. 유저 업데이트 (md_status = pending)
    const { error: userError } = await supabaseAdmin
      .from("users")
      .update({
        display_name,
        area,
        phone,
        instagram: cleanInstagram,
        ...(cleanKakaoUrl ? { kakao_open_chat_url: cleanKakaoUrl } : {}),
        preferred_contact_methods,
        verification_club_name: club_name,
        additional_club_names: additionalClubNames,
        md_unique_slug: generatedSlug,
        md_status: "pending",
        role: "user",
        ...(floor_plan_url ? { floor_plan_url } : {}),
        ...(business_card_url ? { business_card_url } : {}),
      })
      .eq("id", user.id);

    if (userError) {
      logger.error("User update error:", userError);

      // 에러 코드별 메시지 (클럽을 생성하지 않으므로 롤백 대상 없음)
      if (userError.code === "23505") {
        // phone unique 충돌 (idx_users_unique_phone) vs slug 중복 분기
        const detail = `${userError.message} ${userError.details ?? ""}`.toLowerCase();
        if (detail.includes("phone")) {
          return NextResponse.json(
            { error: "이 번호는 다른 계정에 등록되어 있습니다. 다른 번호로 시도해주세요." },
            { status: 409 }
          );
        }
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

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("MD apply API error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
