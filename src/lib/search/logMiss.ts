"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizeSearchText } from "./normalize";

/** 검색이 일어난 화면 — search_misses.surface (Migration 601) */
export type SearchSurface = "clubs" | "lineups" | "events";

/**
 * 검색 결과 0건을 기록한다 — 운영자가 /admin/clubs/search-misses에서 보고
 * clubs.aliases에 별칭을 추가하는 피드백 루프의 입력부.
 *
 * ⚠️ `resultCount`에는 **검색어만 적용한** 결과 수를 넘겨야 한다.
 *    지역·날짜 칩 때문에 0건인 것까지 넘기면 "별칭이 없어서 못 찾은 것"과
 *    "필터 때문에 안 보이는 것"이 섞여 큐가 오염된다.
 */
export function useSearchMissLogger(
  surface: SearchSurface,
  rawQuery: string,
  resultCount: number
): void {
  const normalized = normalizeSearchText(rawQuery);

  useEffect(() => {
    // 1글자는 오타·입력 중간 상태가 대부분이라 별칭 후보로 쓸 수 없다
    if (normalized.length < 2) return;
    if (resultCount > 0) return;

    // 타이핑이 멎은 뒤에만 — 한 글자씩 늘어나는 중간 쿼리를 전부 기록하지 않는다
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        await supabase.rpc("log_search_miss", {
          p_query: rawQuery,
          p_normalized: normalized,
          p_result_count: 0,
          p_surface: surface,
        });
      } catch {
        // 로깅 실패는 조용히 무시 — 검색 UX를 막을 이유가 없다
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [surface, rawQuery, normalized, resultCount]);
}
