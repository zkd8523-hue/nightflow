"use client";

import { useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/useAuthStore";

/** 현재 로그인 유저 조회 + 스토어 동기화 */
export function useCurrentUser() {
  const { user, isLoading, setUser, setLoading } = useAuthStore();

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[useCurrentUser] auth.getUser 실패:", authError.message);
    }

    if (!authUser) {
      console.log("[useCurrentUser] authUser 없음 (미로그인)");
      setUser(null);
      return;
    }

    console.log("[useCurrentUser] authUser 확인:", authUser.id, authUser.email);

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileError) {
      console.error("[useCurrentUser] users 테이블 조회 실패:", profileError.message, profileError.code);
    }

    console.log("[useCurrentUser] profile:", profile ? `${profile.name} (${profile.role})` : "null");
    setUser(profile);
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
      // 분석 유틸리티 로드 및 유저 식별 실행
      import("@/lib/analytics/events").then(({ identifyUser }) => {
        identifyUser(user.id, {
          name: user.name,
          role: user.role,
          md_status: user.md_status,
        });
      });
    } else {
      // 로그아웃 시 식별 정보 초기화
      import("@/lib/analytics/events").then(({ resetUser }) => {
        resetUser();
      });
    }
  }, [user?.id]);

  return { user, isLoading, refetch };
}
