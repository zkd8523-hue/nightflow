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

    const loginEmail = email || `kakao_${kakaoId}@nightflow.kakao`;

    // 페이지네이션으로 전체 유저 검색 (listUsers 기본 50명 제한 회피)
    const findUser = async () => {
      let page = 1;
      while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error || !data?.users?.length) return null;
        const byKakao = data.users.find(
          (u) => u.app_metadata?.provider === "kakao" &&
                 u.app_metadata?.provider_id === kakaoId
        );
        if (byKakao) return byKakao;
        const byEmail = data.users.find((u) => u.email === loginEmail);
        if (byEmail) return byEmail;
        if (data.users.length < 1000) return null;
        page += 1;
        if (page > 50) return null; // 안전 상한
      }
    };

    let existingUser = await findUser();
    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      userId = existingUser.id;
      if (existingUser.app_metadata?.provider_id !== kakaoId) {
        await supabase.auth.admin.updateUserById(userId, {
          app_metadata: {
            ...(existingUser.app_metadata || {}),
            provider: "kakao",
            provider_id: kakaoId,
            providers: Array.from(new Set([...(existingUser.app_metadata?.providers || []), "kakao"])),
          },
        });
      }
    } else {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: loginEmail,
        email_confirm: true,
        user_metadata: { full_name: name, avatar_url: avatar, name },
        app_metadata: { provider: "kakao", provider_id: kakaoId, providers: ["kakao"] },
      });

      if (createError) {
        // 이메일 중복인 경우: 재검색하여 기존 유저 사용
        const msg = createError.message || "";
        if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
          existingUser = await findUser();
          if (!existingUser) {
            return new Response(
              JSON.stringify({ error: `email exists but user lookup failed: ${msg}` }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          userId = existingUser.id;
          await supabase.auth.admin.updateUserById(userId, {
            app_metadata: {
              ...(existingUser.app_metadata || {}),
              provider: "kakao",
              provider_id: kakaoId,
              providers: Array.from(new Set([...(existingUser.app_metadata?.providers || []), "kakao"])),
            },
          });
        } else {
          return new Response(JSON.stringify({ error: msg }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (!newUser?.user) {
        return new Response(JSON.stringify({ error: "createUser returned no user" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        userId = newUser.user.id;
        isNewUser = true;
      }
    }

    // 세션 발급: generateLink(magiclink) → verifyOtp
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: loginEmail,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      return new Response(JSON.stringify({ error: linkError?.message || "generateLink failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError || !verifyData?.session) {
      return new Response(JSON.stringify({ error: verifyError?.message || "verifyOtp failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
        is_new_user: isNewUser,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
