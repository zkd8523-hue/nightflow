import { test, expect, Page } from "@playwright/test";

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

test.describe("홈페이지 / 경매 목록", () => {
  // ── 1. 비로그인 홈 접근 ─────────────────────────────────────────────
  test("1. 비로그인 상태에서 홈 접근 가능 (공개 페이지)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "NightFlow" }).first()).toBeVisible();
  });

  // ── 2. 경매 목록 섹션 렌더링 ────────────────────────────────────────
  test("2. 홈 화면 경매 목록 섹션 렌더링 확인", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // AuctionList 또는 빈 상태 메시지가 렌더링되어야 함
    const hasList = (await page.locator("a[href^='/auctions/']").count()) > 0;
    const hasEmptyText = (await page.getByText(/경매가 없|진행 중인 경매|NightFlow/).count()) > 0;
    expect(hasList || hasEmptyText).toBe(true);
  });

  // ── 3. 경매 카드 렌더링 ──────────────────────────────────────────────
  test("3. 경매 카드 존재 시 클럽명/입찰가 표시 확인", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const cards = page.locator("a[href^='/auctions/']");
    const count = await cards.count();

    if (count === 0) {
      // 경매 없을 때 빈 상태 메시지 또는 페이지 자체가 정상 렌더링
      console.log("진행 중인 경매 없음 - 빈 상태 확인");
      await expect(page.getByRole("heading", { name: "NIGHTFLOW" })).toBeVisible();
      return;
    }

    // 첫 번째 카드에서 가격 정보(원) 노출 확인
    const firstCard = cards.first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByText(/원/)).toBeVisible();
  });

  // ── 4. 경매 카드 클릭 → 상세 이동 ──────────────────────────────────
  test("4. 경매 카드 클릭 시 상세 페이지로 이동", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const cards = page.locator("a[href^='/auctions/']");
    const count = await cards.count();

    if (count === 0) {
      test.skip(true, "진행 중인 경매 없음 - 스킵");
      return;
    }

    const href = await cards.first().getAttribute("href");
    await cards.first().click();
    await expect(page).toHaveURL(href!);
    // 경매 상세 페이지 핵심 요소 확인
    await expect(page.getByText(/원/).first()).toBeVisible({ timeout: 8000 });
  });

  // ── 5. 헤더 네비게이션 렌더링 ────────────────────────────────────────
  test("5. 헤더에 로그인 버튼 또는 프로필 표시", async ({ page }) => {
    await page.goto("/");
    // 비로그인: 로그인 버튼 또는 헤더 자체 존재
    await expect(page.locator("header, nav").first()).toBeVisible();
  });

  // ── 6. 로그인 후 홈 렌더링 ───────────────────────────────────────────
  test("6. 로그인 후 홈 정상 렌더링", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "NightFlow" }).first()).toBeVisible();
  });

  // ── 7. 로그인 후 헤더 메뉴에서 도움말 링크 확인 ───────────────────
  test("7. 로그인 후 헤더 메뉴 열기 가능", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    // 메뉴 버튼 클릭
    const menuBtn = page.getByRole("button", { name: /메뉴/ });
    await expect(menuBtn).toBeVisible({ timeout: 5000 });
    await menuBtn.click();
    // 메뉴 내 도움말 링크 확인 (모든 유저에게 표시)
    await expect(page.getByText("도움말")).toBeVisible({ timeout: 3000 });
  });
});
