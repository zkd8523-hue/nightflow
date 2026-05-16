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

/**
 * 앱 전역에서 단 한 번만 호출되는 인증 초기화 훅.
 * AuthInitProvider 에서만 사용. 다른 컴포넌트는 useCurrentUser() 로 store 만 읽음.
 */
export function useAuthInit() {
  const { setUser, setLoading, reset } = useAuthStore();
  const isRefetching = useRef(false);

  const refetch = useCallback(async () => {
    if (isRefetching.current) return;
    isRefetching.current = true;

    try {
      const supabase = createClient();

      let authUser: { id: string } | null = null;
      let hadAuthError = false;
      try {
        const { data, error: authError } = await withTimeout(
          supabase.auth.getUser(),
          AUTH_TIMEOUT_MS,
          "auth.getUser"
        );
        if (authError) {
          // "Auth session missing" 은 비로그인 정상 상태 — 에러 로그 X
          const msg = authError.message || "";
          if (!msg.includes("Auth session missing")) {
            console.error("[useAuthInit] auth.getUser 실패:", msg);
            hadAuthError = true;
          }
        }
        authUser = data?.user ?? null;
      } catch (e) {
        // Timeout/네트워크 실패 - broken cookie 가능성 → 강제 정리
        console.error("[useAuthInit] auth.getUser timeout/error:", e);
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
        // 비로그인 정상 상태: 쿠키 정리하지 않음 (방금 OAuth 콜백으로 심어진 쿠키
        // 가 다른 인스턴스에 의해 지워지는 race 방지).
        // 실제 refresh 실패(hadAuthError) 일 때만 정리.
        if (hadAuthError) {
          try {
            await withTimeout(
              supabase.auth.signOut({ scope: "local" }),
              2000,
              "signOut.local"
            );
          } catch {
            // ignore
          }
        }
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
            "[useAuthInit] users 테이블 조회 실패:",
            profileError.message,
            profileError.code
          );
        }
        setUser(profile ?? null);
      } catch (e) {
        console.error("[useAuthInit] users 테이블 timeout/error:", e);
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
        console.warn("[useAuthInit] hard timeout - 강제 loading 해제");
        setLoading(false);
      }
    }, 6000);

    const init = async () => {
      setLoading(true);
      try {
        await refetch();
      } catch (err) {
        console.error("[useAuthInit] init 실패:", err);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
        clearTimeout(hardKillTimer);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // SIGNED_OUT 명시적 이벤트만 로컬 정리 — INITIAL_SESSION/null 은 단순 비로그인일 수 있으므로 무시.
      // TOKEN_REFRESHED 실패는 SDK 가 자동으로 SIGNED_OUT 이벤트로 변환해 전달.
      if (event === "SIGNED_OUT") {
        setUser(null);
        return;
      }

      // INITIAL_SESSION: 첫 구독 시 현재 상태 전달. null 이면 단순 비로그인.
      if (event === "INITIAL_SESSION") {
        if (!session) {
          setUser(null);
        } else {
          refetch();
        }
        return;
      }

      // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED → 프로필 재조회
      if (session) {
        refetch();
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(hardKillTimer);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setUser, setLoading]);

  return { refetch };
}

/**
 * 일반 컴포넌트용 훅. Zustand store 만 읽음(부수효과 없음).
 * 인증 초기화는 AuthInitProvider 가 단 한 번 수행.
 */
export function useCurrentUser() {
  const { user, isLoading } = useAuthStore();

  // 호환성: 일부 컴포넌트가 refetch() 를 호출함.
  // store 를 갱신하면 AuthInitProvider 와 모든 컴포넌트에 자동 전파됨.
  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      useAuthStore.getState().setUser(null);
      return;
    }
    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();
    useAuthStore.getState().setUser(profile ?? null);
  }, []);

  // [통합 분석] 유저 식별 연동 — store 에 직접 구독하는 게 더 깔끔하지만
  // 기존 동작 유지 위해 여기 둠. AuthInitProvider 에서도 한 번 호출되므로
  // 중복이지만 멱등적(identifyUser 는 동일 id 면 noop).
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
