/**
 * NightFlow E2E 테스트 스크립트
 * 실제 Supabase DB에 연결해서 핵심 플로우를 테스트합니다.
 *
 * 테스트 항목:
 * 1. 테이블 존재 여부
 * 2. 테스트 유저/클럽/경매 생성
 * 3. 입찰 (place_bid RPC)
 * 4. 재입찰 (outbid 처리)
 * 5. 경매 종료 (close_auction RPC)
 * 6. 즉시 낙찰 (Buy-it-Now)
 * 7. 데이터 정리
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ihqztsakxczzsxfvdkpq.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocXp0c2FreGN6enN4ZnZka3BxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQyODcxMiwiZXhwIjoyMDg3MDA0NzEyfQ.gUwTJIo6jHe52rLq_NQh121JUnXXfzDJcPYWaZFsYrY";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let testMdId, testUserId, testUser2Id, testClubId, testAuctionId, testBinAuctionId;

const log = (emoji, msg) => console.log(`${emoji} ${msg}`);
const pass = (msg) => log("✅", msg);
const fail = (msg) => log("❌", msg);
const info = (msg) => log("📋", msg);
const divider = () => console.log("\n" + "=".repeat(50));

async function cleanup() {
  info("테스트 데이터 정리 중...");
  // 역순으로 삭제 (FK 의존성)
  if (testBinAuctionId) {
    await supabase.from("transactions").delete().eq("auction_id", testBinAuctionId);
    await supabase.from("bids").delete().eq("auction_id", testBinAuctionId);
    await supabase.from("auctions").delete().eq("id", testBinAuctionId);
  }
  if (testAuctionId) {
    await supabase.from("transactions").delete().eq("auction_id", testAuctionId);
    await supabase.from("bids").delete().eq("auction_id", testAuctionId);
    await supabase.from("auctions").delete().eq("id", testAuctionId);
  }
  if (testClubId) await supabase.from("clubs").delete().eq("id", testClubId);
  if (testUser2Id) await supabase.from("users").delete().eq("id", testUser2Id);
  if (testUserId) await supabase.from("users").delete().eq("id", testUserId);
  if (testMdId) await supabase.from("users").delete().eq("id", testMdId);
  pass("테스트 데이터 정리 완료");
}

// ============================================
// 테스트 1: 테이블 존재 확인
// ============================================
async function testTablesExist() {
  divider();
  info("TEST 1: 테이블 존재 확인");

  const tables = ["users", "clubs", "auctions", "bids", "transactions", "auction_templates", "md_vip_users"];
  let allExist = true;

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(0);
    if (error) {
      fail(`${table} 테이블 접근 실패: ${error.message}`);
      allExist = false;
    } else {
      pass(`${table} 테이블 OK`);
    }
  }

  return allExist;
}

// ============================================
// 테스트 2: 테스트 데이터 생성
// ============================================
async function testCreateData() {
  divider();
  info("TEST 2: 테스트 데이터 생성");

  // MD 유저
  const { data: md, error: mdErr } = await supabase.from("users").insert({
    role: "md", kakao_id: "test_md_e2e_" + Date.now(), name: "테스트MD",
    phone: "010-0000-0001", md_status: "approved",
    md_unique_slug: "test-md-" + Date.now()
  }).select("id").single();
  if (mdErr) { fail(`MD 생성 실패: ${mdErr.message}`); return false; }
  testMdId = md.id;
  pass(`MD 생성: ${testMdId}`);

  // 일반 유저 1
  const { data: user1, error: u1Err } = await supabase.from("users").insert({
    role: "user", kakao_id: "test_user1_e2e_" + Date.now(), name: "테스트유저1",
    phone: "010-0000-0002"
  }).select("id").single();
  if (u1Err) { fail(`유저1 생성 실패: ${u1Err.message}`); return false; }
  testUserId = user1.id;
  pass(`유저1 생성: ${testUserId}`);

  // 일반 유저 2
  const { data: user2, error: u2Err } = await supabase.from("users").insert({
    role: "user", kakao_id: "test_user2_e2e_" + Date.now(), name: "테스트유저2",
    phone: "010-0000-0003"
  }).select("id").single();
  if (u2Err) { fail(`유저2 생성 실패: ${u2Err.message}`); return false; }
  testUser2Id = user2.id;
  pass(`유저2 생성: ${testUser2Id}`);

  // 클럽
  const { data: club, error: clubErr } = await supabase.from("clubs").insert({
    md_id: testMdId, name: "E2E 테스트클럽", address: "서울시 강남구", area: "강남"
  }).select("id").single();
  if (clubErr) { fail(`클럽 생성 실패: ${clubErr.message}`); return false; }
  testClubId = club.id;
  pass(`클럽 생성: ${testClubId}`);

  // 경매 (1시간 후 마감)
  const now = new Date();
  const startAt = new Date(now.getTime() - 10 * 60000).toISOString(); // 10분 전 시작
  const endAt = new Date(now.getTime() + 60 * 60000).toISOString();   // 1시간 후 종료

  const { data: auction, error: auctionErr } = await supabase.from("auctions").insert({
    md_id: testMdId, club_id: testClubId,
    title: "E2E 테스트 경매", event_date: "2026-03-01",
    table_type: "VIP", min_people: 4,
    includes: ["보드카 1병", "믹서"],
    original_price: 500000, start_price: 200000, reserve_price: 150000,
    current_bid: 0, bid_increment: 10000, bid_count: 0, bidder_count: 0,
    status: "active", auction_start_at: startAt, auction_end_at: endAt,
    auto_extend_min: 5, duration_minutes: 70
  }).select("id").single();
  if (auctionErr) { fail(`경매 생성 실패: ${auctionErr.message}`); return false; }
  testAuctionId = auction.id;
  pass(`경매 생성: ${testAuctionId}`);

  return true;
}

// ============================================
// 테스트 3: 입찰 (place_bid)
// ============================================
async function testBidding() {
  divider();
  info("TEST 3: 입찰 테스트 (place_bid RPC)");

  // 유저1 첫 입찰 200,000원
  const { data: bid1, error: bid1Err } = await supabase.rpc("place_bid", {
    p_auction_id: testAuctionId, p_bidder_id: testUserId, p_bid_amount: 200000
  });
  if (bid1Err) { fail(`유저1 입찰 실패: ${bid1Err.message}`); return false; }
  pass(`유저1 입찰 성공: ${JSON.stringify(bid1)}`);

  // 경매 상태 확인
  const { data: auction1 } = await supabase.from("auctions")
    .select("current_bid, bid_count, bidder_count")
    .eq("id", testAuctionId).single();
  if (auction1.current_bid !== 200000) { fail(`현재가 불일치: expected 200000, got ${auction1.current_bid}`); return false; }
  if (auction1.bid_count !== 1) { fail(`입찰수 불일치: expected 1, got ${auction1.bid_count}`); return false; }
  pass(`경매 상태: 현재가=${auction1.current_bid}, 입찰수=${auction1.bid_count}, 참여자=${auction1.bidder_count}`);

  return true;
}

// ============================================
// 테스트 4: 재입찰 + outbid 처리
// ============================================
async function testRebidding() {
  divider();
  info("TEST 4: 재입찰 + outbid 처리");

  // 유저2가 더 높은 금액으로 입찰
  const { data: bid2, error: bid2Err } = await supabase.rpc("place_bid", {
    p_auction_id: testAuctionId, p_bidder_id: testUser2Id, p_bid_amount: 210000
  });
  if (bid2Err) { fail(`유저2 입찰 실패: ${bid2Err.message}`); return false; }
  pass(`유저2 입찰 성공: 210,000원`);

  // 유저1의 이전 입찰이 outbid 상태인지 확인
  const { data: user1Bids } = await supabase.from("bids")
    .select("status, bid_amount")
    .eq("auction_id", testAuctionId)
    .eq("bidder_id", testUserId);

  const outbidBid = user1Bids?.find(b => b.status === "outbid");
  if (!outbidBid) { fail("유저1 입찰이 outbid 처리되지 않음"); return false; }
  pass(`유저1 입찰 outbid 확인: ${outbidBid.bid_amount}원 → status=${outbidBid.status}`);

  // 유저1이 다시 더 높은 금액으로 재입찰
  const { data: bid3, error: bid3Err } = await supabase.rpc("place_bid", {
    p_auction_id: testAuctionId, p_bidder_id: testUserId, p_bid_amount: 230000
  });
  if (bid3Err) { fail(`유저1 재입찰 실패: ${bid3Err.message}`); return false; }
  pass(`유저1 재입찰 성공: 230,000원`);

  // 최종 상태
  const { data: finalAuction } = await supabase.from("auctions")
    .select("current_bid, bid_count, bidder_count")
    .eq("id", testAuctionId).single();
  pass(`최종 상태: 현재가=${finalAuction.current_bid}, 입찰수=${finalAuction.bid_count}, 참여자=${finalAuction.bidder_count}`);

  // 입찰 내역 전체 확인
  const { data: allBids } = await supabase.from("bids")
    .select("bidder_id, bid_amount, status")
    .eq("auction_id", testAuctionId)
    .order("bid_at", { ascending: false });
  info("입찰 내역:");
  allBids?.forEach(b => {
    const who = b.bidder_id === testUserId ? "유저1" : "유저2";
    console.log(`   ${who}: ${b.bid_amount}원 [${b.status}]`);
  });

  return true;
}

// ============================================
// 테스트 5: 경매 종료 (close_auction)
// ============================================
async function testCloseAuction() {
  divider();
  info("TEST 5: 경매 종료 (close_auction RPC)");

  const { data, error } = await supabase.rpc("close_auction", {
    p_auction_id: testAuctionId
  });
  if (error) { fail(`경매 종료 실패: ${error.message}`); return false; }
  pass(`경매 종료 결과: ${JSON.stringify(data)}`);

  // 경매 상태 확인
  const { data: closedAuction } = await supabase.from("auctions")
    .select("status, winner_id, winning_price, payment_deadline")
    .eq("id", testAuctionId).single();

  if (closedAuction.status !== "won") { fail(`경매 상태 불일치: expected 'won', got '${closedAuction.status}'`); return false; }
  if (closedAuction.winner_id !== testUserId) { fail("낙찰자 불일치"); return false; }
  if (closedAuction.winning_price !== 230000) { fail(`낙찰가 불일치: expected 230000, got ${closedAuction.winning_price}`); return false; }
  pass(`낙찰 확인: winner=${closedAuction.winner_id === testUserId ? "유저1" : "유저2"}, 낙찰가=${closedAuction.winning_price}`);
  pass(`결제 기한: ${closedAuction.payment_deadline}`);

  // 거래 레코드 확인
  const { data: txn } = await supabase.from("transactions")
    .select("*")
    .eq("auction_id", testAuctionId).single();
  if (!txn) { fail("거래 레코드 미생성"); return false; }
  pass(`거래 생성: code=${txn.reservation_code}, 수수료=${txn.md_commission_amt}원 (${txn.md_commission_rate}%)`);

  return true;
}

// ============================================
// 테스트 6: 즉시 낙찰 (Buy-it-Now)
// ============================================
async function testBuyNow() {
  divider();
  info("TEST 6: 즉시 낙찰 (Buy-it-Now)");

  const now = new Date();
  const startAt = new Date(now.getTime() - 5 * 60000).toISOString();
  const endAt = new Date(now.getTime() + 60 * 60000).toISOString();

  // BIN 경매 생성 (buy_now_price = 450,000, start_price = 200,000)
  const { data: binAuction, error: binErr } = await supabase.from("auctions").insert({
    md_id: testMdId, club_id: testClubId,
    title: "E2E BIN 테스트", event_date: "2026-03-02",
    table_type: "Premium", min_people: 4,
    includes: ["위스키 1병"],
    original_price: 700000, start_price: 200000, reserve_price: 150000,
    current_bid: 0, bid_increment: 10000, bid_count: 0, bidder_count: 0,
    status: "active", auction_start_at: startAt, auction_end_at: endAt,
    auto_extend_min: 5, duration_minutes: 65,
    buy_now_price: 450000
  }).select("id").single();
  if (binErr) { fail(`BIN 경매 생성 실패: ${binErr.message}`); return false; }
  testBinAuctionId = binAuction.id;
  pass(`BIN 경매 생성: ${testBinAuctionId} (즉시낙찰가: 450,000원)`);

  // 유저1이 일반 입찰
  await supabase.rpc("place_bid", {
    p_auction_id: testBinAuctionId, p_bidder_id: testUserId, p_bid_amount: 200000
  });
  pass("유저1 일반 입찰: 200,000원");

  // 유저2가 BIN 가격 이상으로 입찰 → 즉시 낙찰
  const { data: binResult, error: binBidErr } = await supabase.rpc("place_bid", {
    p_auction_id: testBinAuctionId, p_bidder_id: testUser2Id, p_bid_amount: 450000
  });
  if (binBidErr) { fail(`BIN 입찰 실패: ${binBidErr.message}`); return false; }
  pass(`BIN 입찰 결과: ${JSON.stringify(binResult)}`);

  if (!binResult.buy_now) { fail("buy_now 플래그가 true가 아님"); return false; }
  pass("buy_now=true 확인");

  // 경매 상태 즉시 종료 확인
  const { data: binAuctionResult } = await supabase.from("auctions")
    .select("status, winner_id, winning_price")
    .eq("id", testBinAuctionId).single();

  if (binAuctionResult.status !== "won") { fail(`BIN 경매 상태: ${binAuctionResult.status}`); return false; }
  if (binAuctionResult.winner_id !== testUser2Id) { fail("BIN 낙찰자 불일치"); return false; }
  pass(`즉시 낙찰 확인: winner=유저2, 낙찰가=${binAuctionResult.winning_price}`);

  // 거래 레코드 생성 확인
  const { data: binTxn } = await supabase.from("transactions")
    .select("reservation_code, winning_price, md_commission_amt")
    .eq("auction_id", testBinAuctionId).single();
  if (!binTxn) { fail("BIN 거래 레코드 미생성"); return false; }
  pass(`BIN 거래 생성: code=${binTxn.reservation_code}, 수수료=${binTxn.md_commission_amt}원`);

  return true;
}

// ============================================
// 테스트 7: 유효성 검증 (에러 케이스)
// ============================================
async function testValidation() {
  divider();
  info("TEST 7: 유효성 검증 (에러 케이스)");

  // 이미 종료된 경매에 입찰 시도
  const { error: closedErr } = await supabase.rpc("place_bid", {
    p_auction_id: testAuctionId, p_bidder_id: testUser2Id, p_bid_amount: 300000
  });
  if (closedErr) {
    pass(`종료된 경매 입찰 거부: "${closedErr.message}"`);
  } else {
    fail("종료된 경매에 입찰이 성공함 (에러 발생해야 함)");
  }

  // 이미 종료된 경매 재종료 시도
  const { error: reCloseErr } = await supabase.rpc("close_auction", {
    p_auction_id: testAuctionId
  });
  if (reCloseErr) {
    pass(`이미 종료된 경매 재종료 거부: "${reCloseErr.message}"`);
  } else {
    fail("이미 종료된 경매가 재종료됨 (에러 발생해야 함)");
  }

  return true;
}

// ============================================
// 테스트 8: 삭제 테스트
// ============================================
async function testDeletion() {
  divider();
  info("TEST 8: 데이터 삭제 (Cascade) 테스트");

  // 경매 삭제 → bids, transactions 캐스케이드 삭제 확인
  const { error: delErr } = await supabase.from("auctions").delete().eq("id", testAuctionId);
  if (delErr) { fail(`경매 삭제 실패: ${delErr.message}`); return false; }
  pass("경매 삭제 성공");

  // bids 삭제 확인
  const { data: remainingBids } = await supabase.from("bids")
    .select("id").eq("auction_id", testAuctionId);
  if (remainingBids && remainingBids.length > 0) {
    fail(`캐스케이드 삭제 실패: ${remainingBids.length}개 입찰 잔존`);
    return false;
  }
  pass("입찰 캐스케이드 삭제 확인 (bids: 0개)");

  // transactions 삭제 확인
  const { data: remainingTxn } = await supabase.from("transactions")
    .select("id").eq("auction_id", testAuctionId);
  if (remainingTxn && remainingTxn.length > 0) {
    fail(`거래 캐스케이드 삭제 실패: ${remainingTxn.length}개 잔존`);
    return false;
  }
  pass("거래 캐스케이드 삭제 확인 (transactions: 0개)");

  testAuctionId = null; // 이미 삭제됨

  return true;
}

// ============================================
// 실행
// ============================================
async function main() {
  console.log("\n🚀 NightFlow E2E 테스트 시작\n");
  console.log(`📡 Supabase: ${SUPABASE_URL}`);
  console.log(`⏰ 시작 시각: ${new Date().toLocaleString("ko-KR")}`);

  let passed = 0;
  let failed = 0;
  const results = [];

  const tests = [
    { name: "테이블 존재 확인", fn: testTablesExist },
    { name: "테스트 데이터 생성", fn: testCreateData },
    { name: "입찰 (place_bid)", fn: testBidding },
    { name: "재입찰 + outbid", fn: testRebidding },
    { name: "경매 종료 (close_auction)", fn: testCloseAuction },
    { name: "즉시 낙찰 (Buy-it-Now)", fn: testBuyNow },
    { name: "유효성 검증", fn: testValidation },
    { name: "삭제 (Cascade)", fn: testDeletion },
  ];

  for (const test of tests) {
    try {
      const result = await test.fn();
      results.push({ name: test.name, pass: result });
      if (result) passed++; else failed++;
    } catch (err) {
      fail(`${test.name} 예외: ${err.message}`);
      results.push({ name: test.name, pass: false });
      failed++;
    }
  }

  // 정리
  divider();
  await cleanup();

  // 최종 결과
  divider();
  console.log("\n📊 최종 결과\n");
  results.forEach(r => {
    console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
  });
  console.log(`\n  합계: ${passed} passed / ${failed} failed / ${tests.length} total`);
  console.log(`  ${failed === 0 ? "🎉 모든 테스트 통과!" : "⚠️ 실패한 테스트가 있습니다."}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal:", err);
  cleanup().then(() => process.exit(1));
});
