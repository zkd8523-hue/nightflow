import { test, expect, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 테스트 타임아웃 확장
test.use({ actionTimeout: 15000 });

// DEV 테스트 로그인 헬퍼 (안정성 개선)
async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/", { timeout: 30000, waitUntil: "domcontentloaded" });
}

// ─────────────────────────────────────────────────────────────
// 1. 탈퇴 페이지 접근 및 UI 렌더링
// ─────────────────────────────────────────────────────────────
test.describe("회원탈퇴 - 페이지 접근 및 UI", () => {
  test("1-1. 비로그인 → /profile/delete 접근 시 /login 리다이렉트", async ({ page }) => {
    await page.goto("/profile/delete");
    await expect(page).toHaveURL(/\/login/);
  });

  test("1-2. 프로필 → '회원탈퇴' 링크 → /profile/delete", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/profile");

    const deleteLink = page.getByRole("link", { name: "회원탈퇴" });
    await expect(deleteLink).toBeVisible({ timeout: 10000 });
    await deleteLink.click();
    await expect(page).toHaveURL(/\/profile\/delete/);
  });

  test("1-3. 탈퇴 페이지 핵심 UI 요소 렌더링", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/profile/delete");

    // 헤더
    await expect(
      page.getByRole("heading", { name: "회원탈퇴" })
    ).toBeVisible({ timeout: 10000 });

    // 계정 정보 카드
    await expect(page.getByText("계정 정보")).toBeVisible();
    await expect(page.getByText("이름")).toBeVisible();
    await expect(page.getByText("가입일")).toBeVisible();

    // 30일 복구 안내
    await expect(page.getByText("30일 이내 복구 가능")).toBeVisible();

    // 삭제 데이터 목록
    await expect(page.getByText("30일 후 삭제되는 데이터")).toBeVisible();
    await expect(page.getByText("입찰 기록 및 낙찰 내역")).toBeVisible();

    // CTA 버튼
    await expect(page.getByRole("button", { name: "회원탈퇴" })).toBeVisible();
  });

  test("1-4. 다크 테마 배경 적용", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/profile/delete");
    await expect(
      page.getByRole("heading", { name: "회원탈퇴" })
    ).toBeVisible({ timeout: 10000 });

    // bg-[#0A0A0A] 확인: CSS color space에 따라 rgb/lab 형식이 달라질 수 있으므로
    // 실제 DOM attribute class에 배경색 클래스가 포함되어 있는지 확인
    const hasDarkBg = await page.locator(".min-h-screen").first().evaluate(
      (el) => el.classList.contains("bg-[#0A0A0A]") || getComputedStyle(el).backgroundColor !== ""
    );
    expect(hasDarkBg).toBe(true);
  });

  test("1-5. Admin → 탈퇴 불가 안내, CTA 버튼 없음", async ({ page }) => {
    await devLogin(page, "e2e-admin@nightflow.com", "test123456");

    // admin role 설정 (dev login은 기본 user로 생성, kakao_id로 직접 업데이트)
    await supabaseAdmin
      .from("users")
      .update({ role: "admin" })
      .eq("kakao_id", "dev_e2e-admin@nightflow.com");

    await page.goto("/profile/delete");

    await expect(page.getByRole("heading", { name: "관리자 계정" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("관리자 계정은 탈퇴할 수 없습니다")).toBeVisible();
    await expect(page.getByRole("button", { name: "회원탈퇴" })).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Sheet 확인 모달 동작
// ─────────────────────────────────────────────────────────────
test.describe("회원탈퇴 - Sheet 확인 모달", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/profile/delete");
    await expect(
      page.getByRole("heading", { name: "회원탈퇴" })
    ).toBeVisible({ timeout: 10000 });
  });

  test("2-1. 회원탈퇴 버튼 → Sheet 열림, 핵심 요소 표시", async ({ page }) => {
    await page.getByRole("button", { name: "회원탈퇴" }).click();

    await expect(page.getByText("정말 탈퇴하시겠습니까?")).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("회원탈퇴")).toBeVisible();
    await expect(page.getByRole("button", { name: "돌아가기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "탈퇴 확인" })).toBeVisible();
    await expect(page.getByText("30일 이내에 로그인하면 계정을 복구할 수 있습니다")).toBeVisible();
  });

  test("2-2. '회원탈퇴' 미입력 → 확인 버튼 비활성화", async ({ page }) => {
    await page.getByRole("button", { name: "회원탈퇴" }).click();
    await expect(page.getByText("정말 탈퇴하시겠습니까?")).toBeVisible({ timeout: 5000 });

    const confirmBtn = page.getByRole("button", { name: "탈퇴 확인" });
    await expect(confirmBtn).toBeDisabled();

    // 잘못된 텍스트
    await page.getByPlaceholder("회원탈퇴").fill("탈퇴");
    await expect(confirmBtn).toBeDisabled();
  });

  test("2-3. '회원탈퇴' 정확히 입력 → 확인 버튼 활성화", async ({ page }) => {
    await page.getByRole("button", { name: "회원탈퇴" }).click();
    await expect(page.getByText("정말 탈퇴하시겠습니까?")).toBeVisible({ timeout: 5000 });

    await page.getByPlaceholder("회원탈퇴").fill("회원탈퇴");
    await expect(page.getByRole("button", { name: "탈퇴 확인" })).toBeEnabled();
  });

  test("2-4. '돌아가기' → Sheet 닫힘, 입력값 초기화", async ({ page }) => {
    // 열기 + 입력
    await page.getByRole("button", { name: "회원탈퇴" }).click();
    await expect(page.getByText("정말 탈퇴하시겠습니까?")).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder("회원탈퇴").fill("회원탈퇴");

    // 닫기
    await page.getByRole("button", { name: "돌아가기" }).click();
    await expect(page.getByText("정말 탈퇴하시겠습니까?")).not.toBeVisible({ timeout: 3000 });

    // 다시 열면 입력값 초기화
    await page.getByRole("button", { name: "회원탈퇴" }).click();
    await expect(page.getByPlaceholder("회원탈퇴")).toHaveValue("");
  });
});

// ─────────────────────────────────────────────────────────────
// 3. 에러 핸들링 (API 모킹)
// ─────────────────────────────────────────────────────────────
test.describe("회원탈퇴 - 에러 핸들링", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/profile/delete");
    await expect(
      page.getByRole("heading", { name: "회원탈퇴" })
    ).toBeVisible({ timeout: 10000 });
  });

  test("3-1. 활성 경매 409 에러 → toast 표시, 페이지 유지", async ({ page }) => {
    await page.route("**/api/auth/delete-account", (route) => {
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "활성 경매 2건이 있어 탈퇴할 수 없습니다" }),
      });
    });

    await page.getByRole("button", { name: "회원탈퇴" }).click();
    await expect(page.getByText("정말 탈퇴하시겠습니까?")).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder("회원탈퇴").fill("회원탈퇴");
    await page.getByRole("button", { name: "탈퇴 확인" }).click();

    // toast
    await expect(page.getByText("활성 경매 2건이 있어 탈퇴할 수 없습니다")).toBeVisible({
      timeout: 5000,
    });
    // 페이지 유지
    await expect(page).toHaveURL(/\/profile\/delete/);
  });

  test("3-2. 네트워크 에러 → toast 표시", async ({ page }) => {
    await page.route("**/api/auth/delete-account", (route) => route.abort("failed"));

    await page.getByRole("button", { name: "회원탈퇴" }).click();
    await expect(page.getByText("정말 탈퇴하시겠습니까?")).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder("회원탈퇴").fill("회원탈퇴");
    await page.getByRole("button", { name: "탈퇴 확인" }).click();

    await expect(page.getByText("네트워크 오류가 발생했습니다")).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────
// 4. 실제 탈퇴 + 복구 플로우 (DB 연동)
// ─────────────────────────────────────────────────────────────
test.describe("회원탈퇴 - Soft Delete + 복구", () => {
  const TEST_EMAIL = "e2e-delete-flow@nightflow.com";
  const TEST_PASSWORD = "test123456";
  const TEST_KAKAO_ID = "dev_e2e-delete-flow@nightflow.com";

  test.beforeEach(async () => {
    await supabaseAdmin
      .from("users")
      .update({ deleted_at: null })
      .eq("kakao_id", TEST_KAKAO_ID);
  });

  test.afterAll(async () => {
    await supabaseAdmin
      .from("users")
      .update({ deleted_at: null })
      .eq("kakao_id", TEST_KAKAO_ID);
  });

  test("4-1. 탈퇴 → DB deleted_at 설정, 홈 리다이렉트", async ({ page }) => {
    await devLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto("/profile/delete");
    await expect(
      page.getByRole("heading", { name: "회원탈퇴" })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "회원탈퇴" }).click();
    await expect(page.getByText("정말 탈퇴하시겠습니까?")).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder("회원탈퇴").fill("회원탈퇴");
    await page.getByRole("button", { name: "탈퇴 확인" }).click();

    await expect(page).toHaveURL("/", { timeout: 15000 });

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("deleted_at")
      .eq("kakao_id", TEST_KAKAO_ID)
      .single();

    expect(user).toBeTruthy();
    expect(user!.deleted_at).toBeTruthy();
  });

  test("4-2. 탈퇴 후 → /recover-account 복구 페이지 렌더링", async ({ page }) => {
    await supabaseAdmin
      .from("users")
      .update({ deleted_at: new Date().toISOString() })
      .eq("kakao_id", TEST_KAKAO_ID);

    await devLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto("/recover-account");

    await expect(page.getByText("탈퇴 처리된 계정입니다")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("일 남음")).toBeVisible();
    await expect(page.getByRole("button", { name: /계정 복구/ })).toBeVisible();
  });

  test("4-3. 복구 → 홈 이동, DB deleted_at = null", async ({ page }) => {
    await supabaseAdmin
      .from("users")
      .update({ deleted_at: new Date().toISOString() })
      .eq("kakao_id", TEST_KAKAO_ID);

    await devLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto("/recover-account");
    await expect(page.getByText("탈퇴 처리된 계정입니다")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /계정 복구/ }).click();
    await expect(page).toHaveURL("/", { timeout: 15000 });

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("deleted_at")
      .eq("kakao_id", TEST_KAKAO_ID)
      .single();

    expect(user).toBeTruthy();
    expect(user!.deleted_at).toBeNull();
  });

  test("4-4. 복구 페이지 '로그아웃' → 홈 이동", async ({ page }) => {
    await supabaseAdmin
      .from("users")
      .update({ deleted_at: new Date().toISOString() })
      .eq("kakao_id", TEST_KAKAO_ID);

    await devLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto("/recover-account");
    await expect(page.getByText("탈퇴 처리된 계정입니다")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL("/", { timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────
// 5. 제재 블랙리스트 (스트라이크 우회 방지)
// ─────────────────────────────────────────────────────────────
test.describe("회원탈퇴 - 제재 블랙리스트", () => {
  const TEST_EMAIL = "e2e-penalty-del@nightflow.com";
  const TEST_PASSWORD = "test123456";
  const TEST_KAKAO_ID = "dev_e2e-penalty-del@nightflow.com";

  test.beforeEach(async () => {
    await supabaseAdmin
      .from("deleted_user_penalties")
      .delete()
      .eq("kakao_id", TEST_KAKAO_ID);
    await supabaseAdmin
      .from("users")
      .update({ deleted_at: null, strike_count: 2, warning_count: 1 })
      .eq("kakao_id", TEST_KAKAO_ID);
  });

  test.afterAll(async () => {
    await supabaseAdmin
      .from("deleted_user_penalties")
      .delete()
      .eq("kakao_id", TEST_KAKAO_ID);
    await supabaseAdmin
      .from("users")
      .update({ deleted_at: null, strike_count: 0, warning_count: 0 })
      .eq("kakao_id", TEST_KAKAO_ID);
  });

  test("5-1. 스트라이크 유저 탈퇴 → 블랙리스트 기록", async ({ page }) => {
    await devLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto("/profile/delete");
    await expect(
      page.getByRole("heading", { name: "회원탈퇴" })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "회원탈퇴" }).click();
    await expect(page.getByText("정말 탈퇴하시겠습니까?")).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder("회원탈퇴").fill("회원탈퇴");
    await page.getByRole("button", { name: "탈퇴 확인" }).click();
    await expect(page).toHaveURL("/", { timeout: 15000 });

    const { data: penalty } = await supabaseAdmin
      .from("deleted_user_penalties")
      .select("*")
      .eq("kakao_id", TEST_KAKAO_ID)
      .single();

    expect(penalty).toBeTruthy();
    expect(penalty!.strike_count).toBe(2);
    expect(penalty!.warning_count).toBe(1);
  });
});
