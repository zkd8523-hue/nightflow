import { createClient } from "@/lib/supabase/client";

/**
 * 파트너 MD/admin이 클럽의 tags / operating_hours 를 즉시 수정.
 * - 화이트리스트 필드만 변경 (다른 필드는 admin 전용)
 * - 변경 시 자동으로 club_change_log에 기록 (트리거)
 */
export async function updateClubPartnerFields(
  clubId: string,
  payload: {
    tags?: string[];
    operating_hours?: string | null;
    dresscode?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_club_partner_fields", {
    p_club_id: clubId,
    p_tags: payload.tags ?? null,
    p_operating_hours: payload.operating_hours ?? null,
    p_dresscode: payload.dresscode ?? null,
  });
  if (error) {
    return { success: false, error: error.message };
  }
  const result = data as { success: boolean; error?: string };
  return result;
}
