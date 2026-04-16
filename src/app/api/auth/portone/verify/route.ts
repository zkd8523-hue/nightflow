import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessToken, getCertification, isAdultFromBirthday } from "@/lib/portone";
import { logger } from "@/lib/utils/logger";

/**
 * PortOne PASS 본인인증 결과 서버 검증.
 *
 * POST body: { imp_uid: string }
 *
 * 응답:
 *  - 200: { success: true }
 *  - 401: 로그인 필요
 *  - 409: CI_CONFLICT (다른 카카오 계정으로 이미 가입된 본인)
 *  - 422: UNDER_AGE (만 19세 미만)
 *  - 502: PortOne API 호출 실패
 */
export async function POST(request: NextRequest) {
  try {
    const { imp_uid } = (await request.json()) as { imp_uid?: string };
    if (!imp_uid || typeof imp_uid !== "string") {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // PortOne 인증 결과 조회
    let cert;
    try {
      const token = await getAccessToken();
      cert = await getCertification(imp_uid, token);
    } catch (err) {
      logger.error("[portone/verify] PortOne API error:", err);
      return NextResponse.json({ error: "PORTONE_ERROR" }, { status: 502 });
    }

    // 성인 확인
    if (!isAdultFromBirthday(cert.birthday)) {
      return NextResponse.json({ error: "UNDER_AGE" }, { status: 422 });
    }

    // CI 중복 체크 (자기 자신 제외)
    const { data: conflict } = await supabase
      .from("users")
      .select("id")
      .eq("ci", cert.unique_key)
      .neq("id", authUser.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (conflict) {
      return NextResponse.json({ error: "CI_CONFLICT" }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("users")
      .update({
        name: cert.name,
        phone: cert.phone,
        birthday: cert.birthday,
        gender: cert.gender,
        ci: cert.unique_key,
        di: cert.unique_in_site,
        nationality: cert.foreigner ? "FOREIGNER" : "LOCAL",
        identity_verified_at: nowIso,
        age_verified_at: nowIso,
      })
      .eq("id", authUser.id);

    if (updateError) {
      logger.error("[portone/verify] users update failed:", updateError);
      return NextResponse.json({ error: "DB_UPDATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[portone/verify] unexpected error:", err);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
