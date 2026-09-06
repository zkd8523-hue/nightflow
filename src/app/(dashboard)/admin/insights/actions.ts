"use server";

import { createClient } from "@/lib/supabase/server";

export interface JourneyEvent {
  event_name: string;
  path: string | null;
  created_at: string;
  session_id: string | null;
  properties: Record<string, unknown> | null;
}

/**
 * 한 방문자(anon_id)의 이벤트를 시간순으로 전부 가져온다 — 외국인 방문자
 * 목록(foreign_visitor_list)에서 한 명을 눌렀을 때 저니를 펼치는 용도.
 *
 * 목록 뷰에 저니를 미리 붙이면 300명 × 수십 이벤트를 매번 다 내려받아야
 * 해서, 클릭한 사람 것만 그때 조회한다. admin 검증은 RLS(user_events는
 * admin만 SELECT)가 맡지만, 여기서도 한 번 더 막는다 — 서버 액션은 URL로
 * 직접 호출될 수 있어서 페이지 가드만으로는 부족하다.
 */
export async function fetchVisitorJourney(anonId: string): Promise<JourneyEvent[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (ud?.role !== "admin") return [];

  const { data } = await supabase
    .from("user_events")
    .select("event_name, path, created_at, session_id, properties")
    .eq("anon_id", anonId)
    .order("created_at", { ascending: true })
    .limit(500);

  return (data ?? []) as JourneyEvent[];
}
