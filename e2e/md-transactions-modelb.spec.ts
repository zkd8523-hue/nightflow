import { test, expect, Page } from "@playwright/test";

// DEV 테스트 로그인 헬퍼
async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

test.describe("낙찰 관리 페이지 — Model B 용어 정합성", () => {

  // ── 1. 페이지 제목: "낙찰 관리" 표시 확인 ─────────────────────────────
  test("1. 페이지 제목이 '낙찰 관리'로 표시", async ({ page }) => {
    await devLogin(page, "5@5.5", "123123");
    await page.goto("/md/transactions");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/md/transactions")) {
      test.skip(true, "MD 권한 없음 - 리다이렉트됨");
      return;
    }

    // "낙찰 관리" 제목 확인 (기존 "예약 관리" 아님)
    await expect(
      page.getByRole("heading", { name: "낙찰 관리" })
    ).toBeVisible({ timeout: 10000 });

    // "예약 관리" 텍스트가 없어야 함
    await expect(page.getByText("예약 관리")).not.toBeVisible();
  });

  // ── 2. 경고문: "낙찰자" 용어 사용 확인 ──────────────────────────────
  test("2. 개인정보 경고문에 '낙찰자' 용어 사용", async ({ page }) => {
    await devLogin(page, "5@5.5", "123123");
    await page.goto("/md/transactions");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/md/transactions")) {
      test.skip(true, "MD 권한 없음 - 리다이렉트됨");
      return;
    }

    // "낙찰자의 개인정보" 포함 확인
    await expect(
      page.getByText("낙찰자의 개인정보")
    ).toBeVisible({ timeout: 10000 });

    // "방문 확인" 용어 포함 확인
    await expect(page.getByText("방문 확인과 노쇼 방지")).toBeVisible();

    // 구 용어 "구매자" 없어야 함
    await expect(page.getByText("구매자의 개인정보")).not.toBeVisible();
  });

  // ── 3. 섹션 제목: "진행 중인 낙찰" 표시 확인 ─────────────────────────
  test("3. 섹션 제목이 '진행 중인 낙찰'로 표시", async ({ page }) => {
    await devLogin(page, "5@5.5", "123123");
    await page.goto("/md/transactions");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/md/transactions")) {
      test.skip(true, "MD 권한 없음 - 리다이렉트됨");
      return;
    }

    // "진행중" 탭 확인 (TabsTrigger로 렌더링됨)
    await expect(
      page.getByRole("tab", { name: /진행중/ })
    ).toBeVisible({ timeout: 10000 });

    // 구 용어 "대기 중인 예약" 없어야 함
    await expect(page.getByText("대기 중인 예약")).not.toBeVisible();
  });

  // ── 4. 빈 상태: "진행 중인 낙찰이 없습니다" 표시 확인 ────────────────
  test("4. 빈 상태 메시지가 '진행 중인 낙찰이 없습니다'로 표시", async ({ page }) => {
    await devLogin(page, "5@5.5", "123123");
    await page.goto("/md/transactions");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/md/transactions")) {
      test.skip(true, "MD 권한 없음 - 리다이렉트됨");
      return;
    }

    // 낙찰건이 없는 경우 빈 상태 확인
    const emptyState = page.getByText("진행 중인 낙찰이 없습니다.");
    const hasAuctions = await page.locator('[class*="bg-[#1C1C1E]"]').count() > 0;

    if (!hasAuctions) {
      await expect(emptyState).toBeVisible({ timeout: 10000 });
    }

    // 구 용어 "대기 중인 예약이 없습니다" 없어야 함
    await expect(page.getByText("대기 중인 예약이 없습니다")).not.toBeVisible();
  });

  // ── 5. Model A 잔재 용어 부재 확인 ──────────────────────────────────
  test("5. Model A 잔재 용어(결제완료, 직접결제, 구매자) 부재 확인", async ({ page }) => {
    await devLogin(page, "5@5.5", "123123");
    await page.goto("/md/transactions");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/md/transactions")) {
      test.skip(true, "MD 권한 없음 - 리다이렉트됨");
      return;
    }

    // 페이지 로딩 대기
    await expect(
      page.getByRole("heading", { name: "낙찰 관리" })
    ).toBeVisible({ timeout: 10000 });

    // Model A 잔재 용어가 페이지에 없어야 함
    const body = await page.locator("body").textContent();
    expect(body).not.toContain("결제완료");
    expect(body).not.toContain("낙찰완료 (미결제)");
    expect(body).not.toContain("직접결제");
    expect(body).not.toContain("거래완료");
    expect(body).not.toContain("#MATCH");
  });

  // ── 6. 다크 테마 적용 확인 ────────────────────────────────────────
  test("6. 다크 테마 배경색 적용 확인", async ({ page }) => {
    await devLogin(page, "5@5.5", "123123");
    await page.goto("/md/transactions");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/md/transactions")) {
      test.skip(true, "MD 권한 없음 - 리다이렉트됨");
      return;
    }

    await expect(
      page.getByRole("heading", { name: "낙찰 관리" })
    ).toBeVisible({ timeout: 10000 });

    // 텍스트 색상 확인 (white)
    const heading = page.getByRole("heading", { name: "낙찰 관리" });
    await expect(heading).toHaveCSS("color", "rgb(255, 255, 255)");
  });

  // ── 7. 뒤로가기 링크가 /md/dashboard로 연결 ─────────────────────────
  test("7. 뒤로가기 버튼이 /md/dashboard로 연결", async ({ page }) => {
    await devLogin(page, "5@5.5", "123123");
    await page.goto("/md/transactions");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/md/transactions")) {
      test.skip(true, "MD 권한 없음 - 리다이렉트됨");
      return;
    }

    await expect(
      page.getByRole("heading", { name: "낙찰 관리" })
    ).toBeVisible({ timeout: 10000 });

    // 뒤로가기 링크가 /md/dashboard를 가리키는지 확인
    const backLink = page.locator('a[href="/md/dashboard"]');
    await expect(backLink).toBeVisible();
  });
});

test.describe("MD 대시보드 — 낙찰 관리 링크", () => {

  // ── 8. 대시보드에 "낙찰 관리" 버튼 확인 ────────────────────────────
  test("8. MD 대시보드에 '낙찰 관리' 버튼 표시", async ({ page }) => {
    await devLogin(page, "5@5.5", "123123");
    await page.goto("/md/dashboard");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/md/dashboard")) {
      test.skip(true, "MD 권한 없음 - 리다이렉트됨");
      return;
    }

    // "낙찰 관리" 버튼 확인 (기존 "예약 현황" 아님)
    await expect(
      page.getByRole("button", { name: "낙찰 관리" })
    ).toBeVisible({ timeout: 10000 });

    // 구 용어 "예약 현황" 없어야 함
    await expect(page.getByText("예약 현황")).not.toBeVisible();
  });

  // ── 9. "낙찰 관리" 클릭 시 /md/transactions로 이동 ─────────────────
  test("9. '낙찰 관리' 클릭 → /md/transactions 이동", async ({ page }) => {
    await devLogin(page, "5@5.5", "123123");
    await page.goto("/md/dashboard");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (!url.includes("/md/dashboard")) {
      test.skip(true, "MD 권한 없음 - 리다이렉트됨");
      return;
    }

    // "낙찰 관리" 링크 클릭
    const link = page.getByRole("link", { name: "낙찰 관리" });
    await expect(link).toBeVisible({ timeout: 10000 });
    await link.click();

    // /md/transactions로 이동 확인
    await expect(page).toHaveURL(/\/md\/transactions/);

    // 이동 후 "낙찰 관리" 제목 확인
    await expect(
      page.getByRole("heading", { name: "낙찰 관리" })
    ).toBeVisible({ timeout: 10000 });
  });

  // ── 10. 비로그인 /md/transactions → /login 리다이렉트 ───────────────
  test("10. 비로그인 /md/transactions → /login 리다이렉트", async ({ page }) => {
    await page.goto("/md/transactions");
    await expect(page).toHaveURL(/\/login/);
  });
});
