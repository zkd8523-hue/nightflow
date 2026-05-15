import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
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
}
