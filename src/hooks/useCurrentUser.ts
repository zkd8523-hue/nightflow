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
    } = await supabase.auth.getUser();

    if (!authUser) {
      setUser(null);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    setUser(profile);
  }, [setUser]);

  useEffect(() => {
    const supabase = createClient();

    setLoading(true);
    refetch();

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

  return { user, isLoading, refetch };
}
