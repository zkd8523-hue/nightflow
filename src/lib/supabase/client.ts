import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // 모바일 카카오 OAuth: PKCE code verifier가 앱 전환 시 유실되는 문제 방지
        // implicit 플로우는 code verifier 없이 동작
        flowType: "implicit",
      },
    }
  );
}
