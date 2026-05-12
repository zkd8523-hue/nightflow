import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { access_token } = await req.json();
    if (!access_token) {
      return new Response(JSON.stringify({ error: "access_token required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 카카오 사용자 정보 조회
    const kakaoRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!kakaoRes.ok) {
      return new Response(JSON.stringify({ error: "invalid kakao token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const kakaoUser = await kakaoRes.json();
    const kakaoId = String(kakaoUser.id);
    const email = kakaoUser.kakao_account?.email;
    const name = kakaoUser.kakao_account?.profile?.nickname || "카카오 사용자";
    const avatar = kakaoUser.kakao_account?.profile?.thumbnail_image_url;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 기존 유저 조회 (kakao provider + kakaoId)
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.app_metadata?.provider === "kakao" &&
             u.app_metadata?.provider_id === kakaoId
    );

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // 신규 유저 생성
      const loginEmail = email || `kakao_${kakaoId}@nightflow.kakao`;
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: loginEmail,
        email_confirm: true,
        user_metadata: { full_name: name, avatar_url: avatar, name },
        app_metadata: { provider: "kakao", provider_id: kakaoId, providers: ["kakao"] },
      });
      if (createError || !newUser?.user) {
        return new Response(JSON.stringify({ error: createError?.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = newUser.user.id;
    }

    // 세션 발급
    const { data: session, error: sessionError } = await supabase.auth.admin.createSession(userId);
    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: sessionError?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
        is_new_user: !existingUser,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
