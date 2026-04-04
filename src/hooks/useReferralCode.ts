"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 현재 로그인 유저의 referral_code를 가져오는 훅
 * 공유 URL에 자동으로 ref 파라미터를 포함시키기 위해 사용
 * 비로그인 시 null 반환
 */
export function useReferralCode(): string | null {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("users")
        .select("referral_code")
        .eq("id", user.id)
        .single();
      if (data?.referral_code) {
        setCode(data.referral_code);
      }
    });
  }, []);

  return code;
}
