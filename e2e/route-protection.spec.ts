import { test, expect, Page } from "@playwright/test";

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

test.describe("라우트 보호 (미들웨어)", () => {
  // ── 비로그인 접근 차단 ─────────────────────────────────────────────
  test("1. 비로그인 /bids → /login 리다이렉트", async ({ page }) => {
    await page.goto("/bids");
    await expect(page).toHaveURL(/\/login/);
  });

  test("2. 비로그인 /my-wins → /login 리다이렉트", async ({ page }) => {
    await page.goto("/my-wins");
    await expect(page).toHaveURL(/\/login/);
  });

  test("3. 비로그인 /md/dashboard → /login 리다이렉트", async ({ page }) => {
    await page.goto("/md/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("4. 비로그인 /md/auctions/new → /login 리다이렉트", async ({ page }) => {
    await page.goto("/md/auctions/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("5. 비로그인 /admin → /login 리다이렉트", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  // ── 로그인 후 일반 페이지 접근 ─────────────────────────────────────
  test("6. 로그인 후 /bids 접근 가능", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/bids");
    await expect(page).not.toHaveURL(/\/login/);
    // 내 입찰 내역 페이지 헤딩 확인 (strict mode 방지: first() 사용)
    await expect(
      page.getByRole("heading", { name: /입찰/ }).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("7. 로그인 후 /my-wins 접근 가능", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/my-wins");
    await expect(page).not.toHaveURL(/\/login/);
    // 내 낙찰 내역 페이지 핵심 요소 확인
    await expect(
      page.getByRole("heading", { name: /낙찰/ })
    ).toBeVisible({ timeout: 8000 });
  });

  // ── 일반 유저의 MD/Admin 접근 차단 ─────────────────────────────────
  test("8. 일반 유저 /md/dashboard → 홈 또는 리다이렉트", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/md/dashboard");
    // role이 'user'이므로 / 또는 /login으로 리다이렉트되어야 함
    await expect(page).toHaveURL(/\/(login)?$/);
  });

  test("9. 일반 유저 /admin/mds → 홈 또는 /login 리다이렉트", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/admin/mds");
    await expect(page).toHaveURL(/\/(login)?$/);
  });

  // ── 404 처리 ───────────────────────────────────────────────────────
  test("10. 존재하지 않는 경로 → 404 페이지", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-xyz");
    // Next.js 기본 404 또는 커스텀 not-found 페이지
    const title = await page.title();
    const has404 = title.includes("404") || title.includes("찾을 수 없") || title.includes("Not Found");
    const hasNotFoundText = (await page.getByText(/찾을 수 없|404|존재하지 않/).count()) > 0;
    expect(has404 || hasNotFoundText).toBe(true);
  });
});
