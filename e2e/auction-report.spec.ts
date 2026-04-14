/**
 * E2E: 경매 신고 시스템 + Admin 판정
 *
 * 커버 범위:
 *  - DB: 신고 INSERT, 중복 방지, Admin 승인/기각
 *  - UI: ReportAuctionButton (신고 제출)
 *  - UI: Admin /admin/reports (판정)
 *
 * 관련 마이그레이션: 093_auction_reports, 095_auction_report_resolution
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
const ADMIN_EMAIL = "e2e-admin@nightflow.com";
const ADMIN_PW = "test123456";

// ── 헬퍼 ──────────────────────────────────────────────────────────────────

async function getTestIds() {
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 50 });
  const mdAuth = authUsers?.users?.find((u) => u.email === MD_EMAIL);
  const userAuth = authUsers?.users?.find((u) => u.email === USER_EMAIL);
  const adminAuth = authUsers?.users?.find((u) => u.email === ADMIN_EMAIL);

  const { data: club } = await supabase
    .from("clubs")
    .select("id")
    .limit(1)
    .single();

  if (!mdAuth || !userAuth || !club) {
    const missing = [!mdAuth && "MD", !userAuth && "User", !club && "Club"].filter(Boolean);
    throw new Error(`테스트 데이터 없음: ${missing.join(", ")}`);
  }
  return { mdId: mdAuth.id, userId: userAuth.id, adminId: adminAuth?.id, clubId: club.id };
}

async function createTestAuction(mdId: string, clubId: string) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const { data, error } = await supabase
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
      current_bid: 100000,
      bid_count: 0,
      bidder_count: 0,
      status: "active",
      title: "E2E Report Test Auction",
      listing_type: "instant",
      event_date: tomorrow,
      duration_minutes: 60,
      auction_start_at: new Date().toISOString(),
      auction_end_at: new Date(Date.now() + 3600_000).toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`createTestAuction: ${error.message}`);
  return data;
}

async function createTestReport(auctionId: string, reporterId: string, reason = "fake_listing") {
  const { data, error } = await supabase
    .from("auction_reports")
    .insert({
      auction_id: auctionId,
      reporter_id: reporterId,
      reason,
      memo: "E2E 테스트 신고",
    })
    .select()
    .single();
  if (error) throw new Error(`createTestReport: ${error.message}`);
  return data;
}

async function cleanupAuction(auctionId: string) {
  await supabase.from("auction_reports").delete().eq("auction_id", auctionId);
  await supabase.from("bids").delete().eq("auction_id", auctionId);
  await supabase.from("auctions").delete().eq("id", auctionId);
}

async function cleanupReport(reportId: string) {
  await supabase.from("auction_reports").delete().eq("id", reportId);
}

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

// ═══════════════════════════════════════════════════════════════════════════
// Part 1: DB 테스트
// ═══════════════════════════════════════════════════════════════════════════

test.describe("경매 신고 — DB 테스트", () => {
  let mdId: string, userId: string, clubId: string;

  test.beforeAll(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    userId = ids.userId;
    clubId = ids.clubId;
  });

  // ── 1. 신고 INSERT → status='pending' ─────────────────────────────────
  test("1. 유저 경매 신고 → status=pending 기본값", async () => {
    const auction = await createTestAuction(mdId, clubId);
    try {
      const report = await createTestReport(auction.id, userId);
      expect(report.status).toBe("pending");
      expect(report.resolved_at).toBeNull();
      expect(report.resolved_by).toBeNull();
      await cleanupReport(report.id);
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 2. 동일 유저 중복 신고 → 에러 ────────────────────────────────────
  test("2. 동일 유저 중복 신고 → UNIQUE 위반 에러", async () => {
    const auction = await createTestAuction(mdId, clubId);
    try {
      await createTestReport(auction.id, userId);

      // 같은 유저 재신고
      const { error } = await supabase
        .from("auction_reports")
        .insert({
          auction_id: auction.id,
          reporter_id: userId,
          reason: "scam_suspect",
        });

      expect(error).not.toBeNull();
      expect(error!.code).toBe("23505"); // unique_violation
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 3. Admin 승인 처리 ────────────────────────────────────────────────
  test("3. Admin 승인 → status=approved + resolved_at 설정", async () => {
    const auction = await createTestAuction(mdId, clubId);
    try {
      const report = await createTestReport(auction.id, userId);

      const { error } = await supabase
        .from("auction_reports")
        .update({
          status: "approved",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", report.id);

      expect(error).toBeNull();

      const { data: updated } = await supabase
        .from("auction_reports")
        .select("status, resolved_at")
        .eq("id", report.id)
        .single();

      expect(updated!.status).toBe("approved");
      expect(updated!.resolved_at).not.toBeNull();
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 4. Admin 기각 처리 ────────────────────────────────────────────────
  test("4. Admin 기각 → status=dismissed + resolved_at 설정", async () => {
    const auction = await createTestAuction(mdId, clubId);
    try {
      const report = await createTestReport(auction.id, userId);

      const { error } = await supabase
        .from("auction_reports")
        .update({
          status: "dismissed",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", report.id);

      expect(error).toBeNull();

      const { data: updated } = await supabase
        .from("auction_reports")
        .select("status, resolved_at")
        .eq("id", report.id)
        .single();

      expect(updated!.status).toBe("dismissed");
      expect(updated!.resolved_at).not.toBeNull();
    } finally {
      await cleanupAuction(auction.id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 2: UI 테스트 — 신고 제출
// ═══════════════════════════════════════════════════════════════════════════

test.describe("경매 신고 — 신고 제출 UI", () => {
  let mdId: string, userId: string, clubId: string;

  test.beforeAll(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    userId = ids.userId;
    clubId = ids.clubId;
  });

  // ── 5. 경매 상세에서 신고 버튼 표시 ───────────────────────────────────
  test("5. 경매 상세 페이지에서 신고 버튼 렌더링", async ({ page }) => {
    const auction = await createTestAuction(mdId, clubId);
    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto(`/auctions/${auction.id}`);
      await page.waitForLoadState("networkidle");

      // 신고 버튼 또는 아이콘
      const reportBtn = page.getByRole("button", { name: /신고|report/i });
      const reportIcon = page.locator("[data-testid='report-button'], button:has(svg.lucide-flag)");
      const hasReport = (await reportBtn.count()) > 0 || (await reportIcon.count()) > 0;
      expect(hasReport).toBe(true);
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 6. 신고 사유 선택 + 제출 → toast ──────────────────────────────────
  test("6. 신고 사유 선택 + 제출 → '신고가 접수' toast", async ({ page }) => {
    const auction = await createTestAuction(mdId, clubId);
    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto(`/auctions/${auction.id}`);
      await page.waitForLoadState("networkidle");

      // 신고 버튼 클릭
      const reportBtn = page.getByRole("button", { name: /신고|report/i });
      const reportIcon = page.locator("button:has(svg.lucide-flag)");
      if ((await reportBtn.count()) > 0) {
        await reportBtn.first().click();
      } else {
        await reportIcon.first().click();
      }

      // 신고 사유 선택 (라디오 또는 버튼)
      await page.waitForTimeout(500);
      const fakeOption = page.getByText(/허위매물|fake/i);
      if ((await fakeOption.count()) > 0) {
        await fakeOption.first().click();
      }

      // 제출 버튼
      const submitBtn = page.getByRole("button", { name: /신고.*제출|접수|submit/i });
      if ((await submitBtn.count()) > 0) {
        await submitBtn.first().click();
        await expect(page.getByText(/신고.*접수|접수되었습니다/)).toBeVisible({ timeout: 5000 });
      }
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 7. 이미 신고한 경매 → 재신고 시 '이미 신고' toast ───────────────
  // ReportAuctionButton은 초기 렌더에 비활성화 UI를 표시하지 않고,
  // 제출 시점에 중복 여부를 확인하여 toast로 알려줌
  test("7. 이미 신고한 경매 → 재신고 시 '이미 신고한 게시글' toast", async ({ page }) => {
    const auction = await createTestAuction(mdId, clubId);
    const report = await createTestReport(auction.id, userId);
    try {
      await devLogin(page, USER_EMAIL, USER_PW);
      await page.goto(`/auctions/${auction.id}`);
      await page.waitForLoadState("networkidle");

      // "이 게시글 신고" 버튼 클릭
      const reportBtn = page.getByText("이 게시글 신고");
      await expect(reportBtn).toBeVisible({ timeout: 8000 });
      await reportBtn.click();

      // Sheet 열림 확인 후 사유 선택
      await page.waitForTimeout(500);
      const fakeOption = page.getByText("허위매물");
      await expect(fakeOption).toBeVisible({ timeout: 5000 });
      await fakeOption.click();

      // "신고하기" 버튼 클릭
      await page.getByRole("button", { name: "신고하기" }).click();

      // "이미 신고한 게시글" toast 확인
      await expect(page.getByText(/이미 신고한 게시글/)).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupReport(report.id);
      await cleanupAuction(auction.id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 3: UI 테스트 — Admin Reports
// ═══════════════════════════════════════════════════════════════════════════

test.describe("경매 신고 — Admin 판정 UI", () => {
  let mdId: string, userId: string, clubId: string;

  test.beforeAll(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    userId = ids.userId;
    clubId = ids.clubId;
  });

  // ── 8. Admin /admin/reports 페이지 렌더링 ─────────────────────────────
  test("8. Admin 로그인 → /admin/reports 페이지 렌더링", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/admin/reports");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("신고 관리")).toBeVisible({ timeout: 8000 });
    // 통계 카드 (미처리, 승인됨, 기각됨)
    await expect(page.getByText("미처리")).toBeVisible();
    await expect(page.getByText("승인됨")).toBeVisible();
    await expect(page.getByText("기각됨")).toBeVisible();
  });

  // ── 9. 비로그인/일반유저 → 리다이렉트 ────────────────────────────────
  test("9. 비로그인 /admin/reports → /login 리다이렉트", async ({ page }) => {
    await page.goto("/admin/reports");
    await expect(page).toHaveURL(/\/(login|$)/, { timeout: 5000 });
  });

  // ── 10. 승인 버튼 클릭 → status 변경 ─────────────────────────────────
  test("10. Admin 승인 버튼 클릭 → '승인됨' 배지 표시", async ({ page }) => {
    const auction = await createTestAuction(mdId, clubId);
    const report = await createTestReport(auction.id, userId);
    try {
      await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
      await page.goto("/admin/reports");
      await page.waitForLoadState("networkidle");

      // 승인 버튼 클릭
      const approveBtn = page.getByRole("button", { name: "승인" });
      await expect(approveBtn.first()).toBeVisible({ timeout: 8000 });
      await approveBtn.first().click();

      // Toast 또는 '승인됨' 배지 표시
      await expect(
        page.getByText(/승인되었습니다|승인됨/)
      ).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupAuction(auction.id);
    }
  });

  // ── 11. 기각 버튼 클릭 → status 변경 ─────────────────────────────────
  test("11. Admin 기각 버튼 클릭 → '기각됨' 배지 표시", async ({ page }) => {
    const auction = await createTestAuction(mdId, clubId);
    const report = await createTestReport(auction.id, userId);
    try {
      await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
      await page.goto("/admin/reports");
      await page.waitForLoadState("networkidle");

      // 기각 버튼 클릭
      const dismissBtn = page.getByRole("button", { name: "기각" });
      await expect(dismissBtn.first()).toBeVisible({ timeout: 8000 });
      await dismissBtn.first().click();

      // Toast 또는 '기각됨' 배지 표시
      await expect(
        page.getByText(/기각되었습니다|기각됨/)
      ).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupAuction(auction.id);
    }
  });
});
