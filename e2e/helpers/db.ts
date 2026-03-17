import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 테스트 경매 데이터 생성 (service role로 RLS 우회)
 */
export async function createTestAuction(mdId: string, clubId: string, overrides = {}) {
  const { data, error } = await supabase
    .from("auctions")
    .insert({
      md_id: mdId,
      club_id: clubId,
      table_type: "Standard",
      min_people: 2,
      max_people: 4,
      start_price: 100000,
      current_bid: 100000,
      status: "active",
      auction_start_at: new Date().toISOString(),
      auction_end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ...overrides,
    })
    .select()
    .single();

  if (error) throw new Error(`createTestAuction failed: ${error.message}`);
  return data;
}

/**
 * 테스트 데이터 정리
 */
export async function cleanupAuction(auctionId: string) {
  await supabase.from("bids").delete().eq("auction_id", auctionId);
  await supabase.from("auctions").delete().eq("id", auctionId);
}
