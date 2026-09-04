"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * DJ 별칭(dj_aliases) 지연 로드 — 포스터 표기가 여러 개인 DJ("DJ BERMUDA" /
 * "버뮤다")를 어느 표기로 검색해도 찾히게 한다.
 *
 * 왜 SSR이 아니라 여기인가:
 *   별칭은 검색 매칭에만 쓰이고 화면에는 한 글자도 안 그려진다. 그런데 서버에서
 *   받으면 메인 라인업 쿼리 결과(=DJ id 목록)를 기다렸다 실행되는 순차 2단계가
 *   되고, id 381개를 URL에 나열하느라 요청 URL이 14KB까지 부푼다. 첫 화면에
 *   필요 없는 왕복을 SSR 블로킹에 넣는 셈이라 검색창을 열 때로 미룬다.
 *
 * `enabled`가 true가 되는 첫 순간에 한 번만 받고 계속 들고 있는다 — 검색창을
 * 접었다 펴는 건 흔한 동작이라 그때마다 다시 받을 이유가 없다.
 *
 * 도착 전에는 빈 맵을 돌려준다. 별칭은 검색 결과를 "넓히는" 재료라, 없으면
 * 표기명·인스타 핸들로만 매칭될 뿐 검색 자체는 정상 동작한다.
 */
export function useDjAliases(
  djIds: string[],
  enabled: boolean
): Record<string, string[]> {
  const [aliases, setAliases] = useState<Record<string, string[]>>({});
  // 배열 정체성은 매 렌더 바뀌므로 내용으로 비교한다(useLineupLikes와 같은 규약).
  const signature = djIds.join(",");

  useEffect(() => {
    if (!enabled || djIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("dj_aliases")
        .select("dj_id, alias")
        .in("dj_id", djIds);
      if (cancelled || error || !data) return;
      const next: Record<string, string[]> = {};
      for (const a of data as Array<{ dj_id: string; alias: string }>) {
        (next[a.dj_id] ??= []).push(a.alias);
      }
      setAliases(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled]);

  return aliases;
}
