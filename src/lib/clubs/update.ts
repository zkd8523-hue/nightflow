import { createClient } from "@/lib/supabase/client";

/**
 * 파트너 MD/admin이 클럽의 화이트리스트 필드를 즉시 수정.
 * - tags / operating_hours / dresscode / drink_menu_urls(가격표) / floor_plan_urls(테이블맵)
 * - 그 외 필드는 admin 전용
 * - 각 필드 undefined → 미변경(기존 유지), 빈 배열 → 전체 삭제
 * - 변경 시 자동으로 club_change_log에 기록 (트리거)
 */
export async function updateClubPartnerFields(
  clubId: string,
  payload: {
    tags?: string[];
    operating_hours?: string | null;
    dresscode?: string | null;
    drink_menu_urls?: string[] | null;
    floor_plan_urls?: string[] | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_club_partner_fields", {
    p_club_id: clubId,
    p_tags: payload.tags ?? null,
    p_operating_hours: payload.operating_hours ?? null,
    p_dresscode: payload.dresscode ?? null,
    p_drink_menu_urls: payload.drink_menu_urls ?? null,
    p_floor_plan_urls: payload.floor_plan_urls ?? null,
  });
  if (error) {
    return { success: false, error: error.message };
  }
  const result = data as { success: boolean; error?: string };
  return result;
}
