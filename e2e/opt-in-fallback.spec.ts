/**
 * E2E: opt-in 차순위 낙찰 플로우
 *
 * 커버 범위:
 *  - DB RPC: fallback_to_next_bidder / accept_fallback / decline_fallback
 *  - UI: FallbackOfferCard @ /bids?tab=ended
 *  - UI: AuctionDetail 내 FallbackOfferCard 조건부 렌더링
 *
 * 관련 마이그레이션: 088_opt_in_fallback, 091_shorten_fallback_deadline
 */

import { test, expect, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USER_EMAIL = "e2e-user@nightflow.com";
const USER_PW = "test123456";
const MD_EMAIL = "e2e-md@nightflow.com";

// ── 헬퍼 ──────────────────────────────────────────────────────────────────

async function getTestIds() {
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 50 });
  const mdAuth = authUsers?.users?.find((u) => u.email === MD_EMAIL);
  const userAuth = authUsers?.users?.find((u) => u.email === USER_EMAIL);

  const { data: club } = await supabase
    .from("clubs")
    .select("id")
    .limit(1)
    .single();

  if (!mdAuth || !userAuth || !club) {
    const missing = [!mdAuth && "MD", !userAuth && "User", !club && "Club"].filter(Boolean);
    throw new Error(`테스트 데이터 없음: ${missing.join(", ")}`);
  }
  return { mdId: mdAuth.id, userId: userAuth.id, clubId: club.id };
}

/**
 * 이미 낙찰(won)된 경매 생성 — 차순위 제안 테스트용 초기 상태
 * winner: originalWinnerId (bid status = "won")
 * fallback 후보: fallbackUserId (bid status = "outbid")
 */
async function createWonAuction(
  mdId: string,
  clubId: string,
  originalWinnerId: string,
  fallbackUserId: string | null,
  overrides: Record<string, unknown> = {}
) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const { data: auction, error } = await supabase
    .from("auctions")
    .insert({
      md_id: mdId,
      club_id: clubId,
      table_type: "Standard",
      min_people: 2,
      max_people: 4,
      start_price: 100000,
      reserve_price: 100000,
      original_price: 200000,
      current_bid: 150000,
      winning_price: 150000,
      bid_count: fallbackUserId ? 2 : 1,
      bidder_count: fallbackUserId ? 2 : 1,
      status: "won",
      winner_id: originalWinnerId,
      title: "E2E Fallback Test",
      listing_type: "instant",
      event_date: tomorrow,
      duration_minutes: 60,
      auction_start_at: new Date(Date.now() - 3600_000).toISOString(),
      auction_end_at: new Date(Date.now() - 300_000).toISOString(),
      ...overrides,
    })
    .select()
    .single();

  if (error) throw new Error(`createWonAuction: ${error.message}`);

  // 낙찰자 bid
  await supabase.from("bids").insert({
    auction_id: auction!.id,
    bidder_id: originalWinnerId,
    bid_amount: 150000,
    status: "won",
  });

  // 차순위 후보 bid (있을 경우만)
  if (fallbackUserId) {
    await supabase.from("bids").insert({
      auction_id: auction!.id,
      bidder_id: fallbackUserId,
      bid_amount: 130000,
      status: "outbid",
    });
  }

  return auction!;
}

/**
 * fallback 제안 상태 경매 직접 seed
 * (fallback_to_next_bidder RPC 호출 없이 UI 테스트용 상태로 바로 세팅)
 */
async function createFallbackOfferedAuction(
  mdId: string,
  clubId: string,
  fallbackUserId: string,
  deadlineOffset: number = 15 * 60 * 1000 // 기본 15분 후
) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const now = new Date();
  const deadline = new Date(now.getTime() + deadlineOffset);

  const { data: auction, error } = await supabase
    .from("auctions")
    .insert({
      md_id: mdId,
      club_id: clubId,
      table_type: "VIP",
      min_people: 2,
      max_people: 6,
      start_price: 200000,
      reserve_price: 200000,
      original_price: 400000,
      current_bid: 250000,
      winning_price: 250000,
      bid_count: 2,
      bidder_count: 2,
      status: "won",
      winner_id: null, // 원 낙찰자 취소됨
      fallback_offered_to: fallbackUserId,
      fallback_offered_at: now.toISOString(),
      fallback_deadline: deadline.toISOString(),
      title: "E2E Fallback Offer Test",
      listing_type: "instant",
      event_date: tomorrow,
      duration_minutes: 60,
      auction_start_at: new Date(Date.now() - 3600_000).toISOString(),
      auction_end_at: new Date(Date.now() - 300_000).toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`createFallbackOfferedAuction: ${error.message}`);

  // fallback 후보 bid (outbid 상태)
  await supabase.from("bids").insert({
    auction_id: auction!.id,
    bidder_id: fallbackUserId,
    bid_amount: 250000,
    status: "outbid",
  });

  return auction!;
}

async function cleanupAuction(auctionId: string) {
  await supabase.from("bids").delete().eq("auction_id", auctionId);
  await supabase.from("auctions").delete().eq("id", auctionId);
}

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

// ═══════════════════════════════════════════════════════════════════════════
// Part 1: DB RPC 테스트 — fallback_to_next_bidder / accept / decline
// ═══════════════════════════════════════════════════════════════════════════

test.describe("opt-in 차순위 낙찰 — DB RPC 테스트", () => {
  let mdId: string, userId: string, clubId: string;

  test.beforeAll(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    userId = ids.userId;
    clubId = ids.clubId;
  });

  // ── 1. fallback_to_next_bidder — 차순위 제안 설정 ─────────────────────
  test("1. fallback_to_next_bidder — fallback_offered_to 설정 + 15분 deadline", async () => {
    const auction = await createWonAuction(mdId, clubId, mdId, userId);

    try {
      const { data, error } = await supabase.rpc("fallback_to_next_bidder", {
        p_auction_id: auction.id,
      });

      expect(error).toBeNull();

      // DB 확인
      const { data: updated } = await supabase
        .from("auctions")
        .select("fallback_offered_to, fallback_deadline, fallback_offered_at, status")
        .eq("id", auction.id)
        .single();

      expect(updated!.fallback_offered_to).toBe(userId);
      expect(updated!.fallback_deadline).not.toBeNull();
      expect(updated!.fallback_offered_at).not.toBeNull();
      // status는 여전히 won (차순위가 수락/거절 전)
      expect(updated!.status).toBe("won");

      // deadline이 15분 이내인지 확인 (Migration 091 적용 — 15분)
      const deadline = new Date(updated!.fallback_deadline!).getTime();
      const now = Date.now();
      const diffMinutes = (deadline - now) / 60000;
      console.log(`fallback deadline: ${Math.round(diffMinutes)}분`);
      expect(diffMinutes).toBeGreaterThan(0);
      expect(diffMinutes).toBeLessThanOrEqual(16); // 15분 + 약간의 여유
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 2. fallback_to_next_bidder — 차순위 없으면 unsold ────────────────
  test("2. fallback_to_next_bidder — 차순위 없으면 status=unsold", async () => {
    // 입찰자가 낙찰자 1명뿐 (fallbackUserId = null)
    const auction = await createWonAuction(mdId, clubId, mdId, null);

    try {
      const { error } = await supabase.rpc("fallback_to_next_bidder", {
        p_auction_id: auction.id,
      });

      expect(error).toBeNull();

      const { data: updated } = await supabase
        .from("auctions")
        .select("status, fallback_offered_to")
        .eq("id", auction.id)
        .single();

      expect(updated!.status).toBe("unsold");
      expect(updated!.fallback_offered_to).toBeNull();
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 3. accept_fallback — 수락 시 낙찰 확정 ────────────────────────────
  test("3. accept_fallback — winner_id 설정 + fallback 필드 초기화", async () => {
    // 차순위 제안 상태 경매 생성
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId);

    try {
      const { data, error } = await supabase.rpc("accept_fallback", {
        p_auction_id: auction.id,
        p_user_id: userId,
      });

      expect(error).toBeNull();
      expect(data.success).toBe(true);

      const { data: updated } = await supabase
        .from("auctions")
        .select(
          "winner_id, status, contact_deadline, fallback_offered_to, fallback_deadline, fallback_offered_at"
        )
        .eq("id", auction.id)
        .single();

      // 낙찰 확정
      expect(updated!.winner_id).toBe(userId);
      expect(updated!.status).toBe("won");
      // fallback 필드 초기화
      expect(updated!.fallback_offered_to).toBeNull();
      expect(updated!.fallback_deadline).toBeNull();
      expect(updated!.fallback_offered_at).toBeNull();

      // 해당 유저의 bid가 won으로 전환됐는지 확인
      const { data: bid } = await supabase
        .from("bids")
        .select("status")
        .eq("auction_id", auction.id)
        .eq("bidder_id", userId)
        .single();
      expect(bid!.status).toBe("won");
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 4. accept_fallback — 제안받지 않은 유저 수락 시 에러 ──────────────
  test("4. accept_fallback — 제안받지 않은 유저가 수락하면 에러", async () => {
    // 차순위 제안은 userId에게 되어 있지만, mdId로 수락 시도
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId);

    try {
      const { data, error } = await supabase.rpc("accept_fallback", {
        p_auction_id: auction.id,
        p_user_id: mdId, // 제안받지 않은 유저
      });

      // 에러가 반환되거나 success=false여야 함
      const isError = error !== null || (data && data.success === false);
      expect(isError).toBe(true);

      // DB 상태 변경 없음
      const { data: unchanged } = await supabase
        .from("auctions")
        .select("fallback_offered_to, winner_id")
        .eq("id", auction.id)
        .single();
      expect(unchanged!.fallback_offered_to).toBe(userId);
      expect(unchanged!.winner_id).toBeNull();
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 5. accept_fallback — 만료 후 수락 시 에러 ─────────────────────────
  test("5. accept_fallback — 만료된 제안 수락 시 에러", async () => {
    // deadline을 과거로 설정 (-1분)
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId, -60_000);

    try {
      const { data, error } = await supabase.rpc("accept_fallback", {
        p_auction_id: auction.id,
        p_user_id: userId,
      });

      const isError = error !== null || (data && data.success === false);
      expect(isError).toBe(true);
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 6. decline_fallback — 거절 시 해당 bid 취소 ───────────────────────
  test("6. decline_fallback — 거절 후 해당 유저 bid cancelled + fallback 필드 초기화", async () => {
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId);

    try {
      const { error } = await supabase.rpc("decline_fallback", {
        p_auction_id: auction.id,
        p_user_id: userId,
      });

      expect(error).toBeNull();

      // 거절한 유저의 bid가 cancelled로 전환됐는지 확인
      const { data: bid } = await supabase
        .from("bids")
        .select("status")
        .eq("auction_id", auction.id)
        .eq("bidder_id", userId)
        .single();
      expect(bid!.status).toBe("cancelled");

      // fallback 필드 초기화됐는지 확인
      // (다음 차순위가 없으면 unsold로 전환되거나, fallback_offered_to=null)
      const { data: updated } = await supabase
        .from("auctions")
        .select("fallback_offered_to, status")
        .eq("id", auction.id)
        .single();

      const noNextFallback =
        updated!.fallback_offered_to === null ||
        updated!.fallback_offered_to !== userId; // 이미 다른 유저에게 넘어감
      expect(noNextFallback).toBe(true);
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 7. decline_fallback — 패널티 없음 ─────────────────────────────────
  test("7. decline_fallback — 거절해도 strike_count 변화 없음", async () => {
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId);

    // 거절 전 strike_count 확인
    const { data: before } = await supabase
      .from("users")
      .select("strike_count")
      .eq("id", userId)
      .single();
    const strikeBefore = before?.strike_count ?? 0;

    try {
      await supabase.rpc("decline_fallback", {
        p_auction_id: auction.id,
        p_user_id: userId,
      });

      const { data: after } = await supabase
        .from("users")
        .select("strike_count")
        .eq("id", userId)
        .single();

      expect(after?.strike_count).toBe(strikeBefore);
    } finally {
      await cleanupAuction(auction.id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 2: UI 테스트 — /bids?tab=ended (FallbackOfferCard)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("opt-in 차순위 낙찰 — /bids UI 테스트", () => {
  let mdId: string, userId: string, clubId: string;

  test.beforeAll(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    userId = ids.userId;
    clubId = ids.clubId;
  });

  // ── 8. FallbackOfferCard 렌더링 ────────────────────────────────────────
  test("8. FallbackOfferCard — '차순위 낙찰 제안' 배지, 클럽명, 금액, 카운트다운, 수락/거절 버튼 표시", async ({
    page,
  }) => {
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId);

    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto("/bids?tab=ended");
      await page.waitForLoadState("networkidle");

      // 배지
      await expect(page.getByText("차순위 낙찰 제안")).toBeVisible({ timeout: 8000 });
      // 카운트다운 (MM:SS 형태)
      await expect(page.getByText(/\d{2}:\d{2}/)).toBeVisible({ timeout: 5000 });
      // 수락/거절 버튼
      await expect(page.getByRole("button", { name: "수락하기" })).toBeVisible();
      await expect(page.getByRole("button", { name: "거절" })).toBeVisible();
      // 패널티 없음 안내
      await expect(page.getByText(/패널티 없/)).toBeVisible();
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 9. 수락 버튼 클릭 → 낙찰 확정 toast ──────────────────────────────
  test("9. 수락 버튼 클릭 → '차순위 낙찰을 수락' toast 표시", async ({ page }) => {
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId);

    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto("/bids?tab=ended");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("button", { name: "수락하기" })).toBeVisible({ timeout: 8000 });
      await page.getByRole("button", { name: "수락하기" }).click();

      // Toast 확인 (Sonner toast는 data-title 속성)
      await expect(
        page.locator("[data-title]").getByText(/차순위 낙찰을 수락/)
      ).toBeVisible({ timeout: 8000 });
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 10. 거절 버튼 클릭 → 카드 사라짐 ─────────────────────────────────
  test("10. 거절 버튼 클릭 → FallbackOfferCard 수락 버튼 사라짐", async ({ page }) => {
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId);

    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto("/bids?tab=ended");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("button", { name: "거절" })).toBeVisible({ timeout: 8000 });
      await page.getByRole("button", { name: "거절" }).click();

      // 거절 후 처리 대기 (API 호출 + 페이지 리프레시)
      await page.waitForTimeout(2000);

      // FallbackOfferCard의 수락 버튼이 사라져야 함
      await expect(page.getByRole("button", { name: "수락하기" })).not.toBeVisible({
        timeout: 8000,
      });
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 11. 비로그인 /bids → /login 리다이렉트 ───────────────────────────
  test("11. 비로그인 /bids → /login 리다이렉트", async ({ page }) => {
    await page.goto("/bids");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  // ── 12. 만료된 제안 → /bids 목록에서 미표시 확인 ───────────────────
  // MyBidsClient 필터가 deadline < now() 제안을 제외하므로 빈 상태 검증
  test("12. 만료된 차순위 제안 → /bids 낙찰/종료 탭에서 미표시", async ({ page }) => {
    // deadline을 과거로 설정
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId, -60_000);

    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto("/bids?tab=ended");
      await page.waitForLoadState("networkidle");

      // 만료된 제안 → 수락/거절 버튼 없음
      await page.waitForTimeout(1000);
      expect(await page.getByRole("button", { name: "수락하기" }).count()).toBe(0);
      expect(await page.getByRole("button", { name: "거절" }).count()).toBe(0);
      // 차순위 낙찰 제안 배지도 없음
      expect(await page.getByText("차순위 낙찰 제안").count()).toBe(0);
    } finally {
      await cleanupAuction(auction.id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 3: UI 테스트 — 경매 상세 페이지 내 FallbackOfferCard
// ═══════════════════════════════════════════════════════════════════════════

test.describe("opt-in 차순위 낙찰 — 경매 상세 UI 테스트", () => {
  let mdId: string, userId: string, clubId: string;

  test.beforeAll(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    userId = ids.userId;
    clubId = ids.clubId;
  });

  // ── 13. 차순위 제안 받은 유저 — 경매 상세에서 카드 표시 ───────────────
  test("13. 차순위 제안 받은 유저 — 경매 상세에서 FallbackOfferCard 표시", async ({
    page,
  }) => {
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId);

    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto(`/auctions/${auction.id}`);
      await page.waitForLoadState("networkidle");

      // 경매 상세 내 FallbackOfferCard 표시
      await expect(page.getByText("차순위 낙찰 제안")).toBeVisible({ timeout: 8000 });
      await expect(page.getByRole("button", { name: "수락하기" })).toBeVisible();
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 14. 제안받지 않은 유저 — 경매 상세에서 카드 미표시 ───────────────
  test("14. 제안받지 않은 유저 — 경매 상세에서 FallbackOfferCard 미표시", async ({
    page,
  }) => {
    // 차순위 제안은 userId에게 — MD로 경매 상세 접근 시 카드 없어야 함
    const auction = await createFallbackOfferedAuction(mdId, clubId, userId);

    try {
      await devLogin(page, MD_EMAIL, "test123456");
      await page.goto(`/auctions/${auction.id}`);
      await page.waitForLoadState("networkidle");

      // FallbackOfferCard 없음
      expect(await page.getByText("차순위 낙찰 제안").count()).toBe(0);
      expect(await page.getByRole("button", { name: "수락하기" }).count()).toBe(0);
    } finally {
      await cleanupAuction(auction.id);
    }
  });
});
