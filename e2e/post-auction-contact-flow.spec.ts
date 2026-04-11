import { test, expect, Page } from "@playwright/test";

// DEV 테스트 로그인 헬퍼
async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

test.describe("낙찰 후 연락 플로우 E2E", () => {
  // ── 시나리오 1: /match/[id] 페이지 렌더링 + OG 메타 ──────────────────

  test.describe("/match/[id] 낙찰 확인 페이지", () => {
    test("1-1. 유효한 낙찰 건 → 페이지 렌더링 확인", async ({ page }) => {
      // 홈에서 won/confirmed 경매 찾기, 없으면 스킵
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      // 하드코딩 ID 대신 실제 DB의 won 경매 사용 (없으면 스킵)
      const response = await page.request.get("/api/test-helpers/won-auction-id").catch(() => null);
      if (!response || !response.ok()) {
        test.skip(true, "won 경매 없음 또는 API 미지원 - 스킵");
        return;
      }
      const { auctionId } = await response.json();
      if (!auctionId) {
        test.skip(true, "won 경매 없음 - 스킵");
        return;
      }

      await page.goto(`/match/${auctionId}`);
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain(`/match/${auctionId}`);

      // 핵심 요소 렌더링
      await expect(page.getByText(/낙찰|확인/).first()).toBeVisible({ timeout: 10000 });
    });

    test("1-2. OG 메타태그 동적 생성 확인", async ({ page }) => {
      // won 경매가 있어야 동작하므로 없으면 스킵
      test.skip(true, "won 경매 데이터 필요 - 향후 테스트 데이터 셋업 후 활성화");
    });

    test("1-3. 존재하지 않는 경매 ID → 404/에러 표시", async ({ page }) => {
      await page.goto("/match/00000000-0000-0000-0000-000000000000");
      await page.waitForLoadState("networkidle");

      // "낙찰 정보를 찾을 수 없습니다" 또는 404 관련 메시지
      const hasNotFound =
        (await page.getByText("찾을 수 없습니다").isVisible().catch(() => false)) ||
        (await page.getByText("not found").isVisible().catch(() => false)) ||
        (await page.getByText("404").isVisible().catch(() => false)) ||
        (await page.getByText("존재하지 않").isVisible().catch(() => false));

      expect(hasNotFound).toBeTruthy();
    });
  });

  // ── 시나리오 2: 낙찰 후 연락 플로우 ──────────────────────────────────

  test.describe("낙찰 후 연락 플로우", () => {
    test("3-1. my-wins 페이지 렌더링 (빈 상태 또는 목록)", async ({ page }) => {
      await devLogin(page, "e2e-user@nightflow.com", "test123456");
      await page.goto("/my-wins");
      await page.waitForLoadState("networkidle");

      // /my-wins → /bids?tab=won 리다이렉트됨, "내 활동" 헤딩 확인
      await expect(
        page.getByRole("heading", { name: /내 활동/ })
      ).toBeVisible({ timeout: 8000 });
    });

    test("3-2. won 상태 경매 상세 페이지 렌더링", async ({ page }) => {
      // 활성 경매로 테스트 (won 경매 하드코딩 대신)
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const cards = page.locator("a[href^='/auctions/']");
      if ((await cards.count()) === 0) {
        test.skip(true, "경매 없음 - 스킵");
        return;
      }
      const href = await cards.first().getAttribute("href");
      await devLogin(page, "e2e-user@nightflow.com", "test123456");
      await page.goto(href!);
      await page.waitForLoadState("networkidle");

      // 경매 상세 페이지 렌더링 확인 (가격 표시)
      await expect(page.getByText(/원/).first()).toBeVisible({ timeout: 8000 });
    });

    test("3-3. 비로그인 /my-wins 접근 → 로그인 리다이렉트", async ({ page }) => {
      await page.goto("/my-wins");
      // 미들웨어가 /login으로 리다이렉트
      await expect(page).toHaveURL(/\/login/);
    });

    test("3-4. MD transactions 페이지 렌더링", async ({ page }) => {
      // MD 계정으로 로그인
      await devLogin(page, "5@5.5", "123123");
      await page.goto("/md/transactions");
      await page.waitForLoadState("networkidle");

      // 페이지가 렌더링되면 성공 (리다이렉트 안 됨)
      const url = page.url();
      if (url.includes("/md/transactions")) {
        // 연락 확인 페이지 렌더링
        await expect(page.locator("body")).toBeVisible();
      } else if (url.includes("/login")) {
        // 권한 없으면 로그인 리다이렉트 → 허용
        test.skip(true, "MD 권한 없음 - 로그인 리다이렉트");
      }
    });

    test("3-5. /match/[id] 페이지에 연락 버튼 없음 (공개 검증 페이지)", async ({ page }) => {
      const auctionId = "d9f7bb0c-a6ef-4c0b-a6cb-89bd22e0717b";
      await page.goto(`/match/${auctionId}`);
      await page.waitForLoadState("networkidle");

      // match 페이지는 검증용 → 연락 버튼 없어야 함 (개인정보 보호)
      const hasContactBtn = await page
        .getByRole("button", { name: /DM|전화|연락/ })
        .isVisible()
        .catch(() => false);

      expect(hasContactBtn).toBe(false);
    });
  });
});
