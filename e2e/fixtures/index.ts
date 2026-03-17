import { test as base, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// 테스트용 Supabase 클라이언트
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type TestFixtures = {
  supabase: typeof supabase;
};

export const test = base.extend<TestFixtures>({
  supabase: async ({}, use) => {
    await use(supabase);
  },
});

export { expect };
