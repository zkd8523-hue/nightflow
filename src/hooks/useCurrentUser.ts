"use client";

import { useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/useAuthStore";

const AUTH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/** 현재 로그인 유저 조회 + 스토어 동기화 */
export function useCurrentUser() {
  const { user, isLoading, setUser, setLoading, reset } = useAuthStore();
  const isRefetching = useRef(false);

  const refetch = useCallback(async () => {
    if (isRefetching.current) return;
    isRefetching.current = true;

    try {
      const supabase = createClient();

      let authUser: { id: string } | null = null;
      try {
        const { data, error: authError } = await withTimeout(
          supabase.auth.getUser(),
          AUTH_TIMEOUT_MS,
          "auth.getUser"
        );
        if (authError) {
          console.error("[useCurrentUser] auth.getUser 실패:", authError.message);
        }
        authUser = data?.user ?? null;
      } catch (e) {
        // Timeout/네트워크 실패 - broken cookie 가능성 → 강제 정리
        console.error("[useCurrentUser] auth.getUser timeout/error:", e);
        try {
          await withTimeout(
            supabase.auth.signOut({ scope: "local" }),
            2000,
            "signOut.local"
          );
        } catch {
          // signOut도 실패하면 무시 (쿠키는 브라우저 DevTools로 삭제 가능)
        }
        reset();
        return;
      }

      if (!authUser) {
        setUser(null);
        return;
      }

      try {
        const { data: profile, error: profileError } = await withTimeout(
          supabase.from("users").select("*").eq("id", authUser.id).maybeSingle(),
          AUTH_TIMEOUT_MS,
          "users.select"
        );
        if (profileError) {
          console.error(
            "[useCurrentUser] users 테이블 조회 실패:",
            profileError.message,
            profileError.code
          );
        }
        setUser(profile ?? null);
      } catch (e) {
        console.error("[useCurrentUser] users 테이블 timeout/error:", e);
        setUser(null);
      }
    } finally {
      isRefetching.current = false;
    }
  }, [setUser, reset]);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    // 벨트 앤 서스펜더: 무슨 일이 있어도 6초 후엔 loading false
    const hardKillTimer = setTimeout(() => {
      if (mounted) {
        console.warn("[useCurrentUser] hard timeout - 강제 loading 해제");
        setLoading(false);
      }
    }, 6000);

    const init = async () => {
      setLoading(true);
      try {
        await refetch();
      } catch (err) {
        console.error("[useCurrentUser] init 실패:", err);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
        clearTimeout(hardKillTimer);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setUser(null);
      } else {
        refetch();
      }
    });

    return () => {
      mounted = false;
      clearTimeout(hardKillTimer);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setUser, setLoading]);

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
