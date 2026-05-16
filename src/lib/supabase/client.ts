import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// 싱글톤: 매 호출마다 새 객체를 반환하면 useEffect deps 가 무효화돼
// 일부 컴포넌트(SignupForm/login/Header 등)에서 effect 가 무한 재실행됨.
// supabase-ssr 클라이언트는 쿠키로 상태를 공유하므로 인스턴스 1개로 충분.
let browserClient: SupabaseClient | null = null;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Web Locks API 비활성: 좀비 탭/HMR 인스턴스 중복 등으로
        // "lock:sb-...-auth-token timed out waiting 10000ms" 가 발생하면서
        // supabase 호출이 직렬화 정체되는 문제 우회.
        // 같은 origin multi-tab 동시 refresh race 가능성은 남지만 사용 시나리오상 영향 없음.
        lock: async (_name, _acquireTimeout, fn) => fn(),
      },
    }
  );
  return browserClient;
}
