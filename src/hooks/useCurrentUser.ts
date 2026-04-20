"use client";

import { useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/useAuthStore";

/** 현재 로그인 유저 조회 + 스토어 동기화 */
export function useCurrentUser() {
  const { user, isLoading, setUser, setLoading } = useAuthStore();
  const isRefetching = useRef(false);

  const refetch = useCallback(async () => {
    // 중복 실행 방지
    if (isRefetching.current) return;
    isRefetching.current = true;

    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.error("[useCurrentUser] auth.getUser 실패:", authError.message);
      }

      if (!authUser) {
        setUser(null);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileError) {
        console.error("[useCurrentUser] users 테이블 조회 실패:", profileError.message, profileError.code);
      }

      setUser(profile);
    } finally {
      isRefetching.current = false;
    }
  }, [setUser]);

  useEffect(() => {
    const supabase = createClient();

    setLoading(true);
    refetch().catch(() => setUser(null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
      } else {
        refetch();
      }
    });

    return () => subscription.unsubscribe();
  }, [setUser, setLoading, refetch]);

  // [통합 분석] 유저 식별 연동
  useEffect(() => {
    if (user) {
      import("@/lib/analytics/events").then(({ identifyUser }) => {
        identifyUser(user.id, {
          name: user.name,
          role: user.role,
          md_status: user.md_status,
        });
      });
    } else {
      import("@/lib/analytics/events").then(({ resetUser }) => {
        resetUser();
      });
    }
  }, [user?.id]);

  return { user, isLoading, refetch };
}
