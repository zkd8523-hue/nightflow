import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/utils/logger";

export async function POST() {
  try {
    const supabase = await createClient();

    // 진행 중 + 예정된 경매 목록 조회
    const { data: activeAuctions, error: activeError } = await supabase
      .from("auctions")
      .select(
        `
        *,
        club:clubs(*),
        md:users!auctions_md_id_fkey(id, name, profile_image)
      `
      )
      .in("status", ["active", "scheduled"])
      .order("auction_start_at", { ascending: true })
      .limit(20);

    if (activeError) throw activeError;

    // 완료된 경매 목록 조회 (최근 순서)
    const { data: completedAuctions, error: completedError } = await supabase
      .from("auctions")
      .select(
        `
        *,
        club:clubs(*),
        md:users!auctions_md_id_fkey(id, name, profile_image)
      `
      )
      .in("status", ["won", "unsold", "confirmed"])
      .order("auction_end_at", { ascending: false })
      .limit(20);

    if (completedError) throw completedError;

    return Response.json(
      {
        activeAuctions: activeAuctions || [],
        completedAuctions: completedAuctions || [],
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Refresh API error:", error);
    return Response.json(
      { error: "새로고침 실패" },
      { status: 500 }
    );
  }
}
