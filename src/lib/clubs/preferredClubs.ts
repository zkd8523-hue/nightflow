import { createClient } from "@/lib/supabase/client";
import type { PreferredClubItem, ClubLite } from "@/types/database";

/**
 * 유저의 선호 클럽(실제 pinned)을 피커 항목으로 로드.
 * 위시(미등록 클럽)는 영업 리드(club_requests, append-only)라 프리필하지 않음.
 */
export async function loadPreferredClubs(userId: string): Promise<PreferredClubItem[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("user_pinned_clubs")
    .select("club_id, sort_order, club:clubs(id, name, area, thumbnail_url)")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  const items: PreferredClubItem[] = [];
  for (const row of data ?? []) {
    // supabase 임베드는 to-one도 배열 타입으로 추론 → 런타임은 단일 객체
    const raw = (row as unknown as { club?: ClubLite | ClubLite[] }).club;
    const club = Array.isArray(raw) ? raw[0] : raw;
    if (club) items.push({ kind: "club", club });
  }
  return items;
}

/**
 * 선호 클럽 저장.
 *  - 실제 클럽: user_pinned_clubs 전체 교체(프로필 표시)
 *  - 위시(미등록 클럽): 기존 club_requests(Migration 212, 영업 리드)에 INSERT.
 *    본인 기존 요청과 이름(lower) 중복만 제외해 스팸 방지. admin은 /admin/club-requests에서 확인.
 */
export async function savePreferredClubs(
  userId: string,
  items: PreferredClubItem[],
): Promise<{ error: string | null }> {
  const supabase = createClient();

  const clubs = items.filter((i): i is Extract<PreferredClubItem, { kind: "club" }> => i.kind === "club");
  const wishes = items.filter((i): i is Extract<PreferredClubItem, { kind: "wish" }> => i.kind === "wish");

  // 1) 실제 클럽: 전체 교체
  const { error: delPinErr } = await supabase.from("user_pinned_clubs").delete().eq("user_id", userId);
  if (delPinErr) return { error: delPinErr.message };
  if (clubs.length > 0) {
    const rows = clubs.map((c, idx) => ({ user_id: userId, club_id: c.club.id, sort_order: idx }));
    const { error: insPinErr } = await supabase.from("user_pinned_clubs").insert(rows);
    if (insPinErr) return { error: insPinErr.message };
  }

  // 2) 위시 → club_requests (영업 리드). 본인 기존 요청과 이름 중복 제외.
  if (wishes.length > 0) {
    const { data: existing } = await supabase
      .from("club_requests")
      .select("club_name")
      .eq("user_id", userId);
    const existingLower = new Set(
      (existing ?? []).map((r) => (r as { club_name: string }).club_name.trim().toLowerCase()),
    );
    const toInsert = wishes
      .filter((w) => !existingLower.has(w.name.trim().toLowerCase()))
      .map((w) => ({ user_id: userId, club_name: w.name.trim(), area: w.area }));
    if (toInsert.length > 0) {
      const { error: insWishErr } = await supabase.from("club_requests").insert(toInsert);
      if (insWishErr) return { error: insWishErr.message };
    }
  }

  return { error: null };
}
