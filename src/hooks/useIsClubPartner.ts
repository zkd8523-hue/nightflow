"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * 현재 사용자가 해당 클럽의 club_partners 등록 MD인지 확인.
 * - admin은 항상 true (편집 권한)
 * - 파트너 MD인 경우 true
 * - 그 외 false
 */
export function useIsClubPartner(clubId: string | null | undefined) {
  const { user, isLoading: userLoading } = useCurrentUser();
  const supabase = useMemo(() => createClient(), []);
  const [isPartner, setIsPartner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (userLoading) return;
    if (!user || !clubId) {
      setIsPartner(false);
      setIsLoading(false);
      return;
    }
    if (isAdmin) {
      setIsPartner(true);
      setIsLoading(false);
      return;
    }
    if (user.role !== "md") {
      setIsPartner(false);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("club_partners")
        .select("md_id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .eq("md_id", user.id);
      if (!cancelled) {
        setIsPartner((count ?? 0) > 0);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, user, userLoading, clubId, isAdmin]);

  return { isPartner, isAdmin, isLoading };
}
