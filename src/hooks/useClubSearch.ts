"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { findClubIdsByAlias } from "@/lib/clubs/aliases";

export interface ClubSuggestion {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
}

/**
 * 클럽 자동완성용 부분 검색.
 * - 클럽명 ILIKE + alias 매칭 합산
 * - 최대 N개 반환
 * - 250ms 디바운스
 */
export function useClubSearch(query: string, limit = 8) {
  const [results, setResults] = useState<ClubSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const handle = setTimeout(async () => {
      const supabase = createClient();

      // 1) alias 매칭 ID
      const aliasIds = findClubIdsByAlias(q);

      // 2) 클럽명 ILIKE
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, area, thumbnail_url")
        .or(`name.ilike.%${q}%,id.in.(${aliasIds.length > 0 ? aliasIds.join(",") : "00000000-0000-0000-0000-000000000000"})`)
        .is("deleted_at", null)
        .limit(limit);

      if (error) {
        console.error("[useClubSearch] error", error);
        setResults([]);
      } else {
        setResults((data ?? []) as ClubSuggestion[]);
      }
      setLoading(false);
    }, 250);

    return () => clearTimeout(handle);
  }, [query, limit]);

  return { results, loading };
}
