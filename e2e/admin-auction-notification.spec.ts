/**
 * E2E: Admin 경매 강제 취소/삭제 → MD 인앱 알림 수신
 *
 * 필수 테스트 계정:
 *   - admin@test.com / test1234         → role='admin'
 *   - e2e-md@nightflow.com / test123456 → role='md', md_status='approved'
 *
 * UI 구조 메모:
 *   - AdminAuctionManager: Tabs (예정/진행중/종료) 기반 필터, Select 없음
 *   - Draft 경매 → "예정" 탭 (getAuctionTab returns "scheduled" for draft)
 *   - 취소 Sheet 확인 버튼: "강제 취소"
 *   - 삭제 Sheet 확인 버튼: "삭제" (두 번째 "삭제" 버튼, last() 사용)
 *   - 취소/삭제 후 window.location.reload() 호출됨
 *   - 알림: Header 우측 메뉴 Sheet → "알림" 섹션
 */

import { test, expect, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PW = "test1234";
const MD_EMAIL = "e2e-md@nightflow.com";
const MD_PW = "test123456";
const TEST_AUCTION_TITLE = "E2E Admin Notification Test";
const TEST_CANCEL_REASON = "E2E 테스트 자동 취소 사유";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── 헬퍼 ───────────────────────────────────────────────────────────────────

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
  await page.waitForLoadState("networkidle");
  // 헤더가 인증 상태로 완전히 렌더링될 때까지 대기
  await page.waitForSelector('[aria-label="메뉴 열기"]', { state: "visible", timeout: 10000 });
}

/**
 * 세션 제거 로그아웃.
 * window.location.reload() 이후 페이지 컨텍스트가 불안정하므로
 * 먼저 홈으로 이동해 안정된 컨텍스트 확보 후 localStorage 제거.
 */
async function logout(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    Object.keys(localStorage).forEach((key) => {
      if (key.includes("auth-token") || key.includes("supabase")) {
        localStorage.removeItem(key);
      }
    });
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
}

/** MD 로그인 후 나타나는 웰컴 다이얼로그를 닫는다 */
async function dismissWelcomeDialog(page: Page) {
  try {
    const dialog = page.getByRole("dialog", { name: "축하합니다!" });
    const isVisible = await dialog.isVisible({ timeout: 3000 });
    if (isVisible) {
      await page.getByRole("button", { name: "나중에 둘러볼게요" }).click();
      await dialog.waitFor({ state: "hidden", timeout: 3000 });
    }
  } catch {
    // 다이얼로그 없음 — 정상
  }
}

/** 우측 메뉴 Sheet를 열고 알림 섹션이 나타날 때까지 대기 */
async function openNotificationMenu(page: Page) {
  await dismissWelcomeDialog(page);
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page.waitForSelector("text=알림", { state: "visible", timeout: 5000 });
}

/** auth.admin에서 MD UUID와 첫 번째 클럽 UUID 조회 */
async function getTestIds() {
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const mdAuth = authUsers?.users?.find((u) => u.email === MD_EMAIL);

  const { data: club } = await supabase
    .from("clubs")
    .select("id")
    .limit(1)
    .single();

  if (!mdAuth || !club) {
    const missing = [!mdAuth && "MD 계정", !club && "클럽"].filter(Boolean);
    throw new Error(`필수 테스트 데이터 없음: ${missing.join(", ")}`);
  }

  return { mdId: mdAuth.id, clubId: club.id };
}

/** 테스트용 경매 생성 */
async function createTestAuction(mdId: string, clubId: string, status: "active" | "draft") {
  const now = new Date();
  const { data, error } = await supabase
    .from("auctions")
    .insert({
      md_id: mdId,
      club_id: clubId,
      title: TEST_AUCTION_TITLE,
      table_type: "Standard",
      min_people: 2,
      max_people: 4,
      start_price: 100000,
      reserve_price: 100000,
      original_price: 200000,
      current_bid: 100000,
      status,
      listing_type: "instant",
      event_date: new Date(now.getTime() + 86400000).toISOString().split("T")[0],
      duration_minutes: 60,
      auction_start_at: now.toISOString(),
      auction_end_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`경매 생성 실패: ${error.message}`);
  return data!.id as string;
}

async function cleanupNotifications(mdId: string) {
  await supabase
    .from("in_app_notifications")
    .delete()
    .eq("user_id", mdId)
    .in("type", ["auction_admin_cancelled", "auction_admin_deleted"]);
}

async function cleanupAuction(auctionId: string) {
  await supabase.from("bids").delete().eq("auction_id", auctionId);
  await supabase.from("auctions").delete().eq("id", auctionId);
}

// ── 시나리오 1: 강제 취소 → MD 알림 ──────────────────────────────────────

test.describe("Admin 경매 강제 취소 → MD 인앱 알림 수신", () => {
  let auctionId: string | null = null;
  let mdId: string;

  test.beforeEach(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    await cleanupNotifications(mdId);
    auctionId = await createTestAuction(ids.mdId, ids.clubId, "active");
  });

  test.afterEach(async () => {
    await cleanupNotifications(mdId);
    if (auctionId) {
      await cleanupAuction(auctionId);
      auctionId = null;
    }
  });

  test("1-1. Admin이 active 경매 강제 취소 시 PATCH 200 응답", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/admin/auctions");
    await page.waitForLoadState("networkidle");

    // "진행중" 탭은 default (activeTab = "active")
    await page.getByPlaceholder("클럽명, MD명, 경매 제목 검색...").fill(TEST_AUCTION_TITLE);
    await page.waitForTimeout(500);

    const cancelBtn = page.getByRole("button", { name: "취소" }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();

    await expect(page.getByText("경매 강제 취소")).toBeVisible();
    await page.getByPlaceholder("취소 사유를 입력해주세요...").fill(TEST_CANCEL_REASON);
    await expect(page.getByRole("button", { name: "강제 취소" })).toBeEnabled();

    // API 응답 대기 (status만 체크, body는 GC 이슈로 skip)
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/admin/auctions") && res.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "강제 취소" }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    auctionId = null; // cancelled 상태로 남아있음 (cleanupAuction에서 제거)
    // DB에서 직접 확인
    const { data: notif } = await supabase
      .from("in_app_notifications")
      .select("type, title")
      .eq("user_id", mdId)
      .eq("type", "auction_admin_cancelled")
      .single();
    expect(notif?.type).toBe("auction_admin_cancelled");
    expect(notif?.title).toBe("경매가 관리자에 의해 취소되었습니다");
  });

  test("1-2. Admin 취소 후 MD 로그인 시 알림 제목 표시", async ({ page }) => {
    test.setTimeout(60000);
    // 1. Admin 취소
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/admin/auctions");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("클럽명, MD명, 경매 제목 검색...").fill(TEST_AUCTION_TITLE);
    await page.waitForTimeout(500);

    const cancelBtn = page.getByRole("button", { name: "취소" }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();
    await expect(page.getByText("경매 강제 취소")).toBeVisible();
    await page.getByPlaceholder("취소 사유를 입력해주세요...").fill(TEST_CANCEL_REASON);

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/admin/auctions") && res.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "강제 취소" }).click();
    await responsePromise;

    // 2. MD로 전환 (먼저 안정된 페이지로 이동 후 세션 제거)
    await logout(page);
    await devLogin(page, MD_EMAIL, MD_PW);

    // 3. 메뉴 열어 알림 제목 확인 (초기 fetch 완료 대기 포함)
    await openNotificationMenu(page);
    await expect(
      page.getByText("경매가 관리자에 의해 취소되었습니다")
    ).toBeVisible({ timeout: 15000 });
  });

  test("1-3. Admin 취소 알림 메시지에 취소 사유 포함", async ({ page }) => {
    test.setTimeout(60000);
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/admin/auctions");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("클럽명, MD명, 경매 제목 검색...").fill(TEST_AUCTION_TITLE);
    await page.waitForTimeout(500);

    const cancelBtn = page.getByRole("button", { name: "취소" }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();
    await page.getByPlaceholder("취소 사유를 입력해주세요...").fill(TEST_CANCEL_REASON);

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/admin/auctions") && res.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "강제 취소" }).click();
    await responsePromise;

    await logout(page);
    await devLogin(page, MD_EMAIL, MD_PW);
    await openNotificationMenu(page);

    await expect(
      page.getByText(TEST_CANCEL_REASON, { exact: false })
    ).toBeVisible({ timeout: 15000 });
  });
});

// ── 시나리오 2: draft 삭제 → MD 알림 ──────────────────────────────────────

test.describe("Admin draft 경매 삭제 → MD 인앱 알림 수신", () => {
  let auctionId: string | null = null;
  let mdId: string;

  test.beforeEach(async () => {
    const ids = await getTestIds();
    mdId = ids.mdId;
    await cleanupNotifications(mdId);
    auctionId = await createTestAuction(ids.mdId, ids.clubId, "draft");
  });

  test.afterEach(async () => {
    await cleanupNotifications(mdId);
    if (auctionId) {
      await cleanupAuction(auctionId);
      auctionId = null;
    }
  });

  test("2-1. Admin이 draft 경매 삭제 시 DELETE 200 응답", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/admin/auctions");
    await page.waitForLoadState("networkidle");

    // Draft 경매는 "예정" 탭에 위치
    await page.getByRole("tab", { name: /예정/ }).click();
    await page.waitForTimeout(300);

    await page.getByPlaceholder("클럽명, MD명, 경매 제목 검색...").fill(TEST_AUCTION_TITLE);
    await page.waitForTimeout(500);

    // 첫 "삭제" 버튼 = 카드 액션 버튼
    const tableDeleteBtn = page.getByRole("button", { name: "삭제" }).first();
    await expect(tableDeleteBtn).toBeVisible({ timeout: 5000 });
    await tableDeleteBtn.click();

    await expect(page.getByText("경매 삭제")).toBeVisible();
    await expect(page.getByText("이 경매가 영구적으로 삭제됩니다")).toBeVisible();

    // Sheet 내 확인 "삭제" 버튼은 마지막 버튼
    const confirmDeleteBtn = page.getByRole("button", { name: "삭제" }).last();
    await expect(confirmDeleteBtn).toBeVisible({ timeout: 3000 });

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/admin/auctions") && res.request().method() === "DELETE"
    );
    await confirmDeleteBtn.click();
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    auctionId = null;

    // DB에서 직접 확인
    const { data: notif } = await supabase
      .from("in_app_notifications")
      .select("type, title")
      .eq("user_id", mdId)
      .eq("type", "auction_admin_deleted")
      .single();
    expect(notif?.type).toBe("auction_admin_deleted");
    expect(notif?.title).toBe("경매 초안이 관리자에 의해 삭제되었습니다");
  });

  test("2-2. Admin 삭제 후 MD 로그인 시 알림 제목 표시", async ({ page }) => {
    test.setTimeout(60000);
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/admin/auctions");
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: /예정/ }).click();
    await page.waitForTimeout(300);

    await page.getByPlaceholder("클럽명, MD명, 경매 제목 검색...").fill(TEST_AUCTION_TITLE);
    await page.waitForTimeout(500);

    const tableDeleteBtn = page.getByRole("button", { name: "삭제" }).first();
    await expect(tableDeleteBtn).toBeVisible({ timeout: 5000 });
    await tableDeleteBtn.click();
    await expect(page.getByText("경매 삭제")).toBeVisible();

    const confirmDeleteBtn = page.getByRole("button", { name: "삭제" }).last();
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/admin/auctions") && res.request().method() === "DELETE"
    );
    await confirmDeleteBtn.click();
    await responsePromise;
    auctionId = null;

    // MD로 전환
    await logout(page);
    await devLogin(page, MD_EMAIL, MD_PW);

    // 메뉴 열어 알림 제목 확인 (초기 fetch 완료 대기 포함)
    await openNotificationMenu(page);
    await expect(
      page.getByText("경매 초안이 관리자에 의해 삭제되었습니다").first()
    ).toBeVisible({ timeout: 15000 });
  });
});
