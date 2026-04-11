import { test, expect, Page } from "@playwright/test";

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

/** 홈에서 첫 번째 활성 경매 URL 반환. 없으면 null */
async function getFirstAuctionUrl(page: Page): Promise<string | null> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const cards = page.locator("a[href^='/auctions/']");
  if ((await cards.count()) === 0) return null;
  return cards.first().getAttribute("href");
}

test.describe("경매 상세 페이지 / 입찰 UI", () => {
  // ── 1. 존재하지 않는 경매 → 404 ────────────────────────────────────
  test("1. 없는 경매 ID → 404 또는 not-found", async ({ page }) => {
    await page.goto("/auctions/00000000-0000-0000-0000-000000000000");
    const title = await page.title();
    const has404 = title.includes("404") || title.includes("찾을 수 없") || title.includes("Not Found");
    const hasNotFoundEl = (await page.getByText(/찾을 수 없|존재하지 않|없습니다/).count()) > 0;
    expect(has404 || hasNotFoundEl).toBe(true);
  });

  // ── 2. 경매 상세 렌더링 ─────────────────────────────────────────────
  test("2. 경매 상세 페이지 핵심 정보 렌더링", async ({ page }) => {
    const url = await getFirstAuctionUrl(page);
    if (!url) {
      test.skip(true, "진행 중인 경매 없음 - 스킵");
      return;
    }
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    // 현재가(원) 표시
    await expect(page.getByText(/원/).first()).toBeVisible({ timeout: 8000 });
    // 타이머 또는 종료 문구
    const hasTimer = (await page.getByText(/남음|마감|종료|LIVE/).count()) > 0;
    expect(hasTimer).toBe(true);
  });

  // ── 3. 비로그인 입찰 패널 ───────────────────────────────────────────
  test("3. 비로그인 상태에서 입찰 패널 표시 확인", async ({ page }) => {
    const url = await getFirstAuctionUrl(page);
    if (!url) {
      test.skip(true, "진행 중인 경매 없음 - 스킵");
      return;
    }
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    // 입찰 관련 버튼 또는 입력창 존재
    const bidBtn = page.getByRole("button", { name: /입찰|예약|얼마에|마감/ });
    const hasPanel = (await bidBtn.count()) > 0 || (await page.locator("input[inputmode='numeric']").count()) > 0;
    expect(hasPanel).toBe(true);
  });

  // ── 4. 프리셋 버튼 클릭 → 입찰가 설정 ─────────────────────────────
  test("4. 프리셋 버튼 클릭 시 입찰가 설정됨", async ({ page }) => {
    const url = await getFirstAuctionUrl(page);
    if (!url) {
      test.skip(true, "진행 중인 경매 없음 - 스킵");
      return;
    }
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    // "최소" 프리셋 버튼
    const minBtn = page.getByRole("button", { name: "최소" });
    if ((await minBtn.count()) === 0) {
      test.skip(true, "입찰 패널 없음 또는 경매 종료");
      return;
    }

    await minBtn.click();
    // 내 입찰가 영역에 금액 표시
    await expect(page.getByText(/₩/).last()).toBeVisible();
  });

  // ── 5. 최소 금액 미달 시 입찰 버튼 비활성화 ─────────────────────────
  test("5. 금액 미입력 시 입찰 버튼 비활성화 또는 안내 문구 표시", async ({ page }) => {
    const url = await getFirstAuctionUrl(page);
    if (!url) {
      test.skip(true, "진행 중인 경매 없음 - 스킵");
      return;
    }
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    const bidBtn = page.getByRole("button", { name: /입찰|얼마에/ });
    if ((await bidBtn.count()) === 0) {
      test.skip(true, "입찰 패널 없음");
      return;
    }

    // 금액 미입력 상태에서 버튼은 disabled이거나 안내 문구를 표시
    const firstBidBtn = bidBtn.first();
    const isDisabled = await firstBidBtn.isDisabled();
    const btnText = await firstBidBtn.textContent();
    const showsPlaceholder = btnText?.includes("얼마에") || btnText?.includes("입력");
    expect(isDisabled || showsPlaceholder).toBe(true);
  });

  // ── 6. 로그인 후 입찰 확인 시트 열기/닫기 ──────────────────────────
  test("6. 로그인 후 입찰 확인 시트 열고 취소", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");

    const url = await getFirstAuctionUrl(page);
    if (!url) {
      test.skip(true, "진행 중인 경매 없음 - 스킵");
      return;
    }
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    // 최소 프리셋 클릭 → 금액 설정
    const minBtn = page.getByRole("button", { name: "최소" });
    if ((await minBtn.count()) === 0) {
      test.skip(true, "입찰 패널 없음");
      return;
    }
    await minBtn.click();

    // 입찰하기 버튼 활성화 후 클릭
    const submitBtn = page.getByRole("button", { name: /으로 입찰하기|입찰하기/ });
    if ((await submitBtn.count()) === 0 || await submitBtn.first().isDisabled()) {
      test.skip(true, "입찰 버튼 비활성화 - 스킵");
      return;
    }
    await submitBtn.first().click();

    // 확인 시트 열림
    await expect(page.getByRole("heading", { name: /입찰 확인|즉시 낙찰/ })).toBeVisible({ timeout: 5000 });
    // 경매 상품명 표시
    await expect(page.getByText(/최종 지불가/)).toBeVisible();
    // 취소 버튼으로 닫기
    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("heading", { name: /입찰 확인/ })).not.toBeVisible();
  });

  // ── 7. 입찰 확인 시트 - 노쇼 경고 표시 ─────────────────────────────
  test("7. 입찰 확인 시트에 노쇼 경고 문구 표시", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");

    const url = await getFirstAuctionUrl(page);
    if (!url) {
      test.skip(true, "진행 중인 경매 없음 - 스킵");
      return;
    }
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    const minBtn = page.getByRole("button", { name: "최소" });
    if ((await minBtn.count()) === 0) {
      test.skip(true, "입찰 패널 없음");
      return;
    }
    await minBtn.click();

    const submitBtn = page.getByRole("button", { name: /으로 입찰하기/ });
    if ((await submitBtn.count()) === 0 || await submitBtn.first().isDisabled()) {
      test.skip(true, "입찰 버튼 비활성화");
      return;
    }
    await submitBtn.first().click();

    // 노쇼 경고 존재
    await expect(page.getByText(/노쇼|No-Show/)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "취소" }).click();
  });

  // ── 8. 직접 입력 필드 ────────────────────────────────────────────────
  test("8. 직접 입력 필드에 금액 입력 시 내 입찰가 반영", async ({ page }) => {
    const url = await getFirstAuctionUrl(page);
    if (!url) {
      test.skip(true, "진행 중인 경매 없음 - 스킵");
      return;
    }
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    const numericInput = page.locator("input[inputmode='numeric']").first();
    if ((await numericInput.count()) === 0) {
      test.skip(true, "입찰 입력창 없음");
      return;
    }
    await numericInput.fill("500000");
    // 내 입찰가에 500,000 또는 ₩500,000 표시
    await expect(page.getByText(/500,000|500000/).last()).toBeVisible({ timeout: 3000 });
  });
});
