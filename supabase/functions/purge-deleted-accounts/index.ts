// Deno Edge Function: 30일 경과 탈퇴 계정 영구 삭제
// Cron: "0 3 * * *" (매일 새벽 3시, Supabase Dashboard에서 설정)
// deleted_at이 30일 이상 경과한 유저 → DB 데이터 + Auth 계정 영구 삭제

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("🔍 30일 경과 탈퇴 계정 검색...");

    // 1. deleted_at이 30일 이상 경과한 유저 조회
    const threshold = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: expiredUsers, error: fetchError } = await supabase
      .from("users")
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", threshold);

    if (fetchError) {
      console.error("❌ 유저 조회 실패:", fetchError);
      throw fetchError;
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      console.log("✅ 영구 삭제 대상 없음");
      return new Response(
        JSON.stringify({ success: true, total: 0, deleted: 0, errors: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 영구 삭제 대상 ${expiredUsers.length}명 발견`);

    const results = {
      total: expiredUsers.length,
      deleted: 0,
      errors: [] as string[],
    };

    // 2. 각 유저에 대해 영구 삭제 처리
    for (const user of expiredUsers) {
      try {
        // 2a. DB 데이터 삭제 (delete_user_account RPC)
        const { error: rpcError } = await supabase.rpc("delete_user_account", {
          p_user_id: user.id,
        });

        if (rpcError) {
          console.error(
            `❌ DB 삭제 실패 (${user.id}):`,
            rpcError.message
          );
          results.errors.push(`db:${user.id}:${rpcError.message}`);
          continue;
        }

        // 2b. Auth 계정 삭제
        const { error: authError } =
          await supabase.auth.admin.deleteUser(user.id);

        if (authError) {
          console.error(
            `⚠️ Auth 삭제 실패 (${user.id}):`,
            authError.message
          );
          // DB는 이미 삭제됐으므로 에러 기록만 하고 deleted 카운트는 증가
          results.errors.push(`auth:${user.id}:${authError.message}`);
        }

        results.deleted++;
        console.log(`✅ 영구 삭제 완료: ${user.id}`);
      } catch (err) {
        console.error(`❌ 유저 ${user.id} 처리 중 예외:`, err);
        results.errors.push(`${user.id}:${String(err)}`);
      }
    }

    console.log("📊 처리 완료:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Edge Function 실행 오류:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
