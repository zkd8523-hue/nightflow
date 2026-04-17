import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestTid } from "@/lib/danal";
import { logger } from "@/lib/utils/logger";

/**
 * 다날 본인인증 시작: TID 발급 요청.
 *
 * POST → { tid, authUrl }
 *
 * 클라이언트는 authUrl을 팝업으로 열어 유저가 인증하게 한다.
 * 인증 완료 후 다날이 /api/auth/danal/callback 으로 결과를 POST한다.
 *
 * TODO: CPID 발급 후 실제 구현. 현재는 스켈레톤.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const callbackUrl = `${appUrl}/api/auth/danal/callback`;

    const { tid, authUrl } = await requestTid(callbackUrl);

    return NextResponse.json({ tid, authUrl });
  } catch (err) {
    logger.error("[danal/init] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DANAL_INIT_FAILED" },
      { status: 502 }
    );
  }
}
