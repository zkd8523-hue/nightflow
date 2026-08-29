"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clubMatchesQuery } from "@/lib/search/clubMatch";

export interface ClubSuggestion {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
}

/**
 * 클럽 자동완성용 부분 검색.
 * - 250ms 디바운스
 *
 * ⚠️ 예전엔 정적 CLUB_ALIASES(57곳)로만 별칭 매칭하고 DB clubs.aliases(106곳)는
 * 안 읽었다 — "볼레로" 등 DB 전용 별칭 49곳은 채팅 #클럽 태그에서 안 잡혔다.
 * clubs.aliases에 GIN 인덱스가 있지만 정확 일치(@>)용이라 부분 검색엔 못 쓴다.
 * 클럽이 106곳뿐이라 매 검색마다 전체를 가져와 clubMatchesQuery(lib/search의
 * 단일 매칭 규칙)로 클라이언트에서 거른다 — /clubs 목록·/lineups·/events와
 * 동일한 패턴이라 화면마다 검색 결과가 갈리지 않는다.
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

      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, area, thumbnail_url, aliases")
        .is("deleted_at", null)
        .limit(500);

      if (error) {
        console.error("[useClubSearch] error", error);
        setResults([]);
      } else {
        const matched = (data ?? [])
          .filter((c) => clubMatchesQuery({ id: c.id, name: c.name, area: c.area, aliases: c.aliases }, q))
          .slice(0, limit)
          .map(({ id, name, area, thumbnail_url }) => ({ id, name, area, thumbnail_url }));
        setResults(matched);
      }
      setLoading(false);
    }, 250);

    return () => clearTimeout(handle);
  }, [query, limit]);

  return { results, loading };
}
