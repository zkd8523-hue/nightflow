import { test, expect, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USER_EMAIL = "e2e-user@nightflow.com";
const USER_PW = "test123456";
const MD_EMAIL = "e2e-md@nightflow.com";

// ── 헬퍼 함수 ──────────────────────────────────────────────────────────

async function getTestIds() {
  // users 테이블에 email 컬럼 없음 → auth.admin에서 조회
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
    throw new Error(`테스트 데이터 없음: ${missing.join(", ")}. MD=${MD_EMAIL}, User=${USER_EMAIL}`);
  }
  return { mdId: mdAuth.id, userId: userAuth.id, clubId: club.id };
}

/** 마감 임박 경매 생성 (endInSeconds초 후 종료) */
async function createNearEndAuction(
  mdId: string,
  clubId: string,
  opts: {
    endInSeconds?: number;
    durationMinutes?: number;
    autoExtendMin?: number;
    maxExtensions?: number;
    startPrice?: number;
  } = {}
) {
  const {
    endInSeconds = 60,
    durationMinutes = 60,
    autoExtendMin,
    maxExtensions = 3,
    startPrice = 100000,
  } = opts;

  const now = new Date();
  const endAt = new Date(now.getTime() + endInSeconds * 1000);
  const startAt = new Date(now.getTime() - durationMinutes * 60 * 1000);

  const insertData: Record<string, unknown> = {
    md_id: mdId,
    club_id: clubId,
    table_type: "Standard",
    min_people: 2,
    max_people: 4,
    start_price: startPrice,
    current_bid: 0,
    bid_count: 0,
    bidder_count: 0,
    bid_increment: 10000,
    status: "active",
    duration_minutes: durationMinutes,
    max_extensions: maxExtensions,
    extension_count: 0,
    auction_start_at: startAt.toISOString(),
    auction_end_at: endAt.toISOString(),
  };

  // auto_extend_min: 명시적 지정 시 사용, 아니면 055 트리거에 맡김
  if (autoExtendMin !== undefined) {
    insertData.auto_extend_min = autoExtendMin;
  }

  const { data, error } = await supabase
    .from("auctions")
    .insert(insertData)
    .select()
    .single();

  if (error) throw new Error(`createNearEndAuction: ${error.message}`);
  return data;
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

// ═══════════════════════════════════════════════════════════════════════
// Part 1: DB 레벨 — place_bid() RPC 직접 호출
// ═══════════════════════════════════════════════════════════════════════

test.describe("스나이핑 방지 — DB RPC 테스트", () => {
  let mdId: string, userId: string, clubId: string;

  test.beforeAll(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    userId = ids.userId;
    clubId = ids.clubId;
  });

  // ── 1. 마감 임박 입찰 시 자동 연장 + extension_count 증가 ──────────
  test("1. 마감 임박 입찰 → 자동 연장 + extension_count 증가", async () => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 60, // 1분 후 마감 (auto_extend_min 이내)
      autoExtendMin: 3,
    });

    try {
      // 입찰
      const { data, error } = await supabase.rpc("place_bid", {
        p_auction_id: auction.id,
        p_bidder_id: userId,
        p_bid_amount: 100000,
      });

      expect(error).toBeNull();
      expect(data.success).toBe(true);
      expect(data.extended).toBe(true);
      expect(data.extension_count).toBe(1);
      expect(data.max_extensions).toBe(3);

      // DB 확인
      const { data: updated } = await supabase
        .from("auctions")
        .select("extension_count, extended_end_at")
        .eq("id", auction.id)
        .single();

      expect(updated!.extension_count).toBe(1);
      expect(updated!.extended_end_at).not.toBeNull();
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 2. max_extensions 도달 시 연장 중단 ────────────────────────────
  test("2. max_extensions(3회) 도달 후 연장 중단", async () => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 60,
      autoExtendMin: 3,
      maxExtensions: 3,
    });

    try {
      // 2명이 교대로 3회 입찰 → 3회 연장 소진
      // 1회차: userId 입찰
      const bid1 = await supabase.rpc("place_bid", {
        p_auction_id: auction.id,
        p_bidder_id: userId,
        p_bid_amount: 100000,
      });
      expect(bid1.data.extended).toBe(true);
      expect(bid1.data.extension_count).toBe(1);

      // 2회차: mdId는 자기 경매라 불가 → service role로 직접 업데이트
      // 대신 extension_count를 직접 2로 설정 (시간 절약)
      await supabase
        .from("auctions")
        .update({
          extension_count: 2,
          extended_end_at: new Date(Date.now() + 60 * 1000).toISOString(),
          current_bid: 110000,
        })
        .eq("id", auction.id);

      // outbid 처리 (다음 입찰 가능하도록)
      await supabase
        .from("bids")
        .update({ status: "outbid" })
        .eq("auction_id", auction.id)
        .eq("status", "active");

      // 3회차: 마지막 연장
      const bid3 = await supabase.rpc("place_bid", {
        p_auction_id: auction.id,
        p_bidder_id: userId,
        p_bid_amount: 120000,
      });
      expect(bid3.data.extended).toBe(true);
      expect(bid3.data.extension_count).toBe(3);

      // outbid 처리
      await supabase
        .from("bids")
        .update({ status: "outbid" })
        .eq("auction_id", auction.id)
        .eq("status", "active");

      // extended_end_at를 다시 임박하게 설정
      await supabase
        .from("auctions")
        .update({
          extended_end_at: new Date(Date.now() + 30 * 1000).toISOString(),
          current_bid: 120000,
        })
        .eq("id", auction.id);

      // 4회차: 연장 불가
      const bid4 = await supabase.rpc("place_bid", {
        p_auction_id: auction.id,
        p_bidder_id: userId,
        p_bid_amount: 130000,
      });
      expect(bid4.data.success).toBe(true);
      expect(bid4.data.extended).toBe(false);
      expect(bid4.data.extension_count).toBe(3);

      // DB 확인
      const { data: final } = await supabase
        .from("auctions")
        .select("extension_count")
        .eq("id", auction.id)
        .single();
      expect(final!.extension_count).toBe(3);
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 3. 마감 시간 여유 있으면 연장 안 함 ────────────────────────────
  test("3. 마감까지 여유 있으면 연장하지 않음", async () => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 600, // 10분 후 마감 (3분 윈도우 밖)
      autoExtendMin: 3,
    });

    try {
      const { data, error } = await supabase.rpc("place_bid", {
        p_auction_id: auction.id,
        p_bidder_id: userId,
        p_bid_amount: 100000,
      });

      expect(error).toBeNull();
      expect(data.success).toBe(true);
      expect(data.extended).toBe(false);
      expect(data.extension_count).toBe(0);
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 4. 055 트리거: 15분 경매 → auto_extend_min=3 ──────────────────
  test("4. 055 트리거: 15분 경매 → auto_extend_min=3 자동 설정", async () => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 60,
      durationMinutes: 15,
      // autoExtendMin 명시하지 않음 → 트리거가 설정
    });

    try {
      const { data } = await supabase
        .from("auctions")
        .select("auto_extend_min")
        .eq("id", auction.id)
        .single();

      expect(data!.auto_extend_min).toBe(3);
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 5. 055 트리거: 60분 경매 → auto_extend_min=5 ──────────────────
  test("5. 055 트리거: 60분 경매 → auto_extend_min=5 자동 설정", async () => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 60,
      durationMinutes: 60,
      // autoExtendMin 명시하지 않음 → 트리거가 설정
    });

    try {
      const { data } = await supabase
        .from("auctions")
        .select("auto_extend_min")
        .eq("id", auction.id)
        .single();

      expect(data!.auto_extend_min).toBe(5);
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 6. 055 트리거: 30분 경매 → auto_extend_min=5 ──────────────────
  test("6. 055 트리거: 30분 경매 → auto_extend_min=5 자동 설정", async () => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 60,
      durationMinutes: 30,
    });

    try {
      const { data } = await supabase
        .from("auctions")
        .select("auto_extend_min")
        .eq("id", auction.id)
        .single();

      expect(data!.auto_extend_min).toBe(5);
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 7. BIN 입찰 시 연장 없이 즉시 낙찰 ────────────────────────────
  test("7. BIN 입찰 시 자동 연장 없이 즉시 낙찰", async () => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 60,
      autoExtendMin: 3,
      startPrice: 100000,
    });

    // buy_now_price 설정 (start_price * 1.5 이상)
    await supabase
      .from("auctions")
      .update({ buy_now_price: 200000 })
      .eq("id", auction.id);

    try {
      const { data, error } = await supabase.rpc("place_bid", {
        p_auction_id: auction.id,
        p_bidder_id: userId,
        p_bid_amount: 200000,
      });

      expect(error).toBeNull();
      expect(data.success).toBe(true);
      expect(data.buy_now).toBe(true);
      expect(data.result).toBe("won");

      // 연장되지 않아야 함
      const { data: final } = await supabase
        .from("auctions")
        .select("extension_count, status")
        .eq("id", auction.id)
        .single();
      expect(final!.extension_count).toBe(0);
      expect(final!.status).toBe("won");
    } finally {
      await cleanupAuction(auction.id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Part 2: UI 레벨 — ExtensionNotice 컴포넌트 표시
// ═══════════════════════════════════════════════════════════════════════

test.describe("스나이핑 방지 — UI 테스트", () => {
  let mdId: string, userId: string, clubId: string;

  test.beforeAll(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    userId = ids.userId;
    clubId = ids.clubId;
  });

  // ── 8. 마감 임박 경매 → "입찰 시 N분 연장 (X회 남음)" 표시 ────────
  test("8. 마감 임박 경매 상세에서 연장 안내 문구 표시", async ({ page }) => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 120, // 2분 후 마감 (3분 윈도우 내)
      autoExtendMin: 3,
      maxExtensions: 3,
    });

    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto(`/auctions/${auction.id}`);
      await page.waitForLoadState("networkidle");

      // "입찰 시 3분 연장 (3회 남음)" 또는 유사 텍스트
      await expect(
        page.getByText(/연장.*남음/)
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 9. 연장 소진 경매 → "마지막 기회! 더 이상 연장되지 않습니다" ───
  test("9. 연장 소진 시 '마지막 기회' 문구 표시", async ({ page }) => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 120,
      autoExtendMin: 3,
      maxExtensions: 3,
    });

    // extension_count를 max와 동일하게 설정
    await supabase
      .from("auctions")
      .update({ extension_count: 3 })
      .eq("id", auction.id);

    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto(`/auctions/${auction.id}`);
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByText(/마지막 기회|더 이상 연장/)
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 10. 마감까지 여유 있으면 연장 안내 미표시 ──────────────────────
  test("10. 마감 여유 시 연장 안내 미표시", async ({ page }) => {
    const auction = await createNearEndAuction(mdId, clubId, {
      endInSeconds: 600, // 10분 후 마감
      autoExtendMin: 3,
    });

    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto(`/auctions/${auction.id}`);
      await page.waitForLoadState("networkidle");

      // 연장 안내가 보이지 않아야 함
      await expect(
        page.getByText(/연장.*남음/)
      ).not.toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupAuction(auction.id);
    }
  });
});
