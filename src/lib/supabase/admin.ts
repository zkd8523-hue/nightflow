import { createClient } from "@supabase/supabase-js";

// 서버 전용 - Service Role Key (RLS 우회)
// API Route, Server Action에서만 사용
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
