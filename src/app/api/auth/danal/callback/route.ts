import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptResult, isAdultFromBirthday } from "@/lib/danal";
import { logger } from "@/lib/utils/logger";

/**
 * 다날 인증 완료 콜백.
 *
 * 다날이 인증 완료 후 이 URL로 POST (PC) 또는 GET (Mobile)으로 결과를 전달한다.
 * 결과를 복호화 → 성인 체크 → CI 중복 체크 → users 업데이트 → 팝업 닫기 HTML 반환.
 *
 * TODO: CPID 발급 후 실제 복호화 및 파라미터 파싱 구현.
 */
export async function POST(request: NextRequest) {
  return handleCallback(request);
}

export async function GET(request: NextRequest) {
  return handleCallback(request);
}

async function handleCallback(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorHtml("로그인이 만료되었습니다. 다시 로그인해주세요.");
    }

    // TODO: 다날 결과 파싱 (POST body 또는 query params)
    // const body = await request.text();
    // const cert = decryptResult(body);
    // 아래는 스켈레톤 — CPID 발급 후 실제 구현

    // --- 스켈레톤 시작 (CPID 발급 후 교체) ---
    return errorHtml(
      "다날 본인인증 연동이 아직 완료되지 않았습니다. CPID 발급 후 구현 예정."
    );
    // --- 스켈레톤 끝 ---

    // 실제 구현 시 아래 로직 활성화:
    //
    // if (!isAdultFromBirthday(cert.birthday)) {
    //   return errorHtml("만 19세 이상만 이용할 수 있습니다.");
    // }
    //
    // const { data: conflict } = await supabase
    //   .from("users").select("id")
    //   .eq("ci", cert.ci)
    //   .neq("id", user.id)
    //   .is("deleted_at", null)
    //   .maybeSingle();
    //
    // if (conflict) {
    //   return errorHtml("이미 다른 카카오 계정으로 가입된 본인인증입니다.");
    // }
    //
    // await supabase.from("users").update({
    //   name: cert.name,
    //   phone: cert.phone,
    //   birthday: cert.birthday,
    //   gender: cert.gender,
    //   ci: cert.ci,
    //   di: cert.di,
    //   nationality: cert.foreigner ? "FOREIGNER" : "LOCAL",
    //   identity_verified_at: new Date().toISOString(),
    //   age_verified_at: new Date().toISOString(),
    // }).eq("id", user.id);
    //
    // return successHtml();
  } catch (err) {
    logger.error("[danal/callback] error:", err);
    return errorHtml("본인인증 처리 중 오류가 발생했습니다.");
  }
}

function successHtml() {
  return new Response(
    `<!DOCTYPE html><html><body><script>
      window.opener.postMessage({ type: "DANAL_SUCCESS" }, "*");
      window.close();
    </script><p>인증 완료. 이 창은 자동으로 닫힙니다.</p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function errorHtml(message: string) {
  return new Response(
    `<!DOCTYPE html><html><body><script>
      window.opener.postMessage({ type: "DANAL_FAIL", message: ${JSON.stringify(message)} }, "*");
      setTimeout(() => window.close(), 3000);
    </script><p>${message}</p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
