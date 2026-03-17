import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/** 경매 테이블 실시간 구독 */
export function subscribeToAuction(
  supabase: SupabaseClient,
  auctionId: string,
  onAuctionUpdate: (payload: Record<string, unknown>) => void,
  onNewBid: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`auction:${auctionId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "auctions",
        filter: `id=eq.${auctionId}`,
      },
      (payload) => onAuctionUpdate(payload.new)
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "bids",
        filter: `auction_id=eq.${auctionId}`,
      },
      (payload) => onNewBid(payload.new)
    )
    .subscribe();

  return channel;
}

/** 전체 경매 목록 실시간 구독 */
export function subscribeToAuctions(
  supabase: SupabaseClient,
  onUpdate: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  const channel = supabase
    .channel("auctions:list")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "auctions",
      },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();

  return channel;
}
