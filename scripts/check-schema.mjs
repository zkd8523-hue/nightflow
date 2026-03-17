import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://ihqztsakxczzsxfvdkpq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocXp0c2FreGN6enN4ZnZka3BxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQyODcxMiwiZXhwIjoyMDg3MDA0NzEyfQ.gUwTJIo6jHe52rLq_NQh121JUnXXfzDJcPYWaZFsYrY"
);

async function check() {
  // 1. users 컬럼 확인
  const { data: u, error: ue } = await sb.from("users").select("*").limit(1);
  console.log("=== users ===");
  if (ue) console.log("Error:", ue.message);
  else if (u && u.length > 0) console.log("Columns:", Object.keys(u[0]).join(", "));
  else console.log("Table empty, trying insert...");

  // 빈 테이블이면 더미 insert로 컬럼 확인
  if (!u || u.length === 0) {
    const { error: ie } = await sb.from("users").insert({
      role: "user", kakao_id: "test_check", name: "test", phone: "010-0000-0000"
    }).select("*");
    console.log("Insert test:", ie ? ie.message : "OK");
  }

  // 2. auctions 컬럼
  const { data: a } = await sb.from("auctions").select("*").limit(1);
  console.log("\n=== auctions ===");
  if (a && a.length > 0) console.log("Columns:", Object.keys(a[0]).join(", "));
  else console.log("Table empty");

  // 3. RPC 함수
  console.log("\n=== RPC functions ===");
  const { error: e1 } = await sb.rpc("place_bid", {
    p_auction_id: "00000000-0000-0000-0000-000000000001",
    p_bidder_id: "00000000-0000-0000-0000-000000000002",
    p_bid_amount: 100
  });
  console.log("place_bid:", e1 ? e1.message : "exists");

  const { error: e2 } = await sb.rpc("close_auction", {
    p_auction_id: "00000000-0000-0000-0000-000000000001"
  });
  console.log("close_auction:", e2 ? e2.message : "exists");

  // 4. Row counts
  console.log("\n=== Row counts ===");
  for (const t of ["users", "clubs", "auctions", "bids", "transactions", "auction_templates", "md_vip_users"]) {
    const { count } = await sb.from(t).select("id", { count: "exact", head: true });
    console.log(`${t}: ${count} rows`);
  }

  // 5. 기존 유저 확인
  const { data: existingUsers } = await sb.from("users").select("id, name, role, kakao_id").limit(5);
  console.log("\n=== Existing users ===");
  console.log(JSON.stringify(existingUsers, null, 2));
}

check();
