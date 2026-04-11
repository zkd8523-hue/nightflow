import type { SupabaseClient } from "@supabase/supabase-js";

// 탭 세션 전체 dedupe: close_auction RPC 중복 호출 방지
// (useRef는 컴포넌트 언마운트 시 초기화되므로 페이지 이동 간 dedupe 불가)
const closedAuctionIds = new Set<string>();

export async function closeExpiredAuction(
  auctionId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  if (closedAuctionIds.has(auctionId)) return false;
  closedAuctionIds.add(auctionId);

  const { error } = await supabase.rpc("close_auction", { p_auction_id: auctionId });
  if (error) {
    // cron이 먼저 처리했거나 이미 종료 — 정상 케이스
    console.debug(`[close_auction] ${auctionId}: ${error.message}`);
    return false;
  }
  return true;
}

export async function closeExpiredAuctions(
  auctionIds: string[],
  supabase: SupabaseClient
): Promise<string[]> {
  const closed: string[] = [];
  for (const id of auctionIds) {
    const ok = await closeExpiredAuction(id, supabase);
    if (ok) closed.push(id);
  }
  return closed;
}
